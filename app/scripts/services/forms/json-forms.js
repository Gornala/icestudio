//---------------------------------------------------------------------------
//-- FormBasicJsonInput: form for creating/editing a JSON Input block.
//-- Reads an external JSON file; exposes its values as bottom output ports.
//---------------------------------------------------------------------------
'use strict';

window._iceforms = window._iceforms || {};

window._iceforms.jsonForms = function (deps) {
  var gettextCatalog = deps.gettextCatalog;
  var blocks = deps.blocks;
  var Form = deps.Form;
  var TextField = deps.TextField;

  //-------------------------------------------------------------------------
  //-- CLASS: FormBasicJsonInput
  //-- Fields:
  //--   0: Name (text)
  //--   1: File path (text, read-only — browse opens an open dialog)
  //--   2: Ports, comma-separated (text)
  //-------------------------------------------------------------------------
  class FormBasicJsonInput extends Form {
    constructor(name, path, ports) {
      super();

      var field0 = new TextField(
        gettextCatalog.getString('Name'),
        name || '',
        0
      );
      var field1 = new TextField(
        gettextCatalog.getString('File path'),
        path || '',
        1
      );
      var field2 = new TextField(
        gettextCatalog.getString('Ports (comma-separated)'),
        (ports || []).join(','),
        2
      );

      this.addField(field0);
      this.addField(field1);
      this.addField(field2);

      this.resultAlert = null;
      this.nameIni = name || '';
      this.pathIni = path || '';
      this.portsIni = (ports || []).join(',');
    }

    init() {
      super.init();
      var $pathInput = $('#form1');
      $pathInput.prop('readonly', true).css({
        'background-color': '#e8e8e8',
        'cursor': 'not-allowed',
      });
      if ($pathInput.length && !$pathInput.next('.json-browse-btn').length) {
        var $btn = $(
          '<button type="button" class="json-browse-btn">' +
            gettextCatalog.getString('Choose file') +
            '</button>'
        );
        $pathInput.after($btn);
        $btn.on('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          // Always use open dialog — json_input only reads files
          var $fileInput = $('#input-json-open');
          $fileInput
            .off('change.jsonpath')
            .on('change.jsonpath', function (ev) {
              var fp = ev.target.value;
              if (fp) {
                $pathInput.val(fp);
              }
              $fileInput.off('change.jsonpath');
            });
          $fileInput.trigger('click');
        });
      }
    }

    parseFields() {
      this.values = this.readFields();
      this.jsonName = (this.values[0] || '').trim();
      this.jsonPath = (this.values[1] || '').trim();
      var rawPorts = (this.values[2] || '').trim();
      this.jsonPorts = rawPorts
        ? rawPorts
            .split(',')
            .map(function (s) {
              return s.trim();
            })
            .filter(function (s) {
              return s.length > 0;
            })
        : [];
    }

    process(evt) {
      if (this.resultAlert) {
        this.resultAlert.dismiss(false);
      }
      this.parseFields();
      if (!this.jsonName) {
        evt.cancel = true;
        this.resultAlert = alertify.warning(
          gettextCatalog.getString('Enter a block name')
        );
      }
    }

    newBlock() {
      return new blocks.JsonInputBlock(
        this.jsonName,
        this.jsonPath,
        this.jsonPorts
      );
    }

    changed() {
      return (
        this.nameIni !== this.jsonName ||
        this.pathIni !== this.jsonPath ||
        this.portsIni !== (this.jsonPorts || []).join(',')
      );
    }
  }

  return {
    FormBasicJsonInput: FormBasicJsonInput,
  };
};
