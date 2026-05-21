//---------------------------------------------------------------------------
//-- cellManager.js: Add, remove, drag, replace blocks; undo/redo; clipboard
//-- Loaded as a <script> tag before graph.js; exposes window._icegraph.cellManager
//---------------------------------------------------------------------------
/* global iceStudio */
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

  function buildSubmoduleDesign(
    portsIn,
    portsOut,
    params,
    inoutLeft,
    inoutRight,
    code,
    label,
    forceCodeBlock
  ) {
    var allBlocks = [];
    var allWires = [];

    var rangeToSize = function (range) {
      if (!range) {
        return undefined;
      }
      var m = range.match(/\[(\d+):(\d+)\]/);
      return m ? parseInt(m[1]) - parseInt(m[2]) + 1 : undefined;
    };
    var codeBlockId = ctx.joint.util.uuid();
    var includeCode = forceCodeBlock || !!code;

    // Layout constants
    var CODE_X = 398;
    var CODE_Y = 134;
    var CODE_WIDTH = 800;
    var IO_HALF_H = 16; // half of the 32px default ice.Input/Output height
    var totalLeftPorts = portsIn.length + inoutLeft.length;
    var totalRightPorts = portsOut.length + inoutRight.length;
    var leftCount = Math.max(totalLeftPorts, params.length);
    var rightCount = totalRightPorts;
    var codeHeight = Math.max(300, Math.max(leftCount, rightCount) * 80 + 160);
    var ioRightX = CODE_X + CODE_WIDTH + 240;

    // Returns the absolute Y of code-block port[index] of [total] on one side.
    // Mirrors the JointJS getPortAttrs formula in joint.shapes.js.
    var codePortY = function (index, total) {
      var gridunits = codeHeight / 8;
      var pos = Math.round(((index + 0.5) / total) * gridunits) / gridunits;
      return CODE_Y + pos * codeHeight;
    };

    // Y position for an IO block so its port (at block-center) aligns with
    // the corresponding code-block port.  Falls back to simple spacing when
    // there is no code block or no ports on that side.
    var ioY = function (index, total) {
      if (includeCode && total > 0) {
        return codePortY(index, total) - IO_HALF_H;
      }
      return 80 + index * 80;
    };

    portsIn.forEach(function (port, idx) {
      var id = ctx.joint.util.uuid();
      var inputData = {
        name: port.name,
        pins: buildSubmodulePins(port.rangestr),
        virtual: true,
        clock: false,
      };
      if (port.rangestr) {
        inputData.range = port.rangestr;
      }
      allBlocks.push({
        id: id,
        type: 'basic.input',
        data: inputData,
        position: { x: 50, y: ioY(idx, totalLeftPorts) },
      });
      if (includeCode) {
        var inWire = {
          source: { block: id, port: 'out' },
          target: { block: codeBlockId, port: port.name },
        };
        var inSize = rangeToSize(port.rangestr);
        if (inSize) {
          inWire.size = inSize;
        }
        allWires.push(inWire);
      }
    });

    // Inout-left ports appear as left ports on the parent Generic block.
    // Represented inside the submodule as basic.input blocks with inout:true.
    inoutLeft.forEach(function (port, idx) {
      var id = ctx.joint.util.uuid();
      var inputData = {
        name: port.name,
        pins: buildSubmodulePins(port.rangestr),
        virtual: true,
        clock: false,
        inout: true,
      };
      if (port.rangestr) {
        inputData.range = port.rangestr;
      }
      allBlocks.push({
        id: id,
        type: 'basic.input',
        data: inputData,
        position: { x: 50, y: ioY(portsIn.length + idx, totalLeftPorts) },
      });
    });

    portsOut.forEach(function (port, idx) {
      var id = ctx.joint.util.uuid();
      var outputData = {
        name: port.name,
        pins: buildSubmodulePins(port.rangestr),
        virtual: true,
      };
      if (port.rangestr) {
        outputData.range = port.rangestr;
      }
      allBlocks.push({
        id: id,
        type: 'basic.output',
        data: outputData,
        position: { x: ioRightX, y: ioY(idx, totalRightPorts) },
      });
      if (includeCode) {
        var outWire = {
          source: { block: codeBlockId, port: port.name },
          target: { block: id, port: 'in' },
        };
        var outSize = rangeToSize(port.rangestr);
        if (outSize) {
          outWire.size = outSize;
        }
        allWires.push(outWire);
      }
    });

    // Inout-right ports appear as right ports on the parent Generic block.
    // Represented inside the submodule as basic.output blocks with inout:true.
    inoutRight.forEach(function (port, idx) {
      var id = ctx.joint.util.uuid();
      var outputData = {
        name: port.name,
        pins: buildSubmodulePins(port.rangestr),
        virtual: true,
        inout: true,
      };
      if (port.rangestr) {
        outputData.range = port.rangestr;
      }
      allBlocks.push({
        id: id,
        type: 'basic.output',
        data: outputData,
        position: {
          x: ioRightX,
          y: ioY(portsOut.length + idx, totalRightPorts),
        },
      });
    });

    params.forEach(function (param, idx) {
      var id = ctx.joint.util.uuid();
      allBlocks.push({
        id: id,
        type: 'basic.constant',
        data: { name: param.name, value: '', local: false },
        position: { x: CODE_X + idx * 150, y: 20 },
      });
      if (includeCode) {
        allWires.push({
          source: { block: id, port: 'constant-out' },
          target: { block: codeBlockId, port: param.name },
        });
      }
    });

    if (includeCode) {
      var mapPort = function (p) {
        var o = { name: p.name };
        if (p.rangestr) {
          o.range = p.rangestr;
          o.size = p.size || rangeToSize(p.rangestr);
        }
        return o;
      };

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
            in: portsIn.map(mapPort),
            out: portsOut.map(mapPort),
            inoutLeft: inoutLeft.map(mapPort),
            inoutRight: inoutRight.map(mapPort),
          },
        },
        position: { x: CODE_X, y: CODE_Y },
        size: { width: CODE_WIDTH, height: codeHeight },
      });
    }

    return { blocks: allBlocks, wires: allWires };
  }

  function createSubmodule() {
    //-- Single dialog: Module Ports + label (no second popup for package info)
    ctx.blockforms.getCodeFormData(function (formData) {
      var portsIn = formData.inPortsInfo || [];
      var portsOut = formData.outPortsInfo || [];
      var params = formData.inParamsInfo || [];
      var inoutLeft = formData.inoutLeftPortsInfo || [];
      var inoutRight = formData.inoutRightPortsInfo || [];
      var code = (formData.code || '').trim();
      var label = formData.label || 'submodule';

      var subGraph = buildSubmoduleDesign(
        portsIn,
        portsOut,
        params,
        inoutLeft,
        inoutRight,
        code,
        label
      );

      var boardName =
        ctx.common.selectedBoard && ctx.common.selectedBoard.name
          ? ctx.common.selectedBoard.name
          : 'alhambra-ii';

      var blockData = {
        version: '1.2',
        package: {
          name: label,
          version: formData.pkgVersion || '1.0.0',
          description: formData.pkgDesc || '',
          author: formData.pkgAuthor || '',
          image: formData.pkgImage || '',
        },
        design: {
          board: boardName,
          graph: subGraph,
        },
        dependencies: {},
      };

      var type = ctx.utils.dependencyID(blockData);
      ctx.common.allDependencies[type] = blockData;

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
  }

  // Walk a design graph recursively, collecting every non-basic block-type
  // definition found in ctx.common.allDependencies into `result`.
  function collectTransitiveDeps(design, result) {
    (design.graph.blocks || []).forEach(function (block) {
      if (
        block.type &&
        block.type.indexOf('basic.') === -1 &&
        !result[block.type]
      ) {
        var d = ctx.common.allDependencies[block.type];
        if (d) {
          result[block.type] = d;
          collectTransitiveDeps(d.design, result);
        }
      }
    });
  }

  function editGenericBlock(cellId, typeId) {
    var dep = ctx.common.allDependencies[typeId];
    if (!dep) {
      alertify.error(
        ctx.gettextCatalog.getString('Block definition not found')
      );
      return;
    }

    var inputPorts = [];
    var outputPorts = [];
    var paramPorts = [];
    // Build a range-by-name lookup from the basic.code block's ports so that
    // files saved before the importer stored range on basic.input/basic.output
    // still show the correct dimensions in the dialog.
    var codePortRanges = {};
    (dep.design.graph.blocks || []).forEach(function (item) {
      if (item.type === 'basic.code') {
        var allCodePorts = (item.data.ports.in || []).concat(
          item.data.ports.out || []
        );
        allCodePorts.forEach(function (p) {
          if (p.range) {
            codePortRanges[p.name] = p.range;
          }
        });
      }
    });
    (dep.design.graph.blocks || []).forEach(function (item) {
      var range;
      if (item.type === 'basic.input') {
        range = item.data.range || codePortRanges[item.data.name] || '';
        inputPorts.push({ name: item.data.name, range: range });
      } else if (item.type === 'basic.output') {
        range = item.data.range || codePortRanges[item.data.name] || '';
        outputPorts.push({ name: item.data.name, range: range });
      } else if (
        (item.type === 'basic.constant' || item.type === 'basic.memory') &&
        !item.data.local
      ) {
        paramPorts.push({ name: item.data.name });
      }
    });

    var inPortStr = ctx.blocks.portsInfo2Str(inputPorts);
    var outPortStr = ctx.blocks.portsInfo2Str(outputPorts);
    var paramStr = ctx.blocks.portsInfo2Str(paramPorts);
    var pkgName = dep.package.name || '';

    // Build the complete transitive dependency map so the saved .ice file is
    // self-contained (non-basic blocks inside the submodule need their definitions).
    var blockDependencies = {};
    collectTransitiveDeps(dep.design, blockDependencies);

    var pkgInfo = {
      name: dep.package.name || '',
      version: dep.package.version || '',
      desc: dep.package.description || '',
      author: dep.package.author || '',
      image: dep.package.image || '',
      blockDesign: dep.design,
      blockDependencies: blockDependencies,
    };

    ctx.blockforms.getCodeFormDataWith(
      inPortStr,
      outPortStr,
      paramStr,
      pkgName,
      pkgInfo,
      function (formData) {
        dep.package.name = formData.label || pkgName;
        dep.package.version =
          formData.pkgVersion || dep.package.version || '1.0.0';
        dep.package.description =
          formData.pkgDesc || dep.package.description || '';
        dep.package.author = formData.pkgAuthor || dep.package.author || '';
        dep.package.image =
          formData.pkgImage !== undefined
            ? formData.pkgImage
            : dep.package.image || '';

        var nonBoundaryBlocks = (dep.design.graph.blocks || []).filter(
          function (b) {
            return (
              b.type !== 'basic.input' &&
              b.type !== 'basic.output' &&
              !(
                (b.type === 'basic.constant' || b.type === 'basic.memory') &&
                !b.data.local
              )
            );
          }
        );

        // Build a lookup of old boundary block IDs by type+name so that
        // ports whose names are unchanged keep their old IDs.  This preserves
        // internal wire connections that reference those IDs.
        var oldBoundaryIds = {};
        (dep.design.graph.blocks || []).forEach(function (b) {
          if (b.type === 'basic.input' || b.type === 'basic.output') {
            oldBoundaryIds[b.type + ':' + b.data.name] = b.id;
          }
        });

        formData.inPortsInfo.forEach(function (port, idx) {
          var key = 'basic.input:' + port.name;
          var portRange = port.rangestr || '';
          var pinCount = port.size || 1;
          var pins = [];
          for (var pi = 0; pi < pinCount; pi++) {
            pins.push({ index: String(pi), name: '', value: '0' });
          }
          nonBoundaryBlocks.push({
            id: oldBoundaryIds[key] || ctx.joint.util.uuid(),
            type: 'basic.input',
            data: {
              name: port.name,
              range: portRange,
              pins: pins,
              virtual: true,
              clock: false,
            },
            position: { x: 50, y: 80 + idx * 80 },
          });
        });

        formData.outPortsInfo.forEach(function (port, idx) {
          var key = 'basic.output:' + port.name;
          var portRange = port.rangestr || '';
          var pinCount = port.size || 1;
          var pins = [];
          for (var pi = 0; pi < pinCount; pi++) {
            pins.push({ index: String(pi), name: '', value: '0' });
          }
          nonBoundaryBlocks.push({
            id: oldBoundaryIds[key] || ctx.joint.util.uuid(),
            type: 'basic.output',
            data: {
              name: port.name,
              range: portRange,
              pins: pins,
              virtual: true,
            },
            position: { x: 750, y: 80 + idx * 80 },
          });
        });

        formData.inParamsInfo.forEach(function (param, idx) {
          nonBoundaryBlocks.push({
            id: ctx.joint.util.uuid(),
            type: 'basic.constant',
            data: { name: param.name, value: '', local: false },
            position: { x: 300 + idx * 150, y: 20 },
          });
        });

        dep.design.graph.blocks = nonBoundaryBlocks;

        var oldCell = ctx.graph.getCell(cellId);
        if (!oldCell) {
          return;
        }

        var connectedWires = ctx.graph.getConnectedLinks(oldCell);
        var oldPosition = oldCell.get('position');
        var oldSize = oldCell.get('size');

        var newCell = ctx.blockforms.loadGeneric(
          { id: cellId, type: typeId, position: oldPosition, size: oldSize },
          dep,
          false
        );

        ctx.graph.startBatch('change');
        oldCell.remove();
        addCell(newCell);

        var newLeft = newCell.get('leftPorts') || [];
        var newRight = newCell.get('rightPorts') || [];
        var newTop = newCell.get('topPorts') || [];

        connectedWires.forEach(function (wire) {
          var src = wire.get('source');
          var tgt = wire.get('target');
          var srcOk =
            src.id !== cellId ||
            newRight.some(function (p) {
              return p.id === src.port;
            });
          var tgtOk =
            tgt.id !== cellId ||
            newLeft.some(function (p) {
              return p.id === tgt.port;
            }) ||
            newTop.some(function (p) {
              return p.id === tgt.port;
            });
          if (srcOk && tgtOk) {
            ctx.graph.addCell(wire);
          }
        });

        ctx.graph.stopBatch('change');
        iceStudio.bus.events.publish('project:changed');
        alertify.success(ctx.gettextCatalog.getString('Block updated'));
      }
    );
  }

  iceStudio.bus.events.subscribe('block:editProperties', function (data) {
    editGenericBlock(data.cellId, data.typeId);
  });

  //--------------------------------------------------------------------------
  //-- Sync virtual I/O ports in current submodule back to the parent Generic
  //-- cell. Called after a virtual port is added or removed while editing a
  //-- submodule so the parent's port list stays in sync without navigating back.
  //--------------------------------------------------------------------------
  function syncVirtualPortsToParent() {
    if (!ctx.common.submoduleHeap || ctx.common.submoduleHeap.length === 0) {
      return;
    }
    var parentEntry = ctx.getParentEntry ? ctx.getParentEntry() : null;
    if (!parentEntry) {
      return;
    }

    var lastHeap =
      ctx.common.submoduleHeap[ctx.common.submoduleHeap.length - 1];
    var typeId = lastHeap.id;
    var cellId = lastHeap.uid;
    if (!typeId || !cellId) {
      return;
    }

    var dep = ctx.common.allDependencies[typeId];
    if (!dep || !dep.design || !dep.design.graph) {
      return;
    }

    // Collect current virtual I/O blocks from the submodule graph
    var newBoundaryBlocks = [];
    ctx.graph.getCells().forEach(function (cell) {
      var jType = cell.get('type');
      if (jType !== 'ice.Input' && jType !== 'ice.Output') {
        return;
      }
      var data = cell.get('data');
      if (!data || !data.virtual) {
        return;
      }
      // Derive blockType from the JointJS type — blockType attribute may not be
      // set on cells created via the form dialog (only set when loaded from JSON).
      var blockType = jType === 'ice.Input' ? 'basic.input' : 'basic.output';
      newBoundaryBlocks.push({
        id: cell.id,
        type: blockType,
        data: data,
        position: cell.get('position'),
      });
    });

    // Replace boundary blocks in the dependency, keep everything else
    var nonBoundaryBlocks = (dep.design.graph.blocks || []).filter(
      function (b) {
        return b.type !== 'basic.input' && b.type !== 'basic.output';
      }
    );
    dep.design.graph.blocks = nonBoundaryBlocks.concat(newBoundaryBlocks);

    // Rebuild the Generic cell in the parent graph
    var parentGraph = parentEntry.graph;
    var existingCell = parentGraph.getCell(cellId);
    if (!existingCell) {
      return;
    }

    var instance = {
      id: cellId,
      type: typeId,
      position: existingCell.get('position'),
      size: null,
    };

    var newCell = ctx.blockforms.loadGeneric(instance, dep, false);
    if (!newCell) {
      return;
    }

    var connectedWires = parentGraph.getConnectedLinks(existingCell);
    var newLeftPorts = newCell.get('leftPorts');
    var newRightPorts = newCell.get('rightPorts');

    // Set state + rules so the parent paper's view can render without crashing
    updateCellAttributes(newCell);

    parentGraph.startBatch('change');
    existingCell.remove();
    parentGraph.addCell(newCell);
    connectedWires.forEach(function (wire) {
      var src = wire.get('source');
      var tgt = wire.get('target');
      var keep = false;
      if (
        src.id === cellId &&
        newRightPorts.some(function (p) {
          return p.id === src.port;
        })
      ) {
        keep = true;
      } else if (
        tgt.id === cellId &&
        newLeftPorts.some(function (p) {
          return p.id === tgt.port;
        })
      ) {
        keep = true;
      }
      if (keep) {
        parentGraph.addCell(wire);
      }
    });
    parentGraph.stopBatch('change');
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

      // When editing inside a submodule, ensure all new I/O cells are virtual
      // and sync them to the parent Generic block.  Force virtual=true as a
      // safety net in case the form dialog didn't set it (e.g. race with flag).
      var hasIO = cells.some(function (c) {
        var t = c.get('type');
        return t === 'ice.Input' || t === 'ice.Output';
      });
      if (hasIO) {
        if (ctx.common.isEditingSubmodule) {
          _.each(cells, function (c) {
            var t = c.get('type');
            if (t === 'ice.Input' || t === 'ice.Output') {
              var d = c.get('data');
              if (d && !d.virtual) {
                c.set('data', _.extend({}, d, { virtual: true }));
              }
            }
          });
          syncVirtualPortsToParent();
        } else {
          // Outside submodule — only sync if a virtual I/O is present
          var hasVirtualIO = cells.some(function (c) {
            var t = c.get('type');
            return (
              (t === 'ice.Input' || t === 'ice.Output') &&
              c.get('data') &&
              c.get('data').virtual
            );
          });
          if (hasVirtualIO) {
            syncVirtualPortsToParent();
          }
        }
      }
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

  //-- Apply red error highlight to blocks (by id) and specific input ports.
  //-- portSpecs: [{blockId, portId}] where portId matches the leftPorts id.
  function errorHighlightCells(blockIds, portSpecs) {
    blockIds.forEach(function (id) {
      var cellView = ctx.paper.findViewByModel(id);
      if (cellView && cellView.$box) {
        cellView.$box.addClass('conn-error');
      }
    });
    portSpecs.forEach(function (spec) {
      var el = document.getElementById(
        'port-default-' + spec.blockId + '-' + spec.portId
      );
      if (el && el.parentElement) {
        el.parentElement.classList.add('conn-error-port');
      }
    });
  }

  //-- Rename all label cells (inputLabel, outputLabel, pairedLabel) whose
  //-- data.name matches oldName, updating data + refreshing the DOM.
  function renameWire(oldName, newName) {
    if (!newName || newName === oldName) {
      return;
    }
    var labelTypes = [
      window._iceblocks.BASIC_INPUT_LABEL,
      window._iceblocks.BASIC_OUTPUT_LABEL,
      window._iceblocks.BASIC_PAIRED_LABELS,
    ];
    ctx.graph.getCells().forEach(function (cell) {
      if (
        labelTypes.indexOf(cell.get('blockType')) !== -1 &&
        cell.get('data') &&
        cell.get('data').name === oldName
      ) {
        updateCellData(cell.id, { name: newName });
      }
    });
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
        iceStudio.bus.events.publish('git:designChanged', 'Paste');
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
        iceStudio.bus.events.publish('git:designChanged', 'Paste clone');
      });
    }
  }

  function duplicateSelected() {
    if (hasSelection()) {
      ctx.utils.duplicateSelected(ctx.selection, ctx.graph, function (object) {
        ctx.service.appendDesign(object.design, object.dependencies);
        iceStudio.bus.events.publish('git:designChanged', 'Duplicate');
      });
    }
  }

  function removeSelected() {
    if (hasSelection()) {
      var hadVirtualIO = ctx.selection.models.some(function (cell) {
        var t = cell.get('type');
        return (
          (t === 'ice.Input' || t === 'ice.Output') &&
          (ctx.common.isEditingSubmodule ||
            (cell.get('data') && cell.get('data').virtual))
        );
      });
      ctx.graph.removeCells(ctx.selection.models);
      ctx.selectionView.cancelSelection();
      ctx.service.updateWires();
      $('body').trigger('Graph::lpRefresh');
      iceStudio.bus.events.publish('git:designChanged', 'Delete');
      if (hadVirtualIO) {
        syncVirtualPortsToParent();
      }
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
  //-- Top-level cell cache (for fast submodule back-navigation)
  //--------------------------------------------------------------------------

  // Only ACE-editor block types are expensive to recreate — cache those.
  // Simple blocks (Input/Output/Constant/etc.) rebuild from template in <1 ms.
  var _ACE_TYPES = {
    'ice.Code': true,
    'ice.Info': true,
    'ice.Memory': true,
    'ice.JsonInput': true,
    'ice.JsonOutput': true,
  };

  // Snapshot ACE-editor views so the next initialize() can skip ace.edit().
  // Returns ALL cells (blocks + wires) so the caller can re-add them all.
  function cacheTopCells() {
    var cells = ctx.graph.getCells();
    cells.forEach(function (cell) {
      if (cell.isLink()) {
        return;
      }
      if (!_ACE_TYPES[cell.get('type')]) {
        return;
      }
      var view = ctx.paper.findViewByModel(cell);
      if (!view) {
        return;
      }
      if (view.$box) {
        view.$box.detach();
        cell._iceCachedBox = view.$box;
      }
      cell._iceCachedView = view;
      if (view.editor) {
        cell._iceCachedEditor = view.editor;
      }
    });
    return cells;
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

  //--------------------------------------------------------------------------
  //-- Replace a basic.code cell with an equivalent Generic (submodule) cell.
  //-- The code block's ports, params, and Verilog code are preserved inside
  //-- the new submodule. Wires connected to the old cell are reconnected.
  //--------------------------------------------------------------------------
  function transformCodeToSubmodule(cellId) {
    var cell = ctx.graph.getCell(cellId);
    if (!cell) {
      return;
    }
    var data = cell.attributes.data || {};
    var portsIn = ((data.ports && data.ports.in) || []).map(function (p) {
      return { name: p.name, rangestr: p.range || '', size: p.size };
    });
    var portsOut = ((data.ports && data.ports.out) || []).map(function (p) {
      return { name: p.name, rangestr: p.range || '', size: p.size };
    });
    var params = (data.params || []).map(function (p) {
      return { name: p.name };
    });
    var inoutLeft = ((data.ports && data.ports.inoutLeft) || []).map(
      function (p) {
        return { name: p.name, rangestr: p.range || '', size: p.size };
      }
    );
    var inoutRight = ((data.ports && data.ports.inoutRight) || []).map(
      function (p) {
        return { name: p.name, rangestr: p.range || '', size: p.size };
      }
    );
    var code = data.code || '';
    var label = data.label || 'submodule';

    var subGraph = buildSubmoduleDesign(
      portsIn,
      portsOut,
      params,
      inoutLeft,
      inoutRight,
      code,
      label,
      true
    );

    // Map port name → inner block ID so we can update wire endpoints.
    // basic.input covers both regular inputs and inout-left ports.
    // basic.output covers both regular outputs and inout-right ports.
    var inPortNameToId = {};
    var outPortNameToId = {};
    subGraph.blocks.forEach(function (block) {
      if (block.type === 'basic.input') {
        inPortNameToId[block.data.name] = block.id;
      } else if (block.type === 'basic.output') {
        outPortNameToId[block.data.name] = block.id;
      }
    });

    var boardName =
      ctx.common.selectedBoard && ctx.common.selectedBoard.name
        ? ctx.common.selectedBoard.name
        : 'alhambra-ii';

    var blockData = {
      version: '1.2',
      package: {
        name: label,
        version: '1.0.0',
        description: '',
        author: '',
        image: '',
      },
      design: {
        board: boardName,
        graph: subGraph,
      },
      dependencies: {},
    };

    var typeId = ctx.utils.dependencyID(blockData);
    ctx.common.allDependencies[typeId] = blockData;

    var connectedWires = ctx.graph.getConnectedLinks(cell);
    var oldPosition = cell.get('position');

    // Omit size so loadGeneric computes it from port count
    var newCell = ctx.blockforms.loadGeneric(
      { id: cellId, type: typeId, position: oldPosition },
      blockData,
      false
    );

    ctx.graph.startBatch('change');
    cell.remove();
    addCell(newCell);

    var newLeft = newCell.get('leftPorts') || [];
    var newRight = newCell.get('rightPorts') || [];

    connectedWires.forEach(function (wire) {
      var src = wire.get('source');
      var tgt = wire.get('target');
      var newSrc = src;
      var newTgt = tgt;
      var si, ti, newOutId, newInId;

      if (src.id === cellId) {
        newOutId = outPortNameToId[src.port];
        if (newOutId) {
          for (si = 0; si < newRight.length; si++) {
            if (newRight[si].id === newOutId) {
              newSrc = { id: cellId, selector: si, port: newOutId };
              break;
            }
          }
        }
      }
      if (tgt.id === cellId) {
        newInId = inPortNameToId[tgt.port];
        if (newInId) {
          for (ti = 0; ti < newLeft.length; ti++) {
            if (newLeft[ti].id === newInId) {
              newTgt = { id: cellId, selector: ti, port: newInId };
              break;
            }
          }
        }
      }
      var srcValid =
        newSrc.id !== cellId ||
        newRight.some(function (p) {
          return p.id === newSrc.port;
        });
      var tgtValid =
        newTgt.id !== cellId ||
        newLeft.some(function (p) {
          return p.id === newTgt.port;
        });
      if (srcValid && tgtValid) {
        wire.set('source', newSrc);
        wire.set('target', newTgt);
        ctx.graph.addCell(wire);
      }
    });

    ctx.graph.stopBatch('change');
    iceStudio.bus.events.publish('project:changed');
    alertify.success(
      ctx.gettextCatalog.getString('Block transformed to submodule')
    );
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
    errorHighlightCells: errorHighlightCells,
    updateCellData: updateCellData,
    updateCellPin: updateCellPin,
    renameWire: renameWire,
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
    cacheTopCells: cacheTopCells,
    transformCodeToSubmodule: transformCodeToSubmodule,
  };
};
