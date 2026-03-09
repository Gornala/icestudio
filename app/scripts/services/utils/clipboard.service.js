'use strict';

window._iceutils = window._iceutils || {};

window._iceutils.clipboard = function (ctx) {
  var mod = {};

  mod.copyToClipboard = function (selection, graph) {
    var cells = ctx.self.selectionToCells(selection, graph);
    var clipboard = {
      icestudio: ctx.self.cellsToProject(cells, graph),
    };
    ctx.nodeCP.copy(JSON.stringify(clipboard), function () {
      // Success
    });
  };

  mod.pasteFromClipboard = function (profile, callback) {
    ctx.nodeCP.paste(function (err, text) {
      if (err) {
        if (ctx.common.LINUX) {
          var cmd = '';
          var message = ctx.gettextCatalog.getString('{{app}} is required.', {
            app: '<b>xclip</b>',
          });
          ctx.nodeGetOS(function (e, os) {
            if (!e) {
              if (
                os.dist.indexOf('Debian') !== -1 ||
                os.dist.indexOf('Ubuntu Linux') !== -1 ||
                os.dist.indexOf('Linux Mint') !== -1
              ) {
                cmd = 'sudo apt-get install xclip';
              } else if (os.dist.indexOf('Fedora')) {
                cmd = 'sudo dnf install xclip';
              } else if (
                os.dist.indexOf('RHEL') !== -1 ||
                os.dist.indexOf('RHAS') !== -1 ||
                os.dist.indexOf('Centos') !== -1 ||
                os.dist.indexOf('Red Hat Linux') !== -1
              ) {
                cmd = 'sudo yum install xclip';
              } else if (os.dist.indexOf('Arch Linux') !== -1) {
                cmd = 'sudo pacman install xclip';
              }
              if (cmd) {
                message +=
                  ' ' +
                  ctx.gettextCatalog.getString('Please run: {{cmd}}', {
                    cmd: '<br><b><code>' + cmd + '</code></b>',
                  });
              }
            }
            alertify.warning(message, 30);
          });
        }
      } else {
        var clipboard = JSON.parse(text);
        if (callback && clipboard && clipboard.icestudio) {
          var block = clipboard.icestudio;
          if (block.version === ctx.common.VERSION) {
            ctx.self
              .approveProjectBlock(profile, block)
              .then(function (result) {
                if (result === 'cancel') {
                  return;
                }
                callback(block);
              });
          } else {
            alertify.error(
              ctx.gettextCatalog.getString(
                'Cannot paste from a different project format ({{version}})',
                { version: block.version }
              ),
              5
            );
          }
        }
      }
    });
  };

  return mod;
};
