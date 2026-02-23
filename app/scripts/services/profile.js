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
            let cssFile =
              '<link id="uiTheme" rel="stylesheet" href="resources/uiThemes/dark/dark.css">';
            let pHead = document.getElementsByTagName('head')[0];
            pHead.innerHTML = pHead.innerHTML + cssFile;
          }
          //-- Light Theme: same as the original!
          if (self.data.uiTheme === 'light') {
            let cssFile =
              '<link id="uiTheme" rel="stylesheet" href="resources/uiThemes/light/light.css">';
            let pHead = document.getElementsByTagName('head')[0];
            pHead.innerHTML = pHead.innerHTML + cssFile;
          }
          //-- Custom Theme: use light.css as base, then overlay custom colors.
          if (self.data.uiTheme === 'custom') {
            let cssFile =
              '<link id="uiTheme" rel="stylesheet" href="resources/uiThemes/light/light.css">';
            let pHead = document.getElementsByTagName('head')[0];
            pHead.innerHTML = pHead.innerHTML + cssFile;
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
