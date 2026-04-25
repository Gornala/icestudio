/**
 * apio.js - Execute apio/toolchain commands
 * Functions: verifyCode, buildCode, uploadCode (public)
 *            apioRun, toolchainRun, executeLocal, executeRemote (internal)
 */
'use strict';

window._icetools = window._icetools || {};

window._icetools.apio = function (ctx) {
  function restoreTask() {
    setTimeout(function () {
      if (ctx.startAlert) {
        ctx.startAlert.dismiss(false);
      }
      ctx.taskRunning = false;
    }, 1000);
  }

  function apioIntegrityCheck() {
    var test = true;
    var hd = new IceHD();
    console.log('Checks for APIO project integrity');
    if (!ctx.nodeFs.existsSync(ctx.common.BUILD_DIR)) {
      console.log('Build dir not exists', ctx.common.BUILD_DIR);
      ctx.nodeFs.mkdirSync(ctx.common.BUILD_DIR, { recursive: true });
    }
    if (iceStudio.toolchain.apio >= '0.9.6') {
      if (
        !ctx.nodeFs.existsSync(hd.joinPath(ctx.common.BUILD_DIR, 'Apio.ini'))
      ) {
        console.log('Apio.ini not found');
        test = false;
      }
    }
    return test;
  }

  function shellEscape(arrayArgs) {
    return arrayArgs.map(function (c) {
      if (c.indexOf('(') >= 0) {
        c = '"' + c + '"';
      }
      return c;
    });
  }

  function executeRemote(commands, hostname) {
    return new Promise(function (resolve) {
      ctx.startAlert.setContent(
        ctx.gettextCatalog.getString('Synchronize remote files ...')
      );
      ctx.nodeRSync(
        {
          src: ctx.common.BUILD_DIR + '/',
          dest: hostname + ':.build/',
          ssh: true,
          recursive: true,
          delete: true,
          include: ['*.v', '*.pcf', '*.lpf', '*.list'],
          exclude: [
            '.sconsign.dblite',
            '*.out',
            '*.blif',
            '*.asc',
            '*.bin',
            '*.config',
            '*.json',
          ],
        },
        function (error, stdout, stderr) {
          if (!error) {
            ctx.startAlert.setContent(
              ctx.gettextCatalog.getString('Execute remote {{label}} ...', {
                label: '',
              })
            );
            ctx.nodeSSHexec(
              ['apio']
                .concat(commands)
                .concat(['--project-dir', '.build'])
                .join(' '),
              hostname,
              function (err, out, serr) {
                resolve({ error: err, stdout: out, stderr: serr });
              }
            );
          } else {
            resolve({ error: error, stdout: stdout, stderr: stderr });
          }
        }
      );
    });
  }

  var executeLocalSync = async function (commands) {
    try {
      await executeLocal(commands);
    } catch (error) {
      console.log('Execute command fails', commands);
    }
  };

  function executeLocal(commands) {
    return new Promise(function (resolve) {
      if (commands[0] === 'upload') {
        ctx.drivers.preUpload(function () {
          _executeLocal();
        });
      } else {
        _executeLocal();
      }

      function _executeLocal() {
        var apio = ctx.utils.getApioExecutable();
        commands = shellEscape(commands);
        var command = [apio]
          .concat(commands)
          .concat(['-p', ctx.utils.coverPath(ctx.common.BUILD_DIR)])
          .join(' ');
        if (
          typeof ctx.common.DEBUGMODE !== 'undefined' &&
          ctx.common.DEBUGMODE === 1
        ) {
          var fs = require('fs');
          fs.appendFileSync(
            ctx.common.LOGFILE,
            'tools._executeLocal>' + command + '\n'
          );
        }
        ctx.nodeChildProcess.exec(
          command,
          { maxBuffer: 5000 * 1024 },
          function (error, stdout, stderr) {
            if (commands[0] === 'upload') {
              ctx.drivers.postUpload();
            }
            ctx.common.commandOutput = command + '\n\n' + stdout + stderr;
            $(document).trigger('commandOutputChanged', [
              ctx.common.commandOutput,
            ]);
            resolve({ error: error, stdout: stdout, stderr: stderr });
          }
        );
      }
    });
  }

  function toolchainRunResolve(data) {
    ctx.common.commandOutput = data.commandOutput;
    $(document).trigger('commandOutputChanged', [ctx.common.commandOutput]);
    if (data.endMessage) {
      ctx.resultAlert = alertify.success(
        ctx.gettextCatalog.getString(data.endMessage)
      );
    }
    ctx.utils.endBlockingTask();
    restoreTask();
  }

  function toolchainRun(commands, startMessage, endMessage) {
    return new Promise(function (resolve) {
      var sourceCode = '';
      if (!ctx.taskRunning) {
        ctx.taskRunning = true;
        if (ctx.infoAlert) {
          ctx.infoAlert.dismiss(false);
        }
        if (ctx.resultAlert) {
          ctx.resultAlert.dismiss(false);
        }
        ctx.graph
          .resetCodeErrors()
          .then(function () {
            ctx.utils.beginBlockingTask();
            if (startMessage) {
              ctx.startAlert = alertify.message(startMessage, 99999);
            }
            return ctx.generateCode(commands);
          })
          .then(function (output) {
            sourceCode = output.code;
            return ctx.syncResources(output.code, output.internalResources);
          })
          .then(function () {
            var hd = new IceHD();
            var bitstream = hd.joinPath(ctx.common.BUILD_DIR, 'hardware.bin');
            var uploader = hd.joinPath(
              ctx.common.DEFAULT_PLUGIN_DIR,
              'mch2022-tools'
            );
            uploader = hd.joinPath(uploader, 'fpga');
            var python = hd.joinPath(ctx.common.ENV_BIN_DIR, 'python3');
            if (hd.isFile(bitstream)) {
              iceStudio.bus.events.publish('toolchain.upload', {
                cmd: commands,
                msg: { end: endMessage },
                bitstream: bitstream,
                uploader: uploader,
                python: python,
              });
            } else {
              alertify.error(
                ctx.gettextCatalog.getString(
                  'Bitstream not found: Build your project first'
                ),
                30
              );
              ctx.utils.endBlockingTask();
              restoreTask();
            }
          })
          .catch(function (/* e */) {
            ctx.utils.endBlockingTask();
            restoreTask();
          });
      }
      resolve();
    });
  }

  function apioRun(commands, startMessage, endMessage) {
    return new Promise(function (resolve, reject) {
      if (!apioIntegrityCheck()) {
        var board =
          ctx.common.selectedBoard.name === 'MCH2022_badge'
            ? 'iCE40-UP5K'
            : ctx.common.selectedBoard.name;
        executeLocalSync(['create', '--board', board]);
      }

      if (ctx.taskRunning) {
        reject(new Error('Another task is already running'));
        return;
      }
      ctx.taskRunning = true;
      var sourceCode = '';

      if (ctx.infoAlert) {
        ctx.infoAlert.dismiss(false);
      }
      if (ctx.resultAlert) {
        ctx.resultAlert.dismiss(false);
      }

      ctx.graph
        .resetCodeErrors()
        .then(function () {
          return ctx.checkConnections();
        })
        .then(function () {
          return ctx.checkToolchainInstalled();
        })
        .then(function () {
          ctx.utils.beginBlockingTask();
          if (startMessage) {
            ctx.startAlert = alertify.message(startMessage, 99999);
          }
          return ctx.generateCode(commands);
        })
        .then(function (output) {
          sourceCode = output.code;
          return ctx.syncResources(output.code, output.internalResources);
        })
        .then(function () {
          var hostname = ctx.profile.get('remoteHostname');
          var command = commands[0];
          if (command === 'build') {
            if (ctx.profile.get('showFPGAResources')) {
              commands = commands.concat('--verbose-pnr');
            }
          }
          if (hostname) {
            return executeRemote(commands, hostname);
          } else {
            return executeLocal(commands);
          }
        })
        .then(function (result) {
          return ctx.processResult(result, sourceCode);
        })
        .then(function () {
          if (endMessage) {
            ctx.resultAlert = alertify.success(
              ctx.gettextCatalog.getString(endMessage)
            );
          }
          ctx.utils.endBlockingTask();
          restoreTask();
          resolve();
        })
        .catch(function (/* e */) {
          ctx.utils.endBlockingTask();
          restoreTask();
        });
    });
  }

  function verifyCode(startMessage, endMessage) {
    console.log('APIO VERIFY', ctx.toolchain.apio);
    var board =
      ctx.common.selectedBoard.name === 'MCH2022_badge'
        ? 'iCE40-UP5K'
        : ctx.common.selectedBoard.name;
    var apioParams = [];
    if (iceStudio.toolchain.apio >= '0.9.6') {
      apioParams = ['lint'];
    } else {
      apioParams = ['verify', '--board', board];
    }
    return apioRun(apioParams, startMessage, endMessage);
  }

  function buildCode(startMessage, endMessage) {
    var board =
      ctx.common.selectedBoard.name === 'MCH2022_badge'
        ? 'iCE40-UP5K'
        : ctx.common.selectedBoard.name;
    var apioParams = [];
    if (iceStudio.toolchain.apio >= '0.9.6') {
      apioParams = ['build'];
    } else if (ctx.toolchain.apio >= '0.9.0') {
      apioParams = ['build', '--board', board, '--top-module', 'main'];
    } else {
      apioParams = ['build', '--board', board];
    }
    return apioRun(apioParams, startMessage, endMessage);
  }

  function uploadCode(startMessage, endMessage) {
    if (ctx.common.selectedBoard.name === 'MCH2022_badge') {
      return toolchainRun(['upload'], startMessage, endMessage);
    }
    var apioParams = [];
    if (iceStudio.toolchain.apio >= '0.9.6') {
      apioParams = ['upload'];
    } else if (ctx.toolchain.apio >= '0.9.0') {
      apioParams = [
        'upload',
        '--board',
        ctx.common.selectedBoard.name,
        '--top-module',
        'main',
      ];
    } else {
      apioParams = ['upload', '--board', ctx.common.selectedBoard.name];
    }
    return apioRun(apioParams, startMessage, endMessage);
  }

  return {
    verifyCode: verifyCode,
    buildCode: buildCode,
    uploadCode: uploadCode,
    toolchainRunResolve: toolchainRunResolve,
  };
};
