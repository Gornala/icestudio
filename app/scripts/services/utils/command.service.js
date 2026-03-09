'use strict';

window._iceutils = window._iceutils || {};

window._iceutils.command = function (ctx) {
  function disableEvent(event) {
    event.stopPropagation();
    event.preventDefault();
  }

  var mod = {};

  mod.enableClickEvents = function () {
    document.removeEventListener('click', disableEvent, true);
  };

  mod.disableClickEvents = function () {
    document.addEventListener('click', disableEvent, true);
  };

  mod.enableKeyEvents = function () {
    document.removeEventListener('keyup', disableEvent, true);
    document.removeEventListener('keydown', disableEvent, true);
    document.removeEventListener('keypress', disableEvent, true);
  };

  mod.disableKeyEvents = function () {
    document.addEventListener('keyup', disableEvent, true);
    document.addEventListener('keydown', disableEvent, true);
    document.addEventListener('keypress', disableEvent, true);
  };

  mod.executeCommand = function (
    command,
    callback,
    notifyerror,
    callbackAsync
  ) {
    if (notifyerror === undefined) {
      notifyerror = true;
    }
    var cmd = command.join(' ');
    iceConsole.log('>>>> utils.executeCommand => ' + cmd + '\n');

    var args = [];
    if (command.length > 0) {
      args = command.slice(1);
    }

    var proccess = ctx.nodeChildProcess.spawn(command[0], args, {
      shell: true,
    });

    var output = '';

    proccess.stdout.on('data', function (data) {
      iceConsole.log('>>(OUTPUT): ' + data + '\n');
      ctx.common.commandOutput = command.join(' ') + '\n\n' + data;
      $(document).trigger('commandOutputChanged', [ctx.common.commandOutput]);
      output = data;
    });

    proccess.stderr.on('data', function (data) {
      iceConsole.log('>>(ERROR): ' + data + '\n');
      ctx.common.commandOutput = command.join(' ') + '\n\n' + data;
      $(document).trigger('commandOutputChanged', [ctx.common.commandOutput]);
    });

    proccess.on('exit', function (code) {
      if (code !== 0) {
        mod.enableKeyEvents();
        mod.enableClickEvents();
        iceConsole.log('----!!!! ERROR !!!! -----');
        iceConsole.log('CMD: ' + command);
        if (notifyerror) {
          alertify.error('Error executing command ' + command, 30);
        }
        if (typeof callback !== 'undefined' && callback !== null) {
          callback(true, output);
        }
        if (typeof callbackAsync !== 'undefined') {
          callbackAsync();
        }
      } else {
        if (typeof callback !== 'undefined' && callback !== null) {
          callback(false, output);
        }
        if (typeof callbackAsync !== 'undefined') {
          callbackAsync();
        }
      }
    });
  };

  mod.repairPermissions = function (callback) {
    if (iceStudio.env.DARWIN === true) {
      mod.executeCommand(
        [
          'osascript -e \'do shell script "cd ~/.icestudio;sudo find . -exec xattr -d com.apple.quarantine {} \\\\;" with administrator privileges\'',
        ],
        null,
        true,
        callback
      );
    } else {
      if (typeof callback !== 'undefined' && callback !== null) {
        callback();
      }
    }
  };

  mod.beginBlockingTask = async function () {
    angular.element('#menu').addClass('is-disabled');
    document.getElementById('spin-blocking-task').classList.add('waiting');
    await new Promise(requestAnimationFrame);
  };

  mod.endBlockingTask = function () {
    $('body').trigger('Graph::updateWires');
    $('.code-editor.ace_editor').each(function () {
      var editor = ace.edit(this);
      setTimeout(function () {
        editor.resize();
      }, 300);
    });
    angular.element('#menu').removeClass('is-disabled');
    document.getElementById('spin-blocking-task').classList.remove('waiting');
  };

  return mod;
};
