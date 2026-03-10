//-- jshint rules
/* jshint ignore: start */

/* --global sha1, aceFontSize, WIRE_WIDTH */

'use strict';

// JSON block

joint.shapes.ice.Json = joint.shapes.ice.Model.extend({
  defaults: joint.util.deepSupplement(
    {
      type: 'ice.Json',
      z: 10,
      size: {
        width: 192,
        height: 160,
      },
    },
    joint.shapes.ice.Model.prototype.defaults
  ),
});

joint.shapes.ice.JsonView = joint.shapes.ice.ModelView.extend({
  initialize: function () {
    _.bindAll(this, 'updateBox');
    joint.dia.ElementView.prototype.initialize.apply(this, arguments);

    var id = sha1(this.model.get('id')).toString().substring(0, 6);
    var editorLabel = 'jsoneditor' + id;

    var editorTheme;
    if (global.uiTheme === 'dark') {
      editorTheme = 'monokai';
    } else {
      editorTheme = 'chrome';
    }

    this.$box = $(
      joint.util.template(
        '\
      <div class="json-block">\
        <div class="json-content">\
          <div class="json-header">\
            <label class="json-name"></label>\
            <span class="json-type-badge"></span>\
            <button class="json-btn json-btn-menu" title="Configure">&#8801;</button>\
            <button class="json-btn json-btn-save" title="Save As">&#128190;</button>\
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

    // Prevent paper from handling pointerdown
    this.editorSelector.on('mousedown click', function (event) {
      event.stopPropagation();
    });
    this.$box.find('.json-btn').on('mousedown click', function (event) {
      event.stopPropagation();
    });

    this.updateBox();

    this.updating = false;
    this.prevZoom = 0;
    this.deltas = [];
    this.counter = 0;
    this.timer = null;
    var undoGroupingInterval = 200;

    var self = this;
    this.editor = ace.edit(this.editorSelector[0]);
    this.updateScrollStatus(false);
    this.editor.$blockScrolling = Infinity;
    this.editor.commands.removeCommand('touppercase');
    this.editor.session.on('change', function (delta) {
      if (!self.updating) {
        if (Date.now() - self.counter < undoGroupingInterval) {
          clearTimeout(self.timer);
        }
        self.deltas = self.deltas.concat([delta]);
        self.timer = setTimeout(function () {
          var deltas = JSON.parse(JSON.stringify(self.deltas));
          self.model.set('deltas', deltas);
          self.deltas = [];
          self.model.attributes.data.content = self.editor.session.getValue();
        }, undoGroupingInterval);
        self.counter = Date.now();
      }
    });
    this.editor.on('focus', function () {
      self.updateScrollStatus(true);
      $(document).trigger('disableSelected');
      self.editor.setHighlightActiveLine(true);
      self.editor.setHighlightGutterLine(true);
      self.editor.renderer.$cursorLayer.element.style.opacity = 1;
    });
    this.editor.on('blur', function () {
      self.updateScrollStatus(false);
      var selection = self.editor.session.selection;
      if (selection) {
        selection.clearSelection();
      }
      self.editor.setHighlightActiveLine(false);
      self.editor.setHighlightGutterLine(false);
      self.editor.renderer.$cursorLayer.element.style.opacity = 0;
    });
    this.editor.on('paste', function (e) {
      if (e.text.startsWith('{"icestudio":')) {
        e.text = '';
      }
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

    // Configure button: trigger dblclick on the block
    this.$box.find('.json-btn-menu').on('click', function () {
      self.paper.trigger('cell:pointerdblclick', self, {}, 0, 0);
    });

    // Save As button
    this.$box.find('.json-btn-save').on('click', function () {
      iceStudio.bus.events.publish('JsonBlock::saveAs', {
        id: self.model.get('id'),
      });
    });

    this.setupResizer();

    // Apply data
    this.apply({ ini: true });
  },

  apply: function (opt) {
    this.applyName();
    this.applyType();
    this.applyContent(opt);
    if (this.editor) {
      this.editor.resize();
    }
  },

  applyName: function () {
    var name = this.model.get('data').name;
    this.$box.find('.json-name').text(name || 'json');
  },

  applyType: function () {
    var type = this.model.get('data').type;
    var badge = this.$box.find('.json-type-badge');
    if (type === 'input') {
      badge.text('IN').removeClass('json-badge-out').addClass('json-badge-in');
    } else {
      badge.text('OUT').removeClass('json-badge-in').addClass('json-badge-out');
    }
  },

  applyContent: function (opt) {
    this.updating = true;
    var data = this.model.get('data');
    opt = opt || {};
    if (opt.ini) {
      this.editor.session.setValue(data.content || '{}');
    } else {
      this.model.attributes.data.content = this.editor.session.getValue();
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
      this.editor.setReadOnly(this.model.get('disabled'));
    }
    joint.dia.ElementView.prototype.update.apply(this, arguments);
  },

  updateBox: function () {
    var bbox = this.model.getBBox();
    var data = this.model.get('data');
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
