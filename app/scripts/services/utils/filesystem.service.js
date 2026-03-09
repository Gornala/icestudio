'use strict';

window._iceutils = window._iceutils || {};

window._iceutils.filesystem = function (ctx) {
  function isJSON(content) {
    try {
      return JSON.parse(content);
    } catch (e) {
      return false;
    }
  }

  var mod = {};

  mod.extractZip = function (source, destination, callback) {
    ctx.nodeExtract(source, { dir: destination }, function (error) {
      if (error) {
        callback(true);
      } else {
        callback();
      }
    });
  };

  mod.deleteFolderRecursive = function (path) {
    if (ctx.nodeFs.existsSync(path)) {
      ctx.nodeFs.readdirSync(path).forEach(function (file) {
        var curPath = ctx.nodePath.join(path, file);
        if (ctx.nodeFs.lstatSync(curPath).isDirectory()) {
          mod.deleteFolderRecursive(curPath);
        } else {
          ctx.nodeFs.unlinkSync(curPath);
        }
      });
      ctx.nodeFs.rmdirSync(path);
    }
  };

  mod.readFile = function (filepath) {
    return new Promise(function (resolve, reject) {
      if (ctx.nodeFs.existsSync(ctx.common.PROFILE_PATH)) {
        ctx.nodeFs.readFile(filepath, 'utf8', function (err, content) {
          if (err) {
            reject(err.toString());
          } else {
            var data = false;
            data = isJSON(content);
            if (data) {
              resolve(data);
            } else {
              reject();
            }
          }
        });
      } else {
        resolve({});
      }
    });
  };

  mod.saveFile = async function (filepath, data) {
    return new Promise(async function (resolve, reject) {
      try {
        if (!ctx.nodeFs.existsSync(filepath)) {
          ctx.nodeFs.writeFileSync(filepath, '');
        }
        var release = await ctx.fsLock.lock(filepath, { retries: 10 });

        var content = data;
        if (typeof data !== 'string') {
          content = JSON.stringify(data, null, 2);
        }

        ctx.nodeFs.writeFile(filepath, content, async function (err) {
          if (err) {
            await release();
            reject(err.toString());
          } else {
            await release();
            resolve();
          }
        });
      } catch (error) {
        reject('Error while locking the file: ' + error.toString());
      }
    });
  };

  mod.copySync = function (orig, dest) {
    var ret = true;
    try {
      if (ctx.nodeFs.existsSync(orig)) {
        ctx.nodeFse.copySync(orig, dest);
      } else {
        ret = false;
      }
    } catch (e) {
      alertify.error(
        ctx.gettextCatalog.getString('Error: {{error}}', {
          error: e.toString(),
        }),
        30
      );
      ret = false;
    }
    return ret;
  };

  mod.findIncludedFiles = function (code) {
    var ret = [];
    var patterns = [
      /[\n|\s]\/\/\s*@include\s+([^\s]*\.(v|vh))(\n|\s)/g,
      /[\n|\s][^\/]?\"(.*\.list?)\"/g,
    ];
    for (var p in patterns) {
      var match;
      while ((match = patterns[p].exec(code))) {
        var file = match[1].replace(/ /g, '');
        if (ret.indexOf(file) === -1) {
          ret.push(file);
        }
      }
    }
    return ret;
  };

  return mod;
};
