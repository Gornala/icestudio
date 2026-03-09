/**
 * resources.js - Find and sync external resource files (includes, list files)
 * Functions: syncResources, findIncludedFiles, findInlineFiles
 */
'use strict';

window._icetools = window._icetools || {};

window._icetools.resources = function (ctx) {
  function removeFiles(files) {
    _.each(files, function (file) {
      var filepath = ctx.nodePath.join(ctx.common.BUILD_DIR, file);
      ctx.nodeFse.removeSync(filepath);
    });
  }

  function findFiles(pattern, code) {
    var match;
    var files = [];
    while ((match = pattern.exec(code))) {
      files.push(match[1]);
    }
    return files;
  }

  function findIncludedFiles(code) {
    return findFiles(
      /[\n|\s]\/\/\s*@include\s+([^\s]*\.(v|vh|list))(\n|\s)/g,
      code
    );
  }

  function findInlineFiles(code) {
    return findFiles(/[\n|\s][^\/]?\"(.*\.list?)\"/g, code);
  }

  function syncFiles(files, reject) {
    _.each(files, function (file) {
      var destPath = ctx.nodePath.join(ctx.common.BUILD_DIR, file);
      var origPath = ctx.nodePath.join(
        ctx.utils.dirname(ctx.project.filepath),
        file
      );
      var copySuccess = ctx.utils.copySync(origPath, destPath);
      if (!copySuccess) {
        ctx.resultAlert = alertify.error(
          ctx.gettextCatalog.getString('File {{file}} does not exist', {
            file: file,
          }),
          30
        );
        reject();
      }
    });
  }

  function syncResources(code, internalResources) {
    return new Promise(function (resolve, reject) {
      removeFiles(ctx.resources);
      ctx.resources = [];
      ctx.resources = ctx.resources.concat(findIncludedFiles(code));
      ctx.resources = ctx.resources.concat(findInlineFiles(code));
      ctx.resources = _.uniq(ctx.resources);
      ctx.resources = _.difference(ctx.resources, internalResources);
      syncFiles(ctx.resources, reject);
      resolve();
    });
  }

  return {
    syncResources: syncResources,
    findIncludedFiles: findIncludedFiles,
    findInlineFiles: findInlineFiles,
  };
};
