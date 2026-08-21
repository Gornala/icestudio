/* global jspreadsheet */

//---------------------------------------------------------------------------
//-- Form field primitives + base Form class
//-- Loaded as a <script> tag before forms.js; exposes window._iceforms.fields
//---------------------------------------------------------------------------
'use strict';

window._iceforms = window._iceforms || {};

//-- Factory: called from inside the Angular service with injected deps
window._iceforms.fields = function (deps) {
  var gettextCatalog = deps.gettextCatalog;
  var common = deps.common;

  //---------------------------------------------------------
  //-- LABELFIELD. It represents a static text label in the Form
  //---------------------------------------------------------
  class LabelField {
    constructor(msg, formId) {
      this.msg = msg;
      this.formId = formId;

      this.htmlTemplate = `
        <p id="label%ID%" class="form-label"> %TEXT% </p>
      `;
    }

    html() {
      let html = this.htmlTemplate.replace('%TEXT%', this.msg);
      html = html.replace('%ID%', this.formId);
      return html;
    }

    read() {
      let value = $(`#label${this.formId}`).text();
      return value;
    }
  }

  //---------------------------------------------------------
  //-- TEXTFIELD. It represents a Form Input text field
  //---------------------------------------------------------
  class TextField {
    constructor(msg, value, formId, disabled) {
      this.msg = msg;
      this.value = value;
      this.formId = formId;
      this.disabled = disabled === true;
      this.onChangeCallback = null;

      this.htmlTemplate = `
        <p> %TEXT% </p>
        <input class="ajs-input"
              type="text"
              id="form%ID%"
              value="%VALUE%"
              autocomplete="off" %DISABLED%/>
      `;
    }

    html() {
      let html = this.htmlTemplate.replace('%TEXT%', this.msg);
      html = html.replace('%VALUE%', this.value);
      html = html.replace('%ID%', this.formId);
      //-- A readonly input still returns its value on read(), unlike a
      //-- disabled one, so the form keeps working when the field is locked
      html = html.replace('%DISABLED%', this.disabled ? 'readonly' : '');
      return html;
    }

    read() {
      let value = $(`#form${this.formId}`).val();
      return value;
    }

    write(value) {
      $(`#form${this.formId}`).val(value).trigger('input');
    }

    onChange(callback) {
      this.onChangeCallback = callback;
    }

    init() {
      const selector = `#form${this.formId}`;
      if (this.onChangeCallback && $(selector).length) {
        $(selector).on('input', (e) => {
          this.onChangeCallback($(e.target).val());
        });
      }
    }
  }

  //-------------------------------------------------------------------------
  //--- CHECKBOX FIELD. Input checkbox field
  //-------------------------------------------------------------------------
  class CheckboxField {
    constructor(label, value, formId, disabled) {
      this.label = label;
      this.value = value;
      this.formId = formId;
      this.disabled = disabled === true;

      this.htmlTemplate = `
    <div class="checkbox">
      <label>
        <input type="checkbox" %VALUE% id="form%ID%" %DISABLED%/>
        %LABEL%
      </label>
    </div>
  `;
    }

    html() {
      let disabled = this.disabled ? 'disabled' : '';

      let html = this.htmlTemplate.replace(
        '%VALUE%',
        this.value ? 'checked' : ''
      );

      html = html.replace('%ID%', this.formId);
      html = html.replace('%LABEL%', this.label);
      html = html.replace('%DISABLED%', disabled);

      return html;
    }

    read() {
      return $('#form' + this.formId).prop('checked') || false;
    }
  }

  //-------------------------------------------------------------------------
  //--- COLOR FIELD. Input color dropdown field
  //-------------------------------------------------------------------------
  class ColorField {
    constructor(msg, color) {
      this.msg = msg;
      this.color = color;
      this.colorName = this.getColorName(color);

      this.htmlTemplate = `
    <div class="form-group">
      <label style ="font-weight:normal"> %TEXT% </label>
      <div class="lb-color--dropdown">
        <div class="lb-dropdown-title">

          <!-- The current color is the one found in spec.color -->
          <span class="lb-selected-color color-%COLOR%"
            data-color="%COLOR%"
            data-name="%COLOR_NAME%">
          </span>
          %COLOR_NAME%
          <span class="lb-dropdown-icon"></span>
        </div>

        <div class="lb-dropdown-menu">

        <div class="lb-dropdown-option"
          data-color="indianred"
          data-name="${this.getColorName('indianred')}">
            <span class="lb-option-color color-indianred">
            </span>
            ${this.getColorName('indianred')}
        </div>

        <div class="lb-dropdown-option"
          data-color="red"
          data-name="${this.getColorName('red')}">
            <span class="lb-option-color color-red">
            </span>
            ${this.getColorName('red')}
        </div>

        <div class="lb-dropdown-option"
          data-color="deeppink"
          data-name="${this.getColorName('deeppink')}">
            <span class="lb-option-color color-deeppink">
            </span>
            ${this.getColorName('deeppink')}
        </div>

        <div class="lb-dropdown-option"
          data-color="mediumvioletred"
          data-name="${this.getColorName('mediumvioletred')}">
            <span class="lb-option-color color-mediumvioletred">
            </span>
            ${this.getColorName('mediumvioletred')}
        </div>

        <div class="lb-dropdown-option"
          data-color="coral"
          data-name="${this.getColorName('coral')}">
            <span class="lb-option-color color-coral"></span>
            ${this.getColorName('coral')}
        </div>

        <div class="lb-dropdown-option"
          data-color="orangered"
          data-name="${this.getColorName('orangered')}">
            <span class="lb-option-color color-orangered"></span>
            ${this.getColorName('orangered')}
        </div>

        <div class="lb-dropdown-option"
          data-color="darkorange"
          data-name="${this.getColorName('darkorange')}">
            <span class="lb-option-color color-darkorange"></span>
            ${this.getColorName('darkorange')}
        </div>

        <div class="lb-dropdown-option"
          data-color="gold"
          data-name="${this.getColorName('gold')}">
            <span class="lb-option-color color-gold"></span>
            ${this.getColorName('gold')}
        </div>

        <div class="lb-dropdown-option"
          data-color="yellow"
          data-name="${this.getColorName('yellow')}">
            <span class="lb-option-color color-yellow"></span>
            ${this.getColorName('yellow')}
        </div>

        <div class="lb-dropdown-option"
          data-color="fuchsia"
          data-name=" ${this.getColorName('fuchsia')}">
            <span class="lb-option-color color-fuchsia"></span>
            ${this.getColorName('fuchsia')}
        </div>

        <div class="lb-dropdown-option"
          data-color="slateblue"
          data-name="${this.getColorName('slateblue')}">
            <span class="lb-option-color color-slateblue"></span>
            ${this.getColorName('slateblue')}
        </div>
        <div class="lb-dropdown-option"
          data-color="greenyellow"
          data-name="${this.getColorName('greenyellow')}">
            <span class="lb-option-color color-greenyellow"></span>
            ${this.getColorName('greenyellow')}
        </div>

        <div class="lb-dropdown-option"
          data-color="springgreen"
          data-name="${this.getColorName('springgreen')}">
            <span class="lb-option-color color-springgreen"></span>
            ${this.getColorName('springgreen')}
        </div>

        <div class="lb-dropdown-option"
          data-color="darkgreen"
          data-name="${this.getColorName('darkgreen')}">
            <span class="lb-option-color color-darkgreen"></span>
            ${this.getColorName('darkgreen')}
        </div>

        <div class="lb-dropdown-option"
          data-color="olivedrab"
          data-name="${this.getColorName('olivedrab')}">
            <span class="lb-option-color color-olivedrab">
            </span>
            ${this.getColorName('olivedrab')}
        </div>

        <div class="lb-dropdown-option"
          data-color="lightseagreen"
          data-name="${this.getColorName('lightseagreen')}">
            <span class="lb-option-color color-lightseagreen"></span>
            ${this.getColorName('lightseagreen')}
        </div>

        <div class="lb-dropdown-option"
          data-color="turquoise"
          data-name="${this.getColorName('turquioise')}">
            <span class="lb-option-color color-turquoise"></span>
            ${this.getColorName('turquoise')}
        </div>

        <div class="lb-dropdown-option"
          data-color="steelblue"
          data-name="${this.getColorName('steelblue')}">
            <span class="lb-option-color color-steelblue"></span>
            ${this.getColorName('steelblue')}
        </div>

        <div class="lb-dropdown-option"
          data-color="deepskyblue"
          data-name="${this.getColorName('deepskyblue')}">
            <span class="lb-option-color color-deepskyblue"></span>
            ${this.getColorName('deepskyblue')}
        </div>

        <div class="lb-dropdown-option"
          data-color="royalblue"
          data-name="${this.getColorName('royalblue')}">
            <span class="lb-option-color color-royalblue"></span>
            ${this.getColorName('royalblue')}
        </div>

        <div class="lb-dropdown-option"
          data-color="navy"
          data-name="${this.getColorName('navy')}">
            <span class="lb-option-color color-navy"></span>
            ${this.getColorName('navy')}
        </div>

        <div class="lb-dropdown-option"
          data-color="lightgray"
          data-name="${this.getColorName('lightgray')}">
            <span class="lb-option-color color-lightgray"></span>
            ${this.getColorName('lightgray')}
        </div>

        </div>
      </div>
    </div>
  `;
    }

    getColorName(color) {
      switch (color) {
        case 'fuchsia':
          return gettextCatalog.getString('Fuchsia');

        case 'indianred':
          return gettextCatalog.getString('Indian Red');

        case 'red':
          return gettextCatalog.getString('Red');

        case 'deeppink':
          return gettextCatalog.getString('Deep Pink');

        case 'mediumvioletred':
          return gettextCatalog.getString('Medium Violet Red');

        case 'coral':
          return gettextCatalog.getString('Coral');

        case 'orangered':
          return gettextCatalog.getString('Orange Red');

        case 'darkorange':
          return gettextCatalog.getString('Dark Orange');

        case 'gold':
          return gettextCatalog.getString('Gold');

        case 'yellow':
          return gettextCatalog.getString('Yellow');

        case 'slateblue':
          return gettextCatalog.getString('Slate Blue');

        case 'greenyellow':
          return gettextCatalog.getString('Green Yellow');

        case 'springgreen':
          return gettextCatalog.getString('Spring Green');

        case 'darkgreen':
          return gettextCatalog.getString('Dark Green');

        case 'olivedrab':
          return gettextCatalog.getString('Olive Drab');

        case 'lightseagreen':
          return gettextCatalog.getString('Light Sea Green');

        case 'turquoise':
          return gettextCatalog.getString('Turquoise');

        case 'steelblue':
          return gettextCatalog.getString('Steel Blue');

        case 'deepskyblue':
          return gettextCatalog.getString('Deep Sky Blue');

        case 'royalblue':
          return gettextCatalog.getString('Royal Blue');

        case 'navy':
          return gettextCatalog.getString('Navy');

        case 'lightgray':
          return gettextCatalog.getString('Light Gray');
      }
    }

    html() {
      let html = this.htmlTemplate.replace('%TEXT%', this.msg);

      html = html.replaceAll('%COLOR%', this.color);
      html = html.replaceAll('%COLOR_NAME%', this.colorName);

      return html;
    }

    read() {
      let value = $('.lb-selected-color').data('color');
      return value;
    }
  }

  //-------------------------------------------------------------------------
  //--- Input combobox field
  //-------------------------------------------------------------------------
  class ComboboxField {
    constructor(options, label, value, formId, size) {
      this.label = label;
      this.options = options;
      this.value = value;
      this.formId = formId;
      this.size = size === null || size === undefined ? 'auto' : size;

      this.htmlComboboxOptionTemplate = `
    <option value="%VALUE%" %SELECTED%>
      %LABEL%
    </option>
  `;

      this.htmlTemplate = `
    <div class="form-group" style="width:%SIZE%">
      <label style="font-weight:normal">%LABEL%</label>
      <select class="form-control" id="form%ID%">
        %OPTIONS%
      </select>
    </div>
  `;
    }

    htmlComboboxOption(value, selected, label) {
      let html = this.htmlComboboxOptionTemplate.replace('%VALUE%', value);
      html = html.replace('%SELECTED%', selected);
      html = html.replace('%LABEL%', label);
      return html;
    }

    html() {
      let opts = [];

      this.options.forEach((op) => {
        let selected = this.value === op.value ? 'selected' : '';
        let html = this.htmlComboboxOption(op.value, selected, op.label);
        opts.push(html);
      });

      opts = opts.join('');

      let html = this.htmlTemplate.replace('%LABEL%', this.label);
      html = html.replace('%ID%', this.formId);
      html = html.replace('%OPTIONS%', opts);
      html = html.replace('%SIZE%', this.size);

      return html;
    }

    read() {
      let value = $(`#form${this.formId}`).val();
      return value;
    }

    onChange(callback) {
      $(`#form${this.formId}`).on('change', function () {
        callback($(this).val());
      });
    }
  }

  //---------------------------------------------------------
  //-- BUTTONFIELD. It represents a button in a Form
  //---------------------------------------------------------
  class ButtonField {
    constructor(text, callback, formId) {
      this.text = text;
      this.callback = callback;
      this.formId = formId;

      this.htmlTemplate = `<button id="form%ID%" class="ice-button">%TEXT%</button>`;

      $(document)
        .off('click', `#form${this.formId}`)
        .on('click', `#form${this.formId}`, (event) => {
          event.preventDefault();
          this.callback();
        });
    }

    html() {
      let html = this.htmlTemplate.replace('%TEXT%', this.text);
      html = html.replace('%ID%', this.formId);
      return html;
    }

    read() {
      return '';
    }
  }

  //---------------------------------------------------------
  //-- GRIDFIELD. It represents a grid in a Form
  //---------------------------------------------------------
  class GridField {
    constructor(formId, className, cols, data, readOnly) {
      this.cols = cols;
      this.data = data;
      this.tableId = `table${formId}`;
      this.table = null;
      this.className = className;
      this.onEnter = null;
      this.readOnly = readOnly === true;

      this.htmlTemplate = `
        <div id="%TABLE_ID%" class="%CLASS_NAME%"></div>
      `;
    }

    html() {
      return this.htmlTemplate
        .replace('%TABLE_ID%', `${this.tableId}`)
        .replace('%CLASS_NAME%', `${this.className}`);
    }

    init() {
      //-- readOnly columns make jspreadsheet tag every cell "readonly" and
      //-- disable the checkbox inputs, which is what locks the grid for the
      //-- user.  allowInsertRow/allowDeleteRow stay on regardless: with no
      //-- context menu and no manual insert row there is no user-facing path
      //-- to them, and the form still needs to fill the grid programmatically.
      let cols = this.cols;
      if (this.readOnly) {
        cols = this.cols.map(function (col) {
          return Object.assign({}, col, { readOnly: true });
        });
      }
      this.table = jspreadsheet(document.getElementById(this.tableId), {
        data: this.data,
        columns: cols,
        rowDrag: !this.readOnly,
        allowInsertRow: true,
        allowDeleteRow: true,
        allowInsertColumn: false,
        allowManualInsertRow: false,
        tableOverflow: true,
        tableHeight: '200px',
        contextMenu: false,
        onchange: () => {
          if (typeof this.onEnter === 'function') {
            this.onEnter(this);
          }
        },
      });
    }

    read() {
      return this.table.getData();
    }

    allowEnter() {
      const editor = document.querySelector(`#${this.tableId} .editor input`);
      if (editor) {
        editor.blur();
        if (typeof this.onEnter === 'function') {
          this.onEnter(this);
        }
        return false;
      }
      return true;
    }
  }

  //-------------------------------------------------------------------------
  //-- BASE Form class
  //-------------------------------------------------------------------------
  class Form {
    constructor() {
      this.fields = [];
    }

    //------------------------------------------------------
    //-- Parse the block names. The spaces are removed
    //-- and the individual names obtained (if they are
    //-- separated by comas)
    //------------------------------------------------------
    static parseNames(names) {
      let text = names.trim().replace(/\s+/g, '');
      text = text.replace(/\s*,\s*/g, ',');
      let finalNames = text.split(',');
      return finalNames;
    }

    static parsePortName(portName) {
      let pattern = common.PATTERN_PORT_LABEL;
      return Form.parseNameWithPattern(portName, pattern);
    }

    static parseNameWithPattern(portName, pattern) {
      let match = pattern.exec(portName);

      if (match) {
        if (match[0] === match.input) {
          let portInfo = {};

          portInfo.name = match[1] || '';
          portInfo.rangestr = match[2];

          if (portInfo.rangestr) {
            let left = parseInt(match[3]);
            let right = parseInt(match[4]);
            if (/\D/.test(left) || /\D/.test(right)) {
              portInfo.size = 2;
              portInfo.isParametric = true;
            } else {
              portInfo.size = Math.abs(left - right) + 1;
              portInfo.isParametric = false;
            }
          } else {
            portInfo.size = 1;
          }
          return portInfo;
        }
      }
      return null;
    }

    addField(field, tab) {
      if (tab === null || tab === undefined) {
        this.fields.push(field);
      } else {
        if (Array.isArray(this.fields)) {
          this.fields = {};
        }
        if (!this.fields[tab]) {
          this.fields[tab] = [];
        }
        this.fields[tab].push(field);
      }
    }

    readFields() {
      let values = [];

      if (Array.isArray(this.fields)) {
        this.fields.forEach((field) => {
          let value = field.read();
          values.push(value);
        });
      } else {
        Object.keys(this.fields).forEach((tab) => {
          this.fields[tab].forEach((field) => {
            let value = field.read();
            values.push(value);
          });
        });
      }

      return values;
    }

    readField(index) {
      if (Array.isArray(this.fields)) {
        const field = this.fields[index];
        return field ? field.read() : undefined;
      } else {
        const flatFields = Object.values(this.fields).flat();
        const field = flatFields[index];
        return field ? field.read() : undefined;
      }
    }

    html() {
      let formHtml = [];
      let fieldHtml;

      formHtml.push('<div>');

      if (Array.isArray(this.fields)) {
        this.fields.forEach((field) => {
          fieldHtml = field.html();
          formHtml.push(fieldHtml);
        });
      } else {
        formHtml.push('<ul class="tabs">');
        Object.keys(this.fields).forEach((tab, index) => {
          let activeClass = index === 0 ? 'active' : '';
          formHtml.push(
            `<li class="tab-item ${activeClass}" data-tab="${tab}">${tab}</li>`
          );
        });
        formHtml.push('</ul>');

        Object.keys(this.fields).forEach((tab, index) => {
          let activeClass = index === 0 ? 'active' : '';
          formHtml.push(
            `<div class="tab-content ${activeClass}" data-content="${tab}">`
          );

          this.fields[tab].forEach((field) => {
            fieldHtml = field.html();
            formHtml.push(fieldHtml);
          });

          formHtml.push('</div>');
        });
      }

      formHtml.push('</div>');

      let html = formHtml.join('\n');
      return html;
    }

    init() {
      if (Array.isArray(this.fields)) {
        this.fields.forEach((field) => {
          if ('init' in field) {
            field.init();
          }
        });
      } else {
        Object.keys(this.fields).forEach((tab) => {
          this.fields[tab].forEach((field) => {
            if ('init' in field) {
              field.init();
            }
          });
        });
      }
    }

    display(callback) {
      let html = this.html();
      const self = this;

      const dialog = alertify.confirm();
      dialog.setContent(html);

      dialog.set('onok', function (evt) {
        let allow = true;

        if (Array.isArray(self.fields)) {
          self.fields.forEach((field) => {
            if (typeof field.allowEnter === 'function' && !field.allowEnter()) {
              allow = false;
            }
          });
        } else {
          Object.keys(self.fields).forEach((tab) => {
            self.fields[tab].forEach((field) => {
              if (
                typeof field.allowEnter === 'function' &&
                !field.allowEnter()
              ) {
                allow = false;
              }
            });
          });
        }

        if (allow) {
          try {
            callback(evt);
          } catch (e) {
            console.error('[icestudio] Form OK error:', e);
            evt.cancel = true;
          }
        } else {
          evt.cancel = true;
        }
      });

      dialog.set('oncancel', function (/*evt*/) {});

      dialog.set('onshow', function () {
        self.init();
      });

      dialog.show();

      $(document).on('click', '.tabs .tab-item', function () {
        const selectedTab = $(this).attr('data-tab');

        $('.tabs .tab-item').removeClass('active');
        $(this).addClass('active');

        $('.tab-content').removeClass('active').hide();
        $(`.tab-content[data-content="${selectedTab}"]`)
          .addClass('active')
          .show();
      });
    }
  }

  return {
    LabelField: LabelField,
    TextField: TextField,
    CheckboxField: CheckboxField,
    ColorField: ColorField,
    ComboboxField: ComboboxField,
    ButtonField: ButtonField,
    GridField: GridField,
    Form: Form,
  };
};
