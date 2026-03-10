'use strict';

//-- Board management, build / verify / upload, collections
//-- Loaded as a <script> tag before menu.js; exposes window._icemenu.board

window._icemenu = window._icemenu || {};
window._icemenu.board = {
  init: function ($scope, deps) {
    var path = require('path');
    var fs = require('fs');
    var profile = deps.profile;
    var common = deps.common;
    var graph = deps.graph;
    var tools = deps.tools;
    var utils = deps.utils;
    var gettextCatalog = deps.gettextCatalog;
    var boards = deps.boards;
    var collections = deps.collections;
    var state = deps.state;
    var checkGraph = deps.checkGraph;
    var resetBuildStack = deps.resetBuildStack;

    //-----------------------------------------------------------------
    //-- Tools/Custom Board Manager
    //-----------------------------------------------------------------
    $scope.customBoardManager = function () {
      let apioResourcesPath = common.getApioResourcesDir() || '';
      let icestudioBoardsDir = path.resolve(path.join('resources', 'boards'));
      let icestudioMenuJson = path.resolve(
        path.join('resources', 'boards', 'menu.json')
      );

      let configObj = {
        apioResourcesPath: apioResourcesPath,
        icestudioBoardsDir: icestudioBoardsDir,
        icestudioMenuJson: icestudioMenuJson,
        customBoardsDir: common.CUSTOM_BOARDS_DIR,
        profilePath: common.PROFILE_PATH,
        theme: profile.data.uiTheme || 'light',
        customTheme: profile.data.customTheme || null,
      };

      let configParam = encodeURIComponent(JSON.stringify(configObj));
      let URL =
        'resources/viewers/custom-board/custom-board.html?config=' +
        configParam;

      nw.Window.open(
        URL,
        {
          title: 'Custom Board Manager',
          focus: true,
          resizable: true,
          width: 950,
          height: 750,
          icon: 'resources/images/icestudio-logo.png',
        },
        function (newWin) {
          newWin.on('closed', function () {
            let savedId = global.icestudioLastSavedBoard || null;
            global.icestudioLastSavedBoard = null;
            try {
              let profileData = JSON.parse(
                fs.readFileSync(common.PROFILE_PATH, 'utf8')
              );
              common.ownedBoards = profileData.ownedBoards || [];
              profile.data.ownedBoards = common.ownedBoards;
            } catch (e) {}
            boards.reloadBoards();
            if (savedId) {
              let selected = boards.selectBoard(savedId);
              if (selected) {
                profile.set('board', selected.name);
              }
            }
          });
        }
      );
    };

    //-----------------------------------------------------------------
    //-- Board ownership filter — used by | filter:isBoardOwned in menu.html
    //-----------------------------------------------------------------
    $scope.isBoardOwned = function (board) {
      return (
        common.ownedBoards.length === 0 ||
        common.ownedBoards.indexOf(board.name) !== -1
      );
    };

    //-----------------------------------------------------------------
    //-- Board Collection — choose which boards appear in the menu
    //-----------------------------------------------------------------
    $scope.boardCollection = function () {
      let icestudioBoardsDir = path.resolve(path.join('resources', 'boards'));
      let icestudioMenuJson = path.resolve(
        path.join('resources', 'boards', 'menu.json')
      );

      let currentOwnedBoards = profile.data.ownedBoards || [];
      try {
        var freshProfile = JSON.parse(
          fs.readFileSync(common.PROFILE_PATH, 'utf8')
        );
        currentOwnedBoards = freshProfile.ownedBoards || [];
        profile.data.ownedBoards = currentOwnedBoards;
        common.ownedBoards = currentOwnedBoards;
      } catch (e) {}

      let configObj = {
        icestudioBoardsDir: icestudioBoardsDir,
        icestudioMenuJson: icestudioMenuJson,
        profilePath: common.PROFILE_PATH,
        ownedBoards: currentOwnedBoards,
        theme: profile.data.uiTheme || 'light',
        customTheme: profile.data.customTheme || null,
      };

      let configParam = encodeURIComponent(JSON.stringify(configObj));
      let URL =
        'resources/viewers/board-collection/board-collection.html?config=' +
        configParam;

      nw.Window.open(
        URL,
        {
          title: 'Board Collection',
          focus: true,
          resizable: true,
          width: 680,
          height: 520,
          icon: 'resources/images/icestudio-logo.png',
        },
        function (newWin) {
          newWin.on('closed', function () {
            try {
              var profileData = JSON.parse(
                fs.readFileSync(common.PROFILE_PATH, 'utf8')
              );
              common.ownedBoards = profileData.ownedBoards || [];
              profile.data.ownedBoards = common.ownedBoards;
            } catch (e) {
              common.ownedBoards = [];
            }
            utils.rootScopeSafeApply();
          });
        }
      );
    };

    //-----------------------------------------------------------------
    //-- Edit/Preferences/UI Theme/Custom — open color picker
    //-----------------------------------------------------------------
    $scope.openCustomTheme = function () {
      let configObj = {
        profilePath: common.PROFILE_PATH,
        customTheme: profile.data.customTheme || null,
        theme: profile.data.uiTheme || 'light',
      };

      let configParam = encodeURIComponent(JSON.stringify(configObj));
      let URL =
        'resources/viewers/custom-theme/custom-theme.html?config=' +
        configParam;

      nw.Window.open(
        URL,
        {
          title: 'Custom Theme',
          focus: true,
          resizable: false,
          width: 620,
          height: 480,
          icon: 'resources/images/icestudio-logo.png',
        },
        function (newWin) {
          $scope._customThemeWin = newWin;
          newWin.on('closed', function () {
            $scope._customThemeWin = null;
            profile.load(null);
          });
        }
      );
    };

    $scope.toggleFPGAResources = function () {
      profile.set('showFPGAResources', !profile.get('showFPGAResources'));
    };

    $scope.toggleLoggingEnabled = function () {
      const newState = !profile.get('loggingEnabled');
      profile.set('loggingEnabled', newState);
      if (newState) {
        iceConsole.enable();
      } else {
        iceConsole.disable();
      }
    };

    //-----------------------------------------------------------------
    //-- Collection data / command output viewers
    //-----------------------------------------------------------------

    $scope.showCollectionData = function () {
      var collection = common.selectedCollection;
      var readme = collection.content.readme;
      if (readme) {
        nw.Window.open(
          'resources/viewers/markdown/readme.html?readme=' + readme,
          {
            title:
              (collection.name ? collection.name : 'Default') +
              ' Collection - Data',
            focus: true,
            resizable: true,
            width: 700,
            height: 700,
            icon: 'resources/images/icestudio-logo.png',
          }
        );
      } else {
        alertify.error(
          gettextCatalog.getString(
            'Collection {{collection}} info not defined',
            {
              collection: utils.bold(collection.name),
            }
          ),
          5
        );
      }
    };

    $scope.showCommandOutput = function () {
      state.winCommandOutput = nw.Window.open(
        'resources/viewers/plain/output.html?content=' +
          encodeURIComponent(common.commandOutput),
        {
          title: gettextCatalog.getString('Command output'),
          focus: true,
          resizable: true,
          width: 700,
          height: 400,
          icon: 'resources/images/icestudio-logo.png',
        }
      );
    };

    $(document).on('commandOutputChanged', function (evt, commandOutput) {
      if (state.winCommandOutput) {
        try {
          state.winCommandOutput.window.location.href =
            'resources/viewers/plain/output.html?content=' +
            encodeURIComponent(commandOutput);
        } catch (e) {
          state.winCommandOutput = null;
        }
      }
    });

    //-----------------------------------------------------------------
    //-- Collection + board selection
    //-----------------------------------------------------------------

    $scope.selectCollection = function (collection) {
      if (common.selectedCollection.path !== collection.path) {
        var name = collection.name;
        profile.set(
          'collection',
          collections.selectCollection(collection.path)
        );
        alertify.success(
          gettextCatalog.getString('Collection {{name}} selected', {
            name: utils.bold(name ? name : 'Default'),
          })
        );
      }
    };

    function updateSelectedCollection() {
      profile.set(
        'collection',
        collections.selectCollection(profile.get('collection'))
      );
    }

    $(document).on('boardChanged', function (evt, board) {
      if (common.selectedBoard.name !== board.name) {
        var newBoard = graph.selectBoard(board);
        profile.set('board', newBoard.name);
      }
    });

    $scope.selectBoard = function (board) {
      if (common.selectedBoard.name !== board.name) {
        if (!graph.isEmpty()) {
          alertify.confirm(
            gettextCatalog.getString(
              'The current FPGA I/O configuration will be lost. Do you want to change to the {{name}} board?',
              {
                name: utils.bold(board.info.label),
              }
            ),
            function () {
              _boardSelected();
            }
          );
        } else {
          _boardSelected();
        }
      }

      function _boardSelected() {
        var reset = true;
        var newBoard = graph.selectBoard(board, reset);
        profile.set('board', newBoard.name);
        alertify.success(
          gettextCatalog.getString('Board {{name}} selected', {
            name: utils.bold(newBoard.info.label),
          })
        );
      }
    };

    //-----------------------------------------------------------------
    //-- Snapshots
    //-----------------------------------------------------------------

    $scope.takeSnapshotPNG = function () {
      tools.takeSnapshotPNG();
    };

    $scope.takeSnapshotVideo = function () {
      tools.takeSnapshotVideo();
    };

    //-----------------------------------------------------------------
    //-- Verify / Build / Upload
    //-----------------------------------------------------------------

    $scope.verifyCode = function () {
      var startMessage = gettextCatalog.getString('Start verification');
      var endMessage = gettextCatalog.getString('Verification done');
      iceStudio.bus.events.publish('graph:writeJsonOutputs');
      checkGraph()
        .then(function () {
          return tools.verifyCode(startMessage, endMessage);
        })
        .catch(function () {});
    };

    $scope.buildCode = function () {
      if (graph.breadcrumbs.length > 1) {
        alertify.alert(
          gettextCatalog.getString('Build'),
          gettextCatalog.getString(
            'You can only build at the top-level design. Inside submodules, you can <strong>Verify</strong>'
          ),
          function () {}
        );
        return;
      }

      var startMessage = gettextCatalog.getString('Start build');
      var endMessage = gettextCatalog.getString('Build done');
      iceStudio.bus.events.publish('graph:writeJsonOutputs');
      checkGraph()
        .then(function () {
          return tools.buildCode(startMessage, endMessage);
        })
        .then(function () {
          resetBuildStack();
        })
        .catch(function () {});
    };

    $scope.uploadCode = function () {
      if (graph.breadcrumbs.length > 1) {
        alertify.alert(
          gettextCatalog.getString('Upload'),
          gettextCatalog.getString(
            'You can only upload at the top-level design. Inside submodules, you can <strong>Verify</strong>'
          ),
          function () {}
        );

        return;
      }

      var startMessage = gettextCatalog.getString('Start upload');
      var endMessage = gettextCatalog.getString('Upload done');
      iceStudio.bus.events.publish('graph:writeJsonOutputs');
      checkGraph()
        .then(function () {
          return tools.uploadCode(startMessage, endMessage);
        })
        .then(function () {
          resetBuildStack();
        })
        .catch(function () {});
    };

    //-----------------------------------------------------------------
    //-- Collections management
    //-----------------------------------------------------------------

    $scope.addCollections = function () {
      utils.openDialog('#input-add-collection', function (filepaths) {
        filepaths = filepaths.split(';');
        tools.addCollections(filepaths);
      });
    };

    $scope.reloadCollections = function () {
      collections.loadAllCollections();
      collections.selectCollection(common.selectedCollection.path);
    };

    $scope.removeCollection = function (collection) {
      alertify.confirm(
        gettextCatalog.getString(
          'Do you want to remove the {{name}} collection?',
          {
            name: utils.bold(collection.name),
          }
        ),
        function () {
          tools.removeCollection(collection);
          updateSelectedCollection();
          utils.rootScopeSafeApply();
        }
      );
    };

    $scope.removeAllCollections = function () {
      if (common.internalCollections.length > 0) {
        alertify.confirm(
          gettextCatalog.getString(
            'All stored collections will be lost. Do you want to continue?'
          ),
          function () {
            tools.removeAllCollections();
            updateSelectedCollection();
            utils.rootScopeSafeApply();
          }
        );
      } else {
        alertify.warning(gettextCatalog.getString('No collections stored'), 5);
      }
    };

    //-----------------------------------------------------------------
    //-- Misc
    //-----------------------------------------------------------------

    $scope.showChromeDevTools = function () {
      utils.openDevToolsUI();
    };

    $scope.openUrl = function (url, $event) {
      $event.preventDefault();
      utils.openUrlExternalBrowser(url);
      return false;
    };

    $scope.about = function () {
      var content = [
        '<div class="row">',
        '  <div class="col-sm-4">',
        '    <img width="220px" src="resources/images/icestudio-github.svg">',
        '  </div>',
        '  <div class="col-sm-7" style="margin-left: 45px;">',
        '    <h4>Icestudio</h4>',
        '    <p><i>Visual editor for open FPGA boards</i></p>',
        '    <p>Version: <span style="user-select: text;">' +
          $scope.version +
          '</span></p>',
        '    <p>License: GPL-2.0</p>',
        '  </div>',
        '</div>',
        '<div class="row" style="margin-top:30px;">',
        '  <div class="col-sm-12">',

        '    <p>Core Team:</p>',
        '    <ul class="credits-developers-list">',

        '           <li><strong>Carlos Venegas Arrabé</strong>&nbsp;&nbsp;&nbsp;',
        '<a class="action-open-url-external-browser" href="https://github.com/cavearr"><img class="credits-rss-icon" src="resources/images/icon-github.svg"></a>&nbsp;&nbsp;',
        '<a class="action-open-url-external-browser" href="https://twitter.com/cavearr"><img class="credits-rss-icon" src="resources/images/icon-twitter.svg"></a>',
        '</li>',
        '           <li><strong>Juan González Gómez</strong>&nbsp;&nbsp;&nbsp;',
        '<a class="action-open-url-external-browser" href="https://github.com/Obijuan"><img class="credits-rss-icon" src="resources/images/icon-github.svg"></a>&nbsp;&nbsp;',
        '<a class="action-open-url-external-browser" href="https://twitter.com/Obijuan_cube"><img class="credits-rss-icon" src="resources/images/icon-twitter.svg"></a>',
        '</li>',
        '</ul>',
        '    <p>Highlighted contributors:</p>',
        '    <ul class="credits-developers-list">',

        '           <li><strong>Alex Gutierrez Tomas</strong>&nbsp;&nbsp;&nbsp;',
        '<a class="action-open-url-external-browser" href="https://github.com/mslider"><img class="credits-rss-icon" src="resources/images/icon-github.svg"></a>&nbsp;&nbsp;',
        '<a class="action-open-url-external-browser" href="https://twitter.com/microslider"><img class="credits-rss-icon" src="resources/images/icon-twitter.svg"></a>',
        '</li>',
        '           <li><strong>Joaquim</strong>&nbsp;&nbsp;&nbsp;',
        '<a class="action-open-url-external-browser" href="https://github.com/jojo535275"><img class="credits-rss-icon" src="resources/images/icon-github.svg"></a>&nbsp;&nbsp;',
        '</li>',
        '           <li><strong>Democrito</strong>&nbsp;&nbsp;&nbsp;',
        '<a class="action-open-url-external-browser" href="https://github.com/Democrito"><img class="credits-rss-icon" src="resources/images/icon-github.svg"></a>&nbsp;&nbsp;',
        '</li>',
        '<li><strong>Fernando Mosquera</strong>&nbsp;&nbsp;&nbsp;',
        '<a class="action-open-url-external-browser" href="https://github.com/benitoss"><img class="credits-rss-icon" src="resources/images/icon-github.svg"></a>&nbsp;&nbsp;',
        '</li>',
        '</ul>',
        '    <p>Thanks to <strong>Jesús Arroyo Torrens</strong>, ',
        '<a class="action-open-url-external-browser" href="https://github.com/Jesus89"><img class="credits-rss-icon" src="resources/images/icon-github.svg"></a>&nbsp;&nbsp;',
        '<a class="action-open-url-external-browser" href="https://twitter.com/JesusArroyo89"><img class="credits-rss-icon" src="resources/images/icon-twitter.svg"></a>',
        'who started this project and was the main developer from 2016/Jan/28 to 2019/Oct',
        '</p>',
        '    <p>Thanks to the rest of <a class="action-open-url-external-browser" href="https://github.com/FPGAwars/icestudio#user-content-main-page">contributors</a></p>',
        '    <p><span class="copyleft">&copy;</span> <a class="action-open-url-external-browser" href="https://fpgawars.github.io">FPGAwars</a> 2016-2024</p>',
        '<img src="resources/images/fpgawars-logo.png">',
        '  </div>',
        '</div>',
      ].join('\n');
      alertify.alert(content);
    };
  },
};
