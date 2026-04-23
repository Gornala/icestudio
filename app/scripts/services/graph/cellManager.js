//---------------------------------------------------------------------------
//-- cellManager.js: Add, remove, drag, replace blocks; undo/redo; clipboard
//-- Loaded as a <script> tag before graph.js; exposes window._icegraph.cellManager
//---------------------------------------------------------------------------
'use strict';

window._icegraph = window._icegraph || {};

window._icegraph.cellManager = function (ctx) {
  //-- Set state + board rules on a cell before adding to graph
  function updateCellAttributes(cell) {
    cell.attributes.state = ctx.state;
    cell.attributes.rules = ctx.profile.get('boardRules');
  }

  //-- Add a single cell to the graph with z-index management
  function addCell(cell) {
    if (cell) {
      updateCellAttributes(cell);
      ctx.graph.addCell(cell);
      if (!cell.isLink()) {
        var cellView = ctx.paper.findViewByModel(cell);
        if (cellView.$box.css('z-index') < ctx.z.index) {
          cellView.$box.css('z-index', ++ctx.z.index);
        }
      }
    }
  }

  //--------------------------------------------------------------------------
  //-- Selection helpers
  //--------------------------------------------------------------------------
  function hasSelection() {
    return ctx.selection && ctx.selection.length > 0;
  }

  function disableSelected() {
    if (hasSelection()) {
      ctx.selectionView.cancelSelection();
    }
  }

  //--------------------------------------------------------------------------
  //-- Block creation
  //--------------------------------------------------------------------------
  function createBlock(type, block) {
    ctx.blockforms.newGeneric(type, block, function (cell) {
      ctx.service.addDraggableCell(cell);
    });
  }

  function createBasicBlock(type) {
    if (type === window._iceblocks.BASIC_SUBMODULE) {
      createSubmodule();
      return;
    }
    var allowInoutPorts =
      ctx.profile.get('allowInoutPorts') || ctx.common.allowProjectInoutPorts;
    ctx.blockforms.newBasic(type, allowInoutPorts, function (cells) {
      ctx.service.addDraggableCells(cells);
    });
  }

  //-- Build pin array from a Verilog range string like "[7:0]"
  function buildSubmodulePins(range) {
    if (!range) {
      return [{ index: '0', name: '', value: '0' }];
    }
    var m = range.match(/\[(\d+):(\d+)\]/);
    if (!m) {
      return [{ index: '0', name: '', value: '0' }];
    }
    var hi = parseInt(m[1], 10);
    var lo = parseInt(m[2], 10);
    var width = Math.abs(hi - lo) + 1;
    var pins = [];
    for (var i = width - 1; i >= 0; i--) {
      pins.push({ index: String(i), name: '', value: '0' });
    }
    return pins;
  }

  function createSubmodule() {
    //-- Step 1: Module Ports dialog — define inputs / outputs / params + optional code
    ctx.blockforms.getCodeFormData(function (formData) {
      var portsIn = formData.inPortsInfo || [];
      var portsOut = formData.outPortsInfo || [];
      var params = formData.inParamsInfo || [];
      var code = (formData.code || '').trim();
      var label = formData.label || 'submodule';

      //-- Step 2: defer so the first alertify dialog fully closes before opening the next
      setTimeout(function () {
        var infoValues = [label, '1.0.0', '', '', ''];
        ctx.utils.projectinfoprompt(infoValues, function (evt, newValues) {
          var pkgName = newValues[0] || label;
          var pkgVersion = newValues[1] || '1.0.0';
          var pkgDesc = newValues[2] || '';
          var pkgAuthor = newValues[3] || '';
          var pkgImage = newValues[4] || '';

          //-- Step 3: Build the internal .ice graph for the new submodule
          var allBlocks = [];
          var allWires = [];
          var codeBlockId = ctx.joint.util.uuid();
          var yStep = 80;

          portsIn.forEach(function (port, idx) {
            var id = ctx.joint.util.uuid();
            var inputData = {
              name: port.name,
              pins: buildSubmodulePins(port.range),
              virtual: true,
              clock: false,
            };
            if (port.range) {
              inputData.range = port.range;
            }
            allBlocks.push({
              id: id,
              type: 'basic.input',
              data: inputData,
              position: { x: 50, y: 80 + idx * yStep },
            });
            if (code) {
              allWires.push({
                source: { block: id, port: 'out' },
                target: { block: codeBlockId, port: port.name },
              });
            }
          });

          portsOut.forEach(function (port, idx) {
            var id = ctx.joint.util.uuid();
            var outputData = {
              name: port.name,
              pins: buildSubmodulePins(port.range),
              virtual: true,
            };
            if (port.range) {
              outputData.range = port.range;
            }
            allBlocks.push({
              id: id,
              type: 'basic.output',
              data: outputData,
              position: { x: 750, y: 80 + idx * yStep },
            });
            if (code) {
              allWires.push({
                source: { block: codeBlockId, port: port.name },
                target: { block: id, port: 'in' },
              });
            }
          });

          params.forEach(function (param, idx) {
            var id = ctx.joint.util.uuid();
            allBlocks.push({
              id: id,
              type: 'basic.constant',
              data: { name: param.name, value: '', local: false },
              position: { x: 300 + idx * 150, y: 20 },
            });
            if (code) {
              allWires.push({
                source: { block: id, port: 'constant-out' },
                target: { block: codeBlockId, port: param.name },
              });
            }
          });

          if (code) {
            var codeHeight = Math.max(
              300,
              (Math.max(portsIn.length, portsOut.length) + params.length) * 80 +
                160
            );
            allBlocks.push({
              id: codeBlockId,
              type: 'basic.code',
              data: {
                label: label,
                code: code,
                params: params.map(function (p) {
                  return { name: p.name };
                }),
                ports: {
                  in: portsIn.map(function (p) {
                    var o = { name: p.name };
                    if (p.range) {
                      o.range = p.range;
                    }
                    return o;
                  }),
                  out: portsOut.map(function (p) {
                    var o = { name: p.name };
                    if (p.range) {
                      o.range = p.range;
                    }
                    return o;
                  }),
                },
              },
              position: { x: 300, y: 150 },
              size: { width: 800, height: codeHeight },
            });
          }

          var boardName =
            ctx.common.selectedBoard && ctx.common.selectedBoard.name
              ? ctx.common.selectedBoard.name
              : 'alhambra-ii';

          var blockData = {
            version: '1.2',
            package: {
              name: pkgName,
              version: pkgVersion,
              description: pkgDesc,
              author: pkgAuthor,
              image: pkgImage,
            },
            design: {
              board: boardName,
              graph: { blocks: allBlocks, wires: allWires },
            },
            dependencies: {},
          };

          //-- Register as a dependency
          var type = ctx.utils.dependencyID(blockData);
          ctx.common.allDependencies[type] = blockData;

          //-- Create the generic block cell and place it near the cursor
          ctx.blockforms.newGeneric(type, blockData, function (cell) {
            var menuHeight = $('#menu').height();
            cell.set('position', {
              x:
                Math.round(
                  ((ctx.mousePosition.x - ctx.state.pan.x) / ctx.state.zoom -
                    cell.get('size').width / 2) /
                    ctx.gridsize
                ) * ctx.gridsize,
              y:
                Math.round(
                  ((ctx.mousePosition.y - ctx.state.pan.y - menuHeight) /
                    ctx.state.zoom -
                    cell.get('size').height / 2) /
                    ctx.gridsize
                ) * ctx.gridsize,
            });
            ctx.graph.trigger('batch:start');
            addCell(cell);
            ctx.graph.trigger('batch:stop');

            //-- Navigate into the new submodule with write access enabled
            ctx.common.isEditingSubmodule = true;
            ctx.$rootScope.$broadcast('navigateProject', {
              update: ctx.service.breadcrumbs.length === 1,
              project: blockData,
              submodule: type,
              submoduleId: cell.get('id'),
              fromDoubleClick: false,
              fromNewSubmodule: true,
              editMode: false,
            });
          });
        });
      }, 0); // end setTimeout — defer until first alertify dialog fully closes
    });
  }

  //--------------------------------------------------------------------------
  //-- Draggable block placement
  //--------------------------------------------------------------------------
  function addDraggableCell(cell) {
    ctx.service.addingDraggableBlock = true;
    var menuHeight = $('#menu').height();

    var effectiveMouseX = ctx.mousePosition.x;
    var cmPanel = document.getElementById('collectionManager2');
    if (cmPanel) {
      var cmRect = cmPanel.getBoundingClientRect();
      if (effectiveMouseX >= cmRect.left) {
        effectiveMouseX = cmRect.left - 100;
      }
    }

    cell.set('position', {
      x:
        Math.round(
          ((effectiveMouseX - ctx.state.pan.x) / ctx.state.zoom -
            cell.get('size').width / 2) /
            ctx.gridsize
        ) * ctx.gridsize,
      y:
        Math.round(
          ((ctx.mousePosition.y - ctx.state.pan.y - menuHeight) /
            ctx.state.zoom -
            cell.get('size').height / 2) /
            ctx.gridsize
        ) * ctx.gridsize,
    });
    ctx.graph.trigger('batch:start');
    addCell(cell);
    disableSelected();
    var opt = { transparent: true, initooltip: false };
    ctx.selection.add(cell);
    ctx.selectionView.createSelectionBox(cell, opt);
    ctx.selectionView.startAddingSelection({
      clientX: effectiveMouseX,
      clientY: ctx.mousePosition.y,
    });
  }

  function addDraggableCells(cells) {
    ctx.service.addingDraggableBlock = true;
    var menuHeight = $('#menu').height();
    if (cells.length > 0) {
      var effectiveMouseX = ctx.mousePosition.x;
      var cmPanel = document.getElementById('collectionManager2');
      if (cmPanel) {
        var cmRect = cmPanel.getBoundingClientRect();
        if (effectiveMouseX >= cmRect.left) {
          effectiveMouseX = cmRect.left - 100;
        }
      }

      var firstCell = cells[0];
      var offset = {
        x:
          Math.round(
            ((effectiveMouseX - ctx.state.pan.x) / ctx.state.zoom -
              firstCell.get('size').width / 2) /
              ctx.gridsize
          ) *
            ctx.gridsize -
          firstCell.get('position').x,
        y:
          Math.round(
            ((ctx.mousePosition.y - ctx.state.pan.y - menuHeight) /
              ctx.state.zoom -
              firstCell.get('size').height / 2) /
              ctx.gridsize
          ) *
            ctx.gridsize -
          firstCell.get('position').y,
      };
      _.each(cells, function (cell) {
        var position = cell.get('position');
        cell.set('position', {
          x: position.x + offset.x,
          y: position.y + offset.y,
        });
      });
      ctx.graph.trigger('batch:start');
      _.each(cells, function (cell) {
        updateCellAttributes(cell);
      });
      ctx.graph.addCells(cells);
      disableSelected();
      var selOpt = { transparent: true };
      _.each(cells, function (cell) {
        ctx.selection.add(cell);
        ctx.selectionView.createSelectionBox(cell, selOpt);
      });
      ctx.selectionView.startAddingSelection({
        clientX: effectiveMouseX,
        clientY: ctx.mousePosition.y,
      });
    }
  }

  //--------------------------------------------------------------------------
  //-- Cell data accessors
  //--------------------------------------------------------------------------
  function setCells(cells) {
    ctx.graph.attributes.cells.models = cells;
  }

  function editLabelBlock(itemId, newName, newColor) {
    var cellView = ctx.paper.findViewByModel(itemId);
    ctx.blockforms.editBasicLabel(cellView, newName, newColor);
  }

  function triggerDblClick(cellId) {
    var cellView = ctx.paper.findViewByModel(cellId);
    if (cellView) {
      ctx.paper.trigger('cell:pointerdblclick', cellView, {}, 0, 0);
    }
  }

  function lpHighlightCells(ids) {
    ids.forEach(function (id) {
      var cellView = ctx.paper.findViewByModel(id);
      if (cellView && cellView.$box) {
        cellView.$box.addClass('lp-highlight');
      }
    });
  }

  function lpClearHighlight() {
    $('.lp-highlight').removeClass('lp-highlight');
  }

  function updateCellData(cellId, updates) {
    var cell = ctx.graph.getCell(cellId);
    if (!cell) {
      return;
    }
    var data = JSON.parse(JSON.stringify(cell.get('data') || {}));
    Object.keys(updates).forEach(function (k) {
      data[k] = updates[k];
    });
    cell.set('data', data);
    var cellView = ctx.paper.findViewByModel(cellId);
    if (cellView && typeof cellView.apply === 'function') {
      cellView.apply();
    }
  }

  function updateCellPin(cellId, arrayIdx, pinName, pinValue) {
    var cell = ctx.graph.getCell(cellId);
    if (!cell) {
      return;
    }
    var data = JSON.parse(JSON.stringify(cell.get('data') || {}));
    if (data.pins && data.pins[arrayIdx] !== undefined) {
      data.pins[arrayIdx].name = pinName;
      data.pins[arrayIdx].value = pinValue;
      cell.set('data', data);
      var cellView = ctx.paper.findViewByModel(cellId);
      if (cellView && cellView.$box) {
        var pinFieldIndex = data.pins[arrayIdx].index;
        var $combo = cellView.$box.find('#combo' + cellView.id + pinFieldIndex);
        if ($combo.length) {
          cellView.updating = true;
          $combo.val(pinValue).change();
          cellView.updating = false;
        }
      }
    }
  }

  //--------------------------------------------------------------------------
  //-- Undo / Redo / Command stack
  //--------------------------------------------------------------------------
  function undo() {
    if (!ctx.service.addingDraggableBlock) {
      disableSelected();
      ctx.commandManager.undo();
      ctx.service.updateWires();
    }
  }

  function redo() {
    if (!ctx.service.addingDraggableBlock) {
      disableSelected();
      ctx.commandManager.redo();
      ctx.service.updateWires();
    }
  }

  function resetCommandStack() {
    ctx.commandManager.reset();
  }

  //--------------------------------------------------------------------------
  //-- Graph clear / enable
  //--------------------------------------------------------------------------
  function clearAll() {
    ctx.graph.clear();
    ctx.service.appEnable(true);
    ctx.selectionView.cancelSelection();
  }

  function appEnable(value) {
    ctx.paper.options.enabled = value;
    var ael, i;
    if (value) {
      angular.element('#menu').removeClass('is-disabled');
      angular.element('.paper').removeClass('looks-disabled');
      angular.element('.board-container').removeClass('looks-disabled');
      angular.element('.banner').addClass('hidden');

      ael = document.getElementById('menu');
      if (typeof ael !== 'undefined') {
        ael.classList.remove('is-disabled');
      }
      ael = document.getElementsByClassName('paper');
      if (typeof ael !== 'undefined' && ael.length > 0) {
        for (i = 0; i < ael.length; i++) {
          ael[i].classList.remove('looks-disabled');
        }
      }
      ael = document.getElementsByClassName('board-container');
      if (typeof ael !== 'undefined' && ael.length > 0) {
        for (i = 0; i < ael.length; i++) {
          ael[i].classList.remove('looks-disabled');
        }
      }
      ael = document.getElementsByClassName('banner');
      if (typeof ael !== 'undefined' && ael.length > 0) {
        for (i = 0; i < ael.length; i++) {
          ael[i].classList.add('hidden');
        }
      }
      if (!ctx.common.isEditingSubmodule) {
        angular.element('.banner-submodule').addClass('hidden');
        ael = document.getElementsByClassName('banner-submodule');
        if (typeof ael !== 'undefined' && ael.length > 0) {
          for (i = 0; i < ael.length; i++) {
            ael[i].classList.add('hidden');
          }
        }
      } else {
        angular.element('.banner-submodule').removeClass('hidden');
        ael = document.getElementsByClassName('banner-submodule');
        if (typeof ael !== 'undefined' && ael.length > 0) {
          for (i = 0; i < ael.length; i++) {
            ael[i].classList.remove('hidden');
          }
        }
      }
    } else {
      angular.element('#menu').addClass('is-disabled');
      angular.element('.paper').addClass('looks-disabled');
      angular.element('.board-container').addClass('looks-disabled');
      angular.element('.banner').removeClass('hidden');
      angular.element('.banner-submodule').removeClass('hidden');

      ael = document.getElementById('menu');
      if (typeof ael !== 'undefined') {
        ael.classList.add('is-disabled');
      }
      ael = document.getElementsByClassName('paper');
      if (typeof ael !== 'undefined' && ael.length > 0) {
        for (i = 0; i < ael.length; i++) {
          ael[i].classList.add('looks-disabled');
        }
      }
      ael = document.getElementsByClassName('board-container');
      if (typeof ael !== 'undefined' && ael.length > 0) {
        for (i = 0; i < ael.length; i++) {
          ael[i].classList.add('looks-disabled');
        }
      }
      ael = document.getElementsByClassName('banner');
      if (typeof ael !== 'undefined' && ael.length > 0) {
        for (i = 0; i < ael.length; i++) {
          ael[i].classList.remove('hidden');
        }
      }
      ael = document.getElementsByClassName('banner-submodule');
      if (typeof ael !== 'undefined' && ael.length > 0) {
        for (i = 0; i < ael.length; i++) {
          ael[i].classList.remove('hidden');
        }
      }
    }

    var cells = ctx.graph.getCells();
    _.each(cells, function (cell) {
      var cellView = ctx.paper.findViewByModel(cell.id);
      cellView.options.interactive = value;
      if (cell.get('type') !== 'ice.Generic') {
        if (value) {
          cellView.$el.removeClass('disable-graph');
        } else {
          cellView.$el.addClass('disable-graph');
        }
      } else if (cell.get('type') !== 'ice.Wire') {
        if (value) {
          cellView.$el.find('.port-body').removeClass('disable-graph');
        } else {
          cellView.$el.find('.port-body').addClass('disable-graph');
        }
      }
    });
  }

  function isEnabled() {
    if (
      typeof ctx.paper !== 'undefined' &&
      ctx.paper !== null &&
      ctx.paper !== false
    ) {
      return ctx.paper.options.enabled;
    }
    return false;
  }

  //--------------------------------------------------------------------------
  //-- Clipboard operations
  //--------------------------------------------------------------------------
  function cutSelected() {
    if (hasSelection()) {
      ctx.utils.copyToClipboard(ctx.selection, ctx.graph);
      ctx.service.removeSelected();
    }
  }

  function copySelected() {
    if (hasSelection()) {
      ctx.utils.copyToClipboard(ctx.selection, ctx.graph);
    }
  }

  function pasteSelected() {
    if (
      document.activeElement.tagName === 'A' ||
      document.activeElement.tagName === 'BODY'
    ) {
      ctx.utils.pasteFromClipboard(ctx.profile, function (object) {
        ctx.service.appendDesign(object.design, object.dependencies);
      });
    }
  }

  function pasteAndCloneSelected() {
    if (
      document.activeElement.tagName === 'A' ||
      document.activeElement.tagName === 'BODY'
    ) {
      ctx.utils.pasteFromClipboard(ctx.profile, function (object) {
        var hash = {};
        if (
          typeof object.dependencies !== false &&
          object.dependencies !== false &&
          object.dependencies !== null
        ) {
          var dependencies = ctx.utils.clone(object.dependencies);
          object.dependencies = {};
          var hId = false;
          var dep = false;
          var dat = false;
          var seq = false;
          var oldversion = false;

          for (dep in dependencies) {
            dependencies[dep].package.name =
              dependencies[dep].package.name + ' CLONE';
            dat = new Date();
            seq = dat.getTime();
            oldversion = dependencies[dep].package.version.replace(
              /(.*)(-c\d*)/,
              '$1'
            );
            dependencies[dep].package.version = oldversion + '-c' + seq;

            hId = ctx.utils.dependencyID(dependencies[dep]);
            object.dependencies[hId] = dependencies[dep];
            hash[dep] = hId;
          }

          object.design.graph.blocks = object.design.graph.blocks.map(
            function (e) {
              if (
                typeof e.type !== 'undefined' &&
                typeof hash[e.type] !== 'undefined'
              ) {
                e.type = hash[e.type];
              }
              return e;
            }
          );
        }
        ctx.service.appendDesign(object.design, object.dependencies);
      });
    }
  }

  function duplicateSelected() {
    if (hasSelection()) {
      ctx.utils.duplicateSelected(ctx.selection, ctx.graph, function (object) {
        ctx.service.appendDesign(object.design, object.dependencies);
      });
    }
  }

  function removeSelected() {
    if (hasSelection()) {
      ctx.graph.removeCells(ctx.selection.models);
      ctx.selectionView.cancelSelection();
      ctx.service.updateWires();
      $('body').trigger('Graph::lpRefresh');
    }
  }

  function selectAll() {
    disableSelected();
    var cells = ctx.graph.getCells();
    _.each(cells, function (cell) {
      if (!cell.isLink()) {
        ctx.selection.add(cell);
        ctx.selectionView.createSelectionBox(cell);
      }
    });
  }

  //--------------------------------------------------------------------------
  //-- Arrow-key stepping
  //--------------------------------------------------------------------------
  var stepValue = 8;
  var stepCounter = 0;
  var stepTimer = null;
  var stepGroupingInterval = 500;
  var allowStep = true;
  var allosStepInterval = 200;

  function performStep(offset) {
    if (ctx.selection && allowStep) {
      allowStep = false;
      if (Date.now() - stepCounter < stepGroupingInterval) {
        clearTimeout(stepTimer);
      } else {
        ctx.graph.startBatch('change');
      }
      step(offset);
      stepTimer = setTimeout(function () {
        ctx.graph.stopBatch('change');
      }, stepGroupingInterval);
      stepCounter = Date.now();
      setTimeout(function () {
        allowStep = true;
      }, allosStepInterval);
    }
  }

  function step(offset) {
    var processedWires = {};
    ctx.selection.each(function (cell) {
      cell.translate(offset.x, offset.y);
      ctx.selectionView.updateBox(cell);
      var connectedWires = ctx.graph.getConnectedLinks(cell);
      _.each(connectedWires, function (wire) {
        if (processedWires[wire.id]) {
          return;
        }
        var vertices = wire.get('vertices');
        if (vertices && vertices.length) {
          var newVertices = [];
          _.each(vertices, function (vertex) {
            newVertices.push({
              x: vertex.x + offset.x,
              y: vertex.y + offset.y,
            });
          });
          wire.set('vertices', newVertices);
        }
        processedWires[wire.id] = true;
      });
    });
  }

  function stepLeft() {
    performStep({ x: -stepValue, y: 0 });
  }
  function stepUp() {
    performStep({ x: 0, y: -stepValue });
  }
  function stepRight() {
    performStep({ x: stepValue, y: 0 });
  }
  function stepDown() {
    performStep({ x: 0, y: stepValue });
  }

  return {
    updateCellAttributes: updateCellAttributes,
    addCell: addCell,
    hasSelection: hasSelection,
    disableSelected: disableSelected,
    createBlock: createBlock,
    createBasicBlock: createBasicBlock,
    addDraggableCell: addDraggableCell,
    addDraggableCells: addDraggableCells,
    setCells: setCells,
    editLabelBlock: editLabelBlock,
    triggerDblClick: triggerDblClick,
    lpHighlightCells: lpHighlightCells,
    lpClearHighlight: lpClearHighlight,
    updateCellData: updateCellData,
    updateCellPin: updateCellPin,
    undo: undo,
    redo: redo,
    resetCommandStack: resetCommandStack,
    clearAll: clearAll,
    appEnable: appEnable,
    isEnabled: isEnabled,
    cutSelected: cutSelected,
    copySelected: copySelected,
    pasteSelected: pasteSelected,
    pasteAndCloneSelected: pasteAndCloneSelected,
    duplicateSelected: duplicateSelected,
    removeSelected: removeSelected,
    selectAll: selectAll,
    stepLeft: stepLeft,
    stepUp: stepUp,
    stepRight: stepRight,
    stepDown: stepDown,
  };
};
