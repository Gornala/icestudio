'use strict';

window._iceutils = window._iceutils || {};

window._iceutils.dialog = function (ctx) {
  // RENDERFORM "color-dropdown" functions
  function openDropdown() {
    $('.lb-dropdown-menu').addClass('show');
  }

  function closeDropdown() {
    $('.lb-dropdown-menu').removeClass('show');
  }

  $(document).on('mousedown', '.lb-dropdown-title', function () {
    if ($('.lb-dropdown-menu').hasClass('show')) {
      closeDropdown();
    } else {
      openDropdown();
    }
  });

  $(document).on('mouseleave', '.lb-dropdown-menu', function () {
    closeDropdown();
  });

  $(document).on('mouseenter', '.ajs-button', function () {
    closeDropdown();
  });

  $(document).on('mousedown', '.lb-dropdown-option', function () {
    var selected = this;
    $('.lb-dropdown-title').html(
      '<span class="lb-selected-color color-' +
        selected.dataset.color +
        '" data-color="' +
        selected.dataset.color +
        '"></span>' +
        selected.dataset.name +
        '<span class="lb-dropdown-icon"></span>'
    );
    closeDropdown();
  });

  var mod = {};

  mod.projectinfoprompt = function (values, callback) {
    var i;
    var content = [];
    var messages = [
      ctx.gettextCatalog.getString('Name'),
      ctx.gettextCatalog.getString('Version'),
      ctx.gettextCatalog.getString('Description'),
      ctx.gettextCatalog.getString('Author'),
    ];
    var n = messages.length;
    var image = values[4];
    var blankImage =
      'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    content.push('<div>');
    for (i in messages) {
      content.push('  <p>' + messages[i] + '</p>');
      content.push(
        '  <input class="ajs-input" id="input' +
          i +
          '" type="text" value="' +
          values[i] +
          '">'
      );
    }
    content.push('  <p>' + ctx.gettextCatalog.getString('Image') + '</p>');
    content.push(
      '  <input id="input-open-svg" type="file" accept=".svg" class="hidden">'
    );
    content.push(
      '  <input id="input-save-svg" type="file" accept=".svg" class="hidden" nwsaveas="image.svg">'
    );
    content.push('  <div>');
    if (image) {
      var embeded = '<div id="preview-svg-wrapper">';
      var virtualBlock = new IceBlock({
        cacheDirImg: ctx.common.IMAGE_CACHE_DIR,
      });

      var tmpImage = '';
      var tmpImageSrc = '';
      var hash = '';
      if (image.startsWith('%3Csvg')) {
        tmpImage = decodeURI(image);
      } else if (image.startsWith('<svg')) {
        tmpImage = image;
      }
      if (tmpImage.length > 0) {
        hash = ctx.sparkMD5.hash(tmpImage);
        tmpImageSrc = virtualBlock.svgFile(hash, tmpImage);
        embeded = embeded + '<img src="file://' + tmpImageSrc + '"/>';
      }

      embeded += '</div">';
      content.push(embeded);
    } else {
      content.push(
        '  <div id="preview-svg-wrapper"><img id="preview-svg" class="ajs-input" src="' +
          blankImage +
          '" height="68" style="pointer-events:none"></div>'
      );
    }
    content.push('  </div>');
    content.push('  <div>');
    content.push(
      '    <label for="input-open-svg" class="btn">' +
        ctx.gettextCatalog.getString('Open SVG') +
        '</label>'
    );
    content.push(
      '    <label id="save-svg" for="input-save-svg" class="btn">' +
        ctx.gettextCatalog.getString('Save SVG') +
        '</label>'
    );
    content.push(
      '    <label id="reset-svg" class="btn">' +
        ctx.gettextCatalog.getString('Reset SVG') +
        '</label>'
    );
    content.push(
      '    <label id="toggle-thumbmaker" class="btn" title="Draw Thumbnail">' +
        '<i class="fa fa-paint-brush"></i>' +
        '</label>'
    );
    content.push('  </div>');
    content.push('</div>');
    content.push(
      '<div id="projinfo-thumbmaker" class="tm-panel tm-hidden"></div>'
    );

    for (i = 0; i < n; i++) {
      $('#input' + i).val(values[i]);
    }

    var thumbMaker = null;

    function registerOpen() {
      var chooserOpen = $('#input-open-svg');
      chooserOpen.unbind('change');
      chooserOpen.change(function () {
        var filepath = $(this).val();
        ctx.nodeFs.readFile(filepath, 'utf8', function (err, data) {
          if (err) {
            throw err;
          }
          ctx.SVGO.optimize(data, function (result) {
            image = encodeURI(result.data);
            registerSave();
            $('#preview-svg-wrapper').html(result.data);
          });
        });
        $(this).val('');
      });
    }

    function registerSave() {
      var label = $('#save-svg');
      if (image) {
        label.removeClass('disabled');
        label.attr('for', 'input-save-svg');
        var chooserSave = $('#input-save-svg');
        chooserSave.unbind('change');
        chooserSave.change(function () {
          if (image) {
            var filepath = $(this).val();
            if (!filepath.endsWith('.svg')) {
              filepath += '.svg';
            }
            ctx.nodeFs.writeFile(filepath, decodeURI(image), function (err) {
              if (err) {
                throw err;
              }
            });
            $(this).val('');
          }
        });
      } else {
        label.addClass('disabled');
        label.attr('for', '');
      }
    }

    function registerReset() {
      var reset = $('#reset-svg');
      reset.click(function () {
        image = '';
        registerSave();
        $('#preview-svg-wrapper').empty();
      });
    }

    var registerThumbmaker = function () {
      var toggleBtn = document.getElementById('toggle-thumbmaker');
      var panel = document.getElementById('projinfo-thumbmaker');
      var dialog = document.querySelector('.alertify .ajs-dialog');

      var openPanel = function () {
        panel.classList.remove('tm-hidden');
        if (dialog) {
          dialog.classList.add('tm-expanded');
        }
        if (!thumbMaker) {
          thumbMaker = new window.ThumbnailMaker(panel);
          thumbMaker.init();
          // Load existing image into canvas if present
          if (image && image.length > 0) {
            var decoded = '';
            if (image.startsWith('%3Csvg')) {
              decoded = decodeURI(image);
            } else if (image.startsWith('<svg')) {
              decoded = image;
            }
            if (decoded) {
              thumbMaker.loadSVG(decoded);
            }
          }
        }
      };

      var closePanel = function () {
        panel.classList.add('tm-hidden');
        if (dialog) {
          dialog.classList.remove('tm-expanded');
        }
      };

      toggleBtn.addEventListener('click', function () {
        if (panel.classList.contains('tm-hidden')) {
          openPanel();
        } else {
          closePanel();
        }
      });

      // Close button inside the panel
      $(document).on('click', '#tm-close', function () {
        closePanel();
      });

      // Apply button handler
      $(document).on('click', '#tm-apply', function () {
        if (thumbMaker) {
          var svgString = thumbMaker.exportSVG();
          image = encodeURI(svgString);
          registerSave();
          $('#preview-svg-wrapper').html(svgString);
        }
      });
    };

    var cleanupThumbmaker = function () {
      if (thumbMaker) {
        thumbMaker.destroy();
        thumbMaker = null;
      }
      $(document).off('click', '#tm-apply');
      $(document).off('click', '#tm-close');
    };

    var dlg = alertify.confirm();
    dlg.setContent(content.join('\n'));
    dlg.set('onshow', function () {
      registerOpen();
      registerSave();
      registerReset();
      registerThumbmaker();
    });
    dlg.set('onok', function (evt) {
      var vals = [];
      for (var j = 0; j < n; j++) {
        vals.push($('#input' + j).val());
      }
      vals.push(image);
      if (callback) {
        callback(evt, vals);
      }
      cleanupThumbmaker();
      dlg.set('onshow', null);
    });
    dlg.set('oncancel', function () {
      cleanupThumbmaker();
      dlg.set('onshow', null);
    });
    dlg.show();
  };

  mod.openDialog = function (inputID, callback) {
    var chooser = $(inputID);
    chooser.unbind('change');
    chooser.change(function () {
      var filepath = $(this).val();
      if (callback) {
        callback(filepath);
      }
      $(this).val('');
    });
    chooser.trigger('click');
  };

  mod.saveDialog = function (inputID, ext, callback) {
    var chooser = $(inputID);
    chooser.unbind('change');
    chooser.change(function () {
      var filepath = $(this).val();
      if (!filepath.endsWith(ext)) {
        filepath += ext;
      }
      if (callback) {
        callback(filepath);
      }
      $(this).val('');
    });
    chooser.trigger('click');
  };

  mod.renderForm = function (specs, callback) {
    var content = [];
    content.push('<div>');
    for (var i in specs) {
      var spec = specs[i];
      switch (spec.type) {
        case 'text':
          content.push(
            '\
              <p>' +
              spec.title +
              '</p>\
              <input class="ajs-input" type="text" id="form' +
              i +
              '" autocomplete="off"/>\
              '
          );
          break;
        case 'checkbox':
          content.push(
            '\
                <div class="checkbox">\
                <label><input type="checkbox" ' +
              (spec.value ? 'checked' : '') +
              ' id="form' +
              i +
              '"/>' +
              spec.label +
              '</label>\
                </div>\
                '
          );
          break;
        case 'combobox':
          var options = spec.options
            .map(function (option) {
              var selected = spec.value === option.value ? ' selected' : '';
              return (
                '<option value="' +
                option.value +
                '"' +
                selected +
                '>' +
                option.label +
                '</option>'
              );
            })
            .join('');
          content.push(
            '\
              <div class="form-group">\
              <label style="font-weight:normal">' +
              spec.label +
              '</label>\
              <select class="form-control" id="form' +
              i +
              '">\
              ' +
              options +
              '\
              </select>\
              </div>\
              '
          );
          break;
        case 'color-dropdown':
          content.push(
            '\
                <div class="form-group">\
                <label style ="font-weight:normal">' +
              spec.label +
              '</label>\
                <div class="lb-color--dropdown">\
                <div class="lb-dropdown-title"><span class="lb-selected-color color-fuchsia" data-color="fuchsia" data-name="Fuchsia"></span>Fuchsia<span class="lb-dropdown-icon"></span></div>\
                <div class="lb-dropdown-menu">\
                <div class="lb-dropdown-option" data-color="indianred" data-name="IndianRed"><span class="lb-option-color color-indianred"></span>IndianRed</div>\
                <div class="lb-dropdown-option" data-color="red" data-name="Red"><span class="lb-option-color color-red"></span>Red</div>\
                <div class="lb-dropdown-option" data-color="deeppink" data-name="DeepPink"><span class="lb-option-color color-deeppink"></span>DeepPink</div>\
                <div class="lb-dropdown-option" data-color="mediumvioletred"data-name="MediumVioletRed"><span class="lb-option-color color-mediumvioletred"></span>MediumVioletRed</div>\
                <div class="lb-dropdown-option" data-color="coral"data-name="Coral"><span class="lb-option-color color-coral"></span>Coral</div>\
                <div class="lb-dropdown-option" data-color="orangered"data-name="OrangeRed"><span class="lb-option-color color-orangered"></span>OrangeRed</div>\
                <div class="lb-dropdown-option" data-color="darkorange"data-name="DarkOrange"><span class="lb-option-color color-darkorange"></span>DarkOrange</div>\
                <div class="lb-dropdown-option" data-color="gold"data-name="Gold"><span class="lb-option-color color-gold"></span>Gold</div>\
                <div class="lb-dropdown-option" data-color="yellow"data-name="Yellow"><span class="lb-option-color color-yellow"></span>Yellow</div>\
                <div class="lb-dropdown-option" data-color="fuchsia"data-name="Fuchsia"><span class="lb-option-color color-fuchsia"></span>Fuchsia</div>\
                <div class="lb-dropdown-option" data-color="slateblue"data-name="SlateBlue"><span class="lb-option-color color-slateblue"></span>SlateBlue</div>\
                <div class="lb-dropdown-option" data-color="greenyellow"data-name="GreenYellow"><span class="lb-option-color color-greenyellow"></span>GreenYellow</div>\
                <div class="lb-dropdown-option" data-color="springgreen"data-name="SpringGreen"><span class="lb-option-color color-springgreen"></span>SpringGreen</div>\
                <div class="lb-dropdown-option" data-color="darkgreen"data-name="DarkGreen"><span class="lb-option-color color-darkgreen"></span>DarkGreen</div>\
                <div class="lb-dropdown-option" data-color="olivedrab"data-name="OliveDrab"><span class="lb-option-color color-olivedrab"></span>OliveDrab</div>\
                <div class="lb-dropdown-option" data-color="lightseagreen"data-name="LightSeaGreen"><span class="lb-option-color color-lightseagreen"></span>LightSeaGreen</div>\
                <div class="lb-dropdown-option" data-color="turquoise"data-name="Turquoise"><span class="lb-option-color color-turquoise"></span>Turquoise</div>\
                <div class="lb-dropdown-option" data-color="steelblue"data-name="SteelBlue"><span class="lb-option-color color-steelblue"></span>SteelBlue</div>\
                <div class="lb-dropdown-option" data-color="deepskyblue"data-name="DeepSkyBlue"><span class="lb-option-color color-deepskyblue"></span>DeepSkyBlue</div>\
                <div class="lb-dropdown-option" data-color="royalblue"data-name="RoyalBlue"><span class="lb-option-color color-royalblue"></span>RoyalBlue</div>\
                <div class="lb-dropdown-option" data-color="navy"data-name="Navy"><span class="lb-option-color color-navy"></span>Navy</div>\
                <div class="lb-dropdown-option" data-color="lightgray"data-name="LightGray"><span class="lb-option-color color-lightgray"></span>LightGray</div>\
                </div>\
                </div>\
                </div>\
                '
          );
          break;
      }
    }
    content.push('</div>');

    alertify
      .confirm(content.join('\n'))
      .set('onok', function (evt) {
        var values = [];
        if (callback) {
          for (var i in specs) {
            var spec = specs[i];
            switch (spec.type) {
              case 'text':
              case 'combobox':
                values.push($('#form' + i).val());
                break;
              case 'checkbox':
                values.push($('#form' + i).prop('checked'));
                break;
              case 'color-dropdown':
                values.push($('.lb-selected-color').data('color'));
                break;
            }
          }
          callback(evt, values);
        }
      })
      .set('oncancel', function () {});

    setTimeout(function () {
      $('#form0').select();
      for (var i in specs) {
        var spec = specs[i];
        switch (spec.type) {
          case 'text':
          case 'combobox':
            $('#form' + i).val(spec.value);
            break;
          case 'checkbox':
            $('#form' + i).prop('checked', spec.value);
            break;
          case 'color-dropdown':
            $('.lb-dropdown-title').html(
              '<span class="lb-selected-color color-fuchsia" data-color="fuchsia"></span>Fuchsia<span class="lb-dropdown-icon"></span>'
            );
            break;
        }
      }
    }, 50);
  };

  return mod;
};
