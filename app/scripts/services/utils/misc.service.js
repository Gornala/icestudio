'use strict';

window._iceutils = window._iceutils || {};

window._iceutils.misc = function (ctx) {
  var mod = {};

  mod.bold = function (text) {
    return '<b>' + text + '</b>';
  };

  mod.clone = function (data) {
    return ctx.fastCopy(data);
  };

  mod.rootScopeSafeApply = function () {
    if (!ctx.$rootScope.$$phase) {
      ctx.$rootScope.$apply();
    }
  };

  mod.normalizeVerilogName = function (str) {
    str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    str = str.replace(/ñ/g, 'n').replace(/Ñ/g, 'N');
    str = str.replace(/[\s-]/g, '_');
    str = str.replace(/[^a-zA-Z0-9_]/g, '');
    if (/^\d/.test(str)) {
      str = '_' + str;
    }
    return str;
  };

  mod.digestId = function (id) {
    if (id.indexOf('-') !== -1) {
      id = ctx.nodeSha1(id).toString();
    }
    return 'v' + id.substring(0, 6);
  };

  mod.isFunction = function (functionToCheck) {
    return (
      functionToCheck &&
      {}.toString.call(functionToCheck) === '[object Function]'
    );
  };

  mod.hasLeftButton = function (evt) {
    return evt.which === 1;
  };

  mod.hasMiddleButton = function (evt) {
    return evt.which === 2;
  };

  mod.hasRightButton = function (evt) {
    return evt.which === 3;
  };

  mod.hasButtonPressed = function (evt) {
    return evt.which !== 0;
  };

  mod.hasShift = function (evt) {
    return evt.shiftKey;
  };

  mod.hasCtrl = function (evt) {
    return evt.ctrlKey;
  };

  return mod;
};
