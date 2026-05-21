//---------------------------------------------------------------------------
//-- Block form classes: FormBasicCode, FormBasicMemory, FormBasicConstant
//-- Loaded as a <script> tag before forms.js; exposes window._iceforms.blockForms
//---------------------------------------------------------------------------
'use strict';

window._iceforms = window._iceforms || {};

//-- Factory: called from inside the Angular service with injected deps
window._iceforms.blockForms = function (deps) {
  var gettextCatalog = deps.gettextCatalog;
  var common = deps.common;
  var profile = deps.profile;
  var blocks = deps.blocks;
  var utils = deps.utils;
  var nodeFs = deps.nodeFs;
  var Form = deps.Form;
  var TextField = deps.TextField;
  var CheckboxField = deps.CheckboxField;
  var ComboboxField = deps.ComboboxField;
  var ButtonField = deps.ButtonField;
  var GridField = deps.GridField;
  var LabelField = deps.LabelField;

  //-------------------------------------------------------------------------
  //-- CLASS: Creating/Editing a Basic Code block
  //-------------------------------------------------------------------------
  class FormBasicCode extends Form {
    constructor(
      portsIn,
      portsOut,
      paramsIn,
      portsInOutLeft,
      portsInOutRight,
      label
    ) {
      super();

      let portsInVal = portsIn !== undefined ? portsIn : '';
      let portsOutVal = portsOut !== undefined ? portsOut : '';
      let paramsInVal = paramsIn !== undefined ? paramsIn : '';
      let portsInOutLeftVal =
        portsInOutLeft !== undefined ? portsInOutLeft : '';
      let portsInOutRightVal =
        portsInOutRight !== undefined ? portsInOutRight : '';
      let labelVal = label !== undefined ? label : '';

      this._updatingFromText = false;
      this._updatingFromGrid = false;

      let field0 = new TextField(
        gettextCatalog.getString('Input ports'),
        portsInVal,
        0
      );

      let field1 = new TextField(
        gettextCatalog.getString('Output ports'),
        portsOutVal,
        1
      );

      let field2 = new TextField(
        gettextCatalog.getString('Input parameters'),
        paramsInVal,
        2
      );

      const modulePortsLabel = gettextCatalog.getString('Module Ports');

      let fieldLabel = new TextField(
        gettextCatalog.getString('Name'),
        labelVal,
        9
      );
      this.addField(fieldLabel, modulePortsLabel);
      this._labelField = fieldLabel;
      this.iniLabel = labelVal;

      this.addField(field0, modulePortsLabel);
      this.addField(field1, modulePortsLabel);
      this.addField(field2, modulePortsLabel);
      let field3 = false;
      let field4 = false;

      const allowInoutPorts =
        profile.get('allowInoutPorts') || common.allowProjectInoutPorts;
      if (allowInoutPorts) {
        field3 = new TextField(
          gettextCatalog.getString('"Inout" Left ports'),
          portsInOutLeftVal,
          3
        );

        this.addField(field3, modulePortsLabel);

        field4 = new TextField(
          gettextCatalog.getString('"Inout" Right ports'),
          portsInOutRightVal,
          4
        );

        this.addField(field4, modulePortsLabel);
      }

      const toolsLabel = gettextCatalog.getString('Tools');

      let field5 = new LabelField(
        gettextCatalog.getString('Import Verilog code from file'),
        5
      );
      this.addField(field5, toolsLabel);

      this.code = '';
      let self = this;

      let field6 = new ButtonField(
        gettextCatalog.getString('Import code'),
        function () {
          utils.openDialog('#input-import-verilog', async function (filepath) {
            try {
              const content = await nodeFs.promises.readFile(filepath, 'utf8');

              const result = await utils.parseVerilog(content);

              portsInVal = result.inputs;
              portsOutVal = result.outputs;
              paramsInVal = result.parameters;
              field0.write(result.inputs);
              field1.write(result.outputs);
              field2.write(result.parameters);

              if (result.inouts.length > 0) {
                if (field3) {
                  field3.write(result.inouts);
                } else {
                  alertify.error(
                    gettextCatalog.getString(
                      'Design contains tri-state I/O. You need to update your Preferences:<br />&nbsp;&nbsp;&nbsp;<b>Advanced features → Allow tri-state connections</b>,<br />and reimport the block.'
                    ),
                    20000
                  );
                }
              }

              self.code = result.moduleBody;

              if (result.moduleName && self._labelField) {
                self._labelField.write(result.moduleName);
              }

              $('[data-tab="Module Ports"]').click();
            } catch (err) {
              alertify.error(
                gettextCatalog.getString('Error reading the file: {{error}}', {
                  error: err.message,
                })
              );
            }
          });
        },
        6
      );

      this.addField(field6, toolsLabel);

      let options = [
        {
          value: 1,
          label: gettextCatalog.getString('Grid'),
        },
        {
          value: 2,
          label: gettextCatalog.getString('Manual'),
        },
      ];

      const columns = [
        { type: 'text', title: 'Name', width: 140 },
        {
          type: 'dropdown',
          title: 'Type',
          width: 80,
          source: ['IN', 'OUT', 'BIDI'],
        },
        { type: 'numeric', title: 'Bus width', width: 80 },
        { type: 'checkbox', title: 'Enable', width: 60 },
      ];
      const data = [['', 'IN', 1, true]];

      let field7 = new GridField(7, 'ports-table', columns, data);
      field7.onEnter = () => this.onEnterIOPortsTable(field7.table);
      this.addField(field7, modulePortsLabel);
      this._field7 = field7;
      this._allowInoutPorts = allowInoutPorts;

      field0.onChange((value) => {
        if (this._updatingFromGrid) {
          return;
        }
        this._updatingFromText = true;
        this.updateIOPortsTable(field7.table, value, 'IN');
        this._updatingFromText = false;
      });
      field1.onChange((value) => {
        if (this._updatingFromGrid) {
          return;
        }
        this._updatingFromText = true;
        this.updateIOPortsTable(field7.table, value, 'OUT');
        this._updatingFromText = false;
      });
      if (allowInoutPorts) {
        field3.onChange((value) => {
          if (this._updatingFromGrid) {
            return;
          }
          this._updatingFromText = true;
          this.updateIOPortsTable(field7.table, value, 'BIDI');
          this._updatingFromText = false;
        });
        field4.onChange((value) => {
          if (this._updatingFromGrid) {
            return;
          }
          this._updatingFromText = true;
          this.updateIOPortsTable(field7.table, value, 'BIDI');
          this._updatingFromText = false;
        });
      }

      let field8 = new ComboboxField(
        options,
        gettextCatalog.getString('Display mode:'),
        1,
        8,
        'fit-content'
      );

      this.addField(field8, modulePortsLabel);

      this.resultAlert = null;

      this.iniPortsIn = portsInVal;
      this.iniPortsOut = portsOutVal;
      this.iniParamsIn = paramsInVal;
      if (portsInOutLeftVal !== undefined && portsInOutRightVal !== undefined) {
        this.iniPortsInOutLeft = portsInOutLeftVal;
        this.iniPortsInOutRight = portsInOutRightVal;
      }

      // fieldLabel is at index 0; field0..field4 shifted by +1
      this.inInput = this.fields[modulePortsLabel][1];
      this.outInput = this.fields[modulePortsLabel][2];
      this.bidiInput1 = this.fields[modulePortsLabel][4];
      this.bidiInput2 = this.fields[modulePortsLabel][5];
    }

    getPortInfo(names, evt) {
      let portInfo;
      let portInfos = [];

      for (let name of names) {
        portInfo = Form.parsePortName(name);
        if (!portInfo) {
          evt.cancel = true;

          this.resultAlert = alertify.warning(
            gettextCatalog.getString('Wrong block name {{name}}', {
              name: name,
            })
          );
          return;
        }

        if (portInfo.name !== '') {
          portInfos.push(portInfo);
        }
      }

      evt.cancel = false;

      return portInfos;
    }

    parseFields() {
      this.values = this.readFields();

      // values[0] = Name (label) field — not a port, skip
      this.inPorts = Form.parseNames(this.values[1].replace(/\s+/g, ''));
      this.outPorts = Form.parseNames(this.values[2].replace(/\s+/g, ''));
      this.inParams = Form.parseNames(this.values[3].replace(/\s+/g, ''));

      if (this.values[4] && typeof this.values[4] === 'string') {
        this.inoutLeftPorts = Form.parseNames(
          this.values[4].replace(/\s+/g, '')
        );
      }

      if (this.values[5] && typeof this.values[5] === 'string') {
        this.inoutRightPorts = Form.parseNames(
          this.values[5].replace(/\s+/g, '')
        );
      }
    }

    process(evt) {
      if (this.resultAlert) {
        this.resultAlert.dismiss(false);
      }

      this.parseFields();

      this.inPortsInfo = this.getPortInfo(this.inPorts, evt);
      this.outPortsInfo = this.getPortInfo(this.outPorts, evt);
      this.inParamsInfo = this.getPortInfo(this.inParams, evt);
      if (this.hasOwnProperty('inoutLeftPorts')) {
        this.inoutLeftPortsInfo = this.getPortInfo(this.inoutLeftPorts, evt);
      }
      if (this.hasOwnProperty('inoutRightPorts')) {
        this.inoutRightPortsInfo = this.getPortInfo(this.inoutRightPorts, evt);
      }

      let allPortnames = [];

      let userPorts = this.inPortsInfo.concat(this.outPortsInfo);
      userPorts = userPorts.concat(this.inParamsInfo);

      if (this.inoutLeftPortsInfo && this.inoutRightPortsInfo) {
        userPorts = userPorts.concat(
          this.inoutLeftPortsInfo,
          this.inoutRightPortsInfo
        );
      }

      for (let portInfo of userPorts) {
        if (portInfo) {
          if (allPortnames.includes(portInfo.name)) {
            evt.cancel = true;
            this.resultAlert = alertify.warning(
              gettextCatalog.getString('Duplicate port name: {{name}}', {
                name: portInfo.name,
              })
            );
            return;
          }

          allPortnames.push(portInfo.name);
        }
      }
    }

    changed() {
      let inPortNames = blocks.portsInfo2Str(this.inPortsInfo);
      let outPortNames = blocks.portsInfo2Str(this.outPortsInfo);
      let inParamNames = blocks.portsInfo2Str(this.inParamsInfo);

      let inoutLeftPortNames;
      let inoutRightPortNames;

      if (this.inoutLeftPortsInfo && this.inoutRightPortsInfo) {
        inoutLeftPortNames = blocks.portsInfo2Str(this.inoutLeftPortsInfo);
        inoutRightPortNames = blocks.portsInfo2Str(this.inoutRightPortsInfo);
      }

      let changedResult =
        this.iniPortsIn !== inPortNames ||
        this.iniPortsOut !== outPortNames ||
        this.iniParamsIn !== inParamNames ||
        (this.hasOwnProperty('iniPortsInOutLeft') &&
          this.iniPortsInOutLeft !== inoutLeftPortNames) ||
        (this.hasOwnProperty('iniPortsInOutRight') &&
          this.iniPortsInOutRight !== inoutRightPortNames) ||
        this.iniLabel !== this.label;

      return changedResult;
    }

    get label() {
      return this._labelField ? this._labelField.read() : '';
    }

    init() {
      super.init();

      this._updatingFromText = true;
      if (this.iniPortsIn) {
        this.updateIOPortsTable(this._field7.table, this.iniPortsIn, 'IN');
      }
      if (this.iniPortsOut) {
        this.updateIOPortsTable(this._field7.table, this.iniPortsOut, 'OUT');
      }
      if (this._allowInoutPorts) {
        const bidi = [this.iniPortsInOutLeft, this.iniPortsInOutRight]
          .filter((s) => s && s.trim())
          .join(', ');
        if (bidi) {
          this.updateIOPortsTable(this._field7.table, bidi, 'BIDI');
        }
      }
      this._updatingFromText = false;
    }

    onEnterIOPortsTable(table) {
      if (this._updatingFromText) {
        return;
      }

      const grouped = {
        IN: [],
        OUT: [],
        BIDI: [],
      };

      table.getData().forEach((row) => {
        const enabled = row[3] !== false;
        if (!enabled) {
          return;
        }
        let name = row[0] ? row[0].trim() : null;
        const type = row[1] ? row[1].toUpperCase() : null;
        const busWidth = parseInt(row[2], 10);

        if (!name || !type) {
          return;
        }

        if (!isNaN(busWidth) && busWidth > 1) {
          name += `[${busWidth - 1}:0]`;
        }

        if (grouped[type]) {
          grouped[type].push(name);
        }
      });

      this._updatingFromGrid = true;
      this.inInput.write(grouped.IN.join(', '));
      this.outInput.write(grouped.OUT.join(', '));
      if (this.hasOwnProperty('inoutLeftPorts')) {
        this.bidiInput1.write(grouped.BIDI.join(', '));
      }
      if (this.hasOwnProperty('inoutRightPorts')) {
        this.bidiInput2.write(grouped.BIDI.join(', '));
      }
      this._updatingFromGrid = false;

      const coords = table.selectedCell || [];
      const row = coords[1] || 0;
      const data = table.getData();
      const rowData = table.getRowData(row);
      const name = rowData[0];
      const totalRows = data.length;

      const isEmpty = !name;
      const defaultRow = ['', 'IN', 1, true];

      if (isEmpty) {
        const otherEmptyRowExists = data.some((r, i) => !r[0] && i !== row);

        if (otherEmptyRowExists || totalRows > 1) {
          table.deleteRow(row);

          const stillHasEmptyRow = table.getData().some((r) => !r[0]);
          if (!stillHasEmptyRow) {
            table.insertRow([...defaultRow]);
          }
        }
      } else {
        const hasEmptyRow = data.some((r) => !r[0]);
        if (!hasEmptyRow) {
          table.insertRow([...defaultRow]);
        }
      }
    }

    updateIOPortsTable(instance, textList, type) {
      const parsedNames = textList
        .split(',')
        .map((n) => {
          let trimmed = n.trim();

          // Strip legacy @ (signed) and # (registered) prefixes if present
          // in saved projects — they are no longer used
          trimmed = trimmed.replace(/^[@#]+/, '');

          const match = trimmed.match(/^(\w+)\[(\d+):(\d+)\]$/);
          if (match) {
            const portName = match[1];
            const msb = parseInt(match[2], 10);
            const lsb = parseInt(match[3], 10);
            const busWidth = Math.abs(msb - lsb) + 1;
            return { name: portName, busWidth: busWidth };
          }
          return { name: trimmed, busWidth: 1 };
        })
        .filter(({ name }) => name !== '');

      const defaultRow = ['', 'IN', 1, true];
      const data = instance.getData();

      const nameToRowIndex = new Map();
      const usedIndexes = new Set();

      data.forEach((r, index) => {
        const n = r[0];
        if (n) {
          nameToRowIndex.set(n, index);
        }
      });

      const newNames = parsedNames.map((p) => p.name);
      parsedNames.forEach(({ name, busWidth }) => {
        if (nameToRowIndex.has(name)) {
          const i = nameToRowIndex.get(name);
          const r = instance.getData()[i];
          if (r[1] !== type) {
            instance.setValueFromCoords(1, i, type);
          }
          if (r[2] !== busWidth) {
            instance.setValueFromCoords(2, i, busWidth);
          }
          usedIndexes.add(i);
        } else {
          let reused = false;
          for (let i = 0; i < data.length; i++) {
            const existingName = data[i][0];
            const existingType = data[i][1];
            if (
              existingType === type &&
              !newNames.includes(existingName) &&
              !usedIndexes.has(i) &&
              existingName
            ) {
              instance.setValueFromCoords(0, i, name);
              instance.setValueFromCoords(2, i, busWidth);
              usedIndexes.add(i);
              reused = true;
              break;
            }
          }
          if (!reused) {
            instance.insertRow([name, type, busWidth, true]);
          }
        }
      });

      for (let i = instance.getData().length - 1; i >= 0; i--) {
        const rowData = instance.getData()[i];
        const rowName = rowData[0];
        const rowType = rowData[1];
        if (rowType === type && rowName && !newNames.includes(rowName)) {
          instance.deleteRow(i);
        }
      }

      const updated = instance.getData();
      let hasEmptyRow = false;

      for (let i = updated.length - 1; i >= 0; i--) {
        const length = instance.getData().length;
        if (!updated[i][0] && length > 1) {
          instance.deleteRow(i);
        } else if (!updated[i][0]) {
          hasEmptyRow = true;
        }
      }

      if (!hasEmptyRow) {
        instance.insertRow([...defaultRow]);
      }
    }
  }

  //-------------------------------------------------------------------------
  //-- ImageField: SVG thumbnail picker for the Package Info tab
  //-------------------------------------------------------------------------
  class ImageField {
    constructor(initialImage) {
      this.image = initialImage || '';
      this.thumbMaker = null;
    }

    // Extract only the <svg>...</svg> portion — strip XML declaration, DOCTYPE, etc.
    _extractSvg(raw) {
      var idx = raw.search(/<svg[\s>]/i);
      return idx >= 0 ? raw.substring(idx) : '';
    }

    // Normalize an SVG to 64×64 pixels (matching the thumbnail maker canvas).
    // Ensures a viewBox is present (built from width/height if missing) so the
    // original proportions are preserved, then sets width/height to 64.
    _normalizeSvg(svgString) {
      if (!svgString) {
        return svgString;
      }
      var parser = new DOMParser();
      var doc = parser.parseFromString(svgString, 'image/svg+xml');
      var svgEl = doc.querySelector('svg');
      if (!svgEl) {
        return svgString;
      }
      if (!svgEl.getAttribute('viewBox')) {
        var w = parseFloat(svgEl.getAttribute('width')) || 64;
        var h = parseFloat(svgEl.getAttribute('height')) || 64;
        svgEl.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      }
      svgEl.setAttribute('width', '64');
      svgEl.setAttribute('height', '64');
      return new XMLSerializer().serializeToString(svgEl);
    }

    // Decode stored URI-encoded image back to an SVG string
    _decodeSvg() {
      if (!this.image) {
        return '';
      }
      if (this.image.startsWith('%3Csvg') || this.image.startsWith('%3csvg')) {
        return decodeURI(this.image);
      }
      if (this.image.startsWith('<svg')) {
        return this.image;
      }
      return '';
    }

    // Render svgContent (raw string) into the preview div via a data-URI <img>
    _showPreview(svgContent) {
      var preview = $('#pkgi-preview');
      if (!svgContent) {
        var blank =
          'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
        preview.html(
          '<img src="' +
            blank +
            '" style="max-width:100%;max-height:100%;opacity:0.3">'
        );
        return;
      }
      var dataUrl =
        'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgContent);
      preview.html(
        '<img src="' +
          dataUrl +
          '" style="max-width:100%;max-height:100%;object-fit:contain">'
      );
    }

    html() {
      var existingSvg = this._decodeSvg();
      var previewHtml;
      if (existingSvg) {
        var dataUrl =
          'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(existingSvg);
        previewHtml =
          '<img src="' +
          dataUrl +
          '" style="max-width:100%;max-height:100%;object-fit:contain">';
      } else {
        var blank =
          'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
        previewHtml =
          '<img src="' +
          blank +
          '" style="max-width:100%;max-height:100%;opacity:0.3">';
      }
      var saveFor = this.image ? 'pkgi-save-file' : '';
      var saveDisabled = this.image ? '' : ' disabled';
      return [
        '<p>' + gettextCatalog.getString('Image') + '</p>',
        '<input id="pkgi-open-file" type="file" accept=".svg" class="hidden">',
        '<input id="pkgi-save-file" type="file" accept=".svg" class="hidden" nwsaveas="image.svg">',
        '<div id="pkgi-preview" style="width:100%;height:120px;border:1px solid #555;border-radius:4px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#1a1a2e;margin-bottom:4px">' +
          previewHtml +
          '</div>',
        '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:2px">',
        '  <label for="pkgi-open-file" class="btn">' +
          gettextCatalog.getString('Open SVG') +
          '</label>',
        '  <label id="pkgi-save-lbl" for="' +
          saveFor +
          '" class="btn' +
          saveDisabled +
          '">' +
          gettextCatalog.getString('Save SVG') +
          '</label>',
        '  <label id="pkgi-reset-lbl" class="btn">' +
          gettextCatalog.getString('Reset SVG') +
          '</label>',
        '  <label id="pkgi-thumb-toggle" class="btn" title="Draw Thumbnail"><i class="fa fa-paint-brush"></i></label>',
        '</div>',
        '<div id="pkgi-thumbmaker" class="tm-panel tm-hidden"></div>',
      ].join('\n');
    }

    _updateSave() {
      var self = this;
      var lbl = $('#pkgi-save-lbl');
      if (this.image) {
        lbl.removeClass('disabled').attr('for', 'pkgi-save-file');
        $('#pkgi-save-file')
          .off('change')
          .on('change', function () {
            var fp = $(this).val();
            if (!fp.endsWith('.svg')) {
              fp += '.svg';
            }
            var out = self._decodeSvg() || self.image;
            nodeFs.writeFile(fp, out, function (err) {
              if (err) {
                console.error(err);
              }
            });
            $(this).val('');
          });
      } else {
        lbl.addClass('disabled').attr('for', '');
      }
    }

    init() {
      var self = this;

      $(document).off('click.pkgimg');

      // Open SVG — extract <svg> element, strip XML preamble, normalize to 64×64
      $('#pkgi-open-file')
        .off('change')
        .on('change', function () {
          var fp = $(this).val();
          nodeFs.readFile(fp, 'utf8', function (err, data) {
            if (err) {
              return;
            }
            var svgContent = self._normalizeSvg(self._extractSvg(data));
            if (!svgContent) {
              return;
            }
            self.image = encodeURI(svgContent);
            self._updateSave();
            self._showPreview(svgContent);
          });
          $(this).val('');
        });

      this._updateSave();

      // Reset SVG
      $('#pkgi-reset-lbl')
        .off('click')
        .on('click', function () {
          self.image = '';
          self._updateSave();
          self._showPreview('');
        });

      // Thumbnail maker toggle
      var toggleBtn = document.getElementById('pkgi-thumb-toggle');
      var panel = document.getElementById('pkgi-thumbmaker');
      if (toggleBtn && panel) {
        toggleBtn.addEventListener('click', function () {
          if (panel.classList.contains('tm-hidden')) {
            panel.classList.remove('tm-hidden');
            if (!self.thumbMaker) {
              self.thumbMaker = new window.ThumbnailMaker(panel);
              self.thumbMaker.init();
              var existing = self._decodeSvg();
              if (existing) {
                self.thumbMaker.loadSVG(existing);
              }
            }
          } else {
            panel.classList.add('tm-hidden');
          }
        });

        $(document).on('click.pkgimg', '#tm-apply', function () {
          if (self.thumbMaker) {
            var svg = self.thumbMaker.exportSVG();
            self.image = encodeURI(svg);
            self._updateSave();
            self._showPreview(svg);
          }
        });

        $(document).on('click.pkgimg', '#tm-close', function () {
          if (panel) {
            panel.classList.add('tm-hidden');
          }
        });
      }
    }

    destroy() {
      $(document).off('click.pkgimg');
      if (this.thumbMaker) {
        this.thumbMaker.destroy();
        this.thumbMaker = null;
      }
    }

    read() {
      return this.image;
    }
  }

  //-------------------------------------------------------------------------
  //-- Helper: RFC 4122-like UUID (ctx.joint not available in forms scope)
  //-------------------------------------------------------------------------
  function generateBlockId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
      /[xy]/g,
      function (c) {
        var r = Math.floor(Math.random() * 16);
        var v = c === 'x' ? r : (r % 4) + 8;
        return v.toString(16);
      }
    );
  }

  //-------------------------------------------------------------------------
  //-- Helper: build a pins array from a Verilog bus-range string "[N:M]"
  //-------------------------------------------------------------------------
  function buildPinsFromRange(range) {
    if (!range) {
      return [{ index: '0', name: '', value: '0' }];
    }
    var m = range.match(/\[(\d+):(\d+)\]/);
    if (!m) {
      return [{ index: '0', name: '', value: '0' }];
    }
    var hi = parseInt(m[1], 10);
    var lo = parseInt(m[2], 10);
    var width = Math.abs(hi - lo) + 1;
    var pins = [];
    for (var pi = width - 1; pi >= 0; pi--) {
      pins.push({ index: String(pi), name: '', value: '0' });
    }
    return pins;
  }

  //-------------------------------------------------------------------------
  //-- RawHtmlField: injects arbitrary HTML into a form tab (no input value)
  //-------------------------------------------------------------------------
  class RawHtmlField {
    constructor(htmlContent) {
      this._html = htmlContent;
    }
    html() {
      return this._html;
    }
    read() {
      return null;
    }
    allowEnter() {
      return true;
    }
  }

  //-------------------------------------------------------------------------
  //-- CLASS: FormGenericEdit — FormBasicCode + "Package Info" + "Add to Collection" tabs
  //-------------------------------------------------------------------------
  class FormGenericEdit extends FormBasicCode {
    constructor(
      portsIn,
      portsOut,
      paramsIn,
      portsInOutLeft,
      portsInOutRight,
      label,
      pkgInfo
    ) {
      super(
        portsIn,
        portsOut,
        paramsIn,
        portsInOutLeft,
        portsInOutRight,
        label
      );

      var pkg = pkgInfo || {};
      var pkgTabLabel = gettextCatalog.getString('Package Info');

      var fieldPkgVersion = new TextField(
        gettextCatalog.getString('Version'),
        pkg.version || '',
        21
      );
      var fieldPkgDesc = new TextField(
        gettextCatalog.getString('Description'),
        pkg.desc || '',
        22
      );
      var fieldPkgAuthor = new TextField(
        gettextCatalog.getString('Author'),
        pkg.author || '',
        23
      );
      var fieldPkgImage = new ImageField(pkg.image || '');

      this.addField(fieldPkgVersion, pkgTabLabel);
      this.addField(fieldPkgDesc, pkgTabLabel);
      this.addField(fieldPkgAuthor, pkgTabLabel);
      this.addField(fieldPkgImage, pkgTabLabel);

      this._pkgVersionField = fieldPkgVersion;
      this._pkgDescField = fieldPkgDesc;
      this._pkgAuthorField = fieldPkgAuthor;
      this._pkgImageField = fieldPkgImage;

      // When editing an existing block, the caller threads the actual dependency
      // design through pkgInfo so _saveToCollection can export it verbatim instead
      // of synthesising a new graph from the port-name fields only.
      this._blockDesign = pkg.blockDesign || null;
      this._blockDependencies = pkg.blockDependencies || null;

      var atcTabLabel = gettextCatalog.getString('Add to Collection');
      var atcHtml = [
        '<div id="atc-container" style="padding:8px">',
        '<p>' + gettextCatalog.getString('Collection') + '</p>',
        '<select id="atc-coll-select" class="ajs-input" style="width:100%"></select>',
        '<p id="atc-new-label" style="display:none;margin-top:8px">' +
          gettextCatalog.getString('New collection name') +
          '</p>',
        '<input id="atc-new-name" class="ajs-input" type="text" value="Custom" style="display:none;width:100%;margin-bottom:8px">',
        '<button id="atc-save-btn" style="margin-top:12px;width:100%;padding:6px;cursor:pointer">' +
          gettextCatalog.getString('Add to Collection') +
          '</button>',
        '</div>',
      ].join('\n');

      this.addField(new RawHtmlField(atcHtml), atcTabLabel);
    }

    get pkgVersion() {
      return this._pkgVersionField ? this._pkgVersionField.read() : '';
    }
    get pkgDesc() {
      return this._pkgDescField ? this._pkgDescField.read() : '';
    }
    get pkgAuthor() {
      return this._pkgAuthorField ? this._pkgAuthorField.read() : '';
    }
    get pkgImage() {
      return this._pkgImageField ? this._pkgImageField.read() : '';
    }

    init() {
      super.init();
      var self = this;

      var select = document.getElementById('atc-coll-select');
      if (!select) {
        return;
      }

      var nodePath = require('path');
      var nodeFs = require('fs');
      var existingColls = [];
      var i;
      try {
        var entries = nodeFs.readdirSync(common.INTERNAL_COLLECTIONS_DIR);
        for (i = 0; i < entries.length; i++) {
          var entryPath = nodePath.join(
            common.INTERNAL_COLLECTIONS_DIR,
            entries[i]
          );
          try {
            if (nodeFs.statSync(entryPath).isDirectory()) {
              existingColls.push(entries[i]);
            }
          } catch (eStat) {}
        }
        existingColls.sort();
      } catch (eDir) {}

      existingColls.forEach(function (coll) {
        var opt = document.createElement('option');
        opt.value = coll;
        opt.textContent = coll;
        select.appendChild(opt);
      });

      var newOpt = document.createElement('option');
      newOpt.value = '__new__';
      newOpt.textContent = gettextCatalog.getString('-- New collection --');
      select.appendChild(newOpt);

      var lbl = document.getElementById('atc-new-label');
      var inp = document.getElementById('atc-new-name');

      var toggle = function () {
        var isNew = select.value === '__new__';
        if (lbl) {
          lbl.style.display = isNew ? '' : 'none';
        }
        if (inp) {
          inp.style.display = isNew ? '' : 'none';
        }
      };
      select.addEventListener('change', toggle);
      toggle();

      var btn = document.getElementById('atc-save-btn');
      if (btn) {
        btn.addEventListener('click', function () {
          var collName =
            select.value === '__new__'
              ? ((inp ? inp.value : '') || '').trim()
              : select.value;
          self._saveToCollection(collName);
        });
      }
    }

    _saveToCollection(collectionName) {
      var nodePath = require('path');
      var nodeFs = require('fs');

      if (!collectionName) {
        alertify.warning(
          gettextCatalog.getString('Collection name cannot be empty')
        );
        return;
      }

      var moduleName = this.label || 'Untitled';
      var pkgVersion = this.pkgVersion || '1.0.0';
      var pkgDesc = this.pkgDesc || '';
      var pkgAuthor = this.pkgAuthor || '';
      var pkgImage = this.pkgImage || '';
      var boardName =
        common.selectedBoard && common.selectedBoard.name
          ? common.selectedBoard.name
          : 'alhambra-ii';

      var graphData;
      var dependencies = {};

      if (this._blockDesign) {
        // Editing an existing block: export the actual live design verbatim so
        // all manually-drawn wires are preserved.
        graphData = {
          blocks:
            (this._blockDesign.graph && this._blockDesign.graph.blocks) || [],
          wires:
            (this._blockDesign.graph && this._blockDesign.graph.wires) || [],
        };
        dependencies = this._blockDependencies || {};
      } else {
        // Creating a new block: synthesise the design from the form values,
        // mirroring buildSubmoduleDesign exactly (wires only when code present).
        var fakeEvt = { cancel: false };
        this.process(fakeEvt);
        if (fakeEvt.cancel) {
          return;
        }

        var portsIn = this.inPortsInfo || [];
        var portsOut = this.outPortsInfo || [];
        var params = this.inParamsInfo || [];
        var inoutLeft = this.inoutLeftPortsInfo || [];
        var inoutRight = this.inoutRightPortsInfo || [];
        var codeStr = (this.code || '').trim();
        var yStep = 80;
        var codeBlockId = generateBlockId();

        var mapPort = function (p) {
          var o = { name: p.name };
          if (p.range) {
            o.range = p.range;
          }
          return o;
        };

        var allBlocks = [];
        var allWires = [];

        portsIn.forEach(function (port, idx) {
          var id = generateBlockId();
          var inputData = {
            name: port.name,
            pins: buildPinsFromRange(port.range),
            virtual: true,
            clock: false,
          };
          if (port.range) {
            inputData.range = port.range;
          }
          allBlocks.push({
            id: id,
            type: 'basic.input',
            data: inputData,
            position: { x: 50, y: 80 + idx * yStep },
          });
          if (codeStr) {
            allWires.push({
              source: { block: id, port: 'out' },
              target: { block: codeBlockId, port: port.name },
            });
          }
        });

        inoutLeft.forEach(function (port, idx) {
          var id = generateBlockId();
          var inputData = {
            name: port.name,
            pins: buildPinsFromRange(port.range),
            virtual: true,
            clock: false,
            inout: true,
          };
          if (port.range) {
            inputData.range = port.range;
          }
          allBlocks.push({
            id: id,
            type: 'basic.input',
            data: inputData,
            position: { x: 50, y: 80 + (portsIn.length + idx) * yStep },
          });
        });

        portsOut.forEach(function (port, idx) {
          var id = generateBlockId();
          var outputData = {
            name: port.name,
            pins: buildPinsFromRange(port.range),
            virtual: true,
          };
          if (port.range) {
            outputData.range = port.range;
          }
          allBlocks.push({
            id: id,
            type: 'basic.output',
            data: outputData,
            position: { x: 750, y: 80 + idx * yStep },
          });
          if (codeStr) {
            allWires.push({
              source: { block: codeBlockId, port: port.name },
              target: { block: id, port: 'in' },
            });
          }
        });

        inoutRight.forEach(function (port, idx) {
          var id = generateBlockId();
          var outputData = {
            name: port.name,
            pins: buildPinsFromRange(port.range),
            virtual: true,
            inout: true,
          };
          if (port.range) {
            outputData.range = port.range;
          }
          allBlocks.push({
            id: id,
            type: 'basic.output',
            data: outputData,
            position: { x: 750, y: 80 + (portsOut.length + idx) * yStep },
          });
        });

        params.forEach(function (param, idx) {
          var id = generateBlockId();
          allBlocks.push({
            id: id,
            type: 'basic.constant',
            data: { name: param.name, value: '', local: false },
            position: { x: 300 + idx * 150, y: 20 },
          });
          if (codeStr) {
            allWires.push({
              source: { block: id, port: 'constant-out' },
              target: { block: codeBlockId, port: param.name },
            });
          }
        });

        if (codeStr) {
          var leftCount = Math.max(
            portsIn.length + inoutLeft.length,
            params.length
          );
          var rightCount = portsOut.length + inoutRight.length;
          var codeHeight = Math.max(
            300,
            Math.max(leftCount, rightCount) * 80 + 160
          );
          allBlocks.push({
            id: codeBlockId,
            type: 'basic.code',
            data: {
              label: moduleName,
              code: codeStr,
              params: params.map(function (p) {
                return { name: p.name };
              }),
              ports: {
                in: portsIn.map(mapPort),
                out: portsOut.map(mapPort),
                inoutLeft: inoutLeft.map(mapPort),
                inoutRight: inoutRight.map(mapPort),
              },
            },
            position: { x: 300, y: 150 },
            size: { width: 800, height: codeHeight },
          });
        }

        graphData = { blocks: allBlocks, wires: allWires };
      }

      var iceProject = {
        version: '1.2',
        package: {
          name: moduleName,
          version: pkgVersion,
          description: pkgDesc,
          author: pkgAuthor,
          image: pkgImage,
        },
        design: { board: boardName, graph: graphData },
        dependencies: dependencies,
      };

      var collDir = nodePath.join(
        common.INTERNAL_COLLECTIONS_DIR,
        collectionName
      );
      var blocksDir = nodePath.join(collDir, 'blocks');

      try {
        nodeFs.mkdirSync(blocksDir, { recursive: true });
      } catch (e) {
        alertify.error('Failed to create collection directory: ' + e);
        return;
      }

      var pkgPath = nodePath.join(collDir, 'package.json');
      if (!nodeFs.existsSync(pkgPath)) {
        var pkgData = {
          name: collectionName,
          version: '1.0.0',
          description: 'Custom collection',
          keywords: ['custom', 'collection'],
          license: 'GPL-2.0',
        };
        nodeFs.writeFileSync(pkgPath, JSON.stringify(pkgData, null, 2));
      }

      var safeName =
        moduleName.replace(/[^a-zA-Z0-9_\-\s]/g, '_').trim() || 'Untitled';
      var filePath = nodePath.join(blocksDir, safeName + '.ice');

      var doSave = function () {
        try {
          nodeFs.writeFileSync(filePath, JSON.stringify(iceProject, null, 2));
          alertify.success(
            gettextCatalog.getString('Block saved to collection') +
              ': ' +
              moduleName
          );

          var pkgCachePath = nodePath.resolve(pkgPath);
          if (require.cache[pkgCachePath]) {
            delete require.cache[pkgCachePath];
          }

          var collections = angular
            .element(document.body)
            .injector()
            .get('collections');
          collections.loadAllCollections();
          collections.selectCollection(collDir);
          iceStudio.updateEnv(common);
        } catch (e) {
          alertify.error(
            gettextCatalog.getString('Failed to save block') + ': ' + e
          );
        }
      };

      if (nodeFs.existsSync(filePath)) {
        alertify.confirm(
          gettextCatalog.getString(
            'A block named "' + safeName + '" already exists. Overwrite?'
          ),
          function () {
            doSave();
          }
        );
      } else {
        doSave();
      }
    }

    display(callback) {
      var self = this;
      super.display(function (evt) {
        callback(evt);
        if (!evt.cancel) {
          self._pkgImageField.destroy();
        }
      });
    }
  }

  //-------------------------------------------------------------------------
  //-- CLASS: FormBasicMemory
  //-------------------------------------------------------------------------
  class FormBasicMemory extends Form {
    constructor(names, value, local) {
      super();

      let namesVal = names !== undefined ? names : '';
      let valueVal = value !== undefined ? value : 10;
      let localVal = local !== undefined ? local : false;

      let field0 = new TextField(
        gettextCatalog.getString('Memory block names'),
        namesVal,
        0
      );

      let options = [
        {
          value: 2,
          label: gettextCatalog.getString('Binary'),
        },
        {
          value: 10,
          label: gettextCatalog.getString('Decimal'),
        },
        {
          value: 16,
          label: gettextCatalog.getString('Hexadecimal'),
        },
      ];

      let field1 = new ComboboxField(
        options,
        gettextCatalog.getString('Address format'),
        valueVal,
        1
      );

      let field2 = new CheckboxField(
        gettextCatalog.getString('Local parameter'),
        localVal,
        2
      );

      this.addField(field0);
      this.addField(field1);
      this.addField(field2);

      this.resultAlert = null;

      this.nameIni = namesVal;
      this.valueIni = valueVal;
      this.localIni = localVal;
    }

    parseFields() {
      this.values = this.readFields();

      const rawMemNames =
        this.values[0] !== null && this.values[0] !== undefined
          ? String(this.values[0])
          : '';
      this.names = Form.parseNames(rawMemNames.replace(/\s+/g, ''));

      this.value = parseInt(this.values[1]);
      this.local = this.values[2];
    }

    getPortInfo(evt) {
      let portInfo;
      this.portInfos = [];

      for (let name of this.names) {
        portInfo = Form.parsePortName(name);

        if (!portInfo) {
          evt.cancel = true;

          this.resultAlert = alertify.warning(
            gettextCatalog.getString('Wrong block name {{name}}', {
              name: name,
            })
          );
          return;
        }

        this.portInfos.push(portInfo);
      }

      evt.cancel = false;
    }

    process(evt) {
      if (this.resultAlert) {
        this.resultAlert.dismiss(false);
      }

      this.parseFields();
      this.getPortInfo(evt);
    }

    newBlocks() {
      let blockList = [];
      let block;

      for (let i in this.portInfos) {
        block = this.newBlock(i);
        blockList.push(block);
      }

      return blockList;
    }

    newBlock(n) {
      let block = new blocks.MemoryBlock(
        this.names[n],
        '',
        this.local,
        this.value
      );

      return block;
    }

    changed() {
      let changedResult =
        this.nameIni !== this.values[0] ||
        this.valueIni !== this.value ||
        this.localIni !== this.local;

      return changedResult;
    }
  }

  //-------------------------------------------------------------------------
  //-- CLASS: FormBasicConstant
  //-------------------------------------------------------------------------
  class FormBasicConstant extends Form {
    constructor(names, local) {
      super();

      let namesVal = names !== undefined ? names : '';
      let localVal = local !== undefined ? local : false;

      let field0 = new TextField(
        gettextCatalog.getString('Constant names'),
        namesVal,
        0
      );

      let field1 = new CheckboxField(
        gettextCatalog.getString('Local parameter'),
        localVal,
        1
      );

      this.addField(field0);
      this.addField(field1);

      this.resultAlert = null;

      this.nameIni = namesVal;
      this.localIni = localVal;
    }

    parseFields() {
      this.values = this.readFields();

      const rawNames =
        this.values[0] !== null && this.values[0] !== undefined
          ? String(this.values[0])
          : '';
      this.names = Form.parseNames(rawNames.replace(/\s+/g, ''));

      this.local = this.values[1];
    }

    getPortInfo(evt) {
      let portInfo;
      this.portInfos = [];

      for (let name of this.names) {
        if (!name) {
          evt.cancel = true;
          this.resultAlert = alertify.warning(
            gettextCatalog.getString('Enter a constant name')
          );
          return;
        }

        portInfo = Form.parsePortName(name);

        if (!portInfo) {
          evt.cancel = true;

          this.resultAlert = alertify.warning(
            gettextCatalog.getString('Wrong block name {{name}}', {
              name: name,
            })
          );
          return;
        }

        this.portInfos.push(portInfo);
      }

      evt.cancel = false;
    }

    process(evt) {
      if (this.resultAlert) {
        this.resultAlert.dismiss(false);
      }

      this.parseFields();
      this.getPortInfo(evt);
    }

    newBlocks() {
      let blockList = [];
      let block;

      for (let i in this.portInfos) {
        block = this.newBlock(i);
        blockList.push(block);
      }

      return blockList;
    }

    newBlock(n) {
      let block = new blocks.ConstantBlock(this.names[n], '', this.local);
      return block;
    }

    changed() {
      let changedResult =
        this.nameIni !== this.values[0] || this.localIni !== this.local;

      return changedResult;
    }
  }

  //-------------------------------------------------------------------------
  //-- CLASS: FormBasicGenerate — Creating/Editing a Generate Frame block
  //-------------------------------------------------------------------------
  class FormBasicGenerate extends Form {
    constructor(portsIn, portsOut, instanceCount, label) {
      super();

      var portsInVal = portsIn !== undefined ? portsIn : '';
      var portsOutVal = portsOut !== undefined ? portsOut : '';
      var instanceCountVal =
        instanceCount !== undefined ? String(instanceCount) : '4';
      var labelVal = label !== undefined ? label : '';

      this._updatingFromText = false;
      this._updatingFromGrid = false;

      var genSettingsLabel = gettextCatalog.getString('Generate Settings');

      var fieldLabel = new TextField(
        gettextCatalog.getString('Name'),
        labelVal,
        9
      );
      this.addField(fieldLabel, genSettingsLabel);
      this._labelField = fieldLabel;
      this.iniLabel = labelVal;

      var fieldCount = new TextField(
        gettextCatalog.getString('Instance count (m)'),
        instanceCountVal,
        10
      );
      this.addField(fieldCount, genSettingsLabel);
      this._countField = fieldCount;
      this.iniInstanceCount = instanceCountVal;

      var modulePortsLabel = gettextCatalog.getString('Module Ports');

      var field0 = new TextField(
        gettextCatalog.getString('Input ports'),
        portsInVal,
        0
      );

      var field1 = new TextField(
        gettextCatalog.getString('Output ports'),
        portsOutVal,
        1
      );

      this.addField(field0, modulePortsLabel);
      this.addField(field1, modulePortsLabel);

      var columns = [
        { type: 'text', title: 'Name', width: 120 },
        {
          type: 'dropdown',
          title: 'Type',
          width: 70,
          source: ['IN', 'OUT'],
        },
        { type: 'numeric', title: 'Bus width', width: 70 },
        {
          type: 'dropdown',
          title: 'Gen Mode',
          width: 100,
          source: ['direct', 'iterable', 'iterative', 'muxed', 'or'],
        },
        { type: 'checkbox', title: 'Enable', width: 55 },
      ];
      var data = [['', 'IN', 1, 'direct', true]];

      var genModesForIn = ['direct', 'iterable'];
      var genModesForOut = ['iterative', 'muxed', 'or'];
      this._genModesForIn = genModesForIn;
      this._genModesForOut = genModesForOut;

      var field7 = new GridField(7, 'gen-ports-table', columns, data);
      field7.onEnter = () => this.onEnterIOPortsTable(field7.table);
      this.addField(field7, modulePortsLabel);
      this._field7 = field7;

      field0.onChange((value) => {
        if (this._updatingFromGrid) {
          return;
        }
        this._updatingFromText = true;
        this.updateGenPortsTable(field7.table, value, 'IN');
        this._updatingFromText = false;
      });
      field1.onChange((value) => {
        if (this._updatingFromGrid) {
          return;
        }
        this._updatingFromText = true;
        this.updateGenPortsTable(field7.table, value, 'OUT');
        this._updatingFromText = false;
      });

      this.code = '';
      this.resultAlert = null;

      this.iniPortsIn = portsInVal;
      this.iniPortsOut = portsOutVal;

      // fieldLabel at [0], fieldCount at [1] in genSettingsLabel tab
      // field0 at [0], field1 at [1] in modulePortsLabel tab
      this.inInput = this.fields[modulePortsLabel][0];
      this.outInput = this.fields[modulePortsLabel][1];
    }

    getPortInfo(names, evt) {
      var portInfo;
      var portInfos = [];

      for (var i = 0; i < names.length; i++) {
        portInfo = Form.parsePortName(names[i]);
        if (!portInfo) {
          evt.cancel = true;
          this.resultAlert = alertify.warning(
            gettextCatalog.getString('Wrong block name {{name}}', {
              name: names[i],
            })
          );
          return;
        }
        if (portInfo.name !== '') {
          portInfos.push(portInfo);
        }
      }
      evt.cancel = false;
      return portInfos;
    }

    parseFields() {
      this.values = this.readFields();

      // Tab "Generate Settings": [0]=label, [1]=instanceCount
      // Tab "Module Ports": [0]=portsIn, [1]=portsOut, [2]=grid, ...
      // Read from text fields by reference
      var inText = this.inInput.read().replace(/\s+/g, '');
      var outText = this.outInput.read().replace(/\s+/g, '');

      this.inPorts = Form.parseNames(inText);
      this.outPorts = Form.parseNames(outText);
    }

    process(evt) {
      if (this.resultAlert) {
        this.resultAlert.dismiss(false);
      }

      this.parseFields();

      this.inPortsInfo = this.getPortInfo(this.inPorts, evt);
      this.outPortsInfo = this.getPortInfo(this.outPorts, evt);

      // Parse instance count
      var countStr = this._countField.read();
      this.instanceCount = parseInt(countStr, 10);
      if (isNaN(this.instanceCount) || this.instanceCount < 2) {
        evt.cancel = true;
        this.resultAlert = alertify.warning(
          gettextCatalog.getString('Instance count must be >= 2')
        );
        return;
      }

      // Check for duplicate port names
      var allPortnames = [];
      var userPorts = (this.inPortsInfo || []).concat(this.outPortsInfo || []);

      for (var i = 0; i < userPorts.length; i++) {
        var portInfo = userPorts[i];
        if (portInfo) {
          if (allPortnames.indexOf(portInfo.name) !== -1) {
            evt.cancel = true;
            this.resultAlert = alertify.warning(
              gettextCatalog.getString('Duplicate port name: {{name}}', {
                name: portInfo.name,
              })
            );
            return;
          }
          allPortnames.push(portInfo.name);
        }
      }

      // Extract genMode from grid table
      this.genModes = {};
      if (this._field7 && this._field7.table) {
        var gridData = this._field7.table.getData();
        for (var j = 0; j < gridData.length; j++) {
          var row = gridData[j];
          var name = row[0] ? row[0].trim() : '';
          var genMode = row[3] || 'direct';
          if (name) {
            this.genModes[name] = genMode;
          }
        }
      }

      // Validate: for iterable/iterative ports, bus width must be a multiple of m
      // (the total width typed by user must divide evenly by m for clean slicing)
      var m = this.instanceCount;
      var allPorts = (this.inPortsInfo || []).concat(this.outPortsInfo || []);
      for (var k = 0; k < allPorts.length; k++) {
        var pInfo = allPorts[k];
        if (!pInfo) {
          continue;
        }
        var pMode = this.genModes[pInfo.name] || '';
        var pSize = pInfo.size || 1;
        if ((pMode === 'iterable' || pMode === 'iterative') && pSize > 1) {
          if (pSize % m !== 0) {
            evt.cancel = true;
            this.resultAlert = alertify.warning(
              gettextCatalog.getString(
                'Port "{{name}}" ({{mode}}): bus width {{size}} must be a multiple of instance count {{m}}',
                { name: pInfo.name, mode: pMode, size: pSize, m: m }
              )
            );
            return;
          }
        }
      }
    }

    changed() {
      var inPortNames = blocks.portsInfo2Str(this.inPortsInfo || []);
      var outPortNames = blocks.portsInfo2Str(this.outPortsInfo || []);
      var countStr = this._countField.read();

      // Check if genModes changed
      var genModesChanged = false;
      if (this.genModes && this._iniGenModes) {
        var keys = Object.keys(this.genModes).concat(
          Object.keys(this._iniGenModes)
        );
        for (var i = 0; i < keys.length; i++) {
          if (this.genModes[keys[i]] !== this._iniGenModes[keys[i]]) {
            genModesChanged = true;
            break;
          }
        }
      } else if (this.genModes || this._iniGenModes) {
        genModesChanged = true;
      }

      return (
        this.iniPortsIn !== inPortNames ||
        this.iniPortsOut !== outPortNames ||
        this.iniInstanceCount !== countStr ||
        this.iniLabel !== this.label ||
        genModesChanged
      );
    }

    get label() {
      return this._labelField ? this._labelField.read() : '';
    }

    init() {
      super.init();

      this._updatingFromText = true;
      if (this.iniPortsIn) {
        this.updateGenPortsTable(this._field7.table, this.iniPortsIn, 'IN');
      }
      if (this.iniPortsOut) {
        this.updateGenPortsTable(this._field7.table, this.iniPortsOut, 'OUT');
      }
      this._updatingFromText = false;

      // Single-click to open dropdown editors
      var tableEl = document.getElementById(this._field7.tableId);
      var table = this._field7.table;
      var self = this;
      if (tableEl && table) {
        tableEl.addEventListener('click', function (e) {
          var td = e.target.closest('td');
          if (td && !td.classList.contains('jss_row')) {
            var colIdx = td.dataset.x;
            if (colIdx === '1' || colIdx === '3' || colIdx === '4') {
              table.openEditor(td, true);
            }
          }
        });
      }

      // Filter Gen Mode dropdown based on port Type
      var genModeCol = table.options.columns[3];
      var allGenModes = genModeCol.source.slice();
      table.options.oneditionstart = function (el, cell, x, y) {
        if (parseInt(x, 10) === 3) {
          var portType = table.getValueFromCoords(1, y);
          var filtered =
            portType === 'OUT' ? self._genModesForOut : self._genModesForIn;
          genModeCol.source = filtered;
        } else {
          genModeCol.source = allGenModes;
        }
      };

      // Validate Gen Mode when Type changes
      var origOnChange = this._field7.onEnter;
      table.options.onchange = function (el, cell, x, y, value) {
        var colIdx = parseInt(x, 10);
        if (colIdx === 1) {
          // Type column changed — reset Gen Mode if invalid
          var currentGenMode = table.getValueFromCoords(3, y);
          var validModes =
            value === 'OUT' ? self._genModesForOut : self._genModesForIn;
          if (validModes.indexOf(currentGenMode) === -1) {
            table.setValueFromCoords(3, y, validModes[0]);
          }
        } else if (colIdx === 3) {
          // Gen Mode column changed — validate against Type
          var portType = table.getValueFromCoords(1, y);
          var allowed =
            portType === 'OUT' ? self._genModesForOut : self._genModesForIn;
          if (allowed.indexOf(value) === -1) {
            table.setValueFromCoords(3, y, allowed[0]);
          }
        }
        if (typeof origOnChange === 'function') {
          origOnChange();
        }
      };
    }

    onEnterIOPortsTable(table) {
      if (this._updatingFromText) {
        return;
      }

      var grouped = { IN: [], OUT: [] };

      table.getData().forEach(function (row) {
        var enabled = row[4] !== false;
        if (!enabled) {
          return;
        }
        var name = row[0] ? row[0].trim() : null;
        var type = row[1] ? row[1].toUpperCase() : null;
        var busWidth = parseInt(row[2], 10);

        if (!name || !type) {
          return;
        }

        if (!isNaN(busWidth) && busWidth > 1) {
          name += '[' + (busWidth - 1) + ':0]';
        }

        if (grouped[type]) {
          grouped[type].push(name);
        }
      });

      this._updatingFromGrid = true;
      this.inInput.write(grouped.IN.join(', '));
      this.outInput.write(grouped.OUT.join(', '));
      this._updatingFromGrid = false;
    }

    updateGenPortsTable(instance, textList, type) {
      var parsedNames = textList
        .split(',')
        .map(function (n) {
          var trimmed = n.trim().replace(/^[@#]+/, '');
          var match = trimmed.match(/^(\w+)\[(\d+):(\d+)\]$/);
          if (match) {
            var portName = match[1];
            var msb = parseInt(match[2], 10);
            var lsb = parseInt(match[3], 10);
            var busWidth = Math.abs(msb - lsb) + 1;
            return { name: portName, busWidth: busWidth };
          }
          return { name: trimmed, busWidth: 1 };
        })
        .filter(function (p) {
          return p.name !== '';
        });

      var defaultGenMode = type === 'IN' ? 'direct' : 'iterative';
      var defaultRow = ['', 'IN', 1, 'direct', true];
      var data = instance.getData();

      var nameToRowIndex = {};
      var usedIndexes = {};

      data.forEach(function (r, index) {
        var n = r[0];
        if (n) {
          nameToRowIndex[n] = index;
        }
      });

      var newNames = parsedNames.map(function (p) {
        return p.name;
      });
      parsedNames.forEach(function (item) {
        if (nameToRowIndex.hasOwnProperty(item.name)) {
          var i = nameToRowIndex[item.name];
          var r = instance.getData()[i];
          if (r[1] !== type) {
            instance.setValueFromCoords(1, i, type);
          }
          if (r[2] !== item.busWidth) {
            instance.setValueFromCoords(2, i, item.busWidth);
          }
          usedIndexes[i] = true;
        } else {
          instance.insertRow([
            item.name,
            type,
            item.busWidth,
            defaultGenMode,
            true,
          ]);
        }
      });

      for (var i = instance.getData().length - 1; i >= 0; i--) {
        var rowData = instance.getData()[i];
        var rowName = rowData[0];
        var rowType = rowData[1];
        if (rowType === type && rowName && newNames.indexOf(rowName) === -1) {
          instance.deleteRow(i);
        }
      }

      var updated = instance.getData();
      var hasEmptyRow = false;

      for (var j = updated.length - 1; j >= 0; j--) {
        var length = instance.getData().length;
        if (!updated[j][0] && length > 1) {
          instance.deleteRow(j);
        } else if (!updated[j][0]) {
          hasEmptyRow = true;
        }
      }

      if (!hasEmptyRow) {
        instance.insertRow([].concat(defaultRow));
      }
    }
  }

  return {
    FormBasicCode: FormBasicCode,
    FormGenericEdit: FormGenericEdit,
    FormBasicMemory: FormBasicMemory,
    FormBasicConstant: FormBasicConstant,
    FormBasicGenerate: FormBasicGenerate,
  };
};
