//-- jshint rules
/* global sha1, aceFontSize, openurl, marked, mermaid */

'use strict';

// Info block

joint.shapes.ice.Info = joint.shapes.ice.Model.extend({
  defaults: joint.util.deepSupplement(
    {
      type: 'ice.Info',
      z: 12,
      size: {
        width: 400,
        height: 256,
      },
    },
    joint.shapes.ice.Model.prototype.defaults
  ),
});

joint.shapes.ice.InfoView = joint.shapes.ice.ModelView.extend({
  initialize: function () {
    var self = this;
    _.bindAll(this, 'updateBox');
    joint.dia.ElementView.prototype.initialize.apply(this, arguments);

    var id = sha1(this.model.get('id')).toString().substring(0, 6);
    var editorLabel = 'editor' + id;

    var cachedBox = this.model._iceCachedBox;
    var cachedView = this.model._iceCachedView;
    var cachedEditor = this.model._iceCachedEditor;

    if (cachedBox) {
      // ---- FAST PATH ----
      this.$box = cachedBox;
      this.editor = cachedEditor;
      if (cachedView) {
        this.model.off('change', cachedView.updateBox, cachedView);
        this.model.off('remove', cachedView.removeBox, cachedView);
        if (cachedView._aceSessionChangeHandler) {
          cachedEditor.session.removeListener(
            'change',
            cachedView._aceSessionChangeHandler
          );
        }
        if (cachedView._aceFocusHandler) {
          cachedEditor.removeListener('focus', cachedView._aceFocusHandler);
        }
        if (cachedView._aceBlurHandler) {
          cachedEditor.removeListener('blur', cachedView._aceBlurHandler);
        }
        if (cachedView._acePasteHandler) {
          cachedEditor.removeListener('paste', cachedView._acePasteHandler);
        }
        if (cachedView._aceMousewheelHandler) {
          cachedEditor.removeListener(
            'mousewheel',
            cachedView._aceMousewheelHandler
          );
        }
      }
      delete this.model._iceCachedBox;
      delete this.model._iceCachedView;
      delete this.model._iceCachedEditor;
    } else {
      // ---- SLOW PATH ----
      var readonly = this.model.get('data').readonly;
      var editorTheme = global.uiTheme === 'dark' ? 'monokai' : 'chrome';

      this.$box = $(
        joint.util.template(
          '\
        <div class="info-block">\
          <div class="info-render markdown-body' +
            (readonly ? '' : ' hidden') +
            '"></div>\
          <div class="info-content">\
            <div class="info-header">\
              <label class="info-name">Info</label>\
              <button class="info-btn info-btn-toggle" title="Toggle edit/view"></button>\
            </div>\
          </div>\
          <div class="info-editor' +
            (readonly ? ' hidden' : '') +
            '" id="' +
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
            '.setShowPrintMargin(false);\
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
            '.session.setMode("ace/mode/markdown");\
          </script>\
          <div class="resizer"/></div>\
        </div>\
        '
        )()
      );
    }

    // ---- Common setup ----
    this.renderSelector = this.$box.find('.info-render');
    this.editorSelector = this.$box.find('.info-editor');
    this.contentSelector = this.$box.find('.info-content');

    this.model.on('change', this.updateBox, this);
    this.model.on('remove', this.removeBox, this);

    this.editorSelector.on('mousedown click', function (event) {
      event.stopPropagation();
    });
    this.$box.find('.info-btn').on('mousedown click', function (event) {
      event.stopPropagation();
    });
    this.$box.find('.info-btn-toggle').on('click', function () {
      self.model.attributes.data.readonly = !self.model.get('data').readonly;
      self.apply();
    });

    this.updateBox();

    this.updating = false;
    this.deltas = [];
    this.counter = 0;
    this.timer = null;
    var undoGroupingInterval = 200;

    if (!cachedBox) {
      this.editor = ace.edit(this.editorSelector[0]);
      this.updateScrollStatus(false);
      this.editor.$blockScrolling = Infinity;
      this.editor.commands.removeCommand('touppercase');
    }

    // ---- ACE event handlers — always fresh ----
    this._aceSessionChangeHandler = function (delta) {
      if (!self.updating) {
        if (Date.now() - self.counter < undoGroupingInterval) {
          clearTimeout(self.timer);
        }
        self.deltas = self.deltas.concat([delta]);
        self.timer = setTimeout(function () {
          var deltas = JSON.parse(JSON.stringify(self.deltas));
          self.model.set('deltas', deltas);
          self.deltas = [];
          self.model.attributes.data.info = self.editor.session.getValue();
        }, undoGroupingInterval);
        self.counter = Date.now();
      }
    };
    this.editor.session.on('change', this._aceSessionChangeHandler);

    this._aceFocusHandler = function () {
      self.updateScrollStatus(true);
      $(document).trigger('disableSelected');
      self.editor.setHighlightActiveLine(true);
      self.editor.renderer.$cursorLayer.element.style.opacity = 1;
    };
    this.editor.on('focus', this._aceFocusHandler);

    this._aceBlurHandler = function () {
      self.updateScrollStatus(false);
      var selection = self.editor.session.selection;
      if (selection) {
        selection.clearSelection();
      }
      self.editor.setHighlightActiveLine(false);
      self.editor.renderer.$cursorLayer.element.style.opacity = 0;
    };
    this.editor.on('blur', this._aceBlurHandler);

    this._acePasteHandler = function (e) {
      if (e.text.startsWith('{"icestudio":')) {
        e.text = '';
      }
    };
    this.editor.on('paste', this._acePasteHandler);

    this._aceMousewheelHandler = function (event) {
      if (
        document.activeElement.parentNode.id === self.editorSelector.attr('id')
      ) {
        event.stopPropagation();
      } else {
        event.preventDefault();
      }
    };
    this.editor.on('mousewheel', this._aceMousewheelHandler);

    if (!cachedBox) {
      this.setupResizer();
      this.apply({ ini: true });
    } else {
      var data = this.model.get('data');
      if (data && this.editor.session.getValue() !== (data.info || '')) {
        this.editor.session.setValue(data.info || '');
      }
      this.editor.resize();
    }
  },

  applyValue: function (opt) {
    this.updating = true;

    var data = this.model.get('data');

    opt = opt || {};

    if (opt.ini) {
      this.editor.session.setValue(data.info);
    } else {
      // Set data.info
      this.model.attributes.data.info = this.editor.session.getValue();
    }
    setTimeout(
      function (self) {
        self.updating = false;
      },
      10,
      this
    );
  },

  applyReadonly: function () {
    var readonly = this.model.get('data').readonly;
    var toggleBtn = this.$box.find('.info-btn-toggle');
    if (readonly) {
      toggleBtn.html('<i class="fas fa-edit"></i>');
      this.$box.addClass('info-block-readonly');
      this.renderSelector.removeClass('hidden');
      this.editorSelector.addClass('hidden');
      this.disableResizer();
      // Clear selection
      var selection = this.editor.session.selection;
      if (selection) {
        selection.clearSelection();
      }
      this.applyText();
    } else {
      toggleBtn.html('<i class="fas fa-eye"></i>');
      this.$box.removeClass('info-block-readonly');
      this.renderSelector.addClass('hidden');
      this.editorSelector.removeClass('hidden');
      this.enableResizer();
    }
  },

  applyText: function () {
    var data = this.model.get('data');
    var markdown = data.text || data.info || '';

    // Extract mermaid blocks before markdown processing (preserve raw content)
    var mermaidBlocks = [];
    markdown = markdown.replace(
      /```mermaid\r?\n([\s\S]*?)```/g,
      function (_, content) {
        var idx = mermaidBlocks.length;
        mermaidBlocks.push(content.trim());
        return 'MERMAID_PLACEHOLDER_' + idx + '_END';
      }
    );

    // Apply Marked to convert from Markdown to HTML
    var html = marked(markdown);

    // Restore mermaid blocks (content must NOT be HTML-escaped)
    mermaidBlocks.forEach(function (content, idx) {
      html = html.replace(
        'MERMAID_PLACEHOLDER_' + idx + '_END',
        '<div class="mermaid">' + content + '</div>'
      );
    });

    this.renderSelector.html(html);

    // Render mermaid diagrams
    if (
      typeof mermaid !== 'undefined' &&
      this.renderSelector[0].querySelector('.mermaid')
    ) {
      try {
        mermaid.init(
          undefined,
          this.renderSelector[0].querySelectorAll('.mermaid')
        );
      } catch (e) {
        // mermaid rendering failed silently
      }
    }

    // Render task list
    this.renderSelector.find('li').each(function (index, element) {
      replaceCheckboxItem(element);
    });

    function replaceCheckboxItem(element) {
      listIterator(element);
      var child = $(element).children().first()[0];
      if (child && child.localName === 'p') {
        listIterator(child);
      }
    }

    function listIterator(element) {
      var $el = $(element);
      var label = $el.clone().children().remove('il, ul').end().html();
      var detached = $el.children('il, ul');

      if (/^\[\s\]/.test(label)) {
        $el.html(renderItemCheckbox(label, '')).append(detached);
      } else if (/^\[x\]/.test(label)) {
        $el.html(renderItemCheckbox(label, 'checked')).append(detached);
      }
    }

    function renderItemCheckbox(label, checked) {
      label = label.substring(3);
      return '<input type="checkbox" ' + checked + '/>' + label;
    }

    this.renderSelector.find('a').each(function (index, element) {
      element.onclick = function (event) {
        event.preventDefault();
        openurl.open(element.href);
      };
    });
  },

  apply: function (opt) {
    this.applyValue(opt);
    this.applyReadonly();
    this.updateBox(true);
    if (this.editor) {
      this.editor.resize();
    }
  },

  render: function () {
    joint.dia.ElementView.prototype.render.apply(this, arguments);
    this.paper.$el.append(this.$box);
    this.updateBox(true);
    return this;
  },

  update: function () {
    this.editor.setReadOnly(this.model.get('disabled'));
    joint.dia.ElementView.prototype.update.apply(this, arguments);
  },

  updateBox: function () {
    var bbox = this.model.getBBox();
    var state = this.model.get('state');
    var data = this.model.get('data');

    let temporalBypass = true;
    if (!temporalBypass) {
      return;
    }

    var pendingTasks = [];

    if (data.readonly) {
      var renderHeight = bbox.height;
      pendingTasks.push(
        {
          e: this.renderSelector[0],
          property: 'left',
          value: Math.round((bbox.width / 2.0) * (state.zoom - 1)) + 'px',
        },
        {
          e: this.renderSelector[0],
          property: 'top',
          value: Math.round((renderHeight / 2.0) * (state.zoom - 1)) + 'px',
        },
        {
          e: this.renderSelector[0],
          property: 'width',
          value: Math.round(bbox.width) + 'px',
        },
        {
          e: this.renderSelector[0],
          property: 'height',
          value: Math.round(renderHeight) + 'px',
        },
        {
          e: this.renderSelector[0],
          property: 'transform',
          value: 'scale(' + state.zoom + ')',
        },
        {
          e: this.renderSelector[0],
          property: 'font-size',
          value: aceFontSize + 'px',
        }
      );
    } else if (this.editor) {
      pendingTasks.push(
        {
          e: this.editorSelector[0],
          property: 'top',
          value: Math.round(32 * state.zoom) + 'px',
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

      this.editor.setFontSize(Math.round(aceFontSize * state.zoom));
      this.editor.renderer.$cursorLayer.$padding = Math.round(4 * state.zoom);
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

  removeBox: function (/*event*/) {
    delete this.model.attributes.data.delta;
    if (this.model._iceCachedBox) {
      return;
    }
    this.$box.remove();
  },
});
