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

    iceStudio.bus.events.subscribe(
      'collectionManager2.addBlock',
      function (data) {
        utils.openDialog('#input-add-block-ice', function (filepaths) {
          var files = filepaths.split(';');
          files.forEach(function (src) {
            if (!src) {
              return;
            }
            var targetDir =
              data && data.targetCollectionPath
                ? path.join(data.targetCollectionPath, 'blocks')
                : path.join(
                    common.INTERNAL_COLLECTIONS_DIR,
                    'custom',
                    'blocks'
                  );
            try {
              if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
              }
              var destFile = path.join(targetDir, path.basename(src));
              fs.copyFileSync(src, destFile);
            } catch (e) {
              alertify.error(
                gettextCatalog.getString('Could not add block: {{msg}}', {
                  msg: e.message,
                })
              );
            }
          });
          collections.loadInternalCollections();
          iceStudio.updateEnv(common);
          utils.rootScopeSafeApply();
        });
      }
    );

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
      }
      return false;
    });
  },
};
