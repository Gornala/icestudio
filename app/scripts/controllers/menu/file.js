'use strict';

//-- File menu callbacks: open / save / export / quit + version-info window
//-- Loaded as a <script> tag before menu.js; exposes window._icemenu.file

window._icemenu = window._icemenu || {};
window._icemenu.file = {
  init: function ($scope, deps) {
    var path = require('path');
    var $rootScope = deps.$rootScope;
    var $timeout = deps.$timeout;
    var project = deps.project;
    var utils = deps.utils;
    var profile = deps.profile;
    var collections = deps.collections;
    var common = deps.common;
    var graph = deps.graph;
    var tools = deps.tools;
    var gettextCatalog = deps.gettextCatalog;
    var _package = deps._package;
    var win = deps.win;
    var state = deps.state;
    var checkGraph = deps.checkGraph;
    var resetChangedStack = deps.resetChangedStack;
    var resetBuildStack = deps.resetBuildStack;

    //-----------------------------------------------------------
    //-- Version notes info window
    //-----------------------------------------------------------

    $scope.openVersionInfoWindow = function () {
      $('#version-info-tab').removeClass('hidden');

      let versionW = $scope.profile.get('displayVersionInfoWindow');
      let noShowVersion = versionW === 'no';
      $('#version-info-tab--no-display').prop('checked', noShowVersion);
    };

    $scope.closeVersionInfoWindow = function () {
      $('#version-info-tab').addClass('hidden');

      let nodisplay = $('#version-info-tab--no-display').is(':checked');
      let option = nodisplay ? 'no' : 'yes';
      profile.set('displayVersionInfoWindow', option);
      profile.set('lastVersionReview', _package.version);
    };

    //-- Show version notes on startup if needed
    setTimeout(function () {
      let versionW = $scope.profile.get('displayVersionInfoWindow');
      let lastversionReview = $scope.profile.get('lastVersionReview');
      let hasNewVersion =
        lastversionReview === false || lastversionReview < _package.version;

      if (versionW === 'yes' || hasNewVersion) {
        $scope.openVersionInfoWindow();
      }
    }, 500);

    utils.loadProfile(profile, function () {
      $scope.recentProjects = $scope.profile.get('recentProjects');
    });

    //---------------------------------------------------------------------
    //-- File menu callbacks
    //---------------------------------------------------------------------

    //-- FILE/New
    $scope.newProject = function () {
      utils.newWindow('Untitled.ice');
    };

    //-- FILE/Open (dialog)
    $scope.openProjectDialog = function () {
      utils.openDialog('#input-open-project', function (filepath) {
        $scope.openProject(filepath);
      });
    };

    //-- FILE/Open recent

    function addRecentProject(filepath) {
      const recentProjects = profile.get('recentProjects') || [];
      const updatedProjects = recentProjects.filter((p) => p.path !== filepath);
      updatedProjects.unshift({
        path: filepath,
        lastOpened: new Date().toISOString(),
      });
      profile.set('recentProjects', updatedProjects.slice(0, 10));
      $scope.recentProjects = updatedProjects.slice(0, 10);
    }

    $scope.clearRecentProjects = function () {
      alertify.confirm(
        gettextCatalog.getString('Clear recent projects'),
        gettextCatalog.getString(
          'Are you sure you want to clear the recent projects list?'
        ),
        function () {
          profile.set('recentProjects', []);
          $scope.recentProjects = [];
          alertify.success(gettextCatalog.getString('Recent projects cleared'));
        },
        function () {}
      );
    };

    $scope.truncatePath = function (filePath) {
      if (filePath.length > 40) {
        return '...' + filePath.slice(-40);
      }
      return filePath;
    };

    //-- FILE/Open (direct, no dialog)
    $scope.openProject = function (filepath) {
      if (state.zeroProject) {
        updateWorkingdir(filepath);
        project.open(filepath);
      } else if (project.changed || !equalWorkingFilepath(filepath)) {
        utils.newWindow(filepath);
      }

      addRecentProject(filepath);
    };

    $scope.saveProject = function (afterSaveProjectAction) {
      if (
        (typeof common.isEditingSubmodule !== 'undefined' &&
          common.isEditingSubmodule === true) ||
        graph.breadcrumbs.length > 1
      ) {
        alertify.alert(
          gettextCatalog.getString('Save submodule'),
          gettextCatalog.getString(
            'To save your design you need to lock the padlock and \
              go to the top-level design.<br><br>If you want to export \
              this submodule to a file, use the \"Save as\" command.'
          ),
          function () {}
        );

        return;
      }

      var filepath = project.path;
      if (filepath) {
        iceStudio.bus.events.publish('graph:loadJsonInputs');
        iceStudio.bus.events.publish('graph:writeJsonOutputs');
        project.save(filepath, () => {
          reloadCollectionsIfRequired(filepath);
          resetChangedStack();
          if (afterSaveProjectAction) {
            afterSaveProjectAction();
          }
        });
      } else {
        $scope.saveProjectAs();
      }
    };

    // Expose global so popup code-editor windows can trigger a project save
    nw.Window.get().window.icestudioSaveProject = function () {
      $timeout(function () {
        $scope.saveProject();
      }, 0);
    };

    // Expose global for git timeline time-travel: reload project from disk
    nw.Window.get().window.icestudioTimeTravel = function () {
      $timeout(function () {
        var fp = project.path;
        if (fp) {
          project.open(fp);
          if (window.iceTimeline) {
            window.iceTimeline.refresh();
          }
        }
      }, 0);
    };

    // Silent auto-save triggered by block add/delete events
    var _autoSaveTimer = null;
    iceStudio.bus.events.subscribe('git:designChanged', function () {
      if (_autoSaveTimer) {
        clearTimeout(_autoSaveTimer);
      }
      _autoSaveTimer = setTimeout(function () {
        _autoSaveTimer = null;
        if (project.path && typeof project.autoSave === 'function') {
          project.autoSave();
        }
      }, 2000);
    });

    $scope.doSaveProjectAs = function (localCallback) {
      utils.saveDialog('#input-save-project', '.ice', function (filepath) {
        updateWorkingdir(filepath);

        iceStudio.bus.events.publish('graph:loadJsonInputs');
        iceStudio.bus.events.publish('graph:writeJsonOutputs');
        project.save(filepath, function () {
          reloadCollectionsIfRequired(filepath);
          resetChangedStack();
          addRecentProject(filepath);
          if (localCallback) {
            localCallback();
          }
        });
      });
    };

    $scope.saveProjectAs = function (localCallback) {
      if (
        (typeof common.isEditingSubmodule === 'undefined' ||
          (typeof common.isEditingSubmodule !== 'undefined' &&
            common.isEditingSubmodule === false)) &&
        graph.breadcrumbs.length > 1
      ) {
        alertify.alert(
          gettextCatalog.getString('Export submodule'),
          gettextCatalog.getString(
            'You are navigating into the design: If you want to save the entire design, you need to go back \
                     to the top-level. If you want to export this module as new file, unlock the module and use \"Save as\".'
          ),
          function () {}
        );
      } else {
        if (
          typeof common.isEditingSubmodule !== 'undefined' &&
          common.isEditingSubmodule === true
        ) {
          alertify.confirm(
            gettextCatalog.getString('Export submodule'),
            gettextCatalog.getString(
              'You are editing a submodule, so you will save just this submodule (\"Save as\" works like \"Export \
                module\"). Do you want to continue?'
            ),
            function () {
              $scope.doSaveProjectAs(localCallback);
            },
            function () {}
          );
        } else {
          $scope.doSaveProjectAs(localCallback);
        }
      }
    };

    function reloadCollectionsIfRequired(filepath) {
      var selected = common.selectedCollection.name;
      var collectionsChanged = false;
      if (filepath.startsWith(common.INTERNAL_COLLECTIONS_DIR)) {
        collections.loadInternalCollections();
        collectionsChanged = true;
      }
      if (filepath.startsWith(profile.get('externalCollections'))) {
        collections.loadExternalCollections();
        collectionsChanged = true;
      }
      if (
        (selected &&
          filepath.startsWith(
            path.join(common.INTERNAL_COLLECTIONS_DIR, selected)
          )) ||
        filepath.startsWith(
          path.join(profile.get('externalCollections'), selected)
        )
      ) {
        collections.selectCollection(common.selectedCollection.path);
      }
      if (collectionsChanged) {
        iceStudio.updateEnv(common);
      }
    }

    $rootScope.$on('saveProjectAs', function (event, callback) {
      $scope.saveProjectAs(callback);
    });

    // Handle verify request from code-editor popup windows.
    $rootScope.$on('codeblock:requestVerify', function (event, args) {
      var callerWin = args && args.callerWin;
      var startMessage = gettextCatalog.getString('Start verification');
      var endMessage = gettextCatalog.getString('Verification done');

      if (!callerWin) {
        $scope.verifyCode();
        return;
      }

      var sendResult = function (ok, output) {
        if (
          callerWin.window &&
          typeof callerWin.window.icestudioVerifyResult === 'function'
        ) {
          callerWin.window.icestudioVerifyResult(ok, output || '');
        }
      };

      var outputText = null;
      var resolved = false;

      $(document).one('commandOutputChanged', function (evt, output) {
        outputText = output || '';
        setTimeout(function () {
          if (!resolved) {
            resolved = true;
            sendResult(false, outputText);
          }
        }, 600);
      });

      checkGraph()
        .then(function () {
          return tools.verifyCode(startMessage, endMessage);
        })
        .then(function () {
          if (!resolved) {
            resolved = true;
            sendResult(true, outputText || '');
          }
        })
        .catch(function () {
          if (!resolved) {
            resolved = true;
            sendResult(false, 'Graph check failed before verify could run.');
          }
        });
    });

    $scope.addAsBlock = function () {
      var notification = true;
      utils.openDialog('#input-add-as-block', function (filepaths) {
        filepaths = filepaths.split(';');
        for (var i in filepaths) {
          project.addBlockFile(filepaths[i], notification);
        }
      });
    };

    //---------------------------------------------------------------------
    //-- Import Verilog Project
    //-- Opens top.v, parses the full hierarchy, builds icestudio blocks
    //-- for each module and loads the resulting design onto the canvas.
    //---------------------------------------------------------------------

    $scope.importVerilogProject = function () {
      utils.openDialog('#input-import-verilog-project', function (filepath) {
        window._iceVerilogImporter
          .importProject(filepath, {
            nodeFs: require('fs'),
            nodePath: require('path'),
            computeId: function (block) {
              return utils.dependencyID(block);
            },
          })
          .then(function (result) {
            // Show per-module warnings for ports removed before import
            if (result.warnings && result.warnings.length > 0) {
              alertify.warning(
                gettextCatalog.getString(
                  'Removed dangling ports during import:'
                ) +
                  '<br>' +
                  result.warnings.join('<br>'),
                30
              );
            }

            // Replace the dependency table with what was imported
            common.allDependencies = result.dependencies;

            // Load the top-level design (clears canvas, resets command stack)
            var loaded = graph.loadDesign(
              result.design,
              { disabled: false, reset: false },
              function () {
                graph.resetCommandStack();
                alertify.success(
                  gettextCatalog.getString('Verilog project imported')
                );
                utils.endBlockingTask();
              }
            );

            if (!loaded) {
              utils.endBlockingTask();
              alertify.error(
                gettextCatalog.getString('Failed to load the imported design'),
                30
              );
            }
          })
          .catch(function (err) {
            utils.endBlockingTask();
            alertify.error(
              gettextCatalog.getString('Import error: {{err}}', {
                err: String(err),
              }),
              30
            );
          });
      });
    };

    //---------------------------------------------------------------------
    //-- Export functions
    //---------------------------------------------------------------------

    $scope.exportVerilog = function () {
      exportFromCompiler('verilog', 'Verilog', '.v');
    };

    $scope.exportPCF = function () {
      exportFromCompiler('pcf', 'PCF', '.pcf');
    };

    $scope.exportTestbench = function () {
      exportFromCompiler('testbench', 'Testbench', '.v');
    };

    $scope.exportBLIF = function () {
      exportFromBuilder('blif', 'BLIF', '.blif');
    };

    $scope.exportASC = function () {
      exportFromBuilder('asc', 'ASC', '.asc');
    };

    $scope.exportBitstream = function () {
      exportFromBuilder('bin', 'Bitstream', '.bin');
    };

    function exportFromCompiler(id, name, ext) {
      checkGraph()
        .then(function () {
          utils.saveDialog('#input-export-' + id, ext, function (filepath) {
            var data = project.compile(id)[0].content;
            utils
              .saveFile(filepath, data)
              .then(function () {
                alertify.success(
                  gettextCatalog.getString('{{name}} exported', {
                    name: name,
                  })
                );
              })
              .catch(function (error) {
                alertify.error(error, 30);
              });

            updateWorkingdir(filepath);
          });
        })
        .catch(function () {});
    }

    function exportFromBuilder(id, name, ext) {
      checkGraph()
        .then(function () {
          return tools.buildCode();
        })
        .then(function () {
          resetBuildStack();
        })
        .then(function () {
          utils.saveDialog('#input-export-' + id, ext, function (filepath) {
            if (
              utils.copySync(
                path.join(common.BUILD_DIR, 'hardware' + ext),
                filepath
              )
            ) {
              alertify.success(
                gettextCatalog.getString('{{name}} exported', {
                  name: name,
                })
              );
            }
            updateWorkingdir(filepath);
          });
        })
        .catch(function () {});
    }

    //---------------------------------------------------------------------
    //-- Working directory helpers
    //---------------------------------------------------------------------

    function updateWorkingdir(filepath) {
      let dirname = path.dirname(filepath);
      let workingdir = path.join(dirname, path.sep);
      $scope.workingdir = workingdir;
      console.log('Working dir: ' + $scope.workingdir);
    }

    function equalWorkingFilepath(filepath) {
      return $scope.workingdir + project.name + '.ice' === filepath;
    }

    //---------------------------------------------------------------------
    //-- Quit
    //---------------------------------------------------------------------

    $scope.quit = function () {
      exit();
    };

    alertify.dialog('closeDialog', function factory() {
      return {
        main: function (message) {
          this.setContent(message);
        },
        setup: function () {
          return {
            buttons: [
              { text: gettextCatalog.getString('Save'), className: 'ajs-ok' },
              {
                text: gettextCatalog.getString('Don\u2019t Save'),
                className: 'ajs-ok',
              },
              {
                text: gettextCatalog.getString('Cancel'),
                className: 'ajs-cancel',
                key: 27,
              },
            ],
            focus: { element: 3 },
            options: {
              movable: false,
              maximizable: false,
              closable: false,
              resizable: false,
            },
          };
        },
        callback: function (closeEvent) {
          switch (closeEvent.index) {
            case 0:
              $scope.saveProject(() => {
                win.close(true);
              });
              break;
            case 1:
              win.close(true);
              break;
          }
        },
      };
    });

    function exit() {
      if (project.changed) {
        alertify.closeDialog(
          utils.bold(
            gettextCatalog.getString(
              'Do you want to close ' + 'the application?'
            )
          ) +
            '<br>' +
            gettextCatalog.getString(
              'Your changes will be lost if you don\u2019t save them'
            )
        );
      } else {
        _exit();
      }

      function _exit() {
        if ($scope._customThemeWin) {
          try {
            $scope._customThemeWin.close(true);
          } catch (e) {}
          $scope._customThemeWin = null;
        }
        win.close(true);
      }
    }

    //-- Return updateWorkingdir so menu.js can call it for the initial workingdir
    return {
      updateWorkingdir: updateWorkingdir,
    };
  },
};
