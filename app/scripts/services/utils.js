/* global _iceutils */
'use strict';

angular
  .module('icestudio')
  .service(
    'utils',
    function (
      $rootScope,
      gettextCatalog,
      common,
      blocks,
      _package,
      nodeFs,
      nodeFse,
      nodePath,
      nodeChildProcess,
      nodeExtract,
      nodeSha1,
      nodeCP,
      nodeGetOS,
      nodeLangInfo,
      SVGO,
      fastCopy,
      shelljs,
      sparkMD5,
      fsLock
    ) {
      var ctx = {
        $rootScope: $rootScope,
        gettextCatalog: gettextCatalog,
        common: common,
        blocks: blocks,
        _package: _package,
        nodeFs: nodeFs,
        nodeFse: nodeFse,
        nodePath: nodePath,
        nodeChildProcess: nodeChildProcess,
        nodeExtract: nodeExtract,
        nodeSha1: nodeSha1,
        nodeCP: nodeCP,
        nodeGetOS: nodeGetOS,
        nodeLangInfo: nodeLangInfo,
        SVGO: SVGO,
        fastCopy: fastCopy,
        shelljs: shelljs,
        sparkMD5: sparkMD5,
        fsLock: fsLock,
      };

      var python = _iceutils.python(ctx);
      var command = _iceutils.command(ctx);
      var filesystem = _iceutils.filesystem(ctx);
      var path = _iceutils.path(ctx);
      var project = _iceutils.project(ctx);
      var graph = _iceutils.graph(ctx);
      var clipboard = _iceutils.clipboard(ctx);
      var parsing = _iceutils.parsing(ctx);
      var locale = _iceutils.locale(ctx);
      var dialog = _iceutils.dialog(ctx);
      var win = _iceutils.window(ctx);
      var misc = _iceutils.misc(ctx);

      var modules = [
        python,
        command,
        filesystem,
        path,
        project,
        graph,
        clipboard,
        parsing,
        locale,
        dialog,
        win,
        misc,
      ];
      for (var m = 0; m < modules.length; m++) {
        angular.extend(this, modules[m]);
      }

      // Wire ctx.self so cross-module calls resolve to the full service
      ctx.self = this;
    }
  );
