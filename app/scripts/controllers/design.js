'use strict';

var subModuleActive = false;

angular
  .module('icestudio')
  .controller(
    'DesignCtrl',
    function (
      $rootScope,
      $scope,
      project,
      profile,
      graph,
      gettextCatalog,
      utils,
      common
    ) {
      //----------------------------------------------------------------
      //-- Module initialization
      //----------------------------------------------------------------

      $scope.graph = graph;
      $scope.common = common;
      $scope.profile = profile;
      $scope.information = {};
      $scope.topModule = true;
      $scope.isNavigating = false;
      $scope.backup = {};
      $scope.toRestore = false;

      //-- Create the PAPER. It is the place were the circuits are drawn
      //-- It is associated to html element 'paper', located in the
      //--  design.html file
      let htmlElement = $('.paper');
      graph.createPaper(htmlElement);

      //-------------------------------------------------------------
      //-- FUNCTIONS
      //-------------------------------------------------------------

      // Breadcrumbs

      $scope.breadcrumbsNavigate = function (selectedItem) {
        var item;
        if (common.isEditingSubmodule) {
          alertify.warning(
            gettextCatalog.getString(
              'To navigate through the design, you need to close \"edit mode\".'
            )
          );
        } else {
          if (!$scope.isNavigating) {
            $scope.isNavigating = true;

            do {
              graph.breadcrumbs.pop();
              common.submoduleHeap.pop();
              item = graph.breadcrumbs.slice(-1)[0];
            } while (selectedItem !== item);
            if (common.submoduleHeap.length > 0) {
              const last = common.submoduleHeap.length - 1;
              common.submoduleId = common.submoduleHeap[last].id;
              common.submoduleUID = common.submoduleHeap[last].uid;
              iceStudio.bus.events.publish('Navigation::ReadOnly');
            } else {
              iceStudio.bus.events.publish('Navigation::ReadWrite');
            }

            loadSelectedGraph();
          }
        }
      };

      $scope.breadcrumbsBack = function () {
        if (!$scope.isNavigating) {
          $scope.isNavigating = true;
          graph.breadcrumbs.pop();
          common.submoduleHeap.pop();
          if (common.submoduleHeap.length > 0) {
            const last = common.submoduleHeap.length - 1;
            common.submoduleId = common.submoduleHeap[last].id;
            common.submoduleUID = common.submoduleHeap[last].uid;
            iceStudio.bus.events.publish('Navigation::ReadOnly');
          } else {
            iceStudio.bus.events.publish('Navigation::ReadWrite');
          }
          loadSelectedGraph();
        }
      };

      function isSortable(cell, sortType) {
        const type = cell.get('type');
        return (
          (sortType === 'xy' &&
            (type === 'ice.Constant' || type === 'ice.Memory')) ||
          (sortType === 'y' && (type === 'ice.Input' || type === 'ice.Output'))
        );
      }

      function getSortValue(cell, sortType) {
        if (sortType === 'xy') {
          return cell.get('position').x;
        } else if (sortType === 'y') {
          return cell.get('position').y;
        }
        return 0; // Si no es sortable por ninguna de las condiciones, retornamos un valor neutral
      }

      $scope.editModeToggle = function ($event) {
        var btn = $event.currentTarget;
        if (!$scope.isNavigating) {
          utils.beginBlockingTask();
          var block = graph.breadcrumbs[graph.breadcrumbs.length - 1];
          var tmp = false;
          var rw = true;
          var lockImg = false;
          var lockImgSrc = false;
          if (common.isEditingSubmodule) {
            lockImg = $('img', btn);
            lockImgSrc = lockImg.attr('data-lock');
            lockImg[0].src = lockImgSrc;
            common.isEditingSubmodule = false;
            subModuleActive = false;
            var cells = $scope.graph.getCells();

            cells.sort((a, b) => {
              const isSortableAxy = isSortable(a, 'xy');
              const isSortableBy = isSortable(b, 'y');
              const isSortableA = isSortableAxy || isSortable(a, 'y');
              const isSortableB = isSortable(b, 'xy') || isSortableBy;

              if (!isSortableA && !isSortableB) {
                return 0; // Ninguno es sortable
              }

              if (isSortableA !== isSortableB) {
                // Si uno es sortable y el otro no, el sortable va primero
                // Aquí puedes decidir el orden de precedencia entre xy y y
                return isSortableA ? -1 : 1;
              }

              // Ambos son sortables, ahora comparamos basados en sus tipos y coordenadas
              if (isSortableAxy && isSortableBy) {
                // Si uno es de xy y el otro de y, priorizamos xy
                return -1;
              } else if (isSortableBy && isSortableAxy) {
                return 1;
              } else if (isSortableAxy) {
                return getSortValue(a, 'xy') - getSortValue(b, 'xy');
              } else {
                return getSortValue(a, 'y') - getSortValue(b, 'y');
              }
            });

            /*
         function isSortableConstMem(cell) {
  const type = cell.get('type');
  return type === 'ice.Constant' || type === 'ice.Memory';
}

cells.sort((a, b) => {
  const isSortableA = isSortableConstMem(a);
  const isSortableB = isSortableConstMem(b);

  if (isSortableA !== isSortableB) {
    return isSortableA ? -1 : 1;
  } else if (isSortableA) {
    return a.get('position').x - b.get('position').x;
  }
  return 0;
});

function isSortable(cell) {
  const type = cell.get('type');
  return type === 'ice.Input' || type === 'ice.Output';
}

cells.sort((a, b) => {
  const isSortableA = isSortable(a);
  const isSortableB = isSortable(b);

  if (isSortableA !== isSortableB) {
    return isSortableA ? -1 : 1;
  } else if (isSortableA) {
    return a.get('position').y - b.get('position').y;
  }
  return 0;
});
        */

            // Sort Constant/Memory cells by x-coordinate
            /* OPT1-- cells = _.sortBy(cells, function (cell) {
              if (
                cell.get('type') === 'ice.Constant' ||
                cell.get('type') === 'ice.Memory'
              ) {
                return cell.get('position').x;
              }
            });*/

            // Sort I/O cells by y-coordinate
            /*   OPT1-- cells = _.sortBy(cells, function (cell) {
              if (
              cell.get('type') === 'ice.Input' ||
              cell.get('type') === 'ice.Output'
              ) {
                return cell.get('position').y;
              }
            });*/

            $scope.graph.setCells(cells);

            var graphData = $scope.graph.toJSON();
            var p = utils.cellsToProject(graphData.cells);
            tmp = utils.clone(common.allDependencies[block.type]);
            tmp.design.graph = p.design.graph;
            var hId = block.type;
            common.allDependencies[hId] = tmp;

            /* ---------------------------------------- */
            /* Avoid automatically back on toggle edit  */
            //$scope.toRestore = hId;
            //common.forceBack = true;
            /* ---------------------------------------- */

            common.forceBack = false;
          } else {
            lockImg = $('img', btn);
            lockImgSrc = lockImg.attr('data-unlock');
            lockImg[0].src = lockImgSrc;
            tmp = common.allDependencies[block.type];
            $scope.toRestore = false;
            rw = false;
            common.isEditingSubmodule = true;
            subModuleActive = true;
          }
          setTimeout(() => {
            $rootScope.$broadcast('navigateProject', {
              update: false,
              project: tmp,
              editMode: rw,
              fromDoubleClick: false,
            });
            utils.rootScopeSafeApply();

            utils.endBlockingTask();
          }, 0);
        }
      };

      function loadSelectedGraph() {
        utils.beginBlockingTask();
        setTimeout(function () {
          _decoupledLoadSelectedGraph();
        }, 0);
      }

      function _decoupledLoadSelectedGraph() {
        var n = graph.breadcrumbs.length;
        var opt = { disabled: true };
        var design = false;
        var i = 0;
        if (n === 1) {
          design = project.get('design');
          opt.disabled = false;
          if (
            $scope.toRestore !== false &&
            common.submoduleId !== false &&
            design.graph.blocks.length > 0
          ) {
            for (i = 0; i < design.graph.blocks.length; i++) {
              if (common.submoduleUID === design.graph.blocks[i].id) {
                design.graph.blocks[i].type = $scope.toRestore;
              }
            }

            $scope.toRestore = false;
          }

          var didPop = graph.popPaper();
          if (didPop) {
            graph.fitContent();
            $scope.isNavigating = false;
            utils.endBlockingTask();
          } else {
            graph.resetView();
            graph.loadDesign(design, opt, function () {
              $scope.isNavigating = false;
              utils.endBlockingTask();
            });
          }
          $scope.topModule = true;
        } else {
          var type = graph.breadcrumbs[n - 1].type;
          var dependency = common.allDependencies[type];
          design = dependency.design;
          if (
            $scope.toRestore !== false &&
            common.submoduleId !== false &&
            design.graph.blocks.length > 0
          ) {
            for (i = 0; i < design.graph.blocks.length; i++) {
              if (common.submoduleUID === design.graph.blocks[i].id) {
                common.allDependencies[type].design.graph.blocks[i].type =
                  $scope.toRestore;
              }
            }
            $scope.toRestore = false;
          }
          graph.resetView();
          graph.loadDesign(dependency.design, opt, function () {
            $scope.isNavigating = false;
            utils.endBlockingTask();
          });
          $scope.information = dependency.package;
        }
      }

      $rootScope.$on('navigateProject', function (event, args) {
        var opt = { disabled: true };
        if (typeof common.submoduleHeap === 'undefined') {
          common.submoduleHeap = [];
        }
        let heap = { id: false, uid: false };
        if (typeof args.submodule !== 'undefined') {
          common.submoduleId = args.submodule;
          heap.id = args.submodule;
        }
        if (typeof args.submoduleId !== 'undefined') {
          common.submoduleUID = args.submoduleId;

          heap.uid = args.submoduleId;
        }

        if (heap.id !== false || heap.uid !== false) {
          common.submoduleHeap.push(heap);
        }

        if (typeof args.editMode !== 'undefined') {
          opt.disabled = args.editMode;
        }

        // When leaving the top level to enter a submodule, hide the current
        // paper (keeping all cells and ACE editors live) and spin up a fresh
        // paper for the submodule.  On back-navigation popPaper() restores the
        // hidden paper instantly — no cell rebuild needed.
        if (
          graph.breadcrumbs.length === 1 &&
          typeof args.submodule !== 'undefined'
        ) {
          graph.pushPaper();
        }

        //  utils.beginBlockingTask();
        if (args.update) {
          graph.resetView();
          project.update({ deps: false }, function () {
            graph.loadDesign(args.project.design, opt, function () {
              //  utils.endBlockingTask();
            });
          });
        } else {
          graph.resetView();

          graph.loadDesign(args.project.design, opt, function () {});
        }
        $scope.topModule = false;
        $scope.information = args.project.package;
        if (
          typeof common.forceBack !== 'undefined' &&
          common.forceBack === true
        ) {
          common.forceBack = false;
          $scope.breadcrumbsBack();
        }

        if (common.isEditingSubmodule || common.submoduleHeap.length === 0) {
          iceStudio.bus.events.publish('Navigation::ReadWrite');
        } else {
          iceStudio.bus.events.publish('Navigation::ReadOnly');
        }

        let flowInfo = {
          fromDoubleClick: args.fromDoubleClick ?? false,
          fromNewSubmodule: args.fromNewSubmodule ?? false,
          submodule: args.submodule,
        };
        $rootScope.$broadcast('navigateProjectEnded', flowInfo);
      });

      $rootScope.$on('breadcrumbsBack', function (/*event*/) {
        $scope.breadcrumbsBack();
        utils.rootScopeSafeApply();
      });

      $rootScope.$on('editModeToggle', function (event) {
        $scope.editModeToggle(event);
        utils.rootScopeSafeApply();
        //utils.endBlockingTask();
      });

      //----------------------------------------------------------------
      //-- Left Panel: Module Explorer & Port Editor
      //----------------------------------------------------------------

      $scope.lp = {
        open: false,
        tab: 'modules',
        width: 280,
        nodes: [], // generic submodules + code blocks
        constBlocks: [], // constant blocks
        memBlocks: [], // memory blocks
        jsonBlocks: [], // json parameter blocks
        infoBlocks: [], // info/comment blocks
        virtPorts: [], // virtual I/O ports
        hwPorts: [], // FPGA-assigned pins
        unusedPins: [], // board pins not assigned to any port
        wires: [], // label wires
        pinned: null,
      };

      $scope.lp.toggle = function () {
        $scope.lp.open = !$scope.lp.open;
        if ($scope.lp.open) {
          $scope.lp.refresh();
        }
      };

      $scope.lp.setTab = function (tab) {
        $scope.lp.tab = tab;
      };

      $scope.lp.addGenerate = function () {
        project.addBasicBlock('basic.generate');
      };

      //----------------------------------------------------------------
      //-- Right Panel
      //----------------------------------------------------------------

      $scope.rp = {
        open: false,
        width: 375,
      };

      $scope.rp.toggle = function () {
        $scope.rp.open = !$scope.rp.open;
      };

      // Move the collection manager plugin element into the right panel
      // once the plugin finishes loading (async)
      var rpCmInterval = setInterval(function () {
        var cm = document.getElementById('collectionManager2');
        var host = document.getElementById('rp-cm-host');
        if (cm && host && !host.contains(cm)) {
          host.appendChild(cm);
          clearInterval(rpCmInterval);
          rpCmInterval = null;
        }
      }, 200);

      // Build tree nodes for blocks inside a dependency (recursive expand)
      const buildDepNodes = function (depBlocks, depth) {
        const result = [];
        (depBlocks || []).forEach(function (block) {
          if (!block.type) {
            return;
          }
          const dep =
            common.allDependencies && common.allDependencies[block.type];
          const childBlocks =
            dep && dep.design && dep.design.graph && dep.design.graph.blocks;
          const d = block.data || {};
          let lbl;
          if (dep) {
            lbl = (dep.package && dep.package.name) || block.type;
          } else {
            lbl =
              d.label || d.name || d.info || block.type.replace('basic.', '');
          }
          result.push({
            id: block.id,
            type: block.type,
            cellType: dep ? 'generic' : block.type.replace('basic.', ''),
            label: lbl || block.type,
            depth: depth,
            hasChildren: !!(childBlocks && childBlocks.length),
            expanded: false,
            _depBlocks: childBlocks || null,
          });
        });
        return result;
      };

      $scope.lp.toggleNode = function (node) {
        const idx = $scope.lp.nodes.indexOf(node);
        if (idx === -1) {
          return;
        }
        node.expanded = !node.expanded;
        if (node.expanded) {
          const children = buildDepNodes(node._depBlocks, node.depth + 1);
          $scope.lp.nodes.splice(idx + 1, 0, ...children);
        } else {
          let removeCount = 0;
          for (let i = idx + 1; i < $scope.lp.nodes.length; i++) {
            if ($scope.lp.nodes[i].depth > node.depth) {
              removeCount++;
            } else {
              break;
            }
          }
          $scope.lp.nodes.splice(idx + 1, removeCount);
        }
      };

      // Label block types that belong in the Wires tab, not Modules
      const WIRE_TYPES = new Set([
        'basic.inputLabel',
        'basic.outputLabel',
        'basic.pairedLabel',
      ]);

      // --- Highlight helpers ---
      var lpGetCellIds = function (kind, item) {
        var ids = [];
        graph.getCells().forEach(function (cell) {
          if (cell.isLink()) {
            return;
          }
          if (kind === 'node' && item.depth === 0) {
            var match =
              item.cellType === 'generic'
                ? (cell.get('blockType') || '') === item.type
                : cell.id === item.id;
            if (match) {
              ids.push(cell.id);
            }
          } else if (kind === 'wire') {
            if (WIRE_TYPES.has(cell.get('blockType') || '')) {
              var d = cell.get('data') || {};
              if ((d.label || d.name || d.info || '?') === item.name) {
                ids.push(cell.id);
              }
            }
          } else if (item && item.id && cell.id === item.id) {
            // port, constblock, infoblock, virtport — all matched by cell id
            ids.push(cell.id);
          }
        });
        return ids;
      };

      $scope.lp.hoverIn = function (kind, item) {
        if ($scope.lp.pinned) {
          return;
        }
        graph.lpClearHighlight();
        graph.lpHighlightCells(lpGetCellIds(kind, item));
      };

      $scope.lp.hoverOut = function () {
        if ($scope.lp.pinned) {
          return;
        }
        graph.lpClearHighlight();
      };

      $scope.lp.clickItem = function (kind, item, $event) {
        $event.stopPropagation();
        if ($event.detail > 1) {
          return; // ignore the second click of a dblclick
        }
        if ($scope.lp.pinned && $scope.lp.pinned.item === item) {
          $scope.lp.pinned = null;
          graph.lpClearHighlight();
        } else {
          $scope.lp.pinned = { kind: kind, item: item };
          graph.lpClearHighlight();
          graph.lpHighlightCells(lpGetCellIds(kind, item));
        }
      };

      $scope.lp.dblClickItem = function (kind, item, $event) {
        $event.stopPropagation();
        if (kind === 'wire') {
          alertify.prompt(
            gettextCatalog.getString('Rename wire'),
            item.name,
            function (evt, newName) {
              newName = newName.trim();
              if (newName && newName !== item.name) {
                graph.renameWire(item.name, newName);
              }
            },
            function () {}
          );
          return;
        }
        var ids = lpGetCellIds(kind, item);
        if (ids.length > 0) {
          graph.triggerDblClick(ids[0]);
        }
      };

      // Recompute which board pins are not yet assigned to any hw port
      var refreshUnusedPins = function () {
        var usedPinValues = new Set();
        $scope.lp.hwPorts.forEach(function (port) {
          (port._pins || []).forEach(function (p) {
            if (p.value) {
              usedPinValues.add(p.value);
            }
          });
        });
        var allBoardPins =
          (common.selectedBoard && common.selectedBoard.pinout) || [];
        $scope.lp.unusedPins = allBoardPins.filter(function (p) {
          return p.value && !usedPinValues.has(p.value);
        });
      };

      // --- Const inline editing ---
      $scope.lp.startEditConst = function (cb, $event) {
        $event.stopPropagation();
        cb._editing = true;
        cb._editVal = cb.value;
        setTimeout(function () {
          var inputs = document.querySelectorAll('#left-panel .lp-const-input');
          for (var i = 0; i < inputs.length; i++) {
            if (inputs[i].getAttribute('data-cbid') === cb.id) {
              inputs[i].focus();
              inputs[i].select();
              break;
            }
          }
        }, 0);
      };

      $scope.lp.saveConst = function (cb) {
        if (!cb._editing) {
          return;
        }
        cb._editing = false;
        if (cb._editVal !== cb.value) {
          graph.updateCellData(cb.id, { value: cb._editVal });
          cb.value = cb._editVal;
        }
      };

      $scope.lp.constKeydown = function (cb, $event) {
        if ($event.which === 13) {
          $event.preventDefault();
          $scope.lp.saveConst(cb);
        } else if ($event.which === 27) {
          cb._editing = false;
        }
      };

      // --- HW pin inline change ---
      $scope.lp.changePin = function (port, pin) {
        var allPins =
          (common.selectedBoard && common.selectedBoard.pinout) || [];
        var found = null;
        for (var j = 0; j < allPins.length; j++) {
          if (allPins[j].value === pin.value) {
            found = allPins[j];
            break;
          }
        }
        pin.alias = found ? found.name : pin.value;
        port.pin =
          port._pins
            .map(function (p) {
              return p.alias || p.value || '';
            })
            .filter(Boolean)
            .join(', ') || '–';
        graph.updateCellPin(port.id, pin.arrayIdx, pin.alias, pin.value);
        refreshUnusedPins();
      };

      // Sort board pinout: pins matching port name come first, rest alphabetical.
      $scope.lp.sortedPinout = function (portName) {
        var allPins =
          (common.selectedBoard && common.selectedBoard.pinout) || [];
        var pn = (portName || '').toLowerCase().replace(/[\[\]:]/g, '');
        if (!pn) {
          return allPins;
        }
        var matched = [];
        var rest = [];
        for (var k = 0; k < allPins.length; k++) {
          var pinLower = allPins[k].name.toLowerCase();
          if (pinLower.indexOf(pn) !== -1 || pn.indexOf(pinLower) !== -1) {
            matched.push(allPins[k]);
          } else {
            rest.push(allPins[k]);
          }
        }
        var cmp = function (a, b) {
          return a.name.localeCompare(b.name);
        };
        matched.sort(cmp);
        rest.sort(cmp);
        return matched.concat(rest);
      };

      // Build all panel lists from current graph cells
      $scope.lp.refresh = function () {
        $scope.lp.pinned = null;
        graph.lpClearHighlight();
        const cells = graph.getCells().filter((c) => !c.isLink());
        const nodes = [];
        const constBlocks = [];
        const memBlocks = [];
        const jsonBlocks = [];
        const infoBlocks = [];
        const virtPorts = [];
        const hwPorts = [];
        const wiresMap = new Map();

        cells.forEach(function (cell) {
          const cellType = cell.get('type') || '';
          const blockType = cell.get('blockType') || '';
          const data = cell.get('data') || {};

          // 1 — Wire labels
          if (WIRE_TYPES.has(blockType)) {
            const wName = data.label || data.name || data.info || '?';
            if (!wiresMap.has(wName)) {
              let wDir = 'pair';
              if (blockType === 'basic.inputLabel') {
                wDir = 'in';
              } else if (blockType === 'basic.outputLabel') {
                wDir = 'out';
              }
              wiresMap.set(wName, { name: wName, dir: wDir });
            }
            return;
          }

          // 2 — Info/comment blocks
          if (blockType === 'basic.info') {
            infoBlocks.push({
              id: cell.id,
              cellType: 'info',
              label: data.info || data.text || data.label || '?',
            });
            return;
          }
          if (blockType === 'basic.infoFrame') {
            infoBlocks.push({
              id: cell.id,
              cellType: 'infoFrame',
              label: data.label || 'Frame',
            });
            return;
          }

          // 3 — Constant blocks
          if (blockType === 'basic.constant') {
            constBlocks.push({
              id: cell.id,
              cellType: 'constant',
              label: data.name || data.label || 'constant',
              value: data.value !== undefined ? String(data.value) : '',
            });
            return;
          }

          // 4 — Memory blocks
          if (blockType === 'basic.memory') {
            var entryCount = (data.list || '').split('\n').filter(function (s) {
              return s.trim();
            }).length;
            memBlocks.push({
              id: cell.id,
              cellType: 'memory',
              label: data.name || data.label || 'memory',
              entries: entryCount,
            });
            return;
          }

          // 4b — JSON input/output blocks
          if (blockType === 'basic.jsonInput') {
            jsonBlocks.push({
              id: cell.id,
              cellType: 'jsonInput',
              label: data.name || 'json_input',
              portCount: (data.ports || []).length,
            });
            return;
          }
          if (blockType === 'basic.jsonOutput') {
            jsonBlocks.push({
              id: cell.id,
              cellType: 'jsonOutput',
              label: data.name || 'json_output',
              portCount: (data.ports || []).length,
            });
            return;
          }

          // 4 — I/O ports: virtual → Ports tab, FPGA-assigned → Pins tab
          if (blockType === 'basic.input' || blockType === 'basic.output') {
            const dir = blockType === 'basic.input' ? 'in' : 'out';
            const name = data.name || data.label || '?';
            if (data.virtual === true) {
              virtPorts.push({ id: cell.id, dir: dir, name: name });
            } else {
              const pins = data.pins || [];
              const rawPins = pins.map(function (p, i) {
                return {
                  arrayIdx: i,
                  alias: p.name || '',
                  value: p.value || '',
                };
              });
              const pinStr = rawPins
                .map((p) => p.alias || p.value || '')
                .filter(Boolean)
                .join(', ');
              hwPorts.push({
                id: cell.id,
                dir: dir,
                name: name,
                pin: pinStr || '–',
                _pins: rawPins,
              });
            }
            return;
          }

          // 5 — Generic submodules and code blocks → Modules tab
          if (cellType === 'ice.Generic') {
            const dep =
              common.allDependencies && common.allDependencies[blockType];
            const depBlocks =
              dep && dep.design && dep.design.graph && dep.design.graph.blocks;
            nodes.push({
              id: cell.id,
              type: blockType,
              cellType: 'generic',
              label:
                cell.get('label') ||
                (dep && dep.package && dep.package.name) ||
                blockType,
              depth: 0,
              hasChildren: !!(depBlocks && depBlocks.length),
              expanded: false,
              _depBlocks: depBlocks || null,
            });
          } else if (blockType === 'basic.code') {
            nodes.push({
              id: cell.id,
              type: blockType,
              cellType: 'code',
              label: data.label || data.name || 'code',
              depth: 0,
              hasChildren: false,
              expanded: false,
              _depBlocks: null,
            });
          } else if (blockType === 'basic.generate') {
            var m = data.instanceCount || 4;
            nodes.push({
              id: cell.id,
              type: blockType,
              cellType: 'generate',
              label: (data.label || 'generate') + ' x' + m,
              depth: 0,
              hasChildren: false,
              expanded: false,
              _depBlocks: null,
            });
          }
        });

        $scope.lp.nodes = nodes;
        $scope.lp.constBlocks = constBlocks;
        $scope.lp.memBlocks = memBlocks;
        $scope.lp.jsonBlocks = jsonBlocks;
        $scope.lp.infoBlocks = infoBlocks;
        $scope.lp.virtPorts = virtPorts;
        $scope.lp.hwPorts = hwPorts;
        $scope.lp.wires = Array.from(wiresMap.values());
        refreshUnusedPins();
      };

      // Refresh panel after design navigation (submodule in/out)
      $rootScope.$on('navigateProjectEnded', function () {
        if ($scope.lp.open) {
          setTimeout(function () {
            $scope.$apply(function () {
              $scope.lp.refresh();
            });
          }, 200);
        }
      });

      // Refresh panel when graph changes (blocks added/removed/data changed)
      const lpAutoRefresh = function () {
        if ($scope.lp.open) {
          setTimeout(function () {
            if (!$scope.$$phase && !$rootScope.$$phase) {
              $scope.$apply(function () {
                $scope.lp.refresh();
              });
            } else {
              $scope.lp.refresh();
            }
          }, 0);
        }
      };
      $('body').on('Graph::updateWires', lpAutoRefresh);
      $('body').on('Graph::lpRefresh', lpAutoRefresh);

      // Resize handle drag
      const lpInitResize = function () {
        let dragging = false;
        let startX = 0;
        let startW = 0;
        $(document).on('mousedown.lp', '#lp-resize-handle', function (e) {
          dragging = true;
          startX = e.pageX;
          startW = $scope.lp.width;
          $('body').addClass('lp-resizing');
          e.preventDefault();
        });
        $(document).on('mousemove.lp', function (e) {
          if (!dragging) {
            return;
          }
          const w = Math.max(180, Math.min(520, startW + e.pageX - startX));
          $scope.$apply(function () {
            $scope.lp.width = w;
          });
        });
        $(document).on('mouseup.lp', function () {
          if (!dragging) {
            return;
          }
          dragging = false;
          $('body').removeClass('lp-resizing');
        });
      };
      lpInitResize();

      // Resize handle drag for right panel
      var rpInitResize = function () {
        var dragging = false;
        var startX = 0;
        var startW = 0;
        $(document).on('mousedown.rp', '#rp-resize-handle', function (e) {
          dragging = true;
          startX = e.pageX;
          startW = $scope.rp.width;
          $('body').addClass('rp-resizing');
          e.preventDefault();
        });
        $(document).on('mousemove.rp', function (e) {
          if (!dragging) {
            return;
          }
          var w = Math.max(180, Math.min(520, startW + startX - e.pageX));
          $scope.$apply(function () {
            $scope.rp.width = w;
          });
        });
        $(document).on('mouseup.rp', function () {
          if (!dragging) {
            return;
          }
          dragging = false;
          $('body').removeClass('rp-resizing');
        });
      };
      rpInitResize();

      var lpBlankClick = function () {
        if ($scope.lp.pinned) {
          $scope.lp.pinned = null;
          graph.lpClearHighlight();
          if (!$scope.$$phase && !$rootScope.$$phase) {
            $scope.$apply();
          }
        }
      };
      $('body').on('Graph::blankClick', lpBlankClick);

      $scope.$on('$destroy', function () {
        $('body').off('Graph::updateWires', lpAutoRefresh);
        $('body').off('Graph::lpRefresh', lpAutoRefresh);
        $('body').off('Graph::blankClick', lpBlankClick);
        $(document).off('.lp');
        $(document).off('.rp');
        if (rpCmInterval) {
          clearInterval(rpCmInterval);
        }
      });
    }
  );
