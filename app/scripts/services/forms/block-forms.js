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

  return {
    FormBasicCode: FormBasicCode,
    FormBasicMemory: FormBasicMemory,
    FormBasicConstant: FormBasicConstant,
  };
};
