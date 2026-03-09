/**
 * toolchain.js - Toolchain install/update/check/remove
 * Functions: checkToolchain, installToolchain, installToolchainDev,
 *            updateToolchain, removeToolchain, enableDrivers, disableDrivers
 */
'use strict';

window._icetools = window._icetools || {};

window._icetools.toolchain = function (ctx) {
  function checkToolchainInstalled() {
    return new Promise(function (resolve, reject) {
      if (ctx.toolchain.installed) {
        resolve();
      } else {
        ctx.toolchainNotInstalledAlert(
          ctx.gettextCatalog.getString('Toolchain not installed')
        );
        reject();
      }
    });
  }

  function checkToolchain(callback, notifyerror) {
    if (typeof notifyerror === 'undefined') {
      notifyerror = true;
    }
    ctx.utils.executeCommand(
      [ctx.common.APIO_CMD, '--version'],
      function (error, output) {
        if (error) {
          ctx.toolchain.apio = '';
          ctx.toolchain.installed = false;
          ctx.toolchainNotInstalledAlert(
            ctx.gettextCatalog.getString('Toolchain not installed')
          );
          if (callback) {
            callback();
          }
        } else {
          var msg = '' + output;
          ctx.toolchain.apio = msg.match(/apio,\sversion\s(.+)/)[1];
          iceStudio.toolchain.apio = ctx.toolchain.apio;
          ctx.toolchain.installed =
            ctx.toolchain.apio >= ctx._package.apio.min &&
            ctx.toolchain.apio < ctx._package.apio.max;
          iceStudio.toolchain.installed = ctx.toolchain.installed;
          if (ctx.toolchain.installed) {
            if (callback) {
              callback();
            }
          } else {
            iceConsole.log('Toolchain version does not match');
            ctx.toolchainNotInstalledAlert(
              ctx.gettextCatalog.getString('Toolchain version does not match')
            );
          }
        }
      },
      notifyerror
    );
  }

  function installToolchain() {
    iceConsole.log('------> MENU ENTRY POINT: Install Toolchain');
    if (ctx.resultAlert) {
      ctx.resultAlert.dismiss(false);
    }
    alertify.confirm(
      ctx.gettextCatalog.getString(
        'Install the <b>STABLE Toolchain</b>. This operation requires Internet connection.<br>' +
          '<p><b>NOTE:</b> You need to disconnect your VPN (if any) to allow the toolchain installation</p> ' +
          '<p>Do you want to continue?</p>'
      ),
      function () {
        ctx.utils.removeToolchain();
        installOnlineToolchain(ctx.common.APIO_VERSION_STABLE);
      }
    );
  }

  function installToolchainDev() {
    if (ctx.resultAlert) {
      ctx.resultAlert.dismiss(false);
    }
    alertify.confirm(
      ctx.gettextCatalog.getString(
        'Install the DEVELOPMENT toolchain. It will be downloaded. This operation requires Internet connection. Do you want to continue?'
      ),
      function () {
        installOnlineToolchain(ctx.common.APIO_VERSION_DEV);
      }
    );
  }

  function updateToolchain() {
    iceConsole.log('------------------------------------------');
    iceConsole.log('------> MENU ENTRY POINT: Update Toolchain');
    iceConsole.log('------------------------------------------');
    if (ctx.resultAlert) {
      ctx.resultAlert.dismiss(false);
    }
    alertify.confirm(
      ctx.gettextCatalog.getString(
        'Install the LATEST STABLE toolchain. It will be downloaded. This operation requires Internet connection. Do you want to continue?'
      ),
      function () {
        installOnlineToolchain(ctx.common.APIO_VERSION_LATEST_STABLE);
      }
    );
  }

  function removeToolchain() {
    if (ctx.resultAlert) {
      ctx.resultAlert.dismiss(false);
    }
    alertify.confirm(
      ctx.gettextCatalog.getString(
        'The toolchain will be removed. Do you want to continue?'
      ),
      function () {
        ctx.installationStatus();
        setTimeout(function () {
          ctx.utils.removeToolchain();
          ctx.toolchain.apio = '';
          ctx.toolchain.installed = false;
          alertify.success(
            ctx.gettextCatalog.getString('Toolchain removed'),
            2,
            function () {
              ctx.restoreStatus();
              iceConsole.log('===> Toolchains removed');
            }
          );
        }, 100);
      }
    );
  }

  function enableDrivers() {
    checkToolchain(function () {
      if (ctx.toolchain.installed) {
        ctx.drivers.enable();
      }
    });
  }

  function disableDrivers() {
    checkToolchain(function () {
      if (ctx.toolchain.installed) {
        ctx.drivers.disable();
      }
    });
  }

  function installOnlineToolchain(version) {
    ctx.installationStatus();
    var content = [
      '<div>',
      '  <p id="progress-message">' +
        ctx.gettextCatalog.getString('Installing {{version}}', {
          version: ctx.utils.printApioVersion(version),
        }) +
        '  </p>',
      '  <br>',
      '  <div class="progress">',
      '    <div id="progress-bar" class="progress-bar progress-bar-info progress-bar-striped active" role="progressbar"',
      '      aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style="width:0%">',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('\n');

    ctx.toolchainAlert = alertify.alert(content, function () {
      setTimeout(function () {
        ctx.initProgress();
        $(ctx.toolchainAlert.__internal.buttons[0].element).removeClass(
          'hidden'
        );
      }, 200);
    });

    $(ctx.toolchainAlert.__internal.buttons[0].element).addClass('hidden');

    ctx.toolchain.installed = false;
    ctx.common.APIO_VERSION = version;

    async.series([
      checkInternetConnection,
      ensurePythonIsAvailable,
      createVirtualenv,
      installOnlineApio,
      repairPermissions,
      apioInstallOssCadSuite,
      repairPermissions,
      apioInstallDrivers,
      repairPermissions,
      installationCompleted,
    ]);
  }

  function checkInternetConnection(callback) {
    iceConsole.log('**** STEP: Check internet connection');
    ctx.updateProgress(
      ctx.gettextCatalog.getString('Check Internet connection...'),
      0
    );
    ctx.utils.isOnline(callback, function () {
      ctx.closeToolchainAlert();
      ctx.restoreStatus();
      ctx.resultAlert = alertify.error(
        ctx.gettextCatalog.getString('Internet connection required'),
        30
      );
      callback(true);
    });
  }

  function ensurePythonIsAvailable(callback) {
    iceConsole.log('**** STEP: Check Python');
    ctx.updateProgress(ctx.gettextCatalog.getString('Check Python...'), 0);
    if (ctx.utils.getPythonExecutable()) {
      callback();
    } else {
      ctx.closeToolchainAlert();
      ctx.restoreStatus();
      ctx.resultAlert = alertify.error(
        ctx.gettextCatalog.getString('At least Python 3.7 is required'),
        30
      );
      callback(true);
    }
  }

  function createVirtualenv(callback) {
    iceConsole.log('**** STEP: Create virtualenv');
    ctx.updateProgress(
      ctx.gettextCatalog.getString('Create virtualenv...'),
      20
    );
    ctx.utils.createVirtualenv(callback);
  }

  function installOnlineApio(callback) {
    iceConsole.log('**** STEP: Install APIO');
    var apio = ctx.utils.getApioParameters();
    ctx.updateProgress('pip ' + apio, 40);
    ctx.utils.installOnlineApio(function () {
      ctx.boards.patchApioResources();
      callback();
    });
  }

  function repairPermissions(callback) {
    iceConsole.log('**** STEP: Repair OS Permissions');
    ctx.utils.repairPermissions(callback);
  }

  function apioInstallOssCadSuite(callback) {
    iceConsole.log('**** STEP: APIO install oss-cad-suite');
    var pkgName = 'oss-cad-suite';
    if (ctx.common.APIO_VERSION === ctx.common.APIO_VERSION_STABLE) {
      pkgName += '@' + ctx.common.APIO_PKG_OSS_CAD_SUITE_VERSION;
    }
    ctx.updateProgress(
      ctx.gettextCatalog.getString('Apio install {{name}}', { name: pkgName }),
      60
    );
    ctx.utils.apioInstall(pkgName, callback);
  }

  function apioInstallDrivers(callback) {
    if (ctx.common.WIN32) {
      iceConsole.log('**** STEP: APIO install drivers');
      ctx.updateProgress(
        ctx.gettextCatalog.getString('Apio install drivers'),
        80
      );
      ctx.utils.apioInstall('drivers', callback);
    } else {
      callback();
    }
  }

  function installationCompleted(callback) {
    iceConsole.log('**** FINAL STEP: Checking the installed APIO');
    var storage = new IceHD();
    storage.mkDir(ctx.common.CACHE_DIR);
    storage.mkDir(ctx.common.IMAGE_CACHE_DIR);
    checkToolchain(function () {
      if (ctx.toolchain.installed) {
        ctx.closeToolchainAlert();
        ctx.updateProgress(
          ctx.gettextCatalog.getString('Installation completed'),
          100
        );
        iceConsole.log(
          '****************** INSTALLATION COMPLETED! **************'
        );
        iceConsole.log('\n\n');
        alertify.success(ctx.gettextCatalog.getString('Toolchain installed'));
        ctx.setupDriversAlert();
      }
      ctx.restoreStatus();
      callback();
    });
  }

  return {
    checkToolchain: checkToolchain,
    checkToolchainInstalled: checkToolchainInstalled,
    installToolchain: installToolchain,
    installToolchainDev: installToolchainDev,
    updateToolchain: updateToolchain,
    removeToolchain: removeToolchain,
    enableDrivers: enableDrivers,
    disableDrivers: disableDrivers,
  };
};
