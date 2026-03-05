'use strict';

//-- Nodejs path module
//-- https://nodejs.org/docs/latest-v17.x/api/path.html
const path = require('path');

//-- Nodejs URL module
//-- https://nodejs.org/api/url.html
const url = require('url');

//-- node fs module
//-- https://nodejs.org/api/fs.html
const fs = require('fs');

//-- Section modules (split from this file for maintainability)
//-- NOTE: loaded as <script> tags in index.html before menu.js;
//--       each exposes its init via window._icemenu.<name>
var sectionFile = window._icemenu.file;
var sectionEdit = window._icemenu.edit;
var sectionSettings = window._icemenu.settings;
var sectionBoard = window._icemenu.board;
var sectionLabelFinder = window._icemenu.labelfinder;
var sectionToolbox = window._icemenu.toolbox;

angular.module('icestudio').controller(
  'MenuCtrl',
  function (
    $rootScope,
    $scope,
    $timeout,
    profile,
    project,
    collections,
    graph,
    tools,
    utils,
    blocks,
    forms,
    common,
    shortcuts,
    gettextCatalog,

    //-- Accessing _package object
    //-- Defined in module app/scripts/factories/window.js
    _package,
    boards
  ) {
    //-------------------------------------------------------------------------
    //-- This code is executed when a new Icestudio Window is created:
    //--  Either on startup, when a new project is created or when an
    //--  example is opened
    //--
    //-- The new window receives the parameters through the URL
    //-------------------------------------------------------------------------

    //-- Initialize scope

    $scope.profile = profile;
    $scope.project = project;
    $scope.tools = tools;
    $scope.common = common;

    $scope.version = _package.version;
    $scope.toolchain = tools.toolchain;

    $scope.workingdir = '';
    $scope.snapshotdir = '';

    //-- Shared mutable state (passed to section modules that need it)
    var state = {
      zeroProject: true, // New project without changes
      resultAlert: null,
      winCommandOutput: null,
      mousedown: false, // Tracks mouse-down on .paper (used by menu UI + toolbox)
      buildUndoStack: [],
      changedUndoStack: [],
      currentUndoStack: [],
    };

    //-----------------------------------
    // MAIN WINDOW
    //-----------------------------------

    //-- Get the Window object
    let win = nw.Window.get();

    //-- ONLY MAC:
    //-- Creates the builtin menus (App, Edit and Window) within the menubar
    if (process.platform === 'darwin') {
      let mb = new nw.Menu({
        type: 'menubar',
      });

      mb.createMacBuiltin('Icestudio');
      win.menu = mb;
    }

    //-- Get the focus on the main window
    win.focus();

    //--------------------------------------------------------------
    //-- Configure the window events
    //--------------------------------------------------------------

    //-- Event: Window closed
    win.on('close', function () {
      exit();
    });

    //-- Event: The window is maximized
    win.on('maximize', function () {
      graph.fitPaper();
    });

    //-- Event: The window was resized
    win.on('resize', function () {
      graph.fitPaper();
    });

    //-- Event: The window was moved
    win.on('move', function () {
      //graph.fitContent();
    });

    //-- Emitted when window is restored from minimize, maximize and fullscreen state.
    win.on('restore', function () {
      graph.fitContent();
    });

    //-------------------------------------------------------------------------
    //-- Read the arguments passed to the app
    //-------------------------------------------------------------------------

    let myURL = new url.URL('http://index.html' + window.location.search);

    let filepath = '';

    let icestudioArgv = myURL.searchParams.get('icestudio_argv');

    if (icestudioArgv) {
      let paramsJson = Buffer.from(icestudioArgv, 'base64').toString('utf8');
      let params = JSON.parse(paramsJson);
      filepath = params['filepath'];
    } else {
      let args = nw.App.argv;
      if (args.length > 0) {
        filepath = nw.App.argv[0];
      }
    }

    if (filepath) {
      if (fs.existsSync(filepath)) {
        console.log('OPEN PROJECT', filepath);
        project.open(filepath);
        addRecentProject(filepath);
      }
    }

    //-- Set the working directory for the current design
    if (project.path) {
      var initDirname = path.dirname(project.path);
      $scope.workingdir = path.join(initDirname, path.sep);
    }

    //-------------------------------------------------------------------------
    //-- Shared utility functions (used by multiple section modules)
    //-------------------------------------------------------------------------

    function checkGraph() {
      return new Promise(function (resolve, reject) {
        if (!graph.isEmpty()) {
          resolve();
        } else {
          if (state.resultAlert) {
            state.resultAlert.dismiss(true);
          }
          state.resultAlert = alertify.warning(
            gettextCatalog.getString('Add a block to start'),
            5
          );
          reject();
        }
      });
    }

    function resetChangedStack() {
      state.changedUndoStack = state.currentUndoStack;
      project.changed = false;
      project.updateTitle();
    }

    function resetBuildStack() {
      state.buildUndoStack = state.currentUndoStack;
      common.hasChangesSinceBuild = false;
      utils.rootScopeSafeApply();
    }

    //-- addRecentProject is used in the startup filepath check above
    //-- and also in file section; define it here and let file section reuse $scope.openProject
    function addRecentProject(aFilepath) {
      const recentProjects = profile.get('recentProjects') || [];
      const updatedProjects = recentProjects.filter(
        (p) => p.path !== aFilepath
      );
      updatedProjects.unshift({
        path: aFilepath,
        lastOpened: new Date().toISOString(),
      });
      profile.set('recentProjects', updatedProjects.slice(0, 10));
      $scope.recentProjects = updatedProjects.slice(0, 10);
    }

    //-- Forward exit() to the file section; defined here so win.on('close') can call it
    //-- (overwritten below once file section is initialized)
    var exit = function () {
      win.close(true);
    };

    //-------------------------------------------------------------------------
    //-- Initialize section modules
    //-------------------------------------------------------------------------

    sectionFile.init($scope, {
      $rootScope: $rootScope,
      $timeout: $timeout,
      project: project,
      utils: utils,
      profile: profile,
      collections: collections,
      common: common,
      graph: graph,
      tools: tools,
      gettextCatalog: gettextCatalog,
      _package: _package,
      win: win,
      state: state,
      checkGraph: checkGraph,
      resetChangedStack: resetChangedStack,
      resetBuildStack: resetBuildStack,
    });

    //-- After file section is initialized, $scope.quit calls exit() via that section.
    //-- Re-wire win.on('close') to call the scope function directly.
    exit = function () {
      $scope.quit();
    };

    sectionEdit.init($scope, {
      graph: graph,
      checkGraph: checkGraph,
    });

    sectionSettings.init($scope, {
      forms: forms,
      profile: profile,
      graph: graph,
      project: project,
      common: common,
      collections: collections,
      utils: utils,
      gettextCatalog: gettextCatalog,
      state: state,
    });

    sectionBoard.init($scope, {
      profile: profile,
      common: common,
      graph: graph,
      tools: tools,
      utils: utils,
      gettextCatalog: gettextCatalog,
      boards: boards,
      collections: collections,
      state: state,
      checkGraph: checkGraph,
      resetBuildStack: resetBuildStack,
    });

    sectionLabelFinder.init($scope, {
      utils: utils,
      common: common,
      graph: graph,
      blocks: blocks,
      gettextCatalog: gettextCatalog,
    });

    sectionToolbox.init($scope, {
      project: project,
      blocks: blocks,
      collections: collections,
      common: common,
      utils: utils,
      gettextCatalog: gettextCatalog,
      state: state,
    });

    //-------------------------------------------------------------------------
    //-- Undo stack tracking
    //-------------------------------------------------------------------------

    $(document).on('stackChanged', function (evt, undoStack) {
      state.currentUndoStack = undoStack;
      var undoStackString = JSON.stringify(undoStack);
      project.changed =
        JSON.stringify(state.changedUndoStack) !== undoStackString;
      project.updateTitle();
      state.zeroProject = false;
      common.hasChangesSinceBuild =
        JSON.stringify(state.buildUndoStack) !== undoStackString;
      utils.rootScopeSafeApply();
    });

    //-------------------------------------------------------------------------
    //-- Keyboard shortcuts
    //-------------------------------------------------------------------------

    var promptShown = false;

    alertify.prompt().set({
      onshow: function () {
        promptShown = true;
      },
      onclose: function () {
        promptShown = false;
      },
    });

    alertify.confirm().set({
      onshow: function () {
        promptShown = true;
      },
      onclose: function () {
        promptShown = false;
      },
    });

    // -- File
    shortcuts.method('newProject', $scope.newProject);
    shortcuts.method('openProject', $scope.openProjectDialog);
    shortcuts.method('saveProject', $scope.saveProject);
    shortcuts.method('saveProjectAs', $scope.saveProjectAs);
    shortcuts.method('quit', $scope.quit);

    // -- Edit
    shortcuts.method('undoGraph', $scope.undoGraph);
    shortcuts.method('redoGraph', $scope.redoGraph);
    shortcuts.method('redoGraph2', $scope.redoGraph);
    shortcuts.method('cutSelected', $scope.cutSelected);
    shortcuts.method('copySelected', $scope.copySelected);
    shortcuts.method('pasteAndCloneSelected', $scope.pasteAndCloneSelected);
    shortcuts.method('pasteSelected', $scope.pasteSelected);
    shortcuts.method('duplicateSelected', $scope.duplicateSelected);
    shortcuts.method('removeSelected', $scope.removeSelected);
    shortcuts.method('selectAll', $scope.selectAll);
    shortcuts.method('fitContent', $scope.fitContent);

    // -- Tools
    shortcuts.method('verifyCode', $scope.verifyCode);
    shortcuts.method('buildCode', $scope.buildCode);
    shortcuts.method('uploadCode', $scope.uploadCode);
    shortcuts.method('takeSnapshotPNG', $scope.takeSnapshotPNG);
    shortcuts.method('takeSnapshotVideo', $scope.takeSnapshotVideo);

    // -- Misc
    shortcuts.method('stepUp', graph.stepUp);
    shortcuts.method('stepDown', graph.stepDown);
    shortcuts.method('stepLeft', graph.stepLeft);
    shortcuts.method('stepRight', graph.stepRight);

    // -- Popups
    shortcuts.method('showLabelFinder', $scope.showLabelFinder);
    shortcuts.method('showToolBox', $scope.showToolBox);
    shortcuts.method('showCollectionManager', $scope.showCollectionManager);

    shortcuts.method('back', function () {
      if (graph.isEnabled()) {
        graph.removeSelected();
      }
    });

    shortcuts.method('testing', function () {
      alertify.alert('<b>Ready!</b> ' + process.platform);
    });

    $(document).on('keydown', function (event) {
      var opt = {
        prompt: promptShown,
        disabled: !graph.isEnabled(),
      };
      event.stopImmediatePropagation();
      var ret = shortcuts.execute(event, opt);
      if (ret.preventDefault) {
        event.preventDefault();
      }
    });

    //-------------------------------------------------------------------------
    //-- Menu show / hide / fix (hover-open dropdown behavior)
    //-------------------------------------------------------------------------

    var menu;
    var timerOpen;
    var timerClose;

    $(document).on('mouseup', function () {
      state.mousedown = false;
    });

    $(document).on('mousedown', '.paper', function () {
      state.mousedown = true;
      if (
        typeof $scope.status !== 'undefined' &&
        typeof $scope.status[menu] !== 'undefined'
      ) {
        $scope.status[menu] = false;
      }
      utils.rootScopeSafeApply();
    });

    $scope.showMenu = function (newMenu) {
      cancelTimeouts();
      if (
        !state.mousedown &&
        !graph.addingDraggableBlock &&
        !$scope.status[newMenu]
      ) {
        timerOpen = $timeout(function () {
          $scope.fixMenu(newMenu);
        }, 300);
      }
    };

    $scope.hideMenu = function () {
      cancelTimeouts();
      timerClose = $timeout(function () {
        $scope.status[menu] = false;
      }, 900);
    };

    $scope.fixMenu = function (newMenu) {
      menu = newMenu;
      $scope.status[menu] = true;
    };

    function cancelTimeouts() {
      $timeout.cancel(timerOpen);
      $timeout.cancel(timerClose);
    }

    // Disable click in submenus
    $(document).click('.dropdown-submenu', function (event) {
      if ($(event.target).hasClass('dropdown-toggle')) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    });

    function ebusCollection(args) {
      if (typeof args.status !== 'undefined') {
        switch (args.status) {
          case 'enable':
            $('#menu .navbar-right>li').removeClass('hidden');
            break;
          case 'disable':
            var first = true;
            $('#menu .navbar-right>li').each(function () {
              if (!first) {
                $(this).addClass('hidden');
              }
              first = false;
            });
            break;
        }
      }
    }

    iceStudio.bus.events.subscribe('menu.collection', ebusCollection);
  }
);
