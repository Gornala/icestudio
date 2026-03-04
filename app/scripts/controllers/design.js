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

          graph.resetView();
          graph.loadDesign(design, opt, function () {
            $scope.isNavigating = false;
            utils.endBlockingTask();
          });
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
          graph.fitContent();
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

        let flowInfo = { fromDoubleClick: args.fromDoubleClick ?? false };
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
        nodes: [],
        hwPorts: [],
        wires: [],
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

      // Hover: highlight canvas cells matching this node's module type
      $scope.lp.hoverIn = function (node) {
        if (!node || node.depth > 0) {
          return;
        }
        graph.getCells().forEach(function (cell) {
          if (cell.isLink()) {
            return;
          }
          const match =
            node.cellType === 'generic'
              ? cell.get('blockType') === node.type
              : cell.id === node.id;
          if (match) {
            $('.paper')
              .find('[model-id="' + cell.id + '"]')
              .addClass('lp-highlight');
          }
        });
      };

      $scope.lp.hoverOut = function () {
        $('.paper').find('[model-id]').removeClass('lp-highlight');
      };

      // Label block types that belong in the Wires tab, not Modules
      const WIRE_TYPES = new Set([
        'basic.input_label',
        'basic.output_label',
        'basic.paired_label',
      ]);

      // Build node list, hardware port list, and wire list from current graph cells
      $scope.lp.refresh = function () {
        const cells = graph.getCells().filter((c) => !c.isLink());
        const nodes = [];
        const hwPorts = [];
        const wires = [];

        cells.forEach(function (cell) {
          const cellType = cell.get('type') || '';
          const blockType = cell.get('blockType') || '';
          const data = cell.get('data') || {};
          let lbl;

          // Label blocks go to Wires tab — skip from Modules list
          if (WIRE_TYPES.has(blockType)) {
            let wDir = 'pair';
            if (blockType === 'basic.input_label') {
              wDir = 'in';
            } else if (blockType === 'basic.output_label') {
              wDir = 'out';
            }
            wires.push({
              id: cell.id,
              name: data.label || data.name || data.info || '?',
              dir: wDir,
            });
            return;
          }

          // All other blocks go to Modules list
          if (cellType === 'ice.Generic') {
            const dep =
              common.allDependencies && common.allDependencies[blockType];
            const depBlocks =
              dep && dep.design && dep.design.graph && dep.design.graph.blocks;
            lbl =
              cell.get('label') ||
              (dep && dep.package && dep.package.name) ||
              blockType;
            nodes.push({
              id: cell.id,
              type: blockType,
              cellType: 'generic',
              label: lbl,
              depth: 0,
              hasChildren: !!(depBlocks && depBlocks.length),
              expanded: false,
              _depBlocks: depBlocks || null,
            });
          } else {
            lbl =
              data.label ||
              data.name ||
              data.info ||
              cellType.replace('ice.', '');
            nodes.push({
              id: cell.id,
              type: blockType || cellType,
              cellType: cellType.replace('ice.', '').toLowerCase(),
              label: lbl,
              depth: 0,
              hasChildren: false,
              expanded: false,
              _depBlocks: null,
            });
          }

          // Hardware ports: basic.input / basic.output with FPGA pin assignment
          if (blockType === 'basic.input' || blockType === 'basic.output') {
            const pins = data.pins || [];
            const pinStr = pins
              .map((p) => p.value || '')
              .filter(Boolean)
              .join(', ');
            hwPorts.push({
              id: cell.id,
              name: data.label || data.name || '?',
              dir: blockType === 'basic.input' ? 'in' : 'out',
              pin: pinStr || '–',
              virtual: data.virtual || false,
              size: data.size || 1,
            });
          }
        });

        $scope.lp.nodes = nodes;
        $scope.lp.hwPorts = hwPorts;
        $scope.lp.wires = wires;
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

      // Refresh panel when graph changes (blocks added / removed)
      const lpUpdateWires = function () {
        if ($scope.lp.open) {
          setTimeout(function () {
            $scope.$apply(function () {
              $scope.lp.refresh();
            });
          }, 100);
        }
      };
      $('body').on('Graph::updateWires', lpUpdateWires);

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

      $scope.$on('$destroy', function () {
        $('body').off('Graph::updateWires', lpUpdateWires);
        $(document).off('.lp');
      });
    }
  );
