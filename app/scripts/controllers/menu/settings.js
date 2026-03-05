'use strict';

//-- Settings / Preferences dialogs
//-- Loaded as a <script> tag before menu.js; exposes window._icemenu.settings

window._icemenu = window._icemenu || {};
window._icemenu.settings = {
  init: function ($scope, deps) {
    var fs = require('fs');
    var forms = deps.forms;
    var profile = deps.profile;
    var graph = deps.graph;
    var project = deps.project;
    var common = deps.common;
    var collections = deps.collections;
    var utils = deps.utils;
    var gettextCatalog = deps.gettextCatalog;
    var state = deps.state;

    //---------------------------------------------------------------------
    //-- Display a form for asking the user to introduce the log filename
    //---------------------------------------------------------------------
    $scope.setLoggingFile = function () {
      const lFile = profile.get('loggingFile');

      let form = new forms.FormLogfile(lFile);

      form.display((evt) => {
        form.process(evt);

        if (evt.cancel) {
          return;
        }

        let newLogfile = form.values[0];

        if (newLogfile === lFile) {
          return;
        }

        const hd = new IceHD();
        const separator =
          common.DARWIN === false && common.LINUX === false ? '\\' : '/';

        const dirLFile = newLogfile.substring(
          0,
          newLogfile.lastIndexOf(separator) + 1
        );

        if (newLogfile === '' || hd.isValidPath(dirLFile)) {
          profile.set('loggingFile', newLogfile);
          alertify.success(gettextCatalog.getString('Logging file updated'));
        } else {
          evt.cancel = true;
          state.resultAlert = alertify.error(
            gettextCatalog.getString(
              'Path {{path}} does not exist',
              {
                path: newLogfile,
              },
              5
            )
          );
        }
      });
    };

    //---------------------------------------------------------------------
    //-- Display a form for asking the user to introduce the external plugin path
    //---------------------------------------------------------------------
    $scope.setExternalPlugins = function () {
      const externalPlugins = profile.get('externalPlugins');

      let form = new forms.FormExternalPlugins(externalPlugins);

      form.display((evt) => {
        form.process(evt);

        let newPath = form.values[0];

        if (newPath === externalPlugins) {
          return;
        }

        if (newPath === '' || fs.existsSync(newPath)) {
          profile.set('externalPlugins', newPath);
          alertify.success(
            gettextCatalog.getString('External plugins updated')
          );
        } else {
          evt.cancel = true;
          state.resultAlert = alertify.error(
            gettextCatalog.getString(
              'Path {{path}} does not exist',
              {
                path: newPath,
              },
              5
            )
          );
        }
      });
    };

    //---------------------------------------------------------------------
    //-- Display a form for asking the user to introduce the python path
    //---------------------------------------------------------------------
    $scope.setPythonEnv = function () {
      let pythonEnv = profile.get('pythonEnv');

      let form = new forms.FormPythonEnv(pythonEnv.python, pythonEnv.pip);

      form.display((evt) => {
        form.process(evt);

        let newPythonPath = form.values[0];
        let newPipPath = form.values[1];

        if (
          newPythonPath === pythonEnv.python &&
          newPipPath === pythonEnv.pip
        ) {
          return;
        }

        if (
          (newPythonPath === '' || fs.existsSync(newPythonPath)) &&
          (newPipPath === '' || fs.existsSync(newPipPath))
        ) {
          let newPythonEnv = {
            python: newPythonPath,
            pip: newPipPath,
          };
          profile.set('pythonEnv', newPythonEnv);
          alertify.success(
            gettextCatalog.getString('Python environment updated')
          );
        } else {
          evt.cancel = true;
          state.resultAlert = alertify.error(
            gettextCatalog.getString(
              'Path {{path}} does not exist',
              {
                path: 'of python or pip',
              },
              5
            )
          );
        }
      });
    };

    //---------------------------------------------------------------------
    //-- Display a form for asking the user to introduce the external collections path
    //---------------------------------------------------------------------
    $scope.setExternalCollections = function () {
      let externalCollections = profile.get('externalCollections') || '';

      let form = new forms.FormExternalCollections(externalCollections);

      form.display((evt) => {
        form.process(evt);

        let newExternalCollections = form.values[0];

        if (newExternalCollections === externalCollections) {
          return;
        }

        if (
          newExternalCollections === '' ||
          fs.existsSync(newExternalCollections)
        ) {
          profile.set('externalCollections', newExternalCollections);
          collections.loadExternalCollections();
          collections.selectCollection(); // default
          utils.rootScopeSafeApply();
          alertify.success(
            gettextCatalog.getString('External collections updated')
          );
        } else {
          evt.cancel = true;
          state.resultAlert = alertify.error(
            gettextCatalog.getString(
              'Path {{path}} does not exist',
              {
                path: newExternalCollections,
              },
              5
            )
          );
        }
      });
    };

    //---------------------------------------------------------------------
    //-- Project information
    //---------------------------------------------------------------------

    $(document).on('infoChanged', function (evt, newValues) {
      var values = getProjectInformation();
      if (!_.isEqual(values, newValues)) {
        graph.setInfo(values, newValues, project);
        alertify.message(
          gettextCatalog.getString('Project information updated') +
            '.<br>' +
            gettextCatalog.getString('Click here to view'),
          5
        ).callback = function (isClicked) {
          if (isClicked) {
            $scope.setProjectInformation();
          }
        };
      }
    });

    $scope.setProjectInformation = function () {
      var values = getProjectInformation();
      utils.projectinfoprompt(values, function (evt, newValues) {
        if (!_.isEqual(values, newValues)) {
          if (
            typeof common.submoduleHeap !== 'undefined' &&
            common.submoduleHeap.length > 0
          ) {
            graph.setBlockInfo(values, newValues, common.submoduleId);
          } else {
            graph.setInfo(values, newValues, project);
          }
          alertify.success(
            gettextCatalog.getString('Project information updated')
          );
        }
      });
    };

    function getProjectInformation() {
      var p = false;
      if (
        typeof common.submoduleHeap !== 'undefined' &&
        common.submoduleHeap.length > 0
      ) {
        p = common.allDependencies[common.submoduleId].package;
      } else {
        p = project.get('package');
      }
      return [p.name, p.version, p.description, p.author, p.image];
    }

    //---------------------------------------------------------------------
    //-- Remote hostname
    //---------------------------------------------------------------------

    $scope.setRemoteHostname = function () {
      var current = profile.get('remoteHostname');
      alertify.prompt(
        gettextCatalog.getString('Enter the remote hostname user@host'),
        current ? current : '',
        function (evt, remoteHostname) {
          profile.set('remoteHostname', remoteHostname);
        }
      );
    };

    //---------------------------------------------------------------------
    //-- Board rules + inout ports toggles
    //---------------------------------------------------------------------

    $scope.toggleBoardRules = function () {
      graph.setBoardRules(!profile.get('boardRules'));
      if (profile.get('boardRules')) {
        alertify.success(gettextCatalog.getString('Board rules enabled'));
      } else {
        alertify.success(gettextCatalog.getString('Board rules disabled'));
      }
    };

    $scope.toggleInoutPorts = function () {
      const newState = !profile.get('allowInoutPorts');
      profile.set('allowInoutPorts', newState);
      if (newState) {
        alertify.success(
          gettextCatalog.getString(
            'Tri-state connections (inout ports) enabled'
          )
        );
      } else {
        common.allowProjectInoutPorts = true;
        alertify.success(
          gettextCatalog.getString(
            'Tri-state connections (inout ports) disabled'
          )
        );
      }
    };

    //---------------------------------------------------------------------
    //-- Language
    //---------------------------------------------------------------------

    $(document).on('langChanged', function (evt, lang) {
      $scope.selectLanguage(lang);
    });

    $scope.selectLanguage = function (language) {
      if (profile.get('language') !== language) {
        profile.set('language', graph.selectLanguage(language));
        project.update(
          {
            deps: false,
          },
          function () {
            graph.loadDesign(project.get('design'), {
              disabled: false,
            });
          }
        );
        collections.sort();
      }
    };

    //---------------------------------------------------------------------
    //-- Theme
    //---------------------------------------------------------------------

    $scope.selectTheme = function (theme) {
      if (profile.get('uiTheme') !== theme) {
        const modalWait = new WafleModal();
        modalWait.waitingSeconds(
          3,
          gettextCatalog.getString('UI theme'),
          gettextCatalog.getString('Wait for <b></b> seconds')
        );
        profile.set('uiTheme', theme);
        setTimeout(function () {
          global.uiTheme = theme;
          utils.loadProfile(profile);

          var changeTheme = function (themeName) {
            var editorTheme;
            if (themeName === 'dark') {
              editorTheme = 'monokai';
            } else {
              editorTheme = 'chrome';
            }

            $('.code-editor.ace_editor').each(function () {
              const editor = ace.edit(this);
              editor.setTheme('ace/theme/' + editorTheme);
            });
          };

          changeTheme(theme);
        }, 1000);
      }
    };

    //---------------------------------------------------------------------
    //-- Board reference windows (PCF, Pinout, Datasheet, Board Rules)
    //---------------------------------------------------------------------

    $scope.showPCF = function () {
      nw.Window.open(
        'resources/viewers/plain/pcf.html?board=' + common.selectedBoard.name,
        {
          title: common.selectedBoard.info.label + ' - PCF',
          focus: true,
          resizable: true,
          width: 700,
          height: 700,
          icon: 'resources/images/icestudio-logo.png',
        }
      );
    };

    $scope.showPinout = function () {
      var board = common.selectedBoard;
      var pinoutPath = require('path').join(
        'resources',
        'boards',
        board.name,
        'pinout.svg'
      );
      if (fs.existsSync(pinoutPath)) {
        nw.Window.open(
          'resources/viewers/svg/pinout.html?board=' + board.name,
          {
            title: common.selectedBoard.info.label + ' - Pinout',
            focus: true,
            resizable: true,
            width: 500,
            height: 700,
            icon: 'resources/images/icestudio-logo.png',
          }
        );
      } else {
        alertify.warning(
          gettextCatalog.getString('{{board}} pinout not defined', {
            board: utils.bold(board.info.label),
          }),
          5
        );
      }
    };

    $scope.showDatasheet = function () {
      var board = common.selectedBoard;
      if (board.info.datasheet) {
        nw.Shell.openExternal(board.info.datasheet);
      } else {
        alertify.error(
          gettextCatalog.getString('{{board}} datasheet not defined', {
            board: utils.bold(board.info.label),
          }),
          5
        );
      }
    };

    $scope.showBoardRules = function () {
      var board = common.selectedBoard;
      var rules = JSON.stringify(board.rules);
      if (rules !== '{}') {
        var encRules = encodeURIComponent(rules);
        nw.Window.open('resources/viewers/table/rules.html?rules=' + encRules, {
          title: common.selectedBoard.info.label + ' - Rules',
          focus: true,
          resizable: false,
          width: 500,
          height: 500,
          icon: 'resources/images/icestudio-logo.png',
        });
      } else {
        alertify.error(
          gettextCatalog.getString('{{board}} rules not defined', {
            board: utils.bold(board.info.label),
          }),
          5
        );
      }
    };

    //---------------------------------------------------------------------
    //-- System Info window
    //---------------------------------------------------------------------

    $scope.showSystemInfo = function () {
      iceConsole.log('---------------------');
      iceConsole.log('  VIEW/System Info');
      iceConsole.log('--------------------');
      iceConsole.log('BASE_DIR: ' + common.BASE_DIR + '---');
      iceConsole.log('ICESTUDIO_DIR: ' + common.ICESTUDIO_DIR + '---');
      iceConsole.log('PROFILE_PATH: ' + common.PROFILE_PATH + '---');
      iceConsole.log('APIO_HOME_DIR: ' + common.APIO_HOME_DIR + '---');
      iceConsole.log('ENV_DIR: ' + common.ENV_DIR + '---');
      iceConsole.log('ENV_BIN_DIR: ' + common.ENV_BIN_DIR + '---');
      iceConsole.log('ENV_PIP: ' + common.ENV_PIP + '---');
      iceConsole.log('APIO_CMD: ' + common.APIO_CMD + '---');
      iceConsole.log('APP: ' + common.APP + '---');
      iceConsole.log('APP_DIR: ' + common.APP_DIR + '---');
      iceConsole.log('\n\n');

      var URL =
        `resources/viewers/system/system.html?version=${common.ICESTUDIO_VERSION}` +
        `&base_dir=${encodeURIComponent(common.BASE_DIR)}---` +
        `&icestudio_dir=${encodeURIComponent(common.ICESTUDIO_DIR)}---` +
        `&profile_path=${encodeURIComponent(common.PROFILE_PATH)}---` +
        `&apio_home_dir=${encodeURIComponent(common.APIO_HOME_DIR)}---` +
        `&env_dir=${encodeURIComponent(common.ENV_DIR)}---` +
        `&env_bin_dir=${encodeURIComponent(common.ENV_BIN_DIR)}---` +
        `&env_pip=${encodeURIComponent(common.ENV_PIP)}---` +
        `&apio_cmd=${encodeURIComponent(common.APIO_CMD)}---` +
        `&app=${encodeURIComponent(common.APP)}---` +
        `&app_dir=${encodeURIComponent(common.APP_DIR)}---`;

      nw.Window.open(URL, {
        title: 'System Info',
        focus: true,
        resizable: false,
        width: 700,
        height: 500,
        icon: 'resources/images/icestudio-logo.png',
      });
    };
  },
};
