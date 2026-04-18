//-- jshint rules
/* --global sha1, placementCssIOTasks, WIRE_WIDTH */
/* jshint ignore: start */
'use strict';

// I/O blocks

// Sort pin dropdown options: pins matching the port name come first, rest alphabetical.
// Match is case-insensitive and checks if either name contains the other.
// E.g. port "clk" matches pins "CLK", "CLK_IN", "SYSTEM_CLK", etc.
var sortPinOptions = function (htmlStr, portName) {
  if (!portName) {
    return htmlStr;
  }
  var tmp = document.createElement('select');
  tmp.innerHTML = htmlStr;
  var opts = Array.prototype.slice.call(tmp.options);
  var empty = [];
  var matched = [];
  var rest = [];
  for (var k = 0; k < opts.length; k++) {
    var opt = opts[k];
    if (!opt.value) {
      empty.push(opt);
      continue;
    }
    var pinLower = opt.text.toLowerCase();
    if (
      pinLower.indexOf(portName) !== -1 ||
      portName.indexOf(pinLower) !== -1
    ) {
      matched.push(opt);
    } else {
      rest.push(opt);
    }
  }
  var cmp = function (a, b) {
    return a.text.localeCompare(b.text);
  };
  matched.sort(cmp);
  rest.sort(cmp);
  var result = '';
  var all = empty.concat(matched, rest);
  for (var j = 0; j < all.length; j++) {
    result += all[j].outerHTML;
  }
  return result;
};

joint.shapes.ice.IO = joint.shapes.ice.Model.extend({
  defaults: joint.util.deepSupplement(
    joint.shapes.ice.Model.prototype.defaults
  ),

  initialize: function () {
    this.updateSize();
    this.on('change:data', this.updateSize, this);
    joint.shapes.ice.Model.prototype.initialize.apply(this, arguments);
  },

  updateSize: function () {
    const data = this.get('data');
    const blockType = this.get('blockType') || '';
    const isLabel =
      blockType === 'basic.inputLabel' ||
      blockType === 'basic.outputLabel' ||
      blockType === 'basic.pairedLabel';
    const fontSize = isLabel ? 12 : 14;
    const minW = isLabel ? 64 : 96;
    const customWidth = data.customWidth || 0;
    const blockName = data.name || '';
    const pins = data.pins || [];
    const isVirtual = data.virtual;

    const context = document.createElement('canvas').getContext('2d');
    context.font = `${fontSize}px Monaco`;

    let newWidth;
    if (isLabel) {
      const textWidth =
        blockName.length > 0 ? context.measureText(blockName).width : 0;
      newWidth = Math.round(Math.max(textWidth + 60, minW, customWidth));
    } else if (isVirtual) {
      const textWidth =
        blockName.length > 0 ? context.measureText(blockName).width : 0;
      newWidth = Math.round(Math.max(textWidth + 50, minW, customWidth));
    } else {
      // FPGA mode: name section + pin-selector section side by side
      const nameAreaW = Math.round(context.measureText(blockName).width) + 16;
      let maxPinW = 0;
      for (let i in pins) {
        if (pins[i].name) {
          const pw = context.measureText(pins[i].name).width;
          if (pw > maxPinW) maxPinW = pw;
        }
      }
      const pinAreaW = Math.max(Math.round(maxPinW) + 24, 55);
      newWidth = Math.round(
        Math.max(nameAreaW + pinAreaW + 2, minW, customWidth)
      );
    }

    this.resize(newWidth, this.size().height);
  },
});

joint.shapes.ice.Input = joint.shapes.ice.IO.extend({
  defaults: joint.util.deepSupplement(
    {
      type: 'ice.Input',
      size: {
        width: 96,
        height: 32,
      },
    },
    joint.shapes.ice.IO.prototype.defaults
  ),
});

joint.shapes.ice.Output = joint.shapes.ice.IO.extend({
  defaults: joint.util.deepSupplement(
    {
      type: 'ice.Output',
      z: 10,
      size: {
        width: 96,
        height: 32,
      },
    },
    joint.shapes.ice.Model.prototype.defaults
  ),
});

joint.shapes.ice.InputLabel = joint.shapes.ice.IO.extend({
  markup:
    '<g class="rotatable">\
             <g class="scalable">\
               <rect class="body" />\
             </g>\
             <g class="leftPorts disable-port"/>\
             <g class="rightPorts"/>\
             <g class="topPorts disable-port"/>\
             <g class="bottomPorts"/>\
    </g>',
  portMarkup:
    '<g class="port port<%= index %>">\
               <g class="port-default" id="port-default-<%= id %>-<%= port.id %>">\
               <path/><rect/>\
               </g>\
               <path class="port-wire <%= wireClass %>" id="port-wire-<%= id %>-<%= port.id %>"/>\
                 <text class="port-label"/>\
                 <circle class="port-body" r="0"/>\
               </g>',

  //<polygon  class="input-virtual-terminator" points="0 -5,0 34,20 16" style="fill:white;stroke:<%= port.fill %>;stroke-width:3" transform="translate(100 -15)"/>\
  defaults: joint.util.deepSupplement(
    {
      type: 'ice.Output',
      size: {
        width: 32,
        height: 32,
      },
    },
    joint.shapes.ice.Model.prototype.defaults
  ),
});

joint.shapes.ice.OutputLabel = joint.shapes.ice.IO.extend({
  markup:
    '<g class="rotatable">\
             <g class="scalable">\
               <rect class="body"/>\
             </g>\
             <g class="leftPorts disable-port"/>\
             <g class="rightPorts"/>\
             <g class="topPorts disable-port"/>\
             <g class="bottomPorts"/>\
    </g>',
  portMarkup:
    '<g class="port port<%= index %>">\
               <g class="port-default" id="port-default-<%= id %>-<%= port.id %>">\
               <path/><rect/>\
               </g>\
               <path class="port-wire <%= wireClass %>" id="port-wire-<%= id %>-<%= port.id %>"/>\
                 <text class="port-label"/>\
                 <circle class="port-body" r="0"/>\
               </g>',

  //<polygon points="1 0,15 15,0 30,30 30,30 0" style="fill:lime;stroke-width:1" transform="translate(-122 -15)"/>\
  defaults: joint.util.deepSupplement(
    {
      type: 'ice.Input',
      size: {
        width: 32,
        height: 32,
      },
    },
    joint.shapes.ice.Model.prototype.defaults
  ),
});

joint.shapes.ice.IOView = joint.shapes.ice.ModelView.extend({
  initialize: function () {
    _.bindAll(this, 'updateBox');
    joint.dia.ElementView.prototype.initialize.apply(this, arguments);
    let modelId = this.model.get('id');
    this.id = sha1(modelId).toString().substring(0, 6);
    let comboId = 'combo' + this.id;
    let virtual = this.model.get('data').virtual || this.model.get('disabled');

    let selectCode = '';
    let selectScript = '';
    let data = this.model.get('data');
    let name = data.name + (data.range || '');

    if (data.pins) {
      for (var i in data.pins) {
        selectCode += '<select id="' + comboId + data.pins[i].index + '"';
        selectCode += 'class="select2" i="' + i + '">';
        selectCode += '</select>';

        selectScript += '$("#' + comboId + data.pins[i].index + '").select2(';
        selectScript +=
          '{placeholder: "", allowClear: true, dropdownCssClass: "bigdrop",';
        // Match only words that start with the selected search term
        // http://stackoverflow.com/questions/31571864/select2-search-match-only-words-that-start-with-search-term
        selectScript += 'matcher: function(params, data) {';
        selectScript += '  params.term = params.term || "";';
        selectScript +=
          '  if (data.text.toUpperCase().indexOf(params.term.toUpperCase()) == 0) { return data; }';
        selectScript += '  return false; },';
        // Highlight already-used pins in the dropdown with light blue background
        selectScript += 'templateResult: function(opt) {';
        selectScript += '  if (!opt.id || !opt.element) return opt.text;';
        selectScript += '  if ($(opt.element).hasClass("pin-in-use")) {';
        selectScript +=
          '    return $("<span class=\'pin-in-use-result\'>").text(opt.text);';
        selectScript += '  }';
        selectScript += '  return opt.text;';
        selectScript += '} });';
      }
    }

    this.$box = $(
      joint.util.template(
        '\
      <div class="io-block" data-blkid="' +
          modelId +
          '">\
        <div class="io-virtual-content' +
          (virtual ? '' : ' hidden') +
          '">\
          <div class="header">\
            <label>' +
          name +
          '</label>\
            <svg viewBox="0 0 12 18"><path d="M-1 0 l10 8-10 8" fill="none" stroke-width="2" stroke-linejoin="round"/>\
          </div>\
        </div>\
        <div class="io-fpga-content' +
          (virtual ? ' hidden' : '') +
          '">\
          <div class="fpga-row">\
            <label>' +
          name +
          '</label>\
            <svg viewBox="0 0 12 18"><path d="M-1 0 l10 8-10 8" fill="none" stroke-width="2" stroke-linejoin="round"/>\
          </div>\
          <div class="fpga-pins">' +
          selectCode +
          '</div>\
          <script>' +
          selectScript +
          '</script>\
        </div>\
        <div class="io-resize-handle-left"></div>\
      </div>\
      '
      )()
    );

    this.virtualContentSelector = this.$box.find('.io-virtual-content');
    this.fpgaContentSelector = this.$box.find('.io-fpga-content');
    this.headerSelector = this.$box.find('.header, .fpga-row');
    const dkey = this.id + this.cid + '.io-virtual-content';
    let vcs = domCache[dkey];
    if (!vcs) {
      vcs = this.$box[0].querySelectorAll('.io-virtual-content');
      domCache[this.id + this.cid + '.io-virtual-content'] = vcs;
    }

    let fcs = domCache[this.id + this.cid + '.io-fpga-content'];
    if (!fcs) {
      fcs = this.$box[0].querySelectorAll('.io-fpga-content');
      domCache[this.id + this.cid + '.io-fpga-content'] = fcs;
    }
    this.nativeDom = {
      box: this.$box[0],
      virtualContentSelector: vcs,
      fpgaContentSelector: fcs,
    };

    this.model.on('change', this.updateBox, this);
    this.model.on('remove', this.removeBox, this);

    this.listenTo(this.model, 'process:ports', this.update);
    joint.dia.ElementView.prototype.initialize.apply(this, arguments);

    // Prevent paper from handling pointerdown.
    var self = this;
    var selector = this.$box.find('.select2');
    selector.on('mousedown click', function (event) {
      event.stopPropagation();
    });
    selector.on('change', function (event) {
      if (!self.updating) {
        var target = $(event.target);
        var i = target.attr('i');
        var name = target.find('option:selected').text();
        var value = target.val();
        var data = JSON.parse(JSON.stringify(self.model.get('data')));
        if (name !== null && value !== null) {
          data.pins[i].name = name;
          data.pins[i].value = value;
          self.model.set('data', data);
        }
      }
    });

    this.updateBox();

    this.updating = false;

    // Apply data
    if (!this.model.get('disabled')) {
      this.applyChoices();
      this.applyValues();
    }
    this.applyShape();
    this.applyClock();
    this.setupLeftResizer();

    // Listen for any data change across the graph to recheck pin duplicates
    if (this.model.graph) {
      this._graphRef = this.model.graph;
      this._boundCheckDuplicatePins = this.checkDuplicatePins.bind(this);
      this._graphRef.on('change:data', this._boundCheckDuplicatePins);
      // Defer initial check so all blocks are in the graph first
      var self2 = this;
      setTimeout(function () {
        self2.checkDuplicatePins();
      }, 0);
    }
  },

  setupLeftResizer: function () {
    if (this.model.get('disabled')) {
      return;
    }
    this.leftResizing = false;
    this.$leftResizeHandle = this.$box.find('.io-resize-handle-left');
    this.$leftResizeHandle.on(
      'mousedown',
      { self: this },
      this.startLeftResizing
    );
  },

  startLeftResizing: function (event) {
    event.stopPropagation();
    var self = event.data.self;
    self.leftResizing = true;
    self.model.graph.trigger('batch:start');
    self._leftResizeStartX = event.clientX;
    self._leftResizeStartWidth = self.model.get('size').width;
    self._leftResizeStartPosX = self.model.get('position').x;
    $(document).on(
      'mousemove.ioresize',
      { self: self },
      self.performLeftResizing
    );
    $(document).on('mouseup.ioresize', { self: self }, self.stopLeftResizing);
  },

  performLeftResizing: function (event) {
    var self = event.data.self;
    if (!self.leftResizing) {
      return;
    }
    var state = self.model.get('state');
    var zoom = state && state.zoom ? state.zoom : 1;
    var gridstep = 8;
    var dx_model =
      Math.round((event.clientX - self._leftResizeStartX) / zoom / gridstep) *
      gridstep;
    var newWidth = Math.max(96, self._leftResizeStartWidth - dx_model);
    var newX =
      self._leftResizeStartPosX + (self._leftResizeStartWidth - newWidth);
    self.model.set('size', {
      width: newWidth,
      height: self.model.get('size').height,
    });
    self.model.set('position', { x: newX, y: self.model.get('position').y });
  },

  stopLeftResizing: function (event) {
    var self = event.data.self;
    if (!self.leftResizing) {
      return;
    }
    self.leftResizing = false;
    $(document).off('mousemove.ioresize');
    $(document).off('mouseup.ioresize');
    // Persist the user's chosen width so auto-size respects it as a floor
    var data = JSON.parse(JSON.stringify(self.model.get('data')));
    data.customWidth = self.model.get('size').width;
    self.model.set('data', data, { silent: true });
    self.model.graph.trigger('batch:stop');
  },

  checkDuplicatePins: function () {
    var data = this.model.get('data');
    if (
      !data ||
      !data.pins ||
      data.virtual ||
      this.model.get('disabled') ||
      !this.model.graph
    ) {
      return;
    }

    // Count how many times each physical pin value is used across all IO blocks
    var pinValueCount = {};
    var cells = this.model.graph.getCells();
    for (var ci = 0; ci < cells.length; ci++) {
      var cellData = cells[ci].get('data');
      if (!cellData || !cellData.pins || cellData.virtual) {
        continue;
      }
      for (var pi = 0; pi < cellData.pins.length; pi++) {
        var pv = cellData.pins[pi].value;
        if (pv && pv !== '0') {
          pinValueCount[pv] = (pinValueCount[pv] || 0) + 1;
        }
      }
    }

    // Apply or remove duplicate indicator on each pin selector in this block
    var pins = data.pins;
    for (var i = 0; i < pins.length; i++) {
      var pin = pins[i];
      var $select = this.$box.find('#combo' + this.id + pin.index);
      var $container = $select.next('.select2-container');
      if (!$container.length) {
        continue;
      }
      var count =
        pin.value && pin.value !== '0' ? pinValueCount[pin.value] || 0 : 0;
      if (count > 1) {
        $container.addClass('pin-duplicate');
        $container.attr(
          'title',
          'Pin "' +
            (pin.name || pin.value) +
            '" is already used ' +
            count +
            ' times in this design'
        );
      } else {
        $container.removeClass('pin-duplicate');
        $container.removeAttr('title');
      }
    }

    // Mark <option> elements so templateResult can highlight them in the dropdown.
    // Uses count >= 1 so every assigned pin is visible as taken.
    var self = this;
    this.$box.find('.select2').each(function () {
      $(this)
        .find('option')
        .each(function () {
          var val = $(this).val();
          if (val && val !== '0' && pinValueCount[val]) {
            $(this).addClass('pin-in-use');
          } else {
            $(this).removeClass('pin-in-use');
          }
        });
    });
  },

  applyChoices: function () {
    var data = this.model.get('data');
    if (data.pins) {
      var portName = (data.name || '').toLowerCase().replace(/[\[\]:]/g, '');
      var choicesHtml = this.model.get('choices');
      var sorted = sortPinOptions(choicesHtml, portName);
      for (var i in data.pins) {
        this.$box
          .find('#combo' + this.id + data.pins[i].index)
          .empty()
          .append(sorted);
      }
    }
  },

  applyValues: function () {
    //  console.log('ApplyValues');
    this.updating = true;
    var data = this.model.get('data');
    for (var i in data.pins) {
      var index = data.pins[i].index;
      var value = data.pins[i].value;
      var name = data.pins[i].name;
      var comboId = '#combo' + this.id + index;
      var comboSelector = this.$box
        .filter(function () {
          return $(this).text() === name;
        })
        .val();

      if (comboSelector) {
        // Select by pin name
        comboSelector.attr('selected', true);
      } else {
        // If there was a pin rename use the pin value
        comboSelector = this.$box.find(comboId);
        comboSelector.val(value).change();
      }
    }
    this.updating = false;
  },

  applyShape: function () {
    //  console.log('ApplyShape');
    var data = this.model.get('data');
    var name = data.name + (data.range || '');
    var virtual = data.virtual || this.model.get('disabled') || subModuleActive;
    var blockType = this.model.get('blockType') || '';
    var isLabel =
      blockType === 'basic.inputLabel' ||
      blockType === 'basic.outputLabel' ||
      blockType === 'basic.pairedLabel';
    var $label = this.$box.find('label');

    $label.text(name || '');

    if (isLabel) {
      this.$box.addClass('io-label');
    }

    if (virtual) {
      // Virtual port (green)
      this.fpgaContentSelector.addClass('hidden');
      this.virtualContentSelector.removeClass('hidden');

      if (typeof data.blockColor !== 'undefined') {
        // remove all previous "color-*" classes (ok with undo/redo commands)
        for (
          let i = 0;
          i < this.virtualContentSelector[0].classList.length;
          i++
        ) {
          let colorClass = this.virtualContentSelector[0].classList[i];
          if (colorClass.startsWith('color-')) {
            this.virtualContentSelector[0].classList.remove(colorClass);
          }
        }
        this.virtualContentSelector.addClass('color-' + data.blockColor);
      }

      var newH = isLabel ? 32 : 64;
      if (this.model.get('size').height !== newH) {
        this.model.resize(this.model.get('size').width, newH);
      }
    } else {
      // FPGA I/O port (yellow)
      this.virtualContentSelector.addClass('hidden');
      this.fpgaContentSelector.removeClass('hidden');
      if (data.pins) {
        var fpgaH = 32 * data.pins.length;
        if (this.model.get('size').height !== fpgaH) {
          this.model.resize(this.model.get('size').width, fpgaH);
        }
      }
    }
  },

  applyClock: function () {
    // console.log('applyClock');
    if (this.model.get('data').clock) {
      this.$box.find('svg').removeClass('hidden');
    } else {
      this.$box.find('svg').addClass('hidden');
    }
  },

  clearValues: function () {
    //  console.log('clearValues');
    this.updating = true;
    var name = '';
    var value = '0';
    var data = JSON.parse(JSON.stringify(this.model.get('data')));
    for (var i in data.pins) {
      var index = data.pins[i].index;
      var comboId = '#combo' + this.id + index;
      var comboSelector = this.$box.find(comboId);
      comboSelector.val(value).change();
      data.pins[i].name = name;
      data.pins[i].value = value;
    }
    this.model.set('data', data);
    this.updating = false;
  },

  apply: function () {
    //  console.log('Apply');
    this.applyChoices();
    this.applyValues();
    this.applyShape();
    this.applyClock();
    this.render();
  },

  update: function () {
    //console.log('update');
    this.renderPorts();
    joint.dia.ElementView.prototype.update.apply(this, arguments);
  },
  pendingRender: false,
  updateBox: function () {
    // console.log('updateBox');
    const size = this.model.get('size');
    this.virtualContentSelector.width(size.width);
    var pendingTasks = [];
    var bbox = this.model.getBBox();
    var data = this.model.get('data');
    // var state = this.model.get('state');
    console.log('STATE', state);
    return this.placeIO(data, bbox, state, pendingTasks);
  },
  removeBox: function () {
    //console.log('removeBox');
    $(document).off('mousemove.ioresize');
    $(document).off('mouseup.ioresize');
    if (this._graphRef && this._boundCheckDuplicatePins) {
      this._graphRef.off('change:data', this._boundCheckDuplicatePins);
    }
    // Close select options on remove
    this.$box.find('select').select2('close');
    this.$box.remove();
  },
});

joint.shapes.ice.InputView = joint.shapes.ice.IOView;
joint.shapes.ice.OutputView = joint.shapes.ice.IOView;

/* jshint ignore: end */
