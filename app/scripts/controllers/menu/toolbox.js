'use strict';

//-- Basic Toolbox popup + Collection Manager bus events
//-- Loaded as a <script> tag before menu.js; exposes window._icemenu.toolbox

window._icemenu = window._icemenu || {};
window._icemenu.toolbox = {
  init: function ($scope, deps) {
    var path = require('path');
    var fs = require('fs');
    var project = deps.project;
    var blocks = deps.blocks;
    var collections = deps.collections;
    var common = deps.common;
    var utils = deps.utils;
    var gettextCatalog = deps.gettextCatalog;
    var state = deps.state;

    //-- Private state
    var mouseDownTB = false;
    var mousePosition = { x: 0, y: 0 };
    var toolbox = {
      dom: false,
      isOpen: false,
      icons: false,
    };

    //-- close floating toolbox with x button
    $(document).on('mousedown', '.closeToolbox-button', function () {
      state.mousedown = true;
      showToolBox(); // close toolbox
    });

    //-- draggable toolbox
    $(document).on('mousedown', '#iceToolbox .title-bar', function () {
      mouseDownTB = true;
    });

    $(document).on('mouseup', function () {
      mouseDownTB = false;
    });

    $(document).on('mousemove', function (e) {
      mousePosition.x = e.pageX;
      mousePosition.y = e.pageY;
      if (mouseDownTB === true) {
        let posY = mousePosition.y - 40;
        let posX = mousePosition.x - 80;
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        const topMenuH = $('#menu').height();
        const bottomMenuH = $('.footer.ice-bar').height();
        const offsetY = winH - (bottomMenuH + 277);
        const offsetX = winW - 160;
        if (posX < 0) {
          posX = 0;
        } else if (posX > offsetX) {
          posX = offsetX - 1;
        }
        if (posY < topMenuH - 24) {
          posY = topMenuH - 24;
        } else if (posY > offsetY) {
          posY = offsetY - 1;
        }

        toolbox.dom.css('top', `${posY}px`);
        toolbox.dom.css('left', `${posX}px`);
      }
    });

    //------------------------------------------------------------------
    //-- Callback for the EDIT/TOOLBOX option
    //------------------------------------------------------------------
    function showToolBox() {
      if (toolbox.dom === false) {
        toolbox.dom = $('#iceToolbox');
        toolbox.icons = $('.iceToolbox--item');
      }
      if (toolbox.isOpen) {
        toolbox.isOpen = false;
        toolbox.dom.removeClass('opened');
      } else {
        toolbox.isOpen = true;
        let posY = mousePosition.y - 110;
        let posX = mousePosition.x - 80;
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        const topMenuH = $('#menu').height();
        const bottomMenuH = $('.footer.ice-bar').height();
        const offsetY = winH - (bottomMenuH + 276);
        const offsetX = winW - 160;
        if (posX < 0) {
          posX = 0;
        } else if (posX > offsetX) {
          posX = offsetX - 1;
        }
        if (posY < topMenuH) {
          posY = topMenuH - 24;
        } else if (posY > offsetY) {
          posY = offsetY - 1;
        }

        toolbox.dom.css('top', `${posY}px`);
        toolbox.dom.css('left', `${posX}px`);

        toolbox.dom.addClass('opened');
      }
    }

    $scope.showToolBox = function () {
      showToolBox();
    };

    //------------------------------------------------------------------
    //-- Callback for launching Collection Manager from Menu
    //------------------------------------------------------------------
    function showCollectionManager() {
      iceStudio.bus.events.publish(
        'pluginManager.launch',
        'collectionManager2'
      );
    }

    $scope.showCollectionManager = function () {
      showCollectionManager();
    };

    //------------------------------------------------------------------
    //-- Collection Manager 2 bus event handlers
    //------------------------------------------------------------------

    iceStudio.bus.events.subscribe(
      'collectionManager2.removeCollection',
      function (data) {
        $scope.removeCollection(data);
      }
    );

    iceStudio.bus.events.subscribe(
      'collectionManager2.removeBlock',
      function (data) {
        alertify.confirm(
          gettextCatalog.getString(
            'Do you want to remove the block {{name}}?',
            { name: utils.bold(data.name || data.blockPath) }
          ),
          function () {
            try {
              fs.unlinkSync(data.blockPath);
            } catch (e) {
              console.warn('removeBlock: could not delete', data.blockPath, e);
            }
            collections.loadInternalCollections();
            iceStudio.updateEnv(common);
            utils.rootScopeSafeApply();
          }
        );
      }
    );

    iceStudio.bus.events.subscribe('collectionManager2.reload', function () {
      collections.loadInternalCollections();
      iceStudio.updateEnv(common);
      utils.rootScopeSafeApply();
    });

    iceStudio.bus.events.subscribe('collectionManager2.addZip', function () {
      $scope.addCollections();
    });

    iceStudio.bus.events.subscribe('collectionManager2.addFolder', function () {
      utils.openDialog('#input-add-collection-folder', function (folderpath) {
        if (!folderpath) {
          return;
        }
        var name = path.basename(folderpath);
        var dest = path.join(common.INTERNAL_COLLECTIONS_DIR, name);
        var copyFolderSync = function (src, dst) {
          if (!fs.existsSync(dst)) {
            fs.mkdirSync(dst, { recursive: true });
          }
          fs.readdirSync(src).forEach(function (item) {
            var srcItem = path.join(src, item);
            var dstItem = path.join(dst, item);
            if (fs.lstatSync(srcItem).isDirectory()) {
              copyFolderSync(srcItem, dstItem);
            } else {
              fs.copyFileSync(srcItem, dstItem);
            }
          });
        };
        try {
          copyFolderSync(folderpath, dest);
        } catch (e) {
          alertify.error(
            gettextCatalog.getString('Could not copy collection: {{msg}}', {
              msg: e.message,
            })
          );
          return;
        }
        collections.loadInternalCollections();
        iceStudio.updateEnv(common);
        utils.rootScopeSafeApply();
      });
    });

    iceStudio.bus.events.subscribe('collectionManager2.addBlock', function () {
      utils.openDialog('#input-add-block-ice', function (filepaths) {
        var files = filepaths.split(';');
        var pending = files.filter(function (f) {
          return !!f;
        });
        if (!pending.length) {
          return;
        }

        var processFile = function (idx) {
          if (idx >= pending.length) {
            return;
          }
          var src = pending[idx];

          //-- Read and parse the .ice file
          var iceData;
          try {
            iceData = JSON.parse(fs.readFileSync(src, 'utf8'));
          } catch (e) {
            alertify.error(
              gettextCatalog.getString('Could not read block: {{msg}}', {
                msg: e.message,
              })
            );
            processFile(idx + 1);
            return;
          }

          //-- Ensure package section exists
          if (!iceData.package) {
            iceData.package = {};
          }
          var pkg = iceData.package;
          var baseName = path.basename(src, '.ice');

          //-- Step 1: Show Project Information dialog
          var infoValues = [
            pkg.name || baseName,
            pkg.version || '1.0.0',
            pkg.description || '',
            pkg.author || '',
            pkg.image || '',
          ];

          utils.projectinfoprompt(infoValues, function (evt, newValues) {
            var projectName = newValues[0] || baseName || 'Untitled';
            iceData.package.name = projectName;
            iceData.package.version = newValues[1] || '';
            iceData.package.description = newValues[2] || '';
            iceData.package.author = newValues[3] || '';
            iceData.package.image = newValues[4] || '';

            //-- Step 2: Build collection chooser dropdown
            var existingColls = [];
            try {
              var entries = fs.readdirSync(common.INTERNAL_COLLECTIONS_DIR);
              for (var ei = 0; ei < entries.length; ei++) {
                var entryPath = path.join(
                  common.INTERNAL_COLLECTIONS_DIR,
                  entries[ei]
                );
                try {
                  if (fs.statSync(entryPath).isDirectory()) {
                    existingColls.push(entries[ei]);
                  }
                } catch (eStat) {}
              }
              existingColls.sort();
            } catch (eDir) {}

            var collHtml = [];
            collHtml.push('<div>');
            collHtml.push(
              '  <p>' + gettextCatalog.getString('Collection') + '</p>'
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
                gettextCatalog.getString('-- New collection --') +
                '</option>'
            );
            collHtml.push('  </select>');
            collHtml.push(
              '  <p id="coll-new-label" style="display:none;margin-top:8px">' +
                gettextCatalog.getString('New collection name') +
                '</p>'
            );
            collHtml.push(
              '  <input id="coll-new-name" class="ajs-input" type="text" ' +
                'value="Custom" style="display:none;width:100%">'
            );
            collHtml.push('</div>');

            //-- Defer so the projectinfoprompt dialog fully closes first
            setTimeout(function () {
              var collDlg = alertify.confirm();
              collDlg.setContent(collHtml.join('\n'));
              collDlg.set('onok', function () {
                var sel = document.getElementById('coll-select');
                var inp = document.getElementById('coll-new-name');
                var collectionName =
                  sel.value === '__new__'
                    ? (inp.value || '').trim()
                    : sel.value;
                if (!collectionName) {
                  alertify.warning(
                    gettextCatalog.getString('Collection name cannot be empty')
                  );
                  return false;
                }

                var collDir = path.join(
                  common.INTERNAL_COLLECTIONS_DIR,
                  collectionName
                );
                var blocksDir = path.join(collDir, 'blocks');

                try {
                  fs.mkdirSync(blocksDir, { recursive: true });
                } catch (e) {
                  alertify.error('Failed to create collection directory: ' + e);
                  return;
                }

                //-- Create package.json for new collections
                var pkgPath = path.join(collDir, 'package.json');
                if (!fs.existsSync(pkgPath)) {
                  var pkgData = {
                    name: collectionName,
                    version: '1.0.0',
                    description: 'Custom collection',
                    keywords: ['custom', 'collection'],
                    license: 'GPL-2.0',
                  };
                  fs.writeFileSync(pkgPath, JSON.stringify(pkgData, null, 2));
                }

                var safeName = projectName
                  .replace(/[^a-zA-Z0-9_\-\s]/g, '_')
                  .trim();
                if (!safeName) {
                  safeName = 'Untitled';
                }
                var filePath = path.join(blocksDir, safeName + '.ice');

                var doSave = function () {
                  try {
                    fs.writeFileSync(
                      filePath,
                      JSON.stringify(iceData, null, 2)
                    );
                    alertify.success(
                      gettextCatalog.getString('Block saved to collection') +
                        ': ' +
                        projectName
                    );

                    //-- Clear cached package.json so collection reloads properly
                    var pkgCachePath = path.resolve(pkgPath);
                    if (require.cache[pkgCachePath]) {
                      delete require.cache[pkgCachePath];
                    }

                    collections.loadAllCollections();
                    collections.selectCollection(collDir);
                    iceStudio.updateEnv(common);
                    utils.rootScopeSafeApply();
                  } catch (e) {
                    alertify.error(
                      gettextCatalog.getString('Failed to save block') +
                        ': ' +
                        e
                    );
                  }
                  //-- Process next file
                  processFile(idx + 1);
                };

                if (fs.existsSync(filePath)) {
                  alertify.confirm(
                    gettextCatalog.getString(
                      'A block named "' +
                        safeName +
                        '" already exists. Overwrite?'
                    ),
                    function () {
                      doSave();
                    }
                  );
                } else {
                  doSave();
                }
              });
              collDlg.set('oncancel', function () {
                //-- Process next file even if cancelled
                processFile(idx + 1);
              });
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

        processFile(0);
      });
    });

    //------------------------------------------------------------------
    //-- Toolbox menu item dispatch
    //-- Executed when a toolbox shortcut action is clicked
    //------------------------------------------------------------------
    $(document).delegate('.js-shortcut--action', 'click', function (e) {
      e.preventDefault();

      let menuOption = $(this).data('item');

      switch (menuOption) {
        case 'input':
          project.addBasicBlock(blocks.BASIC_INPUT);
          break;

        case 'output':
          project.addBasicBlock(blocks.BASIC_OUTPUT);
          break;

        case 'labelInput':
          project.addBasicBlock(blocks.BASIC_OUTPUT_LABEL);
          break;

        case 'labelOutput':
          project.addBasicBlock(blocks.BASIC_INPUT_LABEL);
          break;

        case 'labelPaired':
          project.addBasicBlock(blocks.BASIC_PAIRED_LABELS);
          break;

        case 'memory':
          project.addBasicBlock(blocks.BASIC_MEMORY);
          break;

        case 'code':
          project.addBasicBlock(blocks.BASIC_CODE);
          break;

        case 'information':
          project.addBasicBlock(blocks.BASIC_INFO);
          break;

        case 'constant':
          project.addBasicBlock(blocks.BASIC_CONSTANT);
          break;

        case 'json-input':
          project.addBasicBlock(blocks.BASIC_JSON_INPUT);
          break;

        case 'json-output':
          project.addBasicBlock(blocks.BASIC_JSON_OUTPUT);
          break;

        case 'verify':
          $scope.verifyCode();
          break;

        case 'build':
          $scope.buildCode();
          break;

        case 'upload':
          $scope.uploadCode();
          break;

        case 'testbench':
          $scope.openTestbench();
          break;

        case 'fitContent':
          $scope.fitContent();
          break;

        case 'showFullVerilog':
          $scope.showFullVerilog();
          break;

        case 'showLabelFinder':
          $scope.showLabelFinder();
          break;
      }
      return false;
    });
  },
};
