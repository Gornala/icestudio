//---------------------------------------------------------------------------
//-- Forms management — orchestrator
//-- Sub-files (loaded as <script> tags before this one) expose factories via
//-- window._iceforms.fields / portForms / blockForms / settingsForms
//---------------------------------------------------------------------------
'use strict';

angular
  .module('icestudio')
  .service(
    'forms',
    function (gettextCatalog, common, profile, blocks, utils, nodeFs) {
      //-- Build field primitives + base Form class
      var _fields = window._iceforms.fields({
        gettextCatalog: gettextCatalog,
        common: common,
      });
      var LabelField = _fields.LabelField;
      var TextField = _fields.TextField;
      var CheckboxField = _fields.CheckboxField;
      var ColorField = _fields.ColorField;
      var ComboboxField = _fields.ComboboxField;
      var ButtonField = _fields.ButtonField;
      var GridField = _fields.GridField;
      var Form = _fields.Form;

      //-- Build port/label form classes
      var _portForms = window._iceforms.portForms({
        gettextCatalog: gettextCatalog,
        common: common,
        blocks: blocks,
        Form: Form,
        TextField: TextField,
        CheckboxField: CheckboxField,
        ColorField: ColorField,
      });
      var FormBasicInput = _portForms.FormBasicInput;
      var FormBasicOutput = _portForms.FormBasicOutput;
      var FormBasicInputLabel = _portForms.FormBasicInputLabel;
      var FormBasicOutputLabel = _portForms.FormBasicOutputLabel;
      var FormBasicPairedLabels = _portForms.FormBasicPairedLabels;

      //-- Build block form classes
      var _blockForms = window._iceforms.blockForms({
        gettextCatalog: gettextCatalog,
        common: common,
        profile: profile,
        blocks: blocks,
        utils: utils,
        nodeFs: nodeFs,
        Form: Form,
        TextField: TextField,
        CheckboxField: CheckboxField,
        ComboboxField: ComboboxField,
        ButtonField: ButtonField,
        GridField: GridField,
        LabelField: LabelField,
      });
      var FormBasicCode = _blockForms.FormBasicCode;
      var FormBasicMemory = _blockForms.FormBasicMemory;
      var FormBasicConstant = _blockForms.FormBasicConstant;
      var FormBasicGenerate = _blockForms.FormBasicGenerate;

      //-- Build JSON Input form class
      var _jsonForms = window._iceforms.jsonForms({
        gettextCatalog: gettextCatalog,
        blocks: blocks,
        Form: Form,
        TextField: TextField,
      });
      var FormBasicJsonInput = _jsonForms.FormBasicJsonInput;

      //-- Build JSON Output form class
      var _jsonOutputForms = window._iceforms.jsonOutputForms({
        gettextCatalog: gettextCatalog,
        blocks: blocks,
        Form: Form,
        TextField: TextField,
        ComboboxField: ComboboxField,
      });
      var FormBasicJsonOutput = _jsonOutputForms.FormBasicJsonOutput;

      //-- Build settings form classes
      var _settingsForms = window._iceforms.settingsForms({
        gettextCatalog: gettextCatalog,
        common: common,
        Form: Form,
        TextField: TextField,
        ComboboxField: ComboboxField,
      });
      var FormSelectBoard = _settingsForms.FormSelectBoard;
      var FormLogfile = _settingsForms.FormLogfile;
      var FormExternalPlugins = _settingsForms.FormExternalPlugins;
      var FormPythonEnv = _settingsForms.FormPythonEnv;
      var FormExternalCollections = _settingsForms.FormExternalCollections;

      //--------------------------------------------------------------
      //-- Public classes
      this.Form = Form;
      this.TextField = TextField;
      this.CheckboxField = CheckboxField;
      this.FormBasicInput = FormBasicInput;
      this.FormBasicOutput = FormBasicOutput;
      this.FormBasicInputLabel = FormBasicInputLabel;
      this.FormBasicOutputLabel = FormBasicOutputLabel;
      this.FormBasicPairedLabels = FormBasicPairedLabels;
      this.FormBasicCode = FormBasicCode;
      this.FormBasicMemory = FormBasicMemory;
      this.FormBasicConstant = FormBasicConstant;
      this.FormBasicGenerate = FormBasicGenerate;
      this.FormBasicJsonInput = FormBasicJsonInput;
      this.FormBasicJsonOutput = FormBasicJsonOutput;
      this.FormSelectBoard = FormSelectBoard;
      this.FormLogfile = FormLogfile;
      this.FormExternalPlugins = FormExternalPlugins;
      this.FormPythonEnv = FormPythonEnv;
      this.FormExternalCollections = FormExternalCollections;
    }
  );
