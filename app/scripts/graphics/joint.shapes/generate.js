// jshint ignore:start

'use strict';

// Generate frame block

joint.shapes.ice.Generate = joint.shapes.ice.Model.extend({
  // Custom markup: no disable-port on leftPorts (inner-left ports are outputs)
  markup:
    '<g class="rotatable">\
             <g class="scalable">\
               <rect class="body"/>\
             </g>\
             <g class="leftPorts"/>\
             <g class="rightPorts"/>\
             <g class="topPorts"/>\
             <g class="bottomPorts"/>\
           </g>',
  defaults: joint.util.deepSupplement(
    {
      type: 'ice.Generate',
      z: 1,
      size: {
        width: 600,
        height: 400,
      },
      attrs: {
        // Do NOT set magnet at class level — per-port getPortAttrs handles it
        // (inner ports and outer ports need different magnet values)
        '.leftPorts .port-body': {
          pos: 'left',
          type: 'input',
          magnet: false,
        },
        '.rightPorts .port-body': {
          pos: 'right',
          type: 'output',
          magnet: false,
        },
      },
    },
    joint.shapes.ice.Model.prototype.defaults
  ),

  // Override to position inner (-int) ports inside the frame
  // and pair ext/int ports at the same vertical position
  getPortAttrs: function (port, index, total, selector, type, length) {
    var attrs = {};
    var gridsize = 8;

    // Pair ext/int ports: logical index = floor(index/2), logical total = ceil(total/2)
    var isInner = port.id && port.id.indexOf('-int') !== -1;
    var logicalTotal = Math.ceil(total / 2);
    var logicalIndex = Math.floor(index / 2);
    var gridunits = length / gridsize;
    var position =
      Math.round(((logicalIndex + 0.5) / logicalTotal) * gridunits) / gridunits;

    var portClass = 'port' + index;
    var portSelector = selector + '>.' + portClass;
    var portLabelSelector = portSelector + '>.port-label';
    var portWireSelector = portSelector + '>.port-wire';
    var portBodySelector = portSelector + '>.port-body';

    var portColor =
      typeof this.attributes.data.blockColor !== 'undefined'
        ? this.attributes.data.blockColor
        : isInner
          ? '#e67e22'
          : 'lime';

    // Inner left ports are outputs (source wires to contained blocks)
    // Inner right ports are inputs (receive wires from contained blocks)
    // Outer left ports are inputs (receive wires from external blocks)
    // Outer right ports are outputs (source wires to external blocks)
    var isMagnet;
    if (type === 'top') {
      isMagnet = true; // iterator port is always an output
    } else if (type === 'left') {
      isMagnet = isInner; // inner-left = output (true), outer-left = input (false)
    } else {
      isMagnet = !isInner; // outer-right = output (true), inner-right = input (false)
    }

    // Inner ports swap pos so validateConnection directional rules work:
    // inner-left acts as output (pos='right'), inner-right acts as input (pos='left')
    var portPos;
    if (type === 'top') {
      portPos = 'right'; // iterator acts as output
    } else if (isInner) {
      portPos = type === 'left' ? 'right' : 'left';
    } else {
      portPos = type;
    }

    attrs[portSelector] = { ref: '.body' };
    attrs[portLabelSelector] = { text: port.label };
    attrs[portWireSelector] = {};
    attrs[portBodySelector] = {
      port: { id: port.id, type: type, fill: portColor, size: port.size },
      pos: portPos,
      magnet: isMagnet,
      type: isMagnet ? 'output' : 'input',
    };

    if (!isMagnet) {
      attrs[portSelector]['pointer-events'] = 'none';
      attrs[portWireSelector]['pointer-events'] = 'none';
    }

    var offset = port.size && port.size > 1 ? 4 : 1;

    if (type === 'left') {
      attrs[portSelector]['ref-x'] = isInner ? 16 : -16;
      attrs[portSelector]['ref-y'] = position;
      attrs[portLabelSelector]['y'] = -5 - offset;
      attrs[portLabelSelector]['text-anchor'] = 'end';
      attrs[portWireSelector]['y'] = position;
      if (isInner) {
        attrs[portLabelSelector]['dx'] = 20;
        attrs[portLabelSelector]['text-anchor'] = 'start';
        attrs[portWireSelector]['d'] = 'M 0 0 L -16 0';
      } else {
        attrs[portLabelSelector]['dx'] = 0;
        attrs[portWireSelector]['d'] = 'M 0 0 L 16 0';
      }
    } else if (type === 'right') {
      attrs[portSelector]['ref-dx'] = isInner ? -16 : 16;
      attrs[portSelector]['ref-y'] = position;
      attrs[portLabelSelector]['y'] = -5 - offset;
      attrs[portWireSelector]['y'] = position;
      if (isInner) {
        attrs[portLabelSelector]['dx'] = -20;
        attrs[portLabelSelector]['text-anchor'] = 'end';
        attrs[portWireSelector]['d'] = 'M 0 0 L 16 0';
      } else {
        attrs[portLabelSelector]['dx'] = 0;
        attrs[portLabelSelector]['text-anchor'] = 'start';
        attrs[portWireSelector]['d'] = 'M 0 0 L -16 0';
      }
    } else if (type === 'top') {
      // Iterator port: inside frame, below the 32px HTML header overlay
      // Label rendered horizontally (no rotation) so it's fully readable
      attrs[portSelector]['ref-y'] = 44;
      attrs[portSelector]['ref-x'] = position;
      attrs[portLabelSelector]['dx'] = 10;
      attrs[portLabelSelector]['y'] = 4;
      attrs[portLabelSelector]['text-anchor'] = 'start';
      attrs[portWireSelector]['x'] = position;
      attrs[portWireSelector]['d'] = 'M 0 0 L 0 -8';
      attrs[portBodySelector]['port']['fill'] = '#f39c12';
    }

    this._portSelectors = this._portSelectors || [];
    this._portSelectors = this._portSelectors.concat(_.keys(attrs));

    return attrs;
  },
});

joint.shapes.ice.GenerateView = joint.shapes.ice.ModelView.extend({
  initialize: function () {
    _.bindAll(this, 'updateBox');
    joint.dia.ElementView.prototype.initialize.apply(this, arguments);

    var modelId = this.model.get('id');

    this.$box = $(
      joint.util.template(
        '<div class="generate-block">\
          <div class="generate-content">\
            <div class="generate-header">\
              <label class="generate-block-name"></label>\
              <span class="generate-range"></span>\
              <div class="js-generate-export-module generate-btn" data-blkId="' +
          modelId +
          '" title="Export Module"><i class="fas fa-file-export"></i></div>\
              <div class="js-generate-io-edit generate-btn" data-blkId="' +
          modelId +
          '" title="Settings"><i class="fas fa-cog"></i></div>\
            </div>\
          </div>\
          <div class="resizer"></div>\
        </div>'
      )()
    );

    this.nativeDom = {
      box: this.$box[0],
      contentSelector: this.$box[0].querySelectorAll('.generate-content'),
      nameEl: this.$box[0].querySelector('.generate-block-name'),
      rangeEl: this.$box[0].querySelector('.generate-range'),
    };

    this.model.on('change', this.updateBox, this);
    this.model.on('remove', this.removeBox, this);

    this.listenTo(this.model, 'process:ports', this.update);
    joint.dia.ElementView.prototype.initialize.apply(this, arguments);

    // Prevent paper from handling pointerdown on header buttons
    this.$box.find('.generate-btn').on('mousedown', function (event) {
      event.stopPropagation();
    });

    // Header drag: forward mousedown to JointJS element for move behavior
    var self = this;
    this.$box.find('.generate-header').on('mousedown', function (event) {
      if ($(event.target).closest('.generate-btn').length) {
        return; // Don't drag when clicking gear button
      }
      // Dispatch a synthetic mousedown on the SVG element so JointJS initiates drag
      var svgEl = self.el;
      var bodyRect = svgEl.querySelector('.body');
      if (bodyRect) {
        bodyRect.style.pointerEvents = 'all';
        var syntheticEvt = new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX: event.clientX,
          clientY: event.clientY,
          button: event.button,
        });
        bodyRect.dispatchEvent(syntheticEvt);
        bodyRect.style.pointerEvents = 'none';
      }
    });

    this.updateBox();

    this.setupResizer();
  },

  update: function () {
    this.renderPorts();
    joint.dia.ElementView.prototype.update.apply(this, arguments);
  },

  updateBox: function () {
    var bbox = this.model.getBBox();
    var data = this.model.get('data');

    var contentTransform = {
      left: Math.round((bbox.width / 2.0) * (state.zoom - 1)) + 'px',
      top: Math.round((bbox.height / 2.0) * (state.zoom - 1)) + 'px',
      width: Math.round(bbox.width) + 'px',
      height: Math.round(bbox.height) + 'px',
      transform: 'scale(' + state.zoom + ')',
    };
    this.applyStyles(this.nativeDom.contentSelector, contentTransform);

    var boxTransform = {
      left: Math.round(bbox.x * state.zoom + state.pan.x) + 'px',
      top: Math.round(bbox.y * state.zoom + state.pan.y) + 'px',
      width: Math.round(bbox.width * state.zoom) + 'px',
      height: Math.round(bbox.height * state.zoom) + 'px',
    };
    this.applyStyles([this.nativeDom.box], boxTransform);

    // Update label
    if (this.nativeDom.nameEl) {
      this.nativeDom.nameEl.textContent =
        data && data.label ? data.label : 'generate';
    }

    // Update iteration range display
    if (this.nativeDom.rangeEl) {
      var m = data && data.instanceCount ? data.instanceCount : 4;
      this.nativeDom.rangeEl.textContent = 'i: 0..' + (m - 1);
    }

    return [];
  },

  applyStyles: function (elements, styles) {
    if (!elements) {
      return;
    }

    if (!Array.isArray(elements) && !(elements instanceof NodeList)) {
      elements = [elements];
    }

    elements.forEach(function (element) {
      if (element && element.style) {
        Object.keys(styles).forEach(function (prop) {
          element.style[prop] = styles[prop];
        });
      }
    });
  },
});

// jshint ignore:end
