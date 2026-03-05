//---------------------------------------------------------------------------
//-- Settings/utility form classes
//-- Loaded as a <script> tag before forms.js; exposes window._iceforms.settingsForms
//---------------------------------------------------------------------------
'use strict';

window._iceforms = window._iceforms || {};

//-- Factory: called from inside the Angular service with injected deps
window._iceforms.settingsForms = function (deps) {
  var gettextCatalog = deps.gettextCatalog;
  var common = deps.common;
  var Form = deps.Form;
  var TextField = deps.TextField;
  var ComboboxField = deps.ComboboxField;

  class FormSelectBoard extends Form {
    constructor() {
      super();

      let options = common.boards.map((board) => {
        return {
          value: board.name,
          label: board.info.label,
        };
      });

      let field0 = new ComboboxField(
        options,
        gettextCatalog.getString('Select your board'),
        '',
        0
      );

      this.addField(field0);

      this.resultAlert = null;
    }

    parseFields() {
      this.values = this.readFields();
    }

    process() {
      if (this.resultAlert) {
        this.resultAlert.dismiss(false);
      }

      this.parseFields();
    }
  }

  class FormLogfile extends Form {
    constructor(logfile) {
      super();

      let field0 = new TextField(
        gettextCatalog.getString('Enter the log filename'),
        logfile,
        0
      );

      this.addField(field0);

      this.resultAlert = null;
    }

    parseFields() {
      this.values = this.readFields();
    }

    process() {
      if (this.resultAlert) {
        this.resultAlert.dismiss(false);
      }

      this.parseFields();
    }
  }

  class FormExternalPlugins extends Form {
    constructor(filename) {
      super();

      let field0 = new TextField(
        gettextCatalog.getString('Enter the external plugins path'),
        filename,
        0
      );

      this.addField(field0);

      this.resultAlert = null;
    }

    parseFields() {
      this.values = this.readFields();
    }

    process() {
      if (this.resultAlert) {
        this.resultAlert.dismiss(false);
      }

      this.parseFields();
    }
  }

  class FormPythonEnv extends Form {
    constructor(pythonPath, pipPath) {
      super();

      let field0 = new TextField(
        gettextCatalog.getString('Enter the python path'),
        pythonPath,
        0
      );

      let field1 = new TextField(
        gettextCatalog.getString('Enter the pip path'),
        pipPath,
        1
      );

      this.addField(field0);
      this.addField(field1);

      this.resultAlert = null;
    }

    parseFields() {
      this.values = this.readFields();
    }

    process() {
      if (this.resultAlert) {
        this.resultAlert.dismiss(false);
      }

      this.parseFields();
    }
  }

  class FormExternalCollections extends Form {
    constructor(collectionPath) {
      super();

      let field0 = new TextField(
        gettextCatalog.getString('Enter the external collection path'),
        collectionPath,
        0
      );

      this.addField(field0);

      this.resultAlert = null;
    }

    parseFields() {
      this.values = this.readFields();
    }

    process() {
      if (this.resultAlert) {
        this.resultAlert.dismiss(false);
      }

      this.parseFields();
    }
  }

  return {
    FormSelectBoard: FormSelectBoard,
    FormLogfile: FormLogfile,
    FormExternalPlugins: FormExternalPlugins,
    FormPythonEnv: FormPythonEnv,
    FormExternalCollections: FormExternalCollections,
  };
};
