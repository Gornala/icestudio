//-- jshint rules
/* jshint ignore: start */

/* --global sha1, aceFontSize, WIRE_WIDTH */

'use strict';

// JSON Input block — reads an external JSON file, exposes values as bottom ports

joint.shapes.ice.JsonInput = joint.shapes.ice.Model.extend({
  defaults: joint.util.deepSupplement(
    {
      type: 'ice.JsonInput',
      z: 10,
      size: {
        width: 192,
        height: 160,
      },
    },
    joint.shapes.ice.Model.prototype.defaults
  ),
});

joint.shapes.ice.JsonInputView = joint.shapes.ice.ModelView.extend({
  initialize: function () {
    _.bindAll(this, 'updateBox');
    joint.dia.ElementView.prototype.initialize.apply(this, arguments);

    var id = sha1(this.model.get('id')).toString().substring(0, 6);
    var editorLabel = 'jsoninputeditor' + id;

    var editorTheme;
    if (global.uiTheme === 'dark') {
      editorTheme = 'monokai';
    } else {
      editorTheme = 'chrome';
    }

    this.$box = $(
      joint.util.template(
        '\
      <div class="json-block json-input-block">\
        <div class="json-content">\
          <div class="json-header">\
            <label class="json-name"></label>\
            <button class="json-btn json-btn-menu" title="Configure">&#8801;</button>\
            <button class="json-btn json-btn-reload" title="Reload from file">&#8635;</button>\
          </div>\
        </div>\
        <div class="json-editor" id="' +
          editorLabel +
          '"></div>\
        <script>\
          var ' +
          editorLabel +
          ' = ace.edit("' +
          editorLabel +
          '");\
          ' +
          editorLabel +
          '.setTheme("ace/theme/' +
          editorTheme +
          '");\
          ' +
          editorLabel +
          '.setHighlightActiveLine(false);\
          ' +
          editorLabel +
          '.setHighlightGutterLine(false);\
          ' +
          editorLabel +
          '.setAutoScrollEditorIntoView(true);\
          ' +
          editorLabel +
          '.renderer.setShowGutter(false);\
          ' +
          editorLabel +
          '.renderer.$cursorLayer.element.style.opacity = 0;\
          ' +
          editorLabel +
          '.session.setMode("ace/mode/json");\
        </script>\
        <div class="resizer"/></div>\
      </div>\
      '
      )()
    );

    this.editorSelector = this.$box.find('.json-editor');
    this.contentSelector = this.$box.find('.json-content');
    this.headerSelector = this.$box.find('.json-header');

    this.model.on('change', this.updateBox, this);
    this.model.on('remove', this.removeBox, this);

    this.listenTo(this.model, 'process:ports', this.update);
    joint.dia.ElementView.prototype.initialize.apply(this, arguments);

    this.$box.find('.json-btn').on('mousedown click', function (event) {
      event.stopPropagation();
    });
    this.editorSelector.on('mousedown click', function (event) {
      event.stopPropagation();
    });

    this.updateBox();

    this.updating = false;
    this.prevZoom = 0;

    var self = this;
    var fs = require('fs');

    this.editor = ace.edit(this.editorSelector[0]);
    this.editor.setReadOnly(true);
    this.updateScrollStatus(false);
    this.editor.$blockScrolling = Infinity;
    this.editor.commands.removeCommand('touppercase');

    this.editor.on('focus', function () {
      self.updateScrollStatus(true);
      $(document).trigger('disableSelected');
    });
    this.editor.on('blur', function () {
      self.updateScrollStatus(false);
    });
    this.editor.on('mousewheel', function (event) {
      if (
        document.activeElement.parentNode.id === self.editorSelector.attr('id')
      ) {
        event.stopPropagation();
      } else {
        event.preventDefault();
      }
    });

    // Load the JSON file from disk (synchronously)
    var doLoad = function (showAlert) {
      var filepath = self.model.get('data').path;
      if (!filepath) {
        if (showAlert) {
          alertify.warning(
            'No file path configured. Double-click the block to configure.'
          );
        }
        return;
      }
      try {
        var content = fs.readFileSync(filepath, 'utf8');
        self.model.attributes.data.content = content;
        self.updating = true;
        self.editor.session.setValue(content);
        setTimeout(function () {
          self.updating = false;
        }, 10);
        if (showAlert) {
          alertify.success('JSON loaded: ' + filepath);
        }
      } catch (e) {
        console.warn('JSON input block: could not read ' + filepath, e);
        if (showAlert) {
          alertify.error('Could not load JSON: ' + e.message);
        }
      }
    };

    // Configure button: trigger dblclick on the block
    this.$box.find('.json-btn-menu').on('click', function () {
      self.paper.trigger('cell:pointerdblclick', self, {}, 0, 0);
    });

    // Reload button: re-read the file with user feedback
    this.$box.find('.json-btn-reload').on('click', function () {
      doLoad(true);
    });

    // Subscribe to global load event (triggered on save/verify/build/upload)
    iceStudio.bus.events.subscribe('graph:loadJsonInputs', function () {
      doLoad(false);
    });

    this.setupResizer();

    // Load on init (if a path is already configured)
    this.apply({ ini: true });
    doLoad(false);
  },

  apply: function (opt) {
    this.applyName();
    this.applyContent(opt);
    if (this.editor) {
      this.editor.resize();
    }
  },

  applyName: function () {
    var name = this.model.get('data').name;
    this.$box.find('.json-name').text(name || 'json_input');
  },

  applyContent: function (opt) {
    this.updating = true;
    var data = this.model.get('data');
    opt = opt || {};
    if (opt.ini) {
      this.editor.session.setValue(data.content || '{}');
    }
    setTimeout(
      function (self) {
        self.updating = false;
      },
      10,
      this
    );
  },

  update: function () {
    this.renderPorts();
    if (this.editor) {
      this.editor.setReadOnly(true);
    }
    joint.dia.ElementView.prototype.update.apply(this, arguments);
  },

  updateBox: function () {
    var bbox = this.model.getBBox();
    var state = this.model.get('state');

    var pendingTasks = [];
    var editorUpdated = false;

    if (this.editor) {
      if (this.prevZoom !== state.zoom) {
        this.prevZoom = state.zoom;
        editorUpdated = true;

        pendingTasks.push(
          {
            e: this.editorSelector[0],
            property: 'top',
            value: 30 * state.zoom + 'px',
          },
          {
            e: this.editorSelector[0],
            property: 'margin',
            value: 7 * state.zoom + 'px',
          },
          {
            e: this.editorSelector[0],
            property: 'border-radius',
            value: 5 * state.zoom + 'px',
          },
          {
            e: this.editorSelector[0],
            property: 'border-width',
            value: state.zoom + 0.5 + 'px',
          }
        );

        var textLayers = this.$box[0].querySelectorAll('.ace_text-layer');
        for (var i = 0; i < textLayers.length; i++) {
          pendingTasks.push({
            e: textLayers[i],
            property: 'padding',
            value: '0px ' + Math.round(4 * state.zoom) + 'px',
          });
        }
      }

      if (editorUpdated) {
        this.editor.setFontSize(Math.round(aceFontSize * state.zoom));
        this.editor.renderer.$cursorLayer.$padding = Math.round(4 * state.zoom);
      }

      this.editor.resize();
    }

    pendingTasks.push(
      {
        e: this.contentSelector[0],
        property: 'left',
        value: Math.round((bbox.width / 2.0) * (state.zoom - 1)) + 'px',
      },
      {
        e: this.contentSelector[0],
        property: 'top',
        value: Math.round((bbox.height / 2.0) * (state.zoom - 1)) + 'px',
      },
      {
        e: this.contentSelector[0],
        property: 'width',
        value: Math.round(bbox.width) + 'px',
      },
      {
        e: this.contentSelector[0],
        property: 'height',
        value: Math.round(bbox.height) + 'px',
      },
      {
        e: this.contentSelector[0],
        property: 'transform',
        value: 'scale(' + state.zoom + ')',
      }
    );

    pendingTasks.push(
      {
        e: this.$box[0],
        property: 'left',
        value: bbox.x * state.zoom + state.pan.x + 'px',
      },
      {
        e: this.$box[0],
        property: 'top',
        value: bbox.y * state.zoom + state.pan.y + 'px',
      },
      {
        e: this.$box[0],
        property: 'width',
        value: bbox.width * state.zoom + 'px',
      },
      {
        e: this.$box[0],
        property: 'height',
        value: bbox.height * state.zoom + 'px',
      }
    );

    requestAnimationFrame(() => {
      for (let task of pendingTasks) {
        if (task.e) {
          task.e.style[task.property] = task.value;
        }
      }
    });
  },
});

/* jshint ignore: end */
