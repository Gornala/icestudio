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
    FormBasicMemory: FormBasicMemory,
    FormBasicConstant: FormBasicConstant,
    FormBasicGenerate: FormBasicGenerate,
  };
};
