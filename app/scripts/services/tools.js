//== JSHINT rules / START
/* global _icetools */
//== JSHINT rules / END

//----------------------------------------------------------------------------
//-- TOOLS: Toolchain, code generation, apio commands — orchestrator
//-- Sub-modules (loaded as <script> tags before this file) expose factories
//-- via window._icetools.*; each factory receives the shared ctx object.
//----------------------------------------------------------------------------

'use strict';

angular
  .module('icestudio')
  .service(
    'tools',
    function (
      project,
      compiler,
      profile,
      collections,
      drivers,
      graph,
      utils,
      forms,
      common,
      gettextCatalog,
      nodeGettext,
      nodeFs,
      nodeFse,
      nodePath,
      nodeChildProcess,
      nodeSSHexec,
      nodeRSync,
      nodeAdmZip,
      _package,
      $rootScope,
      gui,
      boards
    ) {
      //------------------------------------------------------------------------
      //-- Shared mutable state
      //------------------------------------------------------------------------
      var taskRunning = false;
      var resources = [];
      var startAlert = null;
      var infoAlert = null;
      var resultAlert = null;
      var toolchainAlert = null;

      //-- tools.toolchain Global Object
      //-- tools.toolchain.apio -> Apio version
      //-- tools.toolchain.installed -> Boolean. True if toolchain is installed
      //-- tools.toolchain.disable  -> Boolean. True if toolchain is disabled
      var toolchain = {
        apio: '-',
        installed: false,
        disabled: false,
      };
      this.toolchain = toolchain;

      //------------------------------------------------------------------------
      //-- Shared context — passed to every sub-module factory
      //------------------------------------------------------------------------
      var ctx = {
        // Mutable alert state (modules read/write via ctx.*)
        get taskRunning() {
          return taskRunning;
        },
        set taskRunning(v) {
          taskRunning = v;
        },
        get resources() {
          return resources;
        },
        set resources(v) {
          resources = v;
        },
        get startAlert() {
          return startAlert;
        },
        set startAlert(v) {
          startAlert = v;
        },
        get infoAlert() {
          return infoAlert;
        },
        set infoAlert(v) {
          infoAlert = v;
        },
        get resultAlert() {
          return resultAlert;
        },
        set resultAlert(v) {
          resultAlert = v;
        },
        get toolchainAlert() {
          return toolchainAlert;
        },
        set toolchainAlert(v) {
          toolchainAlert = v;
        },

        // Toolchain state
        toolchain: toolchain,

        // Angular-injected services
        project: project,
        compiler: compiler,
        profile: profile,
        collectionsService: collections,
        drivers: drivers,
        graph: graph,
        utils: utils,
        forms: forms,
        common: common,
        gettextCatalog: gettextCatalog,
        nodeGettext: nodeGettext,
        nodeFs: nodeFs,
        nodeFse: nodeFse,
        nodePath: nodePath,
        nodeChildProcess: nodeChildProcess,
        nodeSSHexec: nodeSSHexec,
        nodeRSync: nodeRSync,
        nodeAdmZip: nodeAdmZip,
        _package: _package,
        $rootScope: $rootScope,
        gui: gui,
        boards: boards,
      };

      //------------------------------------------------------------------------
      //-- Initialize modules
      //------------------------------------------------------------------------
      var _ui = _icetools.ui(ctx);
      var _toolchain = _icetools.toolchain(ctx);
      var _connectivity = _icetools.connectivity(ctx);
      var _apio = _icetools.apio(ctx);
      var _codeGen = _icetools.codeGenerator(ctx);
      var _resources = _icetools.resources(ctx);
      var _errorHandler = _icetools.errorHandler(ctx);
      var _snapshots = _icetools.snapshots(ctx);
      var _collections = _icetools.collections(ctx);

      //------------------------------------------------------------------------
      //-- Wire cross-module references into ctx
      //------------------------------------------------------------------------
      ctx.updateProgress = _ui.updateProgress;
      ctx.initProgress = _ui.initProgress;
      ctx.closeToolchainAlert = _ui.closeToolchainAlert;
      ctx.setupDriversAlert = _ui.setupDriversAlert;
      ctx.toolchainNotInstalledAlert = _ui.toolchainNotInstalledAlert;
      ctx.installationStatus = _ui.installationStatus;
      ctx.restoreStatus = _ui.restoreStatus;

      ctx.checkToolchainInstalled = _toolchain.checkToolchainInstalled;
      ctx.checkConnections = _connectivity.checkConnections;

      ctx.generateCode = _codeGen.generateCode;

      ctx.syncResources = _resources.syncResources;

      ctx.processResult = _errorHandler.processResult;

      //------------------------------------------------------------------------
      //-- Event bus subscription (MCH2022 toolchain upload resolve)
      //------------------------------------------------------------------------
      iceStudio.bus.events.subscribe(
        'toolchain.upload.resolve',
        _apio.toolchainRunResolve
      );

      // Remove old build directory on start
      nodeFse.removeSync(common.OLD_BUILD_DIR);

      //------------------------------------------------------------------------
      //-- Public API — apio commands
      //------------------------------------------------------------------------
      this.verifyCode = _apio.verifyCode;
      this.buildCode = _apio.buildCode;
      this.uploadCode = _apio.uploadCode;

      //------------------------------------------------------------------------
      //-- Public API — toolchain management
      //------------------------------------------------------------------------
      this.checkToolchain = _toolchain.checkToolchain;
      this.installToolchain = _toolchain.installToolchain;
      this.installToolchainDev = _toolchain.installToolchainDev;
      this.updateToolchain = _toolchain.updateToolchain;
      this.removeToolchain = _toolchain.removeToolchain;
      this.enableDrivers = _toolchain.enableDrivers;
      this.disableDrivers = _toolchain.disableDrivers;

      //------------------------------------------------------------------------
      //-- Public API — snapshots
      //------------------------------------------------------------------------
      this.takeSnapshotPNG = _snapshots.takeSnapshotPNG;
      this.takeSnapshotVideo = _snapshots.takeSnapshotVideo;

      //------------------------------------------------------------------------
      //-- Public API — collections
      //------------------------------------------------------------------------
      this.addCollections = _collections.addCollections;
      this.removeCollection = _collections.removeCollection;
      this.removeAllCollections = _collections.removeAllCollections;

      //------------------------------------------------------------------------
      //-- Event listeners
      //------------------------------------------------------------------------
      $rootScope.$on(
        'installToolchain',
        function (/*event*/) {
          this.installToolchain();
        }.bind(this)
      );

      $rootScope.$on(
        'enableDrivers',
        function (/*event*/) {
          this.enableDrivers();
        }.bind(this)
      );

      //------------------------------------------------------------------------
      //-- Misc public methods (kept in orchestrator)
      //------------------------------------------------------------------------
      this.checkForNewVersion = function () {
        if (typeof _package.updatecheck !== 'undefined') {
          $.getJSON(
            _package.updatecheck + '?_tsi=' + new Date().getTime(),
            function (result) {
              var hasNewVersion = false;
              if (result !== false) {
                if (
                  typeof result.version !== 'undefined' &&
                  _package.version < result.version
                ) {
                  hasNewVersion = 'stable';
                }
                if (
                  typeof result.nightly !== 'undefined' &&
                  _package.version < result.nightly
                ) {
                  hasNewVersion = 'nightly';
                }
                if (hasNewVersion !== false) {
                  var msg = '';
                  if (hasNewVersion === 'stable') {
                    msg =
                      '<div class="new-version-notifier-box"><div class="new-version-notifier-box--icon"><img src="resources/images/confetti.svg"></div>\
                <div class="new-version-notifier-box--text">' +
                      gettextCatalog.getString(
                        'There is a new stable version available'
                      ) +
                      '<br><a class="action-open-url-external-browser" href="https://icestudio.io" target="_blank">' +
                      gettextCatalog.getString('Click here to install it') +
                      '</a></div></div>';
                  } else {
                    msg =
                      '<div class="new-version-notifier-box"><div class="new-version-notifier-box--icon"><img src="resources/images/confetti.svg"></div>\
                <div class="new-version-notifier-box--text">' +
                      gettextCatalog.getString(
                        'There is a new nightly version available'
                      ) +
                      '<br><a class="action-open-url-external-browser" href="https://icestudio.io" target="_blank">' +
                      gettextCatalog.getString('Click here to install it') +
                      '</a></div></div>';
                  }
                  alertify.notify(msg, 'notify', 30);
                }
              }
            }
          );
        }
      };

      this.ifDevelopmentMode = function () {
        if (
          typeof _package.development !== 'undefined' &&
          typeof _package.development.mode !== 'undefined' &&
          _package.development.mode === true
        ) {
          utils.openDevToolsUI();
        }
      };

      this.initializePluginManager = function (callbackOnRun) {
        if (typeof ICEpm !== 'undefined') {
          common.uiTheme = profile.get('uiTheme') || 'light';
          common.customTheme = profile.get('customTheme') || null;
          ICEpm.setEnvironment(common);
          ICEpm.setPluginDir(common.DEFAULT_PLUGIN_DIR, function () {
            var plist = ICEpm.getAll();
            var uri = ICEpm.getBaseUri();
            var t = $('.icm-icon-list');
            t.empty();
            var html = '';
            for (var prop in plist) {
              if (
                typeof plist[prop].manifest.type === 'undefined' ||
                plist[prop].manifest.type === 'app'
              ) {
                html +=
                  '<a href="#" data-action="icm-plugin-run" data-plugin="' +
                  prop +
                  '"><img class="icm-plugin-icon" src="' +
                  uri +
                  '/' +
                  prop +
                  '/' +
                  plist[prop].manifest.icon +
                  '"><span>' +
                  plist[prop].manifest.name +
                  '</span></a>';
              }
            }
            t.append(html);
            $('[data-action="icm-plugin-run"]').off();
            $('[data-action="icm-plugin-run"]').on('click', function (e) {
              e.preventDefault();
              var ptarget = $(this).data('plugin');
              if (typeof callbackOnRun !== 'undefined') {
                callbackOnRun();
              }
              ICEpm.run(ptarget);
              return false;
            });
          });
        }
      };

      this.selectBoardPrompt = function (callback) {
        // Disable user events
        utils.disableKeyEvents();

        // Hide Cancel button
        $('.ajs-cancel').addClass('hidden');

        //-- Create the form
        var form = new forms.FormSelectBoard();

        //-- Display the form
        form.display(function (evt) {
          //-- Process the information in the form
          form.process(evt);

          //-- Read the selected board
          var selectedBoard = form.values[0];

          if (selectedBoard) {
            evt.cancel = false;

            //-- Execute the callback
            if (callback) {
              callback(selectedBoard);
            }

            // Enable user events
            utils.enableKeyEvents();
          }
        });
      };
    }
  );
