//---------------------------------------------------------------------------
//-- FormBasicJsonInput: form for creating/editing a JSON Input block.
//-- Reads an external JSON file; exposes its keys as bottom output ports.
//-- Ports are extracted automatically from the selected file — no manual
//-- port entry. A preview table is shown in the dialog after file selection.
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
  //-- Ports are derived from the JSON file's top-level keys.
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

      this.addField(field0);
      this.addField(field1);

      this.resultAlert = null;
      this.nameIni = name || '';
      this.pathIni = path || '';
      this.portsIni = (ports || []).join(',');

      // Populated in init() after file is selected / auto-loaded
      this._loadedContent = '{}';
      this._loadedPorts = ports || []; // pre-seed from existing block data
    }

    init() {
      super.init();

      var self = this;
      var fs = require('fs');

      var $pathInput = $('#form1');
      $pathInput.prop('readonly', true).css({
        'background-color': '#e8e8e8',
        'cursor': 'not-allowed',
      });

      // --- Preview table ---------------------------------------------------
      var $preview = $(
        '<div class="json-port-preview">' +
          '<table class="json-port-table">' +
          '<thead><tr>' +
          '<th>' +
          gettextCatalog.getString('Port (key)') +
          '</th>' +
          '<th>' +
          gettextCatalog.getString('Value') +
          '</th>' +
          '</tr></thead>' +
          '<tbody class="json-port-table-body"></tbody>' +
          '</table>' +
          '</div>'
      );

      function renderTable(jsonObj) {
        var $tbody = $preview.find('.json-port-table-body');
        $tbody.empty();
        var keys = Object.keys(jsonObj);
        if (keys.length === 0) {
          $tbody.append(
            $('<tr>').append(
              $('<td>')
                .attr('colspan', '2')
                .text(gettextCatalog.getString('No keys found in JSON file'))
            )
          );
          return;
        }
        keys.forEach(function (key) {
          var valStr = JSON.stringify(jsonObj[key]);
          $tbody.append(
            $('<tr>').append($('<td>').text(key)).append($('<td>').text(valStr))
          );
        });
      }

      function loadAndPreview(fp) {
        if (!fp) {
          return;
        }
        try {
          var content = fs.readFileSync(fp, 'utf8');
          var jsonObj = JSON.parse(content);
          self._loadedContent = content;
          self._loadedPorts = Object.keys(jsonObj);
          renderTable(jsonObj);
        } catch (e) {
          console.warn('JSON input preview: could not read', fp, e);
        }
      }

      // --- Browse button ---------------------------------------------------
      if ($pathInput.length && !$pathInput.next('.json-browse-btn').length) {
        var $btn = $(
          '<button type="button" class="json-browse-btn">' +
            gettextCatalog.getString('Choose file') +
            '</button>'
        );
        $pathInput.after($btn);
        $btn.after($preview);

        // Auto-load if a path is already set (edit-block mode)
        var existingPath = $pathInput.val();
        if (existingPath) {
          loadAndPreview(existingPath);
        }

        $btn.on('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var $fileInput = $('#input-json-open');
          $fileInput
            .off('change.jsonpath')
            .on('change.jsonpath', function (ev) {
              var fp = ev.target.value;
              if (fp) {
                $pathInput.val(fp);
                loadAndPreview(fp);
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
      // Ports come from loaded JSON keys, not from a form field
      this.jsonPorts = this._loadedPorts || [];
      this.jsonContent = this._loadedContent || '{}';
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
      var block = new blocks.JsonInputBlock(
        this.jsonName,
        this.jsonPath,
        this.jsonPorts
      );
      block.data.content = this.jsonContent || '{}';
      return block;
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
