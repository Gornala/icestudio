//---------------------------------------------------------------------------
//-- FormBasicJson: form for creating/editing a JSON parameter block
//---------------------------------------------------------------------------
'use strict';

window._iceforms = window._iceforms || {};

//-- Factory: called from inside the Angular service with injected deps
window._iceforms.jsonForms = function (deps) {
  var gettextCatalog = deps.gettextCatalog;
  var blocks = deps.blocks;
  var Form = deps.Form;
  var TextField = deps.TextField;
  var ComboboxField = deps.ComboboxField;

  //-------------------------------------------------------------------------
  //-- CLASS: FormBasicJson
  //-- Fields:
  //--   0: Name (text)
  //--   1: Save path (text + browse button injected in init())
  //--   2: Type combobox (output / input)
  //--   3: Ports, comma-separated (text)
  //-------------------------------------------------------------------------
  class FormBasicJson extends Form {
    constructor(name, path, type, ports) {
      super();

      var field0 = new TextField(
        gettextCatalog.getString('Name'),
        name || '',
        0
      );
      var field1 = new TextField(
        gettextCatalog.getString('Save path'),
        path || '',
        1
      );
      var field2 = new ComboboxField(
        [
          {
            value: 'output',
            label: gettextCatalog.getString('Output (JSON \u2192 parameters)'),
          },
          {
            value: 'input',
            label: gettextCatalog.getString(
              'Input (constants \u2192 JSON file)'
            ),
          },
        ],
        gettextCatalog.getString('Type'),
        type || 'output',
        2
      );
      var field3 = new TextField(
        gettextCatalog.getString('Ports (comma-separated)'),
        (ports || []).join(','),
        3
      );

      this.addField(field0);
      this.addField(field1);
      this.addField(field2);
      this.addField(field3);

      this.resultAlert = null;
      this.nameIni = name || '';
      this.pathIni = path || '';
      this.typeIni = type || 'output';
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
            gettextCatalog.getString('Choose path') +
            '</button>'
        );
        $pathInput.after($btn);
        $btn.on('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          // Use save dialog for input type (writing new file),
          // open dialog for output type (reading existing file)
          var currentType = $('#form2').val();
          var $fileInput =
            currentType === 'input'
              ? $('#input-json-save')
              : $('#input-json-open');
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
      this.jsonType = this.values[2] || 'output';
      var rawPorts = (this.values[3] || '').trim();
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
      return new blocks.JsonBlock(
        this.jsonName,
        this.jsonPath,
        this.jsonType,
        this.jsonPorts
      );
    }

    changed() {
      return (
        this.nameIni !== this.jsonName ||
        this.pathIni !== this.jsonPath ||
        this.typeIni !== this.jsonType ||
        this.portsIni !== (this.jsonPorts || []).join(',')
      );
    }
  }

  return {
    FormBasicJson: FormBasicJson,
  };
};
