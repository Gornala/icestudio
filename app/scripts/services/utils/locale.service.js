'use strict';

window._iceutils = window._iceutils || {};

window._iceutils.locale = function (ctx) {
  function splitLocale(locale) {
    var ret = {};
    var list = locale.split('_');
    if (list.length > 0) {
      ret.lang = list[0];
    }
    if (list.length > 1) {
      ret.country = list[1];
    }
    return ret;
  }

  function getSupportedLanguages() {
    var supported = [];
    ctx.nodeFs.readdirSync(ctx.common.LOCALE_DIR).forEach(function (element) {
      var curPath = ctx.nodePath.join(ctx.common.LOCALE_DIR, element);
      if (ctx.nodeFs.lstatSync(curPath).isDirectory()) {
        supported.push(splitLocale(element));
      }
    });
    return supported;
  }

  function bestLocale(locale, supported) {
    var i;
    if (locale.country) {
      for (i = 0; i < supported.length; i++) {
        if (
          locale.lang === supported[i].lang &&
          locale.country === supported[i].country
        ) {
          return supported[i].lang + '_' + supported[i].country;
        }
      }
    }
    for (i = 0; i < supported.length; i++) {
      if (locale.lang === supported[i].lang) {
        return (
          supported[i].lang +
          (supported[i].country ? '_' + supported[i].country : '')
        );
      }
    }
    return 'en';
  }

  var mod = {};

  mod.setLocale = function (locale, callback) {
    locale = splitLocale(locale);
    var supported = getSupportedLanguages();
    var bestLang = bestLocale(locale, supported);
    ctx.gettextCatalog.setCurrentLanguage(bestLang);
    ctx.gettextCatalog.loadRemote(
      ctx.nodePath.join(ctx.common.LOCALE_DIR, bestLang, bestLang + '.json')
    );
    var collections = [ctx.common.defaultCollection]
      .concat(ctx.common.internalCollections)
      .concat(ctx.common.externalCollections);
    for (var c in collections) {
      var collection = collections[c];
      var filepath = ctx.nodePath.join(
        collection.path,
        'locale',
        bestLang,
        bestLang + '.json'
      );
      if (ctx.nodeFs.existsSync(filepath)) {
        ctx.gettextCatalog.loadRemote('file://' + filepath);
      }
    }
    if (callback) {
      setTimeout(function () {
        callback();
      }, 50);
    }
    return bestLang;
  };

  mod.loadProfile = function (profile, callback) {
    profile.load(function () {
      if (callback) {
        callback();
      }
    });
  };

  mod.loadLanguage = function (profile, callback) {
    var lang = profile.get('language');
    if (lang) {
      mod.setLocale(lang, callback);
    } else {
      ctx.nodeLangInfo(
        function (err, sysLang) {
          if (!err) {
            profile.set('language', mod.setLocale(sysLang, callback));
          }
        }.bind(mod)
      );
    }
  };

  return mod;
};
