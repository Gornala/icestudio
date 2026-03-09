'use strict';

window._iceutils = window._iceutils || {};

window._iceutils.path = function (ctx) {
  function coverPath(filepath) {
    return '"' + filepath + '"';
  }

  function basename(filepath) {
    var b = ctx.nodePath.basename(filepath);
    return b.substr(0, b.lastIndexOf('.'));
  }

  var mod = {};

  mod.sep = ctx.nodePath.sep;

  mod.basename = basename;

  mod.dirname = function (filepath) {
    return ctx.nodePath.dirname(filepath);
  };

  mod.filepath2buildpath = function (filepath) {
    var b = ctx.nodePath.basename(filepath);
    var localdir = filepath.substr(0, filepath.lastIndexOf(b));
    var dirname = b.substr(0, b.lastIndexOf('.'));
    var path = ctx.nodePath.join(localdir, 'ice-build');
    return ctx.nodePath.join(path, dirname);
  };

  mod.coverPath = coverPath;

  return mod;
};
