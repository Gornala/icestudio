//---------------------------------------------------------------------------
//-- interactions.js: Mouse/keyboard events, selection, block replacement
//-- Loaded as a <script> tag before graph.js; exposes window._icegraph.interactions
//---------------------------------------------------------------------------
/* global isClickOnVertex */
'use strict';

window._icegraph = window._icegraph || {};

window._icegraph.interactions = function (ctx) {
  //--------------------------------------------------------------------------
  //-- Block replacement helpers
  //--------------------------------------------------------------------------
  function processReplaceBlock(upperBlock) {
    var lowerBlock = findLowerBlock(upperBlock);
    replaceBlock(upperBlock, lowerBlock);
  }

  function findLowerBlock(upperBlock) {
    if (
      upperBlock.get('type') === 'ice.Wire' ||
      upperBlock.get('type') === 'ice.Info'
    ) {
      return;
    }
    var foundBlocks = ctx.graph.findModelsUnderElement(upperBlock);
    if (foundBlocks.length === 0) {
      return;
    }
    var lowerBlock = foundBlocks[0];
    if (
      lowerBlock.get('type') === 'ice.Wire' ||
      lowerBlock.get('type') === 'ice.Info'
    ) {
      return;
    }
    var validReplacements = {
      'ice.Generic': ['ice.Generic', 'ice.Code', 'ice.Input', 'ice.Output'],
      'ice.Code': ['ice.Generic', 'ice.Code', 'ice.Input', 'ice.Output'],
      'ice.Input': ['ice.Generic', 'ice.Code'],
      'ice.Output': ['ice.Generic', 'ice.Code'],
      'ice.Constant': ['ice.Constant', 'ice.Memory'],
      'ice.Memory': ['ice.Constant', 'ice.Memory'],
    }[lowerBlock.get('type')];
    if (validReplacements.indexOf(upperBlock.get('type')) === -1) {
      return;
    }
    return lowerBlock;
  }

  function replaceBlock(upperBlock, lowerBlock) {
    var portsMap = false;
    if (lowerBlock) {
      portsMap = computeAllPortsMap(upperBlock, lowerBlock);
      var wires = ctx.graph.getConnectedLinks(lowerBlock);
      _.each(wires, function (wire) {
        replaceWireConnection(wire, 'source');
        replaceWireConnection(wire, 'target');
      });
      var lowerBlockSize = lowerBlock.get('size');
      var upperBlockSize = upperBlock.get('size');
      var lowerBlockType = lowerBlock.get('type');
      var lowerBlockPosition = lowerBlock.get('position');
      if (
        lowerBlockType === 'ice.Constant' ||
        lowerBlockType === 'ice.Memory'
      ) {
        upperBlock.set('position', {
          x:
            lowerBlockPosition.x +
            (lowerBlockSize.width - upperBlockSize.width) / 2,
          y:
            lowerBlockPosition.y +
            lowerBlockSize.height -
            upperBlockSize.height,
        });
      } else if (lowerBlockType === 'ice.Input') {
        upperBlock.set('position', {
          x: lowerBlockPosition.x + lowerBlockSize.width - upperBlockSize.width,
          y:
            lowerBlockPosition.y +
            (lowerBlockSize.height - upperBlockSize.height) / 2,
        });
      } else if (lowerBlockType === 'ice.Output') {
        upperBlock.set('position', {
          x: lowerBlockPosition.x,
          y:
            lowerBlockPosition.y +
            (lowerBlockSize.height - upperBlockSize.height) / 2,
        });
      } else {
        upperBlock.set('position', {
          x:
            lowerBlockPosition.x +
            (lowerBlockSize.width - upperBlockSize.width) / 2,
          y:
            lowerBlockPosition.y +
            (lowerBlockSize.height - upperBlockSize.height) / 2,
        });
      }
      lowerBlock.remove();
      ctx.prevLowerBlock = null;
    }

    function replaceWireConnection(wire, connectorType) {
      var connector = wire.get(connectorType);
      if (connector.id === lowerBlock.get('id') && portsMap[connector.port]) {
        wire.set(connectorType, {
          id: upperBlock.get('id'),
          port: portsMap[connector.port],
        });
      }
    }
  }

  function computeAllPortsMap(upperBlock, lowerBlock) {
    var portsMap = {};
    _.merge(portsMap, computePortsMap(upperBlock, lowerBlock, 'leftPorts'));
    _.merge(portsMap, computePortsMap(upperBlock, lowerBlock, 'rightPorts'));
    _.merge(portsMap, computePortsMap(upperBlock, lowerBlock, 'topPorts'));
    _.merge(portsMap, computePortsMap(upperBlock, lowerBlock, 'bottomPorts'));
    return portsMap;
  }

  function computePortsMap(upperBlock, lowerBlock, portType) {
    var portsMap = {};
    var usedUpperPorts = [];
    var upperPorts = upperBlock.get(portType);
    var lowerPorts = lowerBlock.get(portType);

    _.each(lowerPorts, function (lowerPort) {
      var matchedPorts = _.filter(upperPorts, function (upperPort) {
        return (
          lowerPort.name === upperPort.name &&
          lowerPort.size === upperPort.size &&
          !_.includes(usedUpperPorts, upperPort)
        );
      });
      if (matchedPorts && matchedPorts.length > 0) {
        portsMap[lowerPort.id] = matchedPorts[0].id;
        usedUpperPorts = usedUpperPorts.concat(matchedPorts[0]);
      }
    });

    if (_.isEmpty(portsMap)) {
      var n = Math.min(upperPorts.length, lowerPorts.length);
      for (var i = 0; i < n; i++) {
        if (lowerPorts[i].size === upperPorts[i].size) {
          portsMap[lowerPorts[i].id] = upperPorts[i].id;
        }
      }
    }

    return portsMap;
  }

  function disableReplacedBlock(lowerBlock) {
    if (ctx.prevLowerBlock) {
      var prevLowerBlockView = ctx.paper.findViewByModel(ctx.prevLowerBlock);
      prevLowerBlockView.$box.removeClass('block-disabled');
      prevLowerBlockView.$el.removeClass('block-disabled');
    }
    if (lowerBlock) {
      var lowerBlockView = ctx.paper.findViewByModel(lowerBlock);
      lowerBlockView.$box.addClass('block-disabled');
      lowerBlockView.$el.addClass('block-disabled');
    }
    ctx.prevLowerBlock = lowerBlock;
  }

  var debounceDisableReplacedBlock = ctx.nodeDebounce(function (upperBlock) {
    var lowerBlock = findLowerBlock(upperBlock);
    disableReplacedBlock(lowerBlock);
  }, 100);

  //--------------------------------------------------------------------------
  //-- View box hit test
  //--------------------------------------------------------------------------
  function checkInsideViewBox(view, x, y) {
    if (typeof view.$box === 'undefined') {
      return false;
    }
    var $box = $(view.$box[0]);
    var position = $box.position();
    var rbox = g.rect(
      position.left,
      position.top,
      $box.width() * ctx.state.zoom,
      $box.height() * ctx.state.zoom
    );
    return rbox.containsPoint({
      x: x * ctx.state.zoom + ctx.state.pan.x,
      y: y * ctx.state.zoom + ctx.state.pan.y,
    });
  }

  //--------------------------------------------------------------------------
  //-- Set up all paper + graph + keyboard event listeners
  //--------------------------------------------------------------------------
  function setup() {
    var isDblClick = false;
    var pointerdblclickCellType = false;
    var shiftPressed = false;

    //-- Keyboard: track Shift state, handle Escape → deselect
    $(document).on('keydown', function (evt) {
      if (ctx.utils.hasShift(evt)) {
        shiftPressed = true;
      }
    });

    $(document).on('keyup', function (evt) {
      if (!ctx.utils.hasShift(evt)) {
        shiftPressed = false;
      }
    });

    $(document).on('disableSelected', function () {
      if (!shiftPressed) {
        ctx.disableSelected();
      }
    });

    //-- selectionView events
    ctx.selectionView.on('selection-box:pointerdown', function () {
      if (ctx.hasSelection()) {
        ctx.selection.each(function (cell) {
          var cellView = ctx.paper.findViewByModel(cell);
          if (!cellView.model.isLink()) {
            if (cellView.$box.css('z-index') < ctx.z.index) {
              cellView.$box.css('z-index', ++ctx.z.index);
            }
          }
        });
      }
    });

    ctx.selectionView.on('selection-box:pointerclick', function (evt) {
      if (isDblClick === false) {
        if (ctx.service.addingDraggableBlock) {
          ctx.service.addingDraggableBlock = false;
          processReplaceBlock(ctx.selection.at(0));
          ctx.disableSelected();
          ctx.__updateWiresOnObstacles();
          $('body').trigger('Graph::lpRefresh');
        } else {
          if (ctx.utils.hasShift(evt)) {
            var cell = ctx.selection.get($(evt.target).data('model'));
            ctx.selection.reset(ctx.selection.without(cell));
            ctx.selectionView.destroySelectionBox(cell);
          }
        }
      }
    });

    ctx.selectionView.on('selection-box:pointermove', function () {
      if (ctx.service.addingDraggableBlock && ctx.hasSelection()) {
        debounceDisableReplacedBlock(ctx.selection.at(0));
      }
    });

    //-- cell:pointerclick — wire vertex insertion + block selection
    ctx.paper.on('cell:pointerclick', function (cellView, evt, x, y) {
      if (cellView.model.isLink()) {
        var linkModel = cellView.model;
        var vertices = linkModel.get('vertices') || [];

        if (evt.target.closest('.marker-vertex-remove')) {
          return;
        }
        if (evt.target.closest('.marker-vertex-group')) {
          return;
        }

        var localPoint = ctx.paper.pageToLocalPoint({
          x: evt.clientX,
          y: evt.clientY,
        });

        if (isClickOnVertex(cellView, localPoint.x, localPoint.y)) {
          return;
        }

        var index = ctx.getInsertIndex(vertices, localPoint, linkModel);

        if (
          !vertices.some(function (v) {
            return v.x === localPoint.x && v.y === localPoint.y;
          })
        ) {
          vertices.splice(index, 0, { x: localPoint.x, y: localPoint.y });
          var cleanedVertices = vertices.map(function (v) {
            return { x: v.x, y: v.y };
          });
          linkModel.set('vertices', cleanedVertices, { ui: true });
          setTimeout(function () {
            var linkView = ctx.paper.findViewByModel(linkModel);
            if (!linkView) {
              return;
            }
            linkModel.trigger('change:vertices');
          }, 50);
        }
        return;
      }

      if (!checkInsideViewBox(cellView, x, y)) {
        return;
      }

      if (!ctx.utils.hasShift(evt)) {
        ctx.selectionView.cancelSelection();
      }

      if (ctx.paper.options.enabled) {
        if (!cellView.model.isLink()) {
          document.activeElement.blur();
          if (ctx.utils.hasLeftButton(evt)) {
            ctx.selection.add(cellView.model);
            ctx.selectionView.createSelectionBox(cellView.model);
          }
        }
      }
    });

    //-- cell:pointerdblclick — edit basic blocks / navigate generic blocks
    ctx.paper.on('cell:pointerdblclick', async function (cellView, evt, x, y) {
      if (x && y && !checkInsideViewBox(cellView, x, y)) {
        return;
      }

      ctx.selectionView.cancelSelection();

      if (!ctx.utils.hasShift(evt)) {
        pointerdblclickCellType = cellView.model.get('blockType');
        var blockId = cellView.model.get('id');

        if (pointerdblclickCellType.indexOf('basic.') !== -1) {
          if (ctx.paper.options.enabled) {
            var allowInoutPorts =
              ctx.profile.get('allowInoutPorts') ||
              ctx.common.allowProjectInoutPorts;
            ctx.blockforms.editBasic(
              pointerdblclickCellType,
              allowInoutPorts,
              cellView,
              ctx.addCell
            );
          }
        } else if (ctx.common.allDependencies[pointerdblclickCellType]) {
          if (
            typeof ctx.common.isEditingSubmodule !== 'undefined' &&
            ctx.common.isEditingSubmodule === true
          ) {
            alertify.warning(
              ctx.gettextCatalog.getString(
                'To enter "edit mode" in a deeper block, you need to finish the current level by locking the padlock.'
              )
            );
            return;
          }
          ctx.z.index = 1;
          isDblClick = true;

          await ctx.utils.beginBlockingTask();
          setTimeout(function () {
            ctx.$rootScope.$broadcast('navigateProject', {
              update: ctx.service.breadcrumbs.length === 1,
              project: ctx.common.allDependencies[pointerdblclickCellType],
              submodule: pointerdblclickCellType,
              submoduleId: blockId,
              fromDoubleClick: true,
            });
          }, 0);
          setTimeout(function () {
            isDblClick = false;
          }, 250);
        }
      }
    });

    //-- io-edit icon click → trigger dblclick on cell
    document.addEventListener('click', function (event) {
      var target = event.target;
      while (target && target !== this) {
        if (target.matches('.js-codeblock-io-edit')) {
          event.stopPropagation();
          var modelId = target.getAttribute('data-blkid');
          if (!modelId) {
            return;
          }
          var cell = ctx.paper.getModelById(modelId);
          if (!cell) {
            return;
          }
          var cellView = ctx.paper.findViewByModel(cell);
          if (!cellView) {
            return;
          }
          ctx.paper.trigger('cell:pointerdblclick', cellView, event, 0, 0);
          break;
        }
        target = target.parentNode;
      }
    });

    //-- Advanced code-editor buttons
    document.addEventListener('click', function (event) {
      var nodePath = require('path');
      var target = event.target;
      while (target && target !== document) {
        var mode = null;
        if (target.matches('.js-codeblock-full-edit')) {
          mode = 'full';
        } else if (target.matches('.js-codeblock-formal-test')) {
          mode = 'formal';
        } else if (target.matches('.js-codeblock-testbench')) {
          mode = 'testbench';
        } else if (target.matches('.js-codeblock-push-collection')) {
          event.stopPropagation();
          var pushBlockId = target.getAttribute('data-blkid');
          if (!pushBlockId) {
            break;
          }
          var pushCell = ctx.paper.getModelById(pushBlockId);
          if (!pushCell) {
            break;
          }
          ctx.pushCodeBlockToCollection(
            pushCell.attributes.data || {},
            pushBlockId
          );
          break;
        }

        if (mode) {
          event.stopPropagation();
          var blockId = target.getAttribute('data-blkid');
          if (!blockId) {
            break;
          }
          var cell = ctx.paper.getModelById(blockId);
          if (!cell) {
            break;
          }
          var data = cell.attributes.data || {};
          var rawName = (data.label || data.name || blockId).replace(
            /[^a-zA-Z0-9_]/g,
            '_'
          );
          var moduleName = rawName || 'ice_code_module';

          var configObj = {
            mode: mode,
            blockId: blockId,
            code: data.code || '',
            ports: data.ports || { in: [], out: [] },
            params: data.params || [],
            testbench: data.testbench || '',
            moduleName: moduleName,
            theme: ctx.profile.data.uiTheme || 'light',
            customTheme: ctx.profile.data.customTheme || null,
            buildDir: ctx.common.BUILD_DIR,
            blockDir: nodePath.join(ctx.common.BUILD_DIR, 'blocks', blockId),
            toolchainBinDir: nodePath.join(
              ctx.common.APIO_HOME_DIR,
              'packages',
              'tools-oss-cad-suite',
              'bin'
            ),
            isWin32: process.platform === 'win32',
            formalVerifyPyPath: nodePath.resolve(
              nodePath.join('..', 'formal_verify', 'formal_verify.py')
            ),
            pythonCmd: ctx.common.PYTHON_ENV || 'python',
            sourcePath: data.sourcePath || '',
            boardInfo: ctx.common.selectedBoard
              ? {
                  name: ctx.common.selectedBoard.name || '',
                  info: ctx.common.selectedBoard.info || {},
                }
              : null,
            boardPinout: ctx.common.selectedBoard
              ? ctx.common.selectedBoard.pinout || []
              : [],
          };

          var configParam = encodeURIComponent(JSON.stringify(configObj));
          var editorURL =
            'resources/viewers/code-editor/code-editor.html?config=' +
            configParam;

          var titles = {
            full: 'Full Editor',
            formal: 'Formal Test',
            testbench: 'Testbench',
          };
          nw.Window.open(editorURL, {
            title: 'Code Editor - ' + titles[mode],
            focus: true,
            resizable: true,
            show: false,
            width: mode === 'testbench' ? 1200 : 900,
            height: 700,
            icon: 'resources/images/icestudio-logo.png',
          });
          break;
        }
        target = target.parentNode;
      }
    });

    //-- Expose code-save receiver to popup windows
    nw.Window.get().window.icestudioReceiveCodeSave = function (
      blockId,
      newCode
    ) {
      var cell = ctx.paper.getModelById(blockId);
      if (!cell) {
        return;
      }
      cell.attributes.data.code = newCode;
      var cellView = ctx.paper.findViewByModel(cell);
      if (cellView && cellView.editor) {
        cellView.updating = true;
        cellView.editor.session.setValue(newCode);
        setTimeout(function () {
          cellView.updating = false;
        }, 50);
      }
      ctx.utils.rootScopeSafeApply();
    };

    nw.Window.get().window.icestudioGetCode = function (blockId) {
      var cell = ctx.paper.getModelById(blockId);
      if (!cell) {
        return '';
      }
      return (cell.attributes.data && cell.attributes.data.code) || '';
    };

    nw.Window.get().window.icestudioRequestVerify = function (
      blockId,
      newCode,
      callerNWWin
    ) {
      nw.Window.get().window.icestudioReceiveCodeSave(blockId, newCode);
      ctx.$rootScope.$broadcast('codeblock:requestVerify', {
        callerWin: callerNWWin,
      });
    };

    //-- blank:pointerdown — start selection or enable pan
    ctx.paper.on('blank:pointerdown', function (evt, x, y) {
      document.activeElement.blur();
      if (ctx.utils.hasLeftButton(evt)) {
        if (ctx.utils.hasCtrl(evt)) {
          if (!ctx.service.isEmpty()) {
            ctx.service.panAndZoom.enablePan();
          }
        } else if (ctx.paper.options.enabled) {
          ctx.selectionView.startSelecting(evt, x, y);
        }
      } else if (ctx.utils.hasRightButton(evt)) {
        if (!ctx.service.isEmpty()) {
          ctx.service.panAndZoom.enablePan();
        }
      }
    });

    ctx.paper.on('blank:pointerup', function () {
      ctx.service.panAndZoom.disablePan();
    });

    ctx.paper.on('blank:pointerclick', function () {
      $('body').trigger('Graph::blankClick');
    });

    ctx.paper.on('blank:pointerdown', function () {
      $('body').trigger('Graph::blankClick');
    });

    //-- cell:mouseover — z-index management
    ctx.paper.on('cell:mouseover', function (cellView, evt) {
      if (!ctx.utils.hasButtonPressed(evt)) {
        if (!cellView.model.isLink()) {
          if (cellView.$box.css('z-index') < ctx.z.index) {
            cellView.$box.css('z-index', ++ctx.z.index);
          }
        }
      }
    });

    //-- cell:pointerup — trigger block replacement
    ctx.paper.on('cell:pointerup', function (cellView) {
      setTimeout(function () {
        if (isDblClick === false) {
          ctx.graph.trigger('batch:start');
          processReplaceBlock(cellView.model);
          ctx.graph.trigger('batch:stop');
        }
      }, 200);
    });

    //-- cell:pointermove — debounced replacement highlight
    ctx.paper.on('cell:pointermove', function (cellView) {
      debounceDisableReplacedBlock(cellView.model);
    });

    //-- navigateProjectEnded — update breadcrumbs
    ctx.$rootScope.$on('navigateProjectEnded', function (event, args) {
      if (args.fromDoubleClick) {
        ctx.service.breadcrumbs.push({
          name:
            ctx.common.allDependencies[pointerdblclickCellType].package.name ||
            '#',
          type: pointerdblclickCellType,
        });
      }
      ctx.utils.rootScopeSafeApply();
    });

    //-- graph events: wire order + port defaults + wire group sync + auto refresh
    ctx.graph.off('change:data', ctx.wireLogicLpSyncWireGroup);
    ctx.graph.on('change:data', ctx.wireLogicLpSyncWireGroup);

    var lpTriggerAutoRefresh = ctx.nodeDebounce(function () {
      $('body').trigger('Graph::lpRefresh');
    }, 200);
    ctx.graph.off('change:data', lpTriggerAutoRefresh);
    ctx.graph.on('change:data', lpTriggerAutoRefresh);
    ctx.graph.off('change:deltas', lpTriggerAutoRefresh);
    ctx.graph.on('change:deltas', lpTriggerAutoRefresh);

    ctx.graph.on('add', function (cell) {
      if (cell.isLink()) {
        setTimeout(function () {
          cell.toBack();
        }, 10);
      }
    });

    ctx.graph.on('change:source change:target', function (cell) {
      if (cell.isLink() && cell.get('source').id) {
        var target = cell.get('target');
        if (target.id) {
          cell.attributes.lastTarget = target;
          ctx.updatePortDefault(target, false);
        } else {
          target = cell.get('lastTarget');
          ctx.updatePortDefault(target, true);
        }
      }
      if (cell.isLink()) {
        setTimeout(function () {
          cell.toBack();
        }, 50);
      }
    });

    ctx.graph.on('remove', function (cell) {
      if (cell.isLink()) {
        var target = cell.get('target');
        if (!target.id) {
          target = cell.get('lastTarget');
        }
        ctx.updatePortDefault(target, true);
      }
    });

    ctx.graph.trigger('state', ctx.state);
  }

  return {
    processReplaceBlock: processReplaceBlock,
    findLowerBlock: findLowerBlock,
    disableReplacedBlock: disableReplacedBlock,
    debounceDisableReplacedBlock: debounceDisableReplacedBlock,
    checkInsideViewBox: checkInsideViewBox,
    setup: setup,
  };
};
