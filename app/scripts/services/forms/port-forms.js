//---------------------------------------------------------------------------
//-- Port and Label form classes
//-- Loaded as a <script> tag before forms.js; exposes window._iceforms.portForms
//---------------------------------------------------------------------------
'use strict';

window._iceforms = window._iceforms || {};

//-- Factory: called from inside the Angular service with injected deps
window._iceforms.portForms = function (deps) {
  var gettextCatalog = deps.gettextCatalog;
  var common = deps.common;
  var blocks = deps.blocks;
  var Form = deps.Form;
  var TextField = deps.TextField;
  var CheckboxField = deps.CheckboxField;
  var ColorField = deps.ColorField;

  //-------------------------------------------------------------
  //-- Class for modeling the Forms for the Input and Output
  //--    ports. All their common stuff is place here
  //-------------------------------------------------------------
  class FormBasicPort extends Form {
    constructor(msg, name, virtual, disabled) {
      super();

      let nameVal = name !== undefined ? name : '';
      let virtualVal = virtual !== undefined ? virtual : false;
      let disabledVal = disabled !== undefined ? disabled : false;

      let field0 = new TextField(msg, nameVal, 0);

      let field1 = new CheckboxField(
        gettextCatalog.getString('FPGA pin'),
        !virtualVal,
        1,
        disabledVal
      );

      this.addField(field0);
      this.addField(field1);

      this.resultAlert = null;
    }

    parseFields() {
      this.values = this.readFields();
      this.names = Form.parseNames(this.values[0]);
      this.virtual = !this.values[1];
    }

    getPortInfo(evt) {
      let portInfo;
      this.portInfos = [];

      for (let name of this.names) {
        portInfo = Form.parseNameWithPattern(name, common.PATTERN_PORT_LABEL);
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
  }

  class FormBasicInput extends FormBasicPort {
    constructor(name, virtual, clock, disabled, inoutValue) {
      let nameVal = name !== undefined ? name : '';
      let virtualVal = virtual !== undefined ? virtual : false;
      let clockVal = clock !== undefined ? clock : false;
      let disabledVal = disabled !== undefined ? disabled : false;

      super(
        gettextCatalog.getString('Input port names'),
        nameVal,
        virtualVal,
        disabledVal
      );

      this.type = blocks.BASIC_INPUT;

      let field2 = new CheckboxField(
        gettextCatalog.getString('Show clock'),
        clockVal,
        2
      );

      this.addField(field2);

      if (inoutValue !== undefined) {
        let field3 = new CheckboxField(
          gettextCatalog.getString('"Inout" pin'),
          inoutValue,
          3
        );

        this.addField(field3);
      }

      this.nameIni = nameVal;
      this.virtualIni = virtualVal;
      this.clockIni = clockVal;
      if (inoutValue !== undefined) {
        this.inoutIni = inoutValue;
      }
    }

    process(evt) {
      super.process(evt);

      this.clock = this.values[2];
      this.inout = this.values[3];

      for (let portInfo of this.portInfos) {
        if (portInfo.rangestr && this.clock) {
          evt.cancel = true;

          this.resultAlert = alertify.warning(
            gettextCatalog.getString('Clock not allowed for data buses')
          );

          return;
        }
      }

      this.changed =
        this.nameIni !== this.values[0] ||
        this.virtualIni !== this.virtual ||
        this.clockIni !== this.clock ||
        (this.hasOwnProperty('inoutIni') && this.inoutIni !== this.inout);
    }

    newBlock(n) {
      let portInfo = this.portInfos[n];

      let pins = blocks.getPins(portInfo);
      let block = new blocks.InputPortBlock(
        portInfo.name,
        this.virtual,
        portInfo.rangestr,
        pins,
        this.clock,
        this.inout,
        portInfo.isParametric
      );

      return block;
    }
  }

  class FormBasicOutput extends FormBasicPort {
    constructor(name, virtual, disabled, inoutValue) {
      let nameVal = name !== undefined ? name : '';
      let virtualVal = virtual !== undefined ? virtual : false;
      let disabledVal = disabled !== undefined ? disabled : false;

      super(
        gettextCatalog.getString('Output port names'),
        nameVal,
        virtualVal,
        disabledVal
      );

      this.type = blocks.BASIC_OUTPUT;

      if (inoutValue !== undefined) {
        let field2 = new CheckboxField(
          gettextCatalog.getString('"Inout" pin'),
          inoutValue,
          2
        );

        this.addField(field2);
      }

      this.nameIni = nameVal;
      this.virtualIni = virtualVal;
      if (inoutValue !== undefined) {
        this.inoutIni = inoutValue;
      }
    }

    process(evt) {
      super.process(evt);

      this.inout = this.values[2];

      this.changed =
        this.nameIni !== this.values[0] ||
        this.virtualIni !== this.virtual ||
        (this.hasOwnProperty('inoutIni') && this.inoutIni !== this.inout);
    }

    newBlock(n) {
      let portInfo = this.portInfos[n];

      let pins = blocks.getPins(portInfo);

      let block = new blocks.OutputPortBlock(
        portInfo.name,
        this.virtual,
        portInfo.rangestr,
        pins,
        this.inout
      );

      return block;
    }
  }

  //-------------------------------------------------------------
  //-- Class for modeling the Forms for the Input and Output
  //-- labels. All their common stuff is place here
  //-------------------------------------------------------------
  class FormBasicLabel extends Form {
    constructor(msg, name, color) {
      super();

      let nameVal = name !== undefined ? name : '';
      let colorVal = color !== undefined ? color : 'fuchsia';

      let field0 = new TextField(msg, nameVal, 0);

      let field1 = new ColorField(
        gettextCatalog.getString('Choose a color:'),
        colorVal
      );

      this.addField(field0);
      this.addField(field1);

      this.resultAlert = null;

      this.nameIni = nameVal;
      this.colorIni = colorVal;
    }

    parseFields() {
      this.values = this.readFields();
      this.names = Form.parseNames(this.values[0]);
      this.color = this.values[1];
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
  }

  class FormBasicInputLabel extends FormBasicLabel {
    constructor(name, color) {
      let nameVal = name !== undefined ? name : '';
      let colorVal = color !== undefined ? color : 'fuchsia';

      super(gettextCatalog.getString('Output labels'), nameVal, colorVal);

      this.type = blocks.BASIC_INPUT_LABEL;
    }

    process(evt) {
      super.process(evt);

      this.changed =
        this.nameIni !== this.values[0] || this.colorIni !== this.color;
    }

    newBlock(n) {
      let portInfo = this.portInfos[n];

      let pins = blocks.getPins(portInfo);

      let block = new blocks.InputLabelBlock(
        portInfo.name,
        portInfo.rangestr,
        this.color,
        pins
      );

      return block;
    }
  }

  class FormBasicOutputLabel extends FormBasicLabel {
    constructor(name, color) {
      let nameVal = name !== undefined ? name : '';
      let colorVal = color !== undefined ? color : 'fuchsia';

      super(gettextCatalog.getString('Input labels'), nameVal, colorVal);

      this.type = blocks.BASIC_OUTPUT_LABEL;
    }

    process(evt) {
      super.process(evt);

      this.changed =
        this.nameIni !== this.values[0] || this.colorIni !== this.color;
    }

    newBlock(n) {
      let portInfo = this.portInfos[n];

      let pins = blocks.getPins(portInfo);

      let block = new blocks.OutputLabelBlock(
        portInfo.name,
        portInfo.rangestr,
        this.color,
        pins
      );

      return block;
    }
  }

  class FormBasicPairedLabels extends FormBasicLabel {
    constructor(name, color) {
      let nameVal = name !== undefined ? name : '';
      let colorVal = color !== undefined ? color : 'fuchsia';

      super(
        gettextCatalog.getString('Names of the paired labels'),
        nameVal,
        colorVal
      );

      this.type = blocks.BASIC_PAIRED_LABEL;
    }

    newBlock(n) {
      let portInfo = this.portInfos[n];

      let pins = blocks.getPins(portInfo);

      let block1 = new blocks.InputLabelBlock(
        portInfo.name,
        portInfo.rangestr,
        this.color,
        pins
      );

      let block2 = new blocks.OutputLabelBlock(
        portInfo.name,
        portInfo.rangestr,
        this.color,
        pins
      );

      let pairedLabels = [block1, block2];

      return pairedLabels;
    }
  }

  return {
    FormBasicPort: FormBasicPort,
    FormBasicInput: FormBasicInput,
    FormBasicOutput: FormBasicOutput,
    FormBasicLabel: FormBasicLabel,
    FormBasicInputLabel: FormBasicInputLabel,
    FormBasicOutputLabel: FormBasicOutputLabel,
    FormBasicPairedLabels: FormBasicPairedLabels,
  };
};
