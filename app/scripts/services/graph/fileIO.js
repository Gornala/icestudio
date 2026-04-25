//---------------------------------------------------------------------------
//-- fileIO.js: Load/save designs, graphToCells, pushCodeBlockToCollection
//-- Loaded as a <script> tag before graph.js; exposes window._icegraph.fileIO
//---------------------------------------------------------------------------
'use strict';

window._icegraph = window._icegraph || {};

window._icegraph.fileIO = function (ctx) {
  function toJSON() {
    return ctx.graph.toJSON();
  }

  function getCells() {
    return ctx.graph.getCells();
  }

  function isTopLevel() {
    return ctx.service.breadcrumbs.length < 2;
  }

  function convertIOtoTop(design) {
    if (isTopLevel()) {
      design.graph.blocks = design.graph.blocks.filter(function (block) {
        if (block.type === 'basic.input' || block.type === 'basic.output') {
          if (
            typeof block.data.clock !== 'undefined' &&
            block.data.clock === true
          ) {
            return false;
          }
          block.data.virtual = false;
          block.data.pins =
            block.data.pins ??
            Array.from({ length: block.data.size ?? 1 }, function (_, p) {
              return { index: String(p), name: 'NULL', value: 'NULL' };
            });
        }
        return true;
      });
    }
    design.board = ctx.common.selectedBoard.name;
    return design;
  }

  function graphOrigin(graphData) {
    var origin = { x: Infinity, y: Infinity };
    var position = false;
    _.each(graphData.blocks, function (block) {
      position = block.position;
      if (position.x < origin.x) {
        origin.x = position.x;
      }
      if (position.y < origin.y) {
        origin.y = position.y;
      }
    });
    return origin;
  }

  function graphToCells(_graph, opt) {
    var cell;
    var cells = [];
    var blocksMap = {};
    opt = opt || {};
    var isMigrated = false;

    function getBlocksFromLib(id) {
      for (var dep in ctx.common.allDependencies) {
        if (id === dep) {
          return ctx.common.allDependencies[dep].design.graph.blocks;
        }
      }
      return false;
    }

    function outputExists(oid, blks) {
      var founded = false;
      for (var i = 0; i < blks.length; i++) {
        if (blks[i].id === oid) {
          return true;
        }
      }
      return founded;
    }

    function wireExists(wre, blk, edge) {
      var founded = false;
      var blk2 = false;
      var i = 0;
      for (i = 0; i < blk.length; i++) {
        if (wre[edge].block === blk[i].id) {
          founded = i;
          break;
        }
      }
      if (founded !== false) {
        switch (blk[founded].type) {
          case ctx.blocks.BASIC_MEMORY:
          case ctx.blocks.BASIC_CONSTANT:
          case ctx.blocks.BASIC_OUTPUT_LABEL:
          case ctx.blocks.BASIC_INPUT_LABEL:
          case ctx.blocks.BASIC_CODE:
          case ctx.blocks.BASIC_GENERATE:
          case ctx.blocks.BASIC_INPUT:
          case ctx.blocks.BASIC_OUTPUT:
          case ctx.blocks.BASIC_JSON_INPUT:
          case ctx.blocks.BASIC_JSON_OUTPUT:
            founded = true;
            break;

          default:
            blk2 = getBlocksFromLib(blk[i].type);
            founded = outputExists(wre[edge].port, blk2);
        }
      }
      return founded;
    }

    // Validate wires — remove those pointing to missing blocks/ports
    var test = false;
    var todelete = [];

    for (var i = 0; i < _graph.wires.length; i++) {
      test = wireExists(_graph.wires[i], _graph.blocks, 'source');
      if (test) {
        test = wireExists(_graph.wires[i], _graph.blocks, 'target');
        if (test === true) {
          // valid
        } else {
          todelete.push(i);
        }
      } else {
        todelete.push(i);
      }
    }
    var tempw = [];
    for (var z = 0; z < _graph.wires.length; z++) {
      if (todelete.indexOf(z) === -1) {
        tempw.push(_graph.wires[z]);
      }
    }
    _graph.wires = ctx.utils.clone(tempw);

    _.each(_graph.blocks, function (blockInstance) {
      if (
        blockInstance.type !== false &&
        blockInstance.type.indexOf('basic.') > -1
      ) {
        if (
          opt.reset &&
          (blockInstance.type === ctx.blocks.BASIC_INPUT ||
            blockInstance.type === ctx.blocks.BASIC_OUTPUT)
        ) {
          var pins = blockInstance.data.pins;
          var replaced = false;
          for (var pi in pins) {
            replaced = false;
            if (typeof opt.designPinout !== 'undefined') {
              for (var opin = 0; opin < opt.designPinout.length; opin++) {
                if (
                  String(opt.designPinout[opin].name) === String(pins[pi].name)
                ) {
                  replaced = true;
                } else {
                  var prefix = String(pins[pi].name).replace(/[0-9]/g, '');
                  if (String(opt.designPinout[opin].name) === prefix) {
                    replaced = true;
                  }
                }
                if (replaced === true) {
                  pins[pi].name = opt.designPinout[opin].name;
                  pins[pi].value = opt.designPinout[opin].value;
                  opin = opt.designPinout.length;
                  replaced = true;
                  isMigrated = true;
                }
              }
            }
            if (replaced === false) {
              pins[pi].name = '';
              pins[pi].value = '0';
            }
          }
        }

        cell = ctx.blockforms.loadBasic(blockInstance, opt.disabled);
      } else {
        if (blockInstance.type in ctx.common.allDependencies) {
          cell = ctx.blockforms.loadGeneric(
            blockInstance,
            ctx.common.allDependencies[blockInstance.type],
            opt.disabled
          );
        }
      }

      blocksMap[cell.id] = cell;
      if (opt.new) {
        var oldId = cell.id;
        cell = cell.clone();
        blocksMap[oldId] = cell;
      }
      if (opt.offset) {
        cell.translate(opt.offset.x, opt.offset.y);
      }
      ctx.updateCellAttributes(cell);
      cells.push(cell);
    });

    if (isMigrated) {
      alertify.warning(
        ctx.gettextCatalog.getString(
          'If you see blank IN/OUT pins, it is because equivalent pins do not exist on this board'
        )
      );
    }

    var cellWires = [];
    _.each(_graph.wires, function (wireInstance) {
      var source = blocksMap[wireInstance.source.block];
      var target = blocksMap[wireInstance.target.block];
      if (opt.offset) {
        var newVertices = [];
        var vertices = wireInstance.vertices;
        if (vertices && vertices.length) {
          _.each(vertices, function (vertex) {
            newVertices.push({
              x: vertex.x + opt.offset.x,
              y: vertex.y + opt.offset.y,
            });
          });
        }
        wireInstance.vertices = newVertices;
      }
      cell = ctx.blockforms.loadWire(wireInstance, source, target);
      if (opt.new) {
        cell = cell.clone();
      }
      ctx.updateCellAttributes(cell);
      cellWires.push(cell);
    });

    return [cells, cellWires];
  }

  function loadDesign(design, opt, callback) {
    if (design && design.graph && design.graph.blocks && design.graph.wires) {
      opt = opt || { disabled: false, reset: true };

      ctx.utils.beginBlockingTask();
      ctx.commandManager.stopListening();

      ctx.service.clearAll();

      var result = graphToCells(design.graph, opt);
      var cells = result[0];
      var cellsw = result[1];

      ctx.graph.startBatch('loadDesign');
      ctx.graph.addCells(cells.concat(cellsw));
      ctx.graph.stopBatch('loadDesign');

      ctx.setState(design.state);
      ctx.service.appEnable(!opt.disabled);
      if (!opt.disabled) {
        ctx.commandManager.listen();
      }
      ctx.fitContent();
      if (callback) {
        callback();
        ctx.utils.endBlockingTask();
      }
      return true;
    }
    return false;
  }

  // Restore the top-level design using cached ACE editor instances.
  // We still run graphToCells() so that fresh Backbone models and wires are
  // created (avoiding JointJS stale-model issues), but we inject the cached
  // $box/editor into each matching fresh ACE-block model by block ID so that
  // view.initialize() can take the fast path (no ace.edit() call).
  function loadDesignFromCache(cachedCells, design, opt, callback) {
    // Build ID → ACE-cache map from old models, cleaning up as we go
    var aceMap = {};
    cachedCells.forEach(function (cell) {
      if (cell._iceCachedBox || cell._iceCachedEditor) {
        aceMap[cell.id] = {
          box: cell._iceCachedBox,
          view: cell._iceCachedView,
          editor: cell._iceCachedEditor,
        };
        delete cell._iceCachedBox;
        delete cell._iceCachedView;
        delete cell._iceCachedEditor;
      }
    });

    ctx.utils.beginBlockingTask();
    ctx.commandManager.stopListening();
    ctx.service.clearAll();

    var result = graphToCells(design.graph, opt);
    var cells = result[0];
    var cellsw = result[1];

    // Inject cached $boxes into fresh models before addCells() so that
    // view.initialize() finds _iceCachedBox and skips ace.edit()
    cells.forEach(function (cell) {
      var cached = aceMap[cell.id];
      if (cached) {
        if (cached.box) {
          cell._iceCachedBox = cached.box;
        }
        if (cached.view) {
          cell._iceCachedView = cached.view;
        }
        if (cached.editor) {
          cell._iceCachedEditor = cached.editor;
        }
      }
    });

    ctx.graph.startBatch('loadDesign');
    ctx.graph.addCells(cells.concat(cellsw));
    ctx.graph.stopBatch('loadDesign');

    ctx.setState(design.state);
    ctx.service.appEnable(!opt.disabled);
    if (!opt.disabled) {
      ctx.commandManager.listen();
    }
    ctx.fitContent();
    if (callback) {
      callback();
      ctx.utils.endBlockingTask();
    }
  }

  function appendDesign(design, dependencies) {
    if (
      design &&
      dependencies &&
      design.graph &&
      design.graph.blocks &&
      design.graph.wires
    ) {
      ctx.selectionView.cancelSelection();
      for (var type in dependencies) {
        if (!(type in ctx.common.allDependencies)) {
          ctx.common.allDependencies[type] = dependencies[type];
        }
      }

      design = convertIOtoTop(design);

      var origin = graphOrigin(design.graph);
      var menuHeight = $('#menu').height();
      var opt = {
        new: true,
        disabled: false,
        reset: design.board !== ctx.common.selectedBoard.name,
        offset: {
          x:
            Math.round(
              ((ctx.mousePosition.x - ctx.state.pan.x) / ctx.state.zoom -
                origin.x) /
                ctx.gridsize
            ) * ctx.gridsize,
          y:
            Math.round(
              ((ctx.mousePosition.y - ctx.state.pan.y - menuHeight) /
                ctx.state.zoom -
                origin.y) /
                ctx.gridsize
            ) * ctx.gridsize,
        },
      };
      var result = graphToCells(design.graph, opt);
      var cells = result[0];
      var cellsw = result[1];
      ctx.graph.startBatch('appendDesign');
      ctx.graph.addCells(cells);
      ctx.graph.stopBatch('appendDesign');
      ctx.graph.startBatch('appendDesignW');
      ctx.graph.addCells(cellsw);
      ctx.graph.stopBatch('appendDesignW');

      _.each(cells, function (cell) {
        if (!cell.isLink()) {
          var cellView = ctx.paper.findViewByModel(cell);
          if (cellView.$box.css('z-index') < ctx.z.index) {
            cellView.$box.css('z-index', ++ctx.z.index);
          }
          ctx.selection.add(cell);
          ctx.selectionView.createSelectionBox(cell);
          cellView.updateBox(true);
        }
      });
    }
  }

  //-- Push a code block to a user-selected collection as a reusable .ice file
  var pushCodeBlockToCollection = function (codeBlockData, blockId) {
    var nodePath = require('path');
    var nodeFs = require('fs');
    var nodeFse = require('fs-extra');

    var ports = codeBlockData.ports || { in: [], out: [] };
    var params = codeBlockData.params || [];
    var portsIn = ports.in || [];
    var portsOut = ports.out || [];

    var testbenchCode = '';
    var blockDir = nodePath.join(ctx.common.BUILD_DIR, 'blocks', blockId);
    var tbPath = nodePath.join(blockDir, 'testbench.v');
    try {
      if (nodeFs.existsSync(tbPath)) {
        testbenchCode = nodeFs.readFileSync(tbPath, 'utf8');
      }
    } catch (e) {}

    var moduleName = codeBlockData.label || codeBlockData.name || 'module';
    var codeBlockNewId = ctx.joint.util.uuid();

    var codeHeight = Math.max(
      300,
      (Math.max(portsIn.length, portsOut.length) + params.length) * 80 + 160
    );
    var codeBlockObj = {
      id: codeBlockNewId,
      type: 'basic.code',
      data: {
        label: moduleName,
        code: codeBlockData.code || '',
        params: params.map(function (p) {
          return { name: p.name };
        }),
        ports: {
          in: portsIn.map(function (p) {
            var obj = { name: p.name };
            if (p.range) {
              obj.range = p.range;
            }
            return obj;
          }),
          out: portsOut.map(function (p) {
            var obj = { name: p.name };
            if (p.range) {
              obj.range = p.range;
            }
            return obj;
          }),
        },
      },
      position: { x: 300, y: 150 },
      size: { width: 800, height: codeHeight },
    };

    if (testbenchCode) {
      codeBlockObj.data.testbench = testbenchCode;
    }

    var allBlocks = [];
    var allWires = [];

    portsIn.forEach(function (port, idx) {
      var inputId = ctx.joint.util.uuid();
      var pins = [{ index: '0', name: '', value: '0' }];
      if (port.range) {
        var rangeMatch = port.range.match(/\[(\d+):(\d+)\]/);
        if (rangeMatch) {
          var hi = parseInt(rangeMatch[1], 10);
          var lo = parseInt(rangeMatch[2], 10);
          var width = Math.abs(hi - lo) + 1;
          pins = [];
          for (var pi = width - 1; pi >= 0; pi--) {
            pins.push({ index: String(pi), name: '', value: '0' });
          }
        }
      }
      var inputData = {
        name: port.name,
        pins: pins,
        virtual: true,
        clock: false,
      };
      if (port.range) {
        inputData.range = port.range;
      }
      allBlocks.push({
        id: inputId,
        type: 'basic.input',
        data: inputData,
        position: { x: 50, y: 80 + idx * 80 },
      });
      allWires.push({
        source: { block: inputId, port: 'out' },
        target: { block: codeBlockNewId, port: port.name },
      });
    });

    portsOut.forEach(function (port, idx) {
      var outputId = ctx.joint.util.uuid();
      var pins = [{ index: '0', name: '', value: '0' }];
      if (port.range) {
        var rangeMatch = port.range.match(/\[(\d+):(\d+)\]/);
        if (rangeMatch) {
          var hi = parseInt(rangeMatch[1], 10);
          var lo = parseInt(rangeMatch[2], 10);
          var width = Math.abs(hi - lo) + 1;
          pins = [];
          for (var pi = width - 1; pi >= 0; pi--) {
            pins.push({ index: String(pi), name: '', value: '0' });
          }
        }
      }
      var outputData = {
        name: port.name,
        pins: pins,
        virtual: true,
      };
      if (port.range) {
        outputData.range = port.range;
      }
      allBlocks.push({
        id: outputId,
        type: 'basic.output',
        data: outputData,
        position: { x: 750, y: 80 + idx * 80 },
      });
      allWires.push({
        source: { block: codeBlockNewId, port: port.name },
        target: { block: outputId, port: 'in' },
      });
    });

    params.forEach(function (param, idx) {
      var constId = ctx.joint.util.uuid();
      allBlocks.push({
        id: constId,
        type: 'basic.constant',
        data: {
          name: param.name,
          value: '',
          local: false,
        },
        position: { x: 300 + idx * 150, y: 20 },
      });
      allWires.push({
        source: { block: constId, port: 'constant-out' },
        target: { block: codeBlockNewId, port: param.name },
      });
    });

    allBlocks.push(codeBlockObj);

    var boardName =
      ctx.common.selectedBoard && ctx.common.selectedBoard.name
        ? ctx.common.selectedBoard.name
        : 'alhambra-ii';

    var iceProject = {
      version: '1.2',
      package: {
        name: moduleName,
        version: '1.0.0',
        description: '',
        author: '',
        image: '',
      },
      design: {
        board: boardName,
        graph: {
          blocks: allBlocks,
          wires: allWires,
        },
      },
      dependencies: {},
    };

    var infoValues = [moduleName, '1.0.0', '', '', ''];

    ctx.utils.projectinfoprompt(infoValues, function (evt, newValues) {
      var projectName = newValues[0] || moduleName || 'Untitled';
      iceProject.package.name = projectName;
      iceProject.package.version = newValues[1] || '';
      iceProject.package.description = newValues[2] || '';
      iceProject.package.author = newValues[3] || '';
      iceProject.package.image = newValues[4] || '';

      //-- Build collection chooser: dropdown of existing + "New collection" option
      var existingColls = [];
      try {
        var entries = nodeFs.readdirSync(ctx.common.INTERNAL_COLLECTIONS_DIR);
        for (var ei = 0; ei < entries.length; ei++) {
          var entryPath = nodePath.join(
            ctx.common.INTERNAL_COLLECTIONS_DIR,
            entries[ei]
          );
          try {
            if (nodeFs.statSync(entryPath).isDirectory()) {
              existingColls.push(entries[ei]);
            }
          } catch (eStat) {}
        }
        existingColls.sort();
      } catch (eDir) {}

      var collHtml = [];
      collHtml.push('<div>');
      collHtml.push(
        '  <p>' + ctx.gettextCatalog.getString('Collection') + '</p>'
      );
      collHtml.push(
        '  <select id="coll-select" class="ajs-input" style="width:100%">'
      );
      for (var ci = 0; ci < existingColls.length; ci++) {
        collHtml.push(
          '    <option value="' +
            existingColls[ci] +
            '">' +
            existingColls[ci] +
            '</option>'
        );
      }
      collHtml.push(
        '    <option value="__new__">' +
          ctx.gettextCatalog.getString('-- New collection --') +
          '</option>'
      );
      collHtml.push('  </select>');
      collHtml.push(
        '  <p id="coll-new-label" style="display:none;margin-top:8px">' +
          ctx.gettextCatalog.getString('New collection name') +
          '</p>'
      );
      collHtml.push(
        '  <input id="coll-new-name" class="ajs-input" type="text" ' +
          'value="Custom" style="display:none;width:100%">'
      );
      collHtml.push('</div>');

      //-- Defer so the projectinfoprompt confirm dialog fully closes first
      setTimeout(function () {
        var collDlg = alertify.confirm();
        collDlg.setContent(collHtml.join('\n'));
        collDlg.set('onok', function () {
          var sel = document.getElementById('coll-select');
          var inp = document.getElementById('coll-new-name');
          var collectionName =
            sel.value === '__new__' ? (inp.value || '').trim() : sel.value;
          if (!collectionName) {
            alertify.warning(
              ctx.gettextCatalog.getString('Collection name cannot be empty')
            );
            return false;
          }

          var collDir = nodePath.join(
            ctx.common.INTERNAL_COLLECTIONS_DIR,
            collectionName
          );
          var blocksDir = nodePath.join(collDir, 'blocks');

          try {
            nodeFse.mkdirpSync(blocksDir);
          } catch (e) {
            alertify.error('Failed to create collection directory: ' + e);
            return;
          }

          var pkgPath = nodePath.join(collDir, 'package.json');
          if (!nodeFs.existsSync(pkgPath)) {
            var pkgData = {
              name: collectionName,
              version: '1.0.0',
              description: 'Custom collection',
              keywords: ['custom', 'collection'],
              license: 'GPL-2.0',
            };
            nodeFs.writeFileSync(pkgPath, JSON.stringify(pkgData, null, 2));
          }

          var safeName = projectName.replace(/[^a-zA-Z0-9_\-\s]/g, '_').trim();
          if (!safeName) {
            safeName = 'Untitled';
          }
          var filePath = nodePath.join(blocksDir, safeName + '.ice');

          var priorSourcePath = codeBlockData.sourcePath || '';

          var doSave = function () {
            try {
              nodeFs.writeFileSync(
                filePath,
                JSON.stringify(iceProject, null, 2)
              );
              alertify.success(
                ctx.gettextCatalog.getString('Block saved to collection') +
                  ': ' +
                  projectName
              );

              var savedCell = ctx.paper.getModelById(blockId);
              if (savedCell) {
                savedCell.attributes.data.sourcePath = filePath;
              }

              var statusFile = nodePath.join(
                nw.App.dataPath,
                'block-status.json'
              );
              var blockStatus = {};
              try {
                blockStatus = JSON.parse(
                  nodeFs.readFileSync(statusFile, 'utf8')
                );
              } catch (eRead) {}
              if (!blockStatus[filePath]) {
                blockStatus[filePath] = {
                  V: null,
                  F: null,
                  T: null,
                  B: null,
                };
              }
              var srcStatus =
                (priorSourcePath && blockStatus[priorSourcePath]) ||
                blockStatus[blockId] ||
                {};
              if (srcStatus.V !== null && srcStatus.V !== undefined) {
                blockStatus[filePath].V = srcStatus.V;
              }
              if (srcStatus.F !== null && srcStatus.F !== undefined) {
                blockStatus[filePath].F = srcStatus.F;
              } else if (
                nodeFs.existsSync(nodePath.join(blockDir, 'formal.md'))
              ) {
                blockStatus[filePath].F = true;
              }
              if (srcStatus.T !== null && srcStatus.T !== undefined) {
                blockStatus[filePath].T = srcStatus.T;
              } else if (
                nodeFs.existsSync(nodePath.join(blockDir, 'sim.vcd'))
              ) {
                blockStatus[filePath].T = true;
              }
              if (srcStatus.B !== null && srcStatus.B !== undefined) {
                blockStatus[filePath].B = srcStatus.B;
              }
              try {
                nodeFs.writeFileSync(
                  statusFile,
                  JSON.stringify(blockStatus, null, 2)
                );
              } catch (eWrite) {}

              var pkgCachePath = nodePath.resolve(pkgPath);
              if (require.cache[pkgCachePath]) {
                delete require.cache[pkgCachePath];
              }

              var collections = angular
                .element(document.body)
                .injector()
                .get('collections');
              collections.loadAllCollections();
              collections.selectCollection(collDir);

              iceStudio.updateEnv(ctx.common);
            } catch (e) {
              alertify.error(
                ctx.gettextCatalog.getString('Failed to save block') + ': ' + e
              );
            }
          };

          if (nodeFs.existsSync(filePath)) {
            alertify.confirm(
              ctx.gettextCatalog.getString(
                'A block named "' + safeName + '" already exists. Overwrite?'
              ),
              function () {
                doSave();
              }
            );
          } else {
            doSave();
          }
        });
        collDlg.set('oncancel', function () {});
        collDlg.show();
        //-- Wire up the dropdown toggle after the dialog is in the DOM
        setTimeout(function () {
          var sel = document.getElementById('coll-select');
          var lbl = document.getElementById('coll-new-label');
          var inp = document.getElementById('coll-new-name');
          if (sel && lbl && inp) {
            var toggle = function () {
              var isNew = sel.value === '__new__';
              lbl.style.display = isNew ? '' : 'none';
              inp.style.display = isNew ? '' : 'none';
            };
            sel.addEventListener('change', toggle);
            toggle();
          }
        }, 50);
      }, 100);
    });
  };

  return {
    toJSON: toJSON,
    getCells: getCells,
    isTopLevel: isTopLevel,
    convertIOtoTop: convertIOtoTop,
    graphOrigin: graphOrigin,
    graphToCells: graphToCells,
    loadDesign: loadDesign,
    loadDesignFromCache: loadDesignFromCache,
    appendDesign: appendDesign,
    pushCodeBlockToCollection: pushCodeBlockToCollection,
  };
};
