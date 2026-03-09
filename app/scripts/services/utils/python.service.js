'use strict';

window._iceutils = window._iceutils || {};

window._iceutils.python = function (ctx) {
  var _pythonExecutableCached = null;
  var _pythonPipExecutableCached = null;

  function isPython3(executable) {
    executable += ' -V';
    try {
      var result = ctx.nodeChildProcess.execSync(executable);
      if (result !== false && result !== null) {
        var pythonVersion = /Python 3\.(\d+)\.(\d+)/g.exec(result.toString());
        return (
          pythonVersion !== null &&
          pythonVersion.length === 3 &&
          parseInt(pythonVersion[1]) >= 7
        );
      }
    } catch (e) {}
    return false;
  }

  function getExecutablePath(executable) {
    executable = executable.split(' ')[0];
    return ctx.shelljs.which(executable);
  }

  var mod = {};

  mod.getPythonPipExecutable = function () {
    if (!_pythonExecutableCached) {
      mod.getPythonExecutable();
    }
    if (!_pythonPipExecutableCached) {
      _pythonPipExecutableCached = ctx.common.ENV_PIP;
    }
    return _pythonPipExecutableCached;
  };

  mod.getPythonExecutable = function () {
    if (!_pythonExecutableCached) {
      var possibleExecutables = [];
      if (
        typeof ctx.common.PYTHON_ENV !== 'undefined' &&
        ctx.common.PYTHON_ENV.length > 0
      ) {
        possibleExecutables.push(ctx.common.PYTHON_ENV);
      } else if (ctx.common.WIN32) {
        possibleExecutables.push('py.exe -3');
        possibleExecutables.push('python.exe');
      } else {
        possibleExecutables.push('python3');
        possibleExecutables.push('python');
      }
      for (var i = 0; i < possibleExecutables.length; i++) {
        var executable = possibleExecutables[i];
        iceConsole.log('Trying executable: ' + executable);
        if (isPython3(executable)) {
          _pythonExecutableCached = executable;
          var pythonExecutablePath = getExecutablePath(executable);
          if (pythonExecutablePath) {
            iceConsole.log(
              'Using Python 3 executable: ' + pythonExecutablePath
            );
          } else {
            iceConsole.log('Using Python 3 executable: ' + executable);
          }
          break;
        }
      }
    }
    return _pythonExecutableCached;
  };

  mod.printApioVersion = function (version) {
    var msg = '';
    switch (version) {
      case ctx.common.APIO_VERSION_LATEST_STABLE:
        msg = 'Apio LATEST STABLE version';
        break;
      case ctx.common.APIO_VERSION_STABLE:
        msg = 'Apio STABLE version';
        break;
      case ctx.common.APIO_VERSION_DEV:
        msg = 'Apio DEVELOPMENT VERSION';
        break;
      default:
        msg = 'UNKNOWN Apio Version (ERROR)';
        break;
    }
    return msg;
  };

  mod.createVirtualenv = function (callback) {
    if (!ctx.nodeFs.existsSync(ctx.common.ICESTUDIO_DIR)) {
      ctx.nodeFs.mkdirSync(ctx.common.ICESTUDIO_DIR);
    }
    if (!ctx.nodeFs.existsSync(ctx.common.ENV_DIR)) {
      var command = [
        mod.getPythonExecutable(),
        '-m venv',
        ctx.self.coverPath(ctx.common.ENV_DIR),
      ];
      if (ctx.common.WIN32) {
        // --always-copy (disabled)
      }
      ctx.self.executeCommand(command, null, true, callback);
    } else {
      callback();
    }
  };

  mod.isOnline = function (callback, error) {
    if (navigator.onLine) {
      callback();
    } else {
      error();
      callback(true);
    }
  };

  mod.installOnlineApio = function (callback) {
    var pipExec = mod.getPythonPipExecutable();
    var executable = ctx.self.coverPath(pipExec);
    var params = mod.getApioParameters();
    ctx.self.executeCommand([executable, params], null, true, callback);
  };

  mod.getApioParameters = function () {
    var extraPackages = ctx._package.apio.extras || [];
    var extraPackagesString = '';
    var versionString = '';

    if (ctx.common.APIO_VERSION === ctx.common.APIO_VERSION_STABLE) {
      versionString = '==' + ctx._package.apio.min;
      extraPackagesString = '[' + extraPackages.toString() + ']';
    }

    var apio =
      ctx.common.APIO_VERSION === ctx.common.APIO_VERSION_DEV
        ? ctx.common.APIO_PIP_VCS
        : 'apio';

    return 'install -U ' + apio + extraPackagesString + versionString;
  };

  mod.apioInstall = function (pkg, callback) {
    iceConsole.log(
      'APIO VERSION ' +
        ctx.common.APIO_VERSION +
        ' / ' +
        iceStudio.toolchain.apio
    );

    if (
      iceStudio.toolchain.apio >= '0.9.6' ||
      ctx.common.APIO_VERSION === ctx.common.APIO_VERSION_DEV
    ) {
      var args = 'install';
      var edge = 'packages';
      iceConsole.log(
        'OSS-CAD-SUITE? ' +
          ctx.common.APIO_CMD +
          ' ' +
          edge +
          ' ' +
          args +
          ' ' +
          pkg
      );
      ctx.self.executeCommand(
        [ctx.common.APIO_CMD, edge, args, pkg],
        null,
        true,
        callback
      );
    } else {
      iceConsole.log('--->OLD APIO');
      ctx.self.executeCommand(
        [ctx.common.APIO_CMD, 'install', pkg],
        null,
        true,
        callback
      );
    }
  };

  mod.toolchainDisabled = false;

  mod.getApioExecutable = function () {
    var candidateApio = process.env.ICESTUDIO_APIO
      ? process.env.ICESTUDIO_APIO
      : ctx._package.apio.external;

    if (ctx.nodeFs.existsSync(candidateApio)) {
      if (!mod.toolchainDisabled) {
        alertify.message(
          ctx.gettextCatalog.getString('Using external Apio: {{name}}', {
            name: candidateApio,
          }),
          5
        );
      }
      mod.toolchainDisabled = true;
      return ctx.self.coverPath(candidateApio);
    }

    mod.toolchainDisabled = false;
    return ctx.common.APIO_CMD;
  };

  mod.removeToolchain = function () {
    ctx.self.deleteFolderRecursive(ctx.common.ENV_DIR);
    ctx.self.deleteFolderRecursive(ctx.common.APIO_HOME_DIR);
    ctx.self.deleteFolderRecursive(ctx.common.CACHE_DIR);
  };

  mod.removeCollections = function () {
    ctx.self.deleteFolderRecursive(ctx.common.INTERNAL_COLLECTIONS_DIR);
  };

  return mod;
};
