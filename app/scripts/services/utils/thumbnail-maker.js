/* jshint browser:true, jquery:true */
/* global XMLSerializer, DOMParser */

/**
 * ThumbnailMaker — inline SVG drawing tool for the Project Info dialog.
 * Usage: var maker = new window.ThumbnailMaker(containerEl, { onApply: fn });
 *        maker.init();  // builds UI, binds events
 *        maker.destroy(); // unbinds events
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  window.ThumbnailMaker = function (containerEl, options) {
    options = options || {};

    // --- State ---
    var _svgEl = null; // <g> drawing layer
    var _outerSvg = null; // outer <svg> element for events
    var _cursorEl = null; // custom cursor <g>
    var _currentTool = 'point';
    var _currentColor = '#000000';
    var _drawing = false;
    var _startX = 0;
    var _startY = 0;
    var _previewEl = null;
    var _undoStack = [];
    var _maxUndo = 50;
    var _textOptions = { size: 10, align: 'middle' };
    var _textPreviewEl = null;
    var _boundMouseDown,
      _boundMouseMove,
      _boundMouseUp,
      _boundMouseLeave,
      _boundMouseEnter;

    // --- Coordinate mapping: mouse event → 0..63 grid ---
    var _toGrid = function (evt) {
      var rect = _outerSvg.getBoundingClientRect();
      var x = Math.floor(((evt.clientX - rect.left) / rect.width) * 64);
      var y = Math.floor(((evt.clientY - rect.top) / rect.height) * 64);
      return {
        x: Math.max(0, Math.min(63, x)),
        y: Math.max(0, Math.min(63, y)),
      };
    };

    // --- SVG element creation helpers ---
    var _svgCreate = function (tag, attrs) {
      var el = document.createElementNS(SVG_NS, tag);
      var keys = Object.keys(attrs);
      for (var i = 0; i < keys.length; i++) {
        el.setAttribute(keys[i], attrs[keys[i]]);
      }
      return el;
    };

    var _createPoint = function (x, y, color) {
      return _svgCreate('rect', {
        'x': x,
        'y': y,
        'width': 1,
        'height': 1,
        'fill': color,
        'shape-rendering': 'crispEdges',
      });
    };

    var _createLine = function (x1, y1, x2, y2, color) {
      return _svgCreate('line', {
        'x1': x1 + 0.5,
        'y1': y1 + 0.5,
        'x2': x2 + 0.5,
        'y2': y2 + 0.5,
        'stroke': color,
        'stroke-width': 1,
        'shape-rendering': 'crispEdges',
      });
    };

    var _createRect = function (x1, y1, x2, y2, fill, stroke) {
      var x = Math.min(x1, x2);
      var y = Math.min(y1, y2);
      var w = Math.abs(x2 - x1);
      var h = Math.abs(y2 - y1);
      if (w === 0) {
        w = 1;
      }
      if (h === 0) {
        h = 1;
      }
      return _svgCreate('rect', {
        'x': x,
        'y': y,
        'width': w,
        'height': h,
        'fill': fill,
        'stroke': stroke,
        'stroke-width': stroke !== 'none' ? 1 : 0,
        'shape-rendering': 'crispEdges',
      });
    };

    var _createEllipse = function (x1, y1, x2, y2, fill, stroke) {
      var cx = (x1 + x2) / 2;
      var cy = (y1 + y2) / 2;
      var rx = Math.abs(x2 - x1) / 2;
      var ry = Math.abs(y2 - y1) / 2;
      if (rx < 0.5) {
        rx = 0.5;
      }
      if (ry < 0.5) {
        ry = 0.5;
      }
      return _svgCreate('ellipse', {
        'cx': cx,
        'cy': cy,
        'rx': rx,
        'ry': ry,
        'fill': fill,
        'stroke': stroke,
        'stroke-width': stroke !== 'none' ? 1 : 0,
      });
    };

    var _createText = function (x, y, text, size, align, color) {
      var textEl = _svgCreate('text', {
        'x': x,
        'y': y,
        'font-size': size,
        'font-family': 'sans-serif',
        'fill': color,
        'text-anchor': align,
        'dominant-baseline': 'hanging',
      });
      var lines = text.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var tspan = _svgCreate('tspan', {
          x: x,
          dy: i === 0 ? '0' : '1.2em',
        });
        tspan.textContent = lines[i];
        textEl.appendChild(tspan);
      }
      return textEl;
    };

    // --- Preview builder ---
    var _buildPreview = function (x1, y1, x2, y2) {
      var el = null;
      switch (_currentTool) {
        case 'rect-fill':
          el = _createRect(x1, y1, x2, y2, _currentColor, 'none');
          break;
        case 'rect-stroke':
          el = _createRect(x1, y1, x2, y2, 'none', _currentColor);
          break;
        case 'ellipse-fill':
          el = _createEllipse(x1, y1, x2, y2, _currentColor, 'none');
          break;
        case 'ellipse-stroke':
          el = _createEllipse(x1, y1, x2, y2, 'none', _currentColor);
          break;
        case 'line':
          el = _createLine(x1, y1, x2, y2, _currentColor);
          break;
      }
      if (el) {
        el.setAttribute('opacity', '0.5');
        el.setAttribute('data-preview', 'true');
      }
      return el;
    };

    // --- Undo stack ---
    var _pushUndo = function () {
      _undoStack.push(_svgEl.innerHTML);
      if (_undoStack.length > _maxUndo) {
        _undoStack.shift();
      }
    };

    var _undo = function () {
      if (_undoStack.length > 0) {
        _svgEl.innerHTML = _undoStack.pop();
      }
    };

    var _clearCanvas = function () {
      _pushUndo();
      while (_svgEl.firstChild) {
        _svgEl.removeChild(_svgEl.firstChild);
      }
    };

    // --- Mouse event handlers ---
    var _onMouseDown = function (evt) {
      if (evt.button !== 0) {
        return;
      }
      evt.preventDefault();
      var p = _toGrid(evt);
      _startX = p.x;
      _startY = p.y;

      if (_currentTool === 'text') {
        // Remove text preview before placing
        if (_textPreviewEl && _textPreviewEl.parentNode) {
          _svgEl.removeChild(_textPreviewEl);
          _textPreviewEl = null;
        }
        var textInput = document.getElementById('tm-text-input');
        var txt = textInput ? textInput.value : '';
        if (txt) {
          _pushUndo();
          _svgEl.appendChild(
            _createText(
              p.x,
              p.y,
              txt,
              _textOptions.size,
              _textOptions.align,
              _currentColor
            )
          );
        }
        return;
      }

      _pushUndo();
      _drawing = true;

      if (_currentTool === 'point') {
        _svgEl.appendChild(_createPoint(p.x, p.y, _currentColor));
      }
    };

    var _onMouseEnter = function () {
      if (_cursorEl) {
        _cursorEl.style.display = '';
      }
    };

    var _onMouseMove = function (evt) {
      var p = _toGrid(evt);
      var coordsEl = document.getElementById('tm-coords');
      if (coordsEl) {
        coordsEl.textContent = p.x + ', ' + p.y;
      }

      // Move custom cursor
      if (_cursorEl) {
        _cursorEl.setAttribute(
          'transform',
          'translate(' + p.x + ',' + p.y + ')'
        );
        _cursorEl.style.display = '';
      }

      // Text preview follows mouse
      if (_currentTool === 'text') {
        var textInput = document.getElementById('tm-text-input');
        var txt = textInput ? textInput.value : '';
        if (_textPreviewEl && _textPreviewEl.parentNode) {
          _svgEl.removeChild(_textPreviewEl);
          _textPreviewEl = null;
        }
        if (txt) {
          _textPreviewEl = _createText(
            p.x,
            p.y,
            txt,
            _textOptions.size,
            _textOptions.align,
            _currentColor
          );
          _textPreviewEl.setAttribute('opacity', '0.5');
          _textPreviewEl.setAttribute('data-preview', 'true');
          _svgEl.appendChild(_textPreviewEl);
        }
      }

      if (!_drawing) {
        return;
      }

      if (_currentTool === 'point') {
        _svgEl.appendChild(_createPoint(p.x, p.y, _currentColor));
        return;
      }

      // Live preview for drag-based tools
      if (_previewEl && _previewEl.parentNode) {
        _svgEl.removeChild(_previewEl);
      }
      _previewEl = _buildPreview(_startX, _startY, p.x, p.y);
      if (_previewEl) {
        _svgEl.appendChild(_previewEl);
      }
    };

    var _onMouseUp = function () {
      if (!_drawing) {
        return;
      }
      _drawing = false;

      if (_previewEl && _previewEl.parentNode) {
        _previewEl.removeAttribute('opacity');
        _previewEl.removeAttribute('data-preview');
        _previewEl = null;
      }
    };

    var _onMouseLeave = function () {
      if (_cursorEl) {
        _cursorEl.style.display = 'none';
      }
      if (_textPreviewEl && _textPreviewEl.parentNode) {
        _svgEl.removeChild(_textPreviewEl);
        _textPreviewEl = null;
      }
      if (_drawing && _previewEl && _previewEl.parentNode) {
        _previewEl.removeAttribute('opacity');
        _previewEl.removeAttribute('data-preview');
        _previewEl = null;
      }
      _drawing = false;
    };

    // --- Tool selection ---
    var _selectTool = function (toolName) {
      _currentTool = toolName;
      var buttons = containerEl.querySelectorAll('.tm-tool-btn');
      for (var i = 0; i < buttons.length; i++) {
        var btn = buttons[i];
        if (btn.getAttribute('data-tool') === toolName) {
          btn.classList.add('tm-active');
        } else {
          btn.classList.remove('tm-active');
        }
      }
      // Show/hide text options
      var textOpts = document.getElementById('tm-text-options');
      if (textOpts) {
        textOpts.style.display = toolName === 'text' ? 'block' : 'none';
      }
    };

    // --- Export SVG ---
    var _exportSVG = function () {
      // Build a clean <svg> from the drawing layer <g> children
      var wrapper = document.createElementNS(SVG_NS, 'svg');
      wrapper.setAttribute('xmlns', SVG_NS);
      wrapper.setAttribute('viewBox', '0 0 64 64');
      // Copy drawing children
      var children = _svgEl.childNodes;
      for (var i = 0; i < children.length; i++) {
        var child = children[i].cloneNode(true);
        // Skip preview elements
        if (child.getAttribute && child.getAttribute('data-preview')) {
          continue;
        }
        wrapper.appendChild(child);
      }
      var serializer = new XMLSerializer();
      return serializer.serializeToString(wrapper);
    };

    // --- Load existing SVG into canvas ---
    var _loadSVG = function (svgString) {
      if (!svgString || svgString.length === 0) {
        return;
      }
      var parser = new DOMParser();
      var doc = parser.parseFromString(svgString, 'image/svg+xml');
      var srcSvg = doc.querySelector('svg');
      if (!srcSvg) {
        return;
      }
      // Clear drawing layer and copy children
      while (_svgEl.firstChild) {
        _svgEl.removeChild(_svgEl.firstChild);
      }
      while (srcSvg.firstChild) {
        _svgEl.appendChild(document.importNode(srcSvg.firstChild, true));
      }
    };

    // --- Build UI HTML ---
    var _buildUI = function () {
      var html = [];

      // Header with title and close button
      html.push('<div class="tm-panel-header">');
      html.push('  <span>Thumbnail Maker</span>');
      html.push(
        '  <button id="tm-close" class="tm-close-btn" title="Close">&#10005;</button>'
      );
      html.push('</div>');

      // Toolbar
      html.push('<div class="tm-toolbar">');
      html.push(
        '<button class="tm-tool-btn tm-active" data-tool="point" title="Point / Freehand">&#8226;</button>'
      );
      html.push(
        '<button class="tm-tool-btn" data-tool="line" title="Line">&#9585;</button>'
      );
      html.push(
        '<button class="tm-tool-btn tm-icon-lg" data-tool="rect-fill" title="Filled Rectangle">&#9632;</button>'
      );
      html.push(
        '<button class="tm-tool-btn tm-icon-lg" data-tool="rect-stroke" title="Open Rectangle">&#9633;</button>'
      );
      html.push(
        '<button class="tm-tool-btn tm-icon-lg" data-tool="ellipse-fill" title="Filled Circle">&#9679;</button>'
      );
      html.push(
        '<button class="tm-tool-btn tm-icon-lg" data-tool="ellipse-stroke" title="Open Circle">&#9675;</button>'
      );
      html.push(
        '<button class="tm-tool-btn" data-tool="text" title="Text">T</button>'
      );
      html.push(
        '<button class="tm-tool-btn tm-action-btn" data-action="undo" title="Undo">&#8630;</button>'
      );
      html.push(
        '<button class="tm-tool-btn tm-action-btn" data-action="clear" title="Clear All">&#10005;</button>'
      );
      html.push(
        '<button id="tm-apply" class="tm-apply-btn" data-action="apply" title="Apply to Project">Apply</button>'
      );
      html.push('</div>');

      // Color picker — always visible
      html.push('<div class="tm-color-row">');
      html.push('  <label>Color:</label>');
      html.push(
        '  <input type="color" id="tm-color" value="#000000" title="Color" class="tm-color-input">'
      );
      html.push(
        '  <span id="tm-color-hex" style="font-family:monospace; font-size:12px;">#000000</span>'
      );
      html.push('</div>');

      // Text options (hidden by default)
      html.push('<div id="tm-text-options" style="display:none;">');
      html.push(
        '  <input type="text" id="tm-text-input" class="ajs-input" placeholder="Enter text..." style="width:100%; margin-bottom:4px;">'
      );
      html.push('  <div style="display:flex; gap:4px; align-items:center;">');
      html.push('    <select id="tm-text-size" class="tm-select">');
      html.push('      <option value="4">4</option>');
      html.push('      <option value="6">6</option>');
      html.push('      <option value="8">8</option>');
      html.push('      <option value="10" selected>10</option>');
      html.push('      <option value="12">12</option>');
      html.push('      <option value="16">16</option>');
      html.push('      <option value="20">20</option>');
      html.push('    </select>');
      html.push(
        '    <button class="tm-align-btn" data-align="start" title="Left">L</button>'
      );
      html.push(
        '    <button class="tm-align-btn tm-active" data-align="middle" title="Center">C</button>'
      );
      html.push(
        '    <button class="tm-align-btn" data-align="end" title="Right">R</button>'
      );
      html.push('  </div>');
      html.push('</div>');

      // SVG Canvas with grid overlay
      html.push('<div class="tm-canvas-wrap">');
      html.push(
        '  <svg id="tm-canvas-outer" viewBox="0 0 64 64" width="384" height="384" style="position:relative;">'
      );
      html.push('    <defs>');
      html.push(
        '      <pattern id="tm-grid-pattern" width="1" height="1" patternUnits="userSpaceOnUse">'
      );
      html.push(
        '        <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#ddd" stroke-width="0.05"/>'
      );
      html.push('      </pattern>');
      html.push('    </defs>');
      // Drawing layer
      html.push('    <g id="tm-canvas"></g>');
      // Grid overlay
      html.push(
        '    <rect width="64" height="64" fill="url(#tm-grid-pattern)" pointer-events="none"/>'
      );
      // Custom cursor — black cross with white border
      html.push(
        '    <g id="tm-cursor" pointer-events="none" style="display:none;">'
      );
      html.push(
        '      <line x1="-3" y1="0.5" x2="4" y2="0.5" stroke="white" stroke-width="0.4"/>'
      );
      html.push(
        '      <line x1="0.5" y1="-3" x2="0.5" y2="4" stroke="white" stroke-width="0.4"/>'
      );
      html.push(
        '      <line x1="-3" y1="0.5" x2="4" y2="0.5" stroke="black" stroke-width="0.15"/>'
      );
      html.push(
        '      <line x1="0.5" y1="-3" x2="0.5" y2="4" stroke="black" stroke-width="0.15"/>'
      );
      html.push('    </g>');
      html.push('  </svg>');
      html.push('</div>');

      // Status bar
      html.push(
        '<div class="tm-status"><span id="tm-coords">0, 0</span></div>'
      );

      containerEl.innerHTML = html.join('\n');
    };

    // --- Wire up events ---
    var _wireToolbar = function () {
      // Tool buttons
      var toolBtns = containerEl.querySelectorAll(
        '.tm-tool-btn:not(.tm-action-btn)'
      );
      for (var i = 0; i < toolBtns.length; i++) {
        toolBtns[i].addEventListener('click', function () {
          var tool = this.getAttribute('data-tool');
          if (tool) {
            _selectTool(tool);
          }
        });
      }

      // Action buttons (undo, clear)
      var actionBtns = containerEl.querySelectorAll('.tm-action-btn');
      for (var j = 0; j < actionBtns.length; j++) {
        actionBtns[j].addEventListener('click', function () {
          var action = this.getAttribute('data-action');
          if (action === 'undo') {
            _undo();
          } else if (action === 'clear') {
            _clearCanvas();
          }
        });
      }

      // Color picker
      var colorInput = document.getElementById('tm-color');
      if (colorInput) {
        colorInput.addEventListener('input', function () {
          _currentColor = this.value;
          var hexLabel = document.getElementById('tm-color-hex');
          if (hexLabel) {
            hexLabel.textContent = this.value;
          }
        });
      }

      // Text size
      var sizeSelect = document.getElementById('tm-text-size');
      if (sizeSelect) {
        sizeSelect.addEventListener('change', function () {
          _textOptions.size = parseInt(this.value, 10);
        });
      }

      // Text alignment
      var alignBtns = containerEl.querySelectorAll('.tm-align-btn');
      for (var k = 0; k < alignBtns.length; k++) {
        alignBtns[k].addEventListener('click', function () {
          for (var m = 0; m < alignBtns.length; m++) {
            alignBtns[m].classList.remove('tm-active');
          }
          this.classList.add('tm-active');
          _textOptions.align = this.getAttribute('data-align');
        });
      }
    };

    // --- Public API ---
    var _init = function () {
      _buildUI();
      _svgEl = document.getElementById('tm-canvas'); // <g> drawing layer
      _outerSvg = document.getElementById('tm-canvas-outer'); // outer <svg>
      _cursorEl = document.getElementById('tm-cursor');

      _boundMouseDown = _onMouseDown.bind(null);
      _boundMouseMove = _onMouseMove.bind(null);
      _boundMouseUp = _onMouseUp.bind(null);
      _boundMouseLeave = _onMouseLeave.bind(null);
      _boundMouseEnter = _onMouseEnter.bind(null);

      _outerSvg.addEventListener('mousedown', _boundMouseDown);
      _outerSvg.addEventListener('mousemove', _boundMouseMove);
      _outerSvg.addEventListener('mouseup', _boundMouseUp);
      _outerSvg.addEventListener('mouseleave', _boundMouseLeave);
      _outerSvg.addEventListener('mouseenter', _boundMouseEnter);

      _wireToolbar();
    };

    var _destroy = function () {
      if (_outerSvg) {
        _outerSvg.removeEventListener('mousedown', _boundMouseDown);
        _outerSvg.removeEventListener('mousemove', _boundMouseMove);
        _outerSvg.removeEventListener('mouseup', _boundMouseUp);
        _outerSvg.removeEventListener('mouseleave', _boundMouseLeave);
        _outerSvg.removeEventListener('mouseenter', _boundMouseEnter);
      }
      _undoStack = [];
      _previewEl = null;
      _drawing = false;
    };

    return {
      init: _init,
      destroy: _destroy,
      exportSVG: _exportSVG,
      loadSVG: _loadSVG,
    };
  };
})();
