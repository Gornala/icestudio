// jshint ignore:start

'use strict';

// Information frame block — documentation-only coloured frame, no ports

var _INFO_FRAME_COLORS = {
  indianred: [205, 92, 92],
  red: [255, 0, 0],
  deeppink: [255, 20, 147],
  mediumvioletred: [199, 21, 133],
  coral: [255, 127, 80],
  orangered: [255, 69, 0],
  darkorange: [255, 140, 0],
  gold: [255, 215, 0],
  yellow: [255, 255, 0],
  fuchsia: [255, 0, 255],
  slateblue: [106, 90, 205],
  greenyellow: [173, 255, 47],
  springgreen: [0, 255, 127],
  darkgreen: [0, 100, 0],
  olivedrab: [107, 142, 35],
  lightseagreen: [32, 178, 170],
  turquoise: [64, 224, 208],
  steelblue: [70, 130, 180],
  deepskyblue: [0, 191, 255],
  royalblue: [65, 105, 225],
  navy: [0, 0, 128],
  lightgray: [211, 211, 211],
};

function _infoFrameRgb(colorName) {
  return _INFO_FRAME_COLORS[colorName] || _INFO_FRAME_COLORS.fuchsia;
}

joint.shapes.ice.InfoFrame = joint.shapes.ice.Model.extend({
  markup:
    '<g class="rotatable">\
       <g class="scalable">\
         <rect class="body"/>\
       </g>\
     </g>',
  defaults: joint.util.deepSupplement(
    {
      type: 'ice.InfoFrame',
      z: -1,
      size: {
        width: 400,
        height: 300,
      },
      attrs: {
        '.body': {
          fill: 'transparent',
          stroke: 'transparent',
        },
      },
    },
    joint.shapes.ice.Model.prototype.defaults
  ),
});

joint.shapes.ice.InfoFrameView = joint.shapes.ice.ModelView.extend({
  initialize: function () {
    _.bindAll(this, 'updateBox');
    joint.dia.ElementView.prototype.initialize.apply(this, arguments);

    var modelId = this.model.get('id');

    this.$box = $(
      joint.util.template(
        '<div class="info-frame-block">\
          <div class="info-frame-content">\
            <div class="info-frame-header">\
              <label class="info-frame-name"></label>\
              <div class="js-info-frame-edit info-frame-btn" data-blkId="' +
          modelId +
          '" title="Edit"><i class="fas fa-pen"></i></div>\
            </div>\
          </div>\
          <div class="resize-edge resize-edge-left"></div>\
          <div class="resize-edge resize-edge-right"></div>\
          <div class="resize-edge resize-edge-top"></div>\
          <div class="resize-edge resize-edge-bottom"></div>\
          <div class="resizer"></div>\
        </div>'
      )()
    );

    this.nativeDom = {
      box: this.$box[0],
      contentEl: this.$box[0].querySelector('.info-frame-content'),
      headerEl: this.$box[0].querySelector('.info-frame-header'),
      nameEl: this.$box[0].querySelector('.info-frame-name'),
    };

    this.model.on('change', this.updateBox, this);
    this.model.on('remove', this.removeBox, this);

    this.$box.find('.info-frame-btn').on('mousedown', function (event) {
      event.stopPropagation();
    });

    // Header drag: forward mousedown to JointJS element for move behaviour
    var self = this;
    this.$box.find('.info-frame-header').on('mousedown', function (event) {
      if ($(event.target).closest('.info-frame-btn').length) {
        return;
      }
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

    // Edit button triggers double-click on the SVG element (same path as dblclick)
    this.$box.find('.js-info-frame-edit').on('click', function (event) {
      var svgEl = self.el;
      var dblclickEvt = new MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        clientX: event.clientX,
        clientY: event.clientY,
      });
      svgEl.dispatchEvent(dblclickEvt);
    });

    this.updateBox();
    this.setupResizer();
    this.setupEdgeResizers();
  },

  setupEdgeResizers: function () {
    if (this.model.get('disabled')) {
      return;
    }
    var self = this;
    var gridstep = 8;
    var minW = 64;
    var minH = 64;

    function snapModel(clientPx, z) {
      return Math.round(clientPx / z / gridstep) * gridstep;
    }

    var edgeConfigs = [
      { sel: '.resize-edge-right', axis: 'x', side: 'end' },
      { sel: '.resize-edge-left', axis: 'x', side: 'start' },
      { sel: '.resize-edge-bottom', axis: 'y', side: 'end' },
      { sel: '.resize-edge-top', axis: 'y', side: 'start' },
    ];

    edgeConfigs.forEach(function (cfg) {
      self.$box.find(cfg.sel).on('mousedown', function (event) {
        event.stopPropagation();
        event.preventDefault();

        var ms = self.model.get('state') || {};
        var z = ms.zoom || 1;
        var size = self.model.get('size');
        var pos = self.model.get('position');
        var startCX = event.clientX;
        var startCY = event.clientY;
        var startW = size.width;
        var startH = size.height;
        var startPX = pos.x;
        var startPY = pos.y;

        self.model.graph.trigger('batch:start');

        $(document).on('mousemove.ifresize', function (mv) {
          var ms2 = self.model.get('state') || {};
          var z2 = ms2.zoom || 1;
          var newW, newH;

          if (cfg.axis === 'x') {
            var dx = snapModel(mv.clientX, z2) - snapModel(startCX, z2);
            if (cfg.side === 'end') {
              newW = Math.max(minW, startW + dx);
              self.model.resize(newW, startH);
            } else {
              newW = Math.max(minW, startW - dx);
              self.model.resize(newW, startH);
              self.model.position(startPX + (startW - newW), startPY);
            }
          } else {
            var dy = snapModel(mv.clientY, z2) - snapModel(startCY, z2);
            if (cfg.side === 'end') {
              newH = Math.max(minH, startH + dy);
              self.model.resize(startW, newH);
            } else {
              newH = Math.max(minH, startH - dy);
              self.model.resize(startW, newH);
              self.model.position(startPX, startPY + (startH - newH));
            }
          }
        });

        $(document).on('mouseup.ifresize', function () {
          $(document).off('mousemove.ifresize mouseup.ifresize');
          self.model.graph.trigger('batch:stop');
        });
      });
    });
  },

  updateBox: function () {
    var bbox = this.model.getBBox();
    var data = this.model.get('data');
    var colorName = (data && data.blockColor) || 'fuchsia';
    var rgb = _infoFrameRgb(colorName);
    var borderColor = colorName;
    var bgColor = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.06)';
    var headerBg = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.5)';

    var contentTransform = {
      left: Math.round((bbox.width / 2.0) * (state.zoom - 1)) + 'px',
      top: Math.round((bbox.height / 2.0) * (state.zoom - 1)) + 'px',
      width: Math.round(bbox.width) + 'px',
      height: Math.round(bbox.height) + 'px',
      transform: 'scale(' + state.zoom + ')',
    };

    if (this.nativeDom.contentEl) {
      Object.keys(contentTransform).forEach(function (prop) {
        this.nativeDom.contentEl.style[prop] = contentTransform[prop];
      }, this);
      this.nativeDom.contentEl.style.borderColor = borderColor;
      this.nativeDom.contentEl.style.background = bgColor;
    }

    var boxTransform = {
      left: Math.round(bbox.x * state.zoom + state.pan.x) + 'px',
      top: Math.round(bbox.y * state.zoom + state.pan.y) + 'px',
      width: Math.round(bbox.width * state.zoom) + 'px',
      height: Math.round(bbox.height * state.zoom) + 'px',
    };
    if (this.nativeDom.box) {
      Object.keys(boxTransform).forEach(function (prop) {
        this.nativeDom.box.style[prop] = boxTransform[prop];
      }, this);
    }

    if (this.nativeDom.headerEl) {
      this.nativeDom.headerEl.style.background = headerBg;
    }

    if (this.nativeDom.nameEl) {
      this.nativeDom.nameEl.textContent =
        data && data.label ? data.label : 'frame';
    }

    return [];
  },
});

// jshint ignore:end
