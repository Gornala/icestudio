//---------------------------------------------------------------------------
//-- Profile managment
//--
//-- Methods, data and constants for managing the Icestudio profile file
//---------------------------------------------------------------------------
'use strict';

angular
  .module('icestudio')
  .service('profile', function (utils, common, _package, nodeFs) {
    //-- Information stored in the profile file
    this.data = {
      board: '', //-- Selected board
      boardRules: true, //-- Boardrules (active by default)
      allowInoutPorts: false, //-- Tri-state (inout ports) available (not included by default)
      collection: '', //-- Selected collection
      externalCollections: '', //-- Path for the external collections
      externalPlugins: '', //-- Path for the external paths
      language: '', //-- Current selected language
      uiTheme: 'light', //-- Theme
      remoteHostname: '',
      showFPGAResources: false,
      loggingEnabled: false,
      loggingFile: '',
      displayVersionInfoWindow: 'yes',
      pythonEnv: { python: '', pip: '' },
      recentProjects: [],
      ownedBoards: [], //-- Board Collection filter (empty = show all)
      customTheme: null, //-- Custom theme colors object (null = use dark/light CSS)
    };

    //-- Property added to the MACs
    if (common.DARWIN) {
      this.data['macosFTDIDrivers'] = false;
    }

    //-- Load the Profile file
    //-- The profile path is in the common.PROFILE_PATH global object
    this.load = function (callback) {
      var self = this;

      utils
        //-- Read the profile file....
        .readFile(common.PROFILE_PATH)

        //-- Store the values from the file into the common.data global object
        .then(function (data) {
          self.data = {
            board: data.board || '',
            boardRules: data.boardRules !== false,
            allowInoutPorts: data.allowInoutPorts === true,
            collection: data.collection || '',
            language: data.language || 'en',
            uiTheme: data.uiTheme || 'dark',
            externalCollections: data.externalCollections || '',
            externalPlugins: data.externalPlugins || '',
            remoteHostname: data.remoteHostname || '',
            showFPGAResources: data.showFPGAResources || false,
            displayVersionInfoWindow: data.displayVersionInfoWindow || 'yes',
            lastVersionReview: data.lastVersionReview || false,
            loggingEnabled: data.loggingEnabled || false,
            loggingFile: data.loggingFile || '',
            pythonEnv: data.pythonEnv || { python: '', pip: '' },
            recentProjects: data.recentProjects || [],
            ownedBoards: data.ownedBoards || [],
            customTheme: data.customTheme || null,
          };

          if (self.data.pythonEnv.python.length > 0) {
            common.PYTHON_ENV = self.data.pythonEnv.python;
            common.PYTHON_PIP_ENV = self.data.pythonEnv.pip;
          }

          // Make variable uiTheme as global for use in "joint.shapes.js"
          global.uiTheme = self.data.uiTheme;

          //-- Custom Theme support
          //-- pHead uiTheme css sanitization
          let uiThemeEl = document.getElementById('uiTheme');
          if (uiThemeEl) {
            uiThemeEl.remove();
          }
          let uiThemeCustomEl = document.getElementById('uiThemeCustom');
          if (uiThemeCustomEl) {
            uiThemeCustomEl.remove();
          }
          //-- Dark Theme:
          if (self.data.uiTheme === 'dark') {
            let link = document.createElement('link');
            link.id = 'uiTheme';
            link.rel = 'stylesheet';
            link.href = 'resources/uiThemes/dark/dark.css';
            document.head.appendChild(link);
          }
          //-- Light Theme: same as the original!
          if (self.data.uiTheme === 'light') {
            let link = document.createElement('link');
            link.id = 'uiTheme';
            link.rel = 'stylesheet';
            link.href = 'resources/uiThemes/light/light.css';
            document.head.appendChild(link);
          }
          //-- Custom Theme: use light.css as base, then overlay custom colors.
          if (self.data.uiTheme === 'custom') {
            let link = document.createElement('link');
            link.id = 'uiTheme';
            link.rel = 'stylesheet';
            link.href = 'resources/uiThemes/light/light.css';
            document.head.appendChild(link);
            let ct = self.data.customTheme;
            if (ct) {
              let customStyle = document.createElement('style');
              customStyle.id = 'uiThemeCustom';
              customStyle.textContent = [
                '.joint-paper-background { background: ' +
                  ct.bg +
                  ' !important; }',
                '.ice-bar { background: ' +
                  (ct.sidebar || ct.bg) +
                  ' !important; color: ' +
                  ct.text +
                  ' !important; border-bottom: 1px solid ' +
                  ct.border +
                  '; }',
                '.footer { background: ' +
                  (ct.sidebar || ct.bg) +
                  ' !important; color: ' +
                  ct.text +
                  ' !important; border-top: 1px solid ' +
                  ct.border +
                  '; }',
                '.ice-button { background: ' +
                  ct.bg2 +
                  ' !important; color: ' +
                  ct.text +
                  ' !important; border: 1px solid ' +
                  ct.border +
                  '; }',
                '.dropdown-menu { background: ' + ct.bg2 + ' !important; }',
                '.dropdown-menu > li > a { background: ' +
                  ct.bg2 +
                  '; color: ' +
                  ct.text +
                  '; }',
                '.dropdown-menu > li > a:hover { background: ' +
                  ct.border +
                  ' !important; color: ' +
                  ct.text +
                  '; }',
                '.dropdown a { color: ' + ct.text + ' !important; }',
                '.breadcrumb { background: ' + ct.bg + ' !important; }',
                '.breadcrumb span { color: ' + ct.text + '; }',
                '.info { background: ' +
                  (ct.sidebar || ct.bg) +
                  ' !important; color: ' +
                  ct.text +
                  ' !important; }',
                // Left & right panels
                '#left-panel { background: ' +
                  ct.sidebar +
                  ' !important; border-right-color: ' +
                  ct.border +
                  ' !important; color: ' +
                  ct.text +
                  ' !important; }',
                '#right-panel { background: ' +
                  ct.sidebar +
                  ' !important; border-left-color: ' +
                  ct.border +
                  ' !important; color: ' +
                  ct.text +
                  ' !important; }',
                '#lp-tab-bar { background: ' +
                  ct.sidebar +
                  ' !important; border-bottom-color: ' +
                  ct.border +
                  ' !important; }',
                '.lp-tab-row { border-bottom-color: ' +
                  ct.border +
                  ' !important; }',
                '.lp-tab-btn { color: ' + ct.text + ' !important; }',
                '.lp-tab-btn:hover { background: ' +
                  ct.border +
                  ' !important; color: ' +
                  ct.text +
                  ' !important; }',
                '.lp-tab-btn.active { background: ' +
                  ct.sidebar +
                  ' !important; color: ' +
                  ct.accent +
                  ' !important; border-bottom-color: ' +
                  ct.accent +
                  ' !important; }',
                '.lp-refresh-btn { border-left-color: ' +
                  ct.border +
                  ' !important; color: ' +
                  ct.text +
                  ' !important; }',
                '.lp-refresh-btn:hover { background: ' +
                  ct.border +
                  ' !important; }',
                '#lp-tab, #rp-tab { background: ' +
                  ct.sidebar +
                  ' !important; border-color: ' +
                  ct.border +
                  ' !important; color: ' +
                  ct.text +
                  ' !important; }',
                '#lp-tab:hover, #rp-tab:hover { background: ' +
                  ct.border +
                  ' !important; }',
                '#lp-resize-handle::before, #rp-resize-handle::before { background: ' +
                  ct.border +
                  ' !important; }',
                '#lp-resize-handle:hover::before, #rp-resize-handle:hover::before { background: ' +
                  ct.accent +
                  ' !important; }',
                '.lp-node:hover { background: ' + ct.border + ' !important; }',
                '.lp-node.lp-pinned, .lp-port-row.lp-pinned { background: ' +
                  ct.bg2 +
                  ' !important; outline-color: ' +
                  ct.accent +
                  ' !important; }',
                '.lp-section-header { color: ' + ct.text + ' !important; }',
                '.lp-label { color: ' + ct.text + ' !important; }',
                // Right panel: set CSS variables on the collectionManager2 host
                // — CSS custom properties inherit through shadow DOM boundaries
                '#collectionManager2 {' +
                  ' --cm-bg: ' +
                  ct.sidebar +
                  ';' +
                  ' --cm-bg2: ' +
                  ct.sidebar +
                  ';' +
                  ' --cm-bg3: ' +
                  ct.bg2 +
                  ';' +
                  ' --cm-border: ' +
                  ct.border +
                  ';' +
                  ' --cm-text: ' +
                  ct.text +
                  ';' +
                  ' --cm-text-btn: ' +
                  ct.text +
                  ';' +
                  ' --cm-text-dim: ' +
                  ct.text +
                  ';' +
                  ' --cm-hover: ' +
                  ct.border +
                  ';' +
                  ' --cm-accent: ' +
                  ct.accent +
                  ';' +
                  ' border-left-color: ' +
                  ct.border +
                  ' !important; }',
              ].join('\n');
              document.head.appendChild(customStyle);
            }
          }
          //-- End Custom Theme support

          //-- Sync ownedBoards to common for use in menuboard directive
          common.ownedBoards = self.data.ownedBoards || [];

          if (common.DARWIN) {
            self.data['macosFTDIDrivers'] = data.macosFTDIDrivers || false;
          }
          if (callback) {
            callback();
          }
          let env = common;
          env.profile = self.data;
          if (!iceStudio.isInitialized()) {
            iceStudio.init(env);
          } else {
            iceStudio.updateEnv(env);
          }
        })
        .catch(function (error) {
          console.warn(error);
          if (callback) {
            callback();
          }
        });
    };

    //-- Set the value of a profile property in the profile file
    this.set = function (key, value) {
      //-- The given property name is valid...
      if (this.data.hasOwnProperty(key)) {
        //-- Store the value
        this.data[key] = value;

        //-- Save into the profile file;
        this.save();
      }
    };

    //-- Read a value from the profile data structure
    this.get = function (key) {
      return this.data[key];
    };

    //------------------------------------------------
    //-- Save the current data to the profile file
    //--
    this.save = function () {
      //-- if no .icestudio folder, create a new one
      if (!nodeFs.existsSync(common.ICESTUDIO_DIR)) {
        nodeFs.mkdirSync(common.ICESTUDIO_DIR);
      }
      let _selfcommon = common;
      _selfcommon.profile = this.data;
      //-- Save the data to the profile file
      utils
        .saveFile(common.PROFILE_PATH, this.data)
        .then(function () {
          iceStudio.updateEnv(_selfcommon);
        })
        .catch(function (error) {
          alertify.error(error, 30);
        });
    };
  });
