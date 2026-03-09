/**
 * collections.js - Add, install and remove collections (zip packages)
 * Functions: addCollections, removeCollection, removeAllCollections
 */
'use strict';

window._icetools = window._icetools || {};

window._icetools.collections = function (ctx) {
  function safeExtract(entry, dest, zip) {
    try {
      var newPath = ctx.nodePath.join(
        ctx.common.INTERNAL_COLLECTIONS_DIR,
        dest
      );
      zip.extractEntryTo(
        entry,
        ctx.utils.dirname(newPath),
        /*maintainEntryPath*/ false
      );
    } catch (e) {}
  }

  function addCollectionItem(key, ext, _collections, zipEntry) {
    var data = zipEntry.entryName.match(
      RegExp('^([^/]+)/' + key + '/.*.' + ext + '$')
    );
    if (data) {
      _collections[data[1]][key].push(zipEntry.entryName);
    }
  }

  function installCollection(collection, zip) {
    var i,
      dest = '';
    var pattern = RegExp('^' + collection.origName);
    for (i in collection.blocks) {
      dest = collection.blocks[i].replace(pattern, collection.name);
      safeExtract(collection.blocks[i], dest, zip);
    }
    for (i in collection.examples) {
      dest = collection.examples[i].replace(pattern, collection.name);
      safeExtract(collection.examples[i], dest, zip);
    }
    for (i in collection.locale) {
      dest = collection.locale[i].replace(pattern, collection.name);
      safeExtract(collection.locale[i], dest, zip);
      // Generate locale JSON files
      var compiler = new ctx.nodeGettext.Compiler({ format: 'json' });
      var sourcePath = ctx.nodePath.join(
        ctx.common.INTERNAL_COLLECTIONS_DIR,
        dest
      );
      var targetPath = ctx.nodePath.join(
        ctx.common.INTERNAL_COLLECTIONS_DIR,
        dest.replace(/\.po$/, '.json')
      );
      var content = ctx.nodeFs.readFileSync(sourcePath).toString();
      var json = compiler.convertPo([content]);
      ctx.nodeFs.writeFileSync(targetPath, json);
      // Add strings to gettext
      ctx.gettextCatalog.loadRemote('file://' + targetPath);
    }
    if (collection.package) {
      dest = collection.package.replace(pattern, collection.name);
      safeExtract(collection.package, dest, zip);
    }
    if (collection.readme) {
      dest = collection.readme.replace(pattern, collection.name);
      safeExtract(collection.readme, dest, zip);
    }
  }

  function getCollections(zipData) {
    var data = '';
    var _collections = {};
    var zipEntries = zipData.getEntries();
    zipEntries.forEach(function (zipEntry) {
      data = zipEntry.entryName.match(/^([^\/]+)\/$/);
      if (data) {
        _collections[data[1]] = {
          origName: data[1],
          blocks: [],
          examples: [],
          locale: [],
          package: '',
        };
      }
      addCollectionItem('blocks', 'ice', _collections, zipEntry);
      addCollectionItem('blocks', 'v', _collections, zipEntry);
      addCollectionItem('blocks', 'vh', _collections, zipEntry);
      addCollectionItem('blocks', 'list', _collections, zipEntry);
      addCollectionItem('examples', 'ice', _collections, zipEntry);
      addCollectionItem('examples', 'v', _collections, zipEntry);
      addCollectionItem('examples', 'vh', _collections, zipEntry);
      addCollectionItem('examples', 'list', _collections, zipEntry);
      addCollectionItem('locale', 'po', _collections, zipEntry);
      data = zipEntry.entryName.match(/^([^\/]+)\/package\.json$/);
      if (data) {
        _collections[data[1]].package = zipEntry.entryName;
      }
      data = zipEntry.entryName.match(/^([^\/]+)\/README\.md$/);
      if (data) {
        _collections[data[1]].readme = zipEntry.entryName;
      }
    });
    return _collections;
  }

  function addCollections(filepaths) {
    async.eachSeries(filepaths, function (filepath, nextzip) {
      var zipData = ctx.nodeAdmZip(filepath);
      var _collections = getCollections(zipData);
      async.eachSeries(
        _collections,
        function (collection, next) {
          setTimeout(function () {
            if (
              collection.package &&
              (collection.blocks || collection.examples)
            ) {
              alertify.prompt(
                ctx.gettextCatalog.getString('Edit the collection name'),
                collection.origName,
                function (evt, name) {
                  if (!name) {
                    return false;
                  }
                  collection.name = name;
                  var destPath = ctx.nodePath.join(
                    ctx.common.INTERNAL_COLLECTIONS_DIR,
                    name
                  );
                  console.log('EE:', destPath);
                  if (ctx.nodeFs.existsSync(destPath)) {
                    alertify.confirm(
                      ctx.gettextCatalog.getString(
                        'The collection {{name}} already exists.',
                        { name: ctx.utils.bold(name) }
                      ) +
                        '<br>' +
                        ctx.gettextCatalog.getString(
                          'Do you want to replace it?'
                        ),
                      function () {
                        ctx.utils.deleteFolderRecursive(destPath);
                        installCollection(collection, zipData);
                        alertify.success(
                          ctx.gettextCatalog.getString(
                            'Collection {{name}} replaced',
                            { name: ctx.utils.bold(name) }
                          )
                        );
                        console.log('NEXT COLLECTION');
                        next(name);
                      },
                      function () {
                        alertify.warning(
                          ctx.gettextCatalog.getString(
                            'Collection {{name}} not replaced',
                            { name: ctx.utils.bold(name) }
                          )
                        );
                        next(name);
                      }
                    );
                  } else {
                    installCollection(collection, zipData);
                    alertify.success(
                      ctx.gettextCatalog.getString(
                        'Collection {{name}} added',
                        { name: ctx.utils.bold(name) }
                      )
                    );
                    next(name);
                  }
                }
              );
            } else {
              alertify.warning(
                ctx.gettextCatalog.getString('Invalid collection {{name}}', {
                  name: ctx.utils.bold(collection.name),
                })
              );
            }
          }, 0);
        },
        function (name) {
          ctx.collectionsService.loadInternalCollections();
          if (ctx.common.selectedCollection.name === name) {
            ctx.collectionsService.selectCollection(name);
          }
          iceStudio.updateEnv(ctx.common);
          ctx.utils.rootScopeSafeApply();
          nextzip();
        }
      );
    });
  }

  function removeCollection(collection) {
    ctx.utils.deleteFolderRecursive(collection.path);
    ctx.collectionsService.loadInternalCollections();
    iceStudio.updateEnv(ctx.common);
    alertify.success(
      ctx.gettextCatalog.getString('Collection {{name}} removed', {
        name: ctx.utils.bold(collection.name),
      })
    );
  }

  function removeAllCollections() {
    ctx.utils.removeCollections();
    ctx.collectionsService.loadInternalCollections();
    iceStudio.updateEnv(ctx.common);
    alertify.success(ctx.gettextCatalog.getString('All collections removed'));
  }

  return {
    addCollections: addCollections,
    removeCollection: removeCollection,
    removeAllCollections: removeAllCollections,
  };
};
