'use strict';

window._iceutils = window._iceutils || {};

window._iceutils.window = function (ctx) {
  var mod = {};

  mod.newWindow = function (filepath) {
    var url = 'index.html';

    if (filepath) {
      var params = { filepath: filepath };
      var jsonParams = JSON.stringify(params);
      var paramsBase64 = Buffer.from(jsonParams).toString('base64');
      var icestudioArgv = '?icestudio_argv=' + paramsBase64;
      url += icestudioArgv;
    }

    var win = ctx.self.clone(ctx._package.window);
    win['new_instance'] = true;
    win['show'] = true;

    nw.Window.open(url);
  };

  mod.updateWindowTitle = function (title) {
    document.title = title;
  };

  mod.openDevToolsUI = function () {
    nw.Window.get().showDevTools();
  };

  mod.openUrlExternalBrowser = function (url) {
    nw.Shell.openExternal(url);
  };

  return mod;
};
