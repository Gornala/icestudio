'use strict';

// ============================================================
// WaveformViewer — HTML5 Canvas digital waveform viewer
// ============================================================

var DEFAULT_COLORS = [
  '#4fc3f7',
  '#81c784',
  '#ffb74d',
  '#e57373',
  '#ba68c8',
  '#4db6ac',
  '#d4a017',
  '#f06292',
  '#90a4ae',
  '#aed581',
];

window.WaveformViewer = function (containerEl, options) {
  if (!containerEl) {
    return;
  }

  // ----- State -----
  var self = this;
  var opts = options || {};
  var data = null; // parsed VCD data
  var signals = []; // display list: {sig, visible, color, displayMode}
  var busGroups = [];
  var viewStart = 0;
  var viewEnd = 0;
  var markerA = null;
  var markerB = null;
  var signalRowHeight = 30;
  var dpr = window.devicePixelRatio || 1;
  var selectedIndices = {}; // track selected signal indices for bus grouping

  // ----- DOM refs (created in buildDOM) -----
  var toolbar, overviewCanvas, waveformCanvas, timeAxisCanvas;
  var signalListEl, measurementEl, canvasCol;
  var markerInfoEl; // marker A/B/Δ display in measurement panel
  var body; // .wv-body
  var draggingMarker = null; // 'A' or 'B' when dragging a marker

  // ----- Cached CSS colors -----
  var colors = {};

  // =========================================================
  // Build DOM
  // =========================================================
  function buildDOM() {
    containerEl.innerHTML = '';

    // Toolbar
    toolbar = el('div', 'wv-toolbar');
    var btnZoomFit = el('button', 'wv-btn', 'Zoom Fit');
    btnZoomFit.title = 'Fit entire simulation';
    var btnZoomIn = el('button', 'wv-btn', '+');
    btnZoomIn.title = 'Zoom in';
    var btnZoomOut = el('button', 'wv-btn', '\u2212');
    btnZoomOut.title = 'Zoom out';
    var btnGroupBus = el('button', 'wv-btn wv-btn-group', 'Group as Bus');
    btnGroupBus.title =
      'Ctrl+click 2 or more signal names to select, then click here to group them as a bus';
    btnGroupBus.disabled = true;
    btnGroupBus.addEventListener('click', function () {
      groupSelectedAsBus();
    });
    toolbar.appendChild(btnZoomFit);
    toolbar.appendChild(btnZoomIn);
    toolbar.appendChild(btnZoomOut);
    toolbar.appendChild(btnGroupBus);
    containerEl.appendChild(toolbar);

    // Body (flex row)
    body = el('div', 'wv-body');

    // Signal list (with spacer to align with overview+marker canvases)
    var signalCol = el('div', 'wv-signal-col');
    var signalSpacer = el('div', 'wv-signal-spacer');
    signalSpacer.style.height = '120px'; // match overview + marker info height
    signalSpacer.style.flexShrink = '0';
    signalCol.appendChild(signalSpacer);
    signalListEl = el('div', 'wv-signal-list');
    signalCol.appendChild(signalListEl);
    body.appendChild(signalCol);

    var wvHandleLeft = el('div', 'resize-handle resize-handle-v');
    body.appendChild(wvHandleLeft);

    // Canvas column
    canvasCol = el('div', 'wv-canvas-col');

    overviewCanvas = el('canvas', 'wv-overview');
    canvasCol.appendChild(overviewCanvas);

    var waveformWrap = el('div', 'wv-waveform-wrap');
    waveformCanvas = el('canvas', 'wv-waveform');
    waveformWrap.appendChild(waveformCanvas);
    // Hover tooltip for integer values
    var tooltip = el('div', 'wv-tooltip');
    tooltip.style.display = 'none';
    waveformWrap.appendChild(tooltip);
    canvasCol.appendChild(waveformWrap);

    timeAxisCanvas = el('canvas', 'wv-timeaxis');
    canvasCol.appendChild(timeAxisCanvas);

    body.appendChild(canvasCol);

    var wvHandleRight = el('div', 'resize-handle resize-handle-v');
    body.appendChild(wvHandleRight);

    // Measurement panel — marker info at top (fixed), edge rows below (scrollable)
    var measCol = el('div', 'wv-meas-col');
    markerInfoEl = el('div', 'wv-meas-marker-info');
    measCol.appendChild(markerInfoEl);
    updateMarkerInfo();
    measurementEl = el('div', 'wv-measurement');
    measCol.appendChild(measurementEl);
    body.appendChild(measCol);

    containerEl.appendChild(body);

    // --- Events ---
    btnZoomFit.addEventListener('click', function () {
      zoomFit();
    });
    btnZoomIn.addEventListener('click', function () {
      zoom((viewStart + viewEnd) / 2, 0.5);
    });
    btnZoomOut.addEventListener('click', function () {
      zoom((viewStart + viewEnd) / 2, 2);
    });

    // Waveform zoom (wheel) and pan (drag)
    waveformCanvas.addEventListener('wheel', onWheelWaveform);
    waveformCanvas.addEventListener('mousedown', onMouseDownWaveform);
    waveformCanvas.addEventListener('mousemove', onMouseMoveWaveform);
    waveformCanvas.addEventListener('mouseleave', onMouseLeaveWaveform);

    // Overview click/drag
    overviewCanvas.addEventListener('mousedown', onMouseDownOverview);

    // Signal list scroll sync — keep signal list, waveform, and measurement in sync
    signalListEl.addEventListener('scroll', function () {
      measurementEl.scrollTop = signalListEl.scrollTop;
      render();
    });
    measurementEl.addEventListener('scroll', function () {
      signalListEl.scrollTop = measurementEl.scrollTop;
      render();
    });

    // Column resize handles
    _bindWvHandle(wvHandleLeft, signalCol, 1, 80, 500);
    _bindWvHandle(wvHandleRight, measCol, -1, 100, 500);
  }

  function _bindWvHandle(handle, targetCol, dir, minW, maxW) {
    handle.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      handle.classList.add('dragging');
      var lastX = e.clientX;
      var onMove = function (ev) {
        var dx = (ev.clientX - lastX) * dir;
        lastX = ev.clientX;
        if (dx === 0) {
          return;
        }
        var newW = Math.max(minW, Math.min(maxW, targetCol.offsetWidth + dx));
        targetCol.style.width = newW + 'px';
        self.resize();
      };
      var onUp = function () {
        handle.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // =========================================================
  // Public API
  // =========================================================
  this.loadVCD = function (vcdContent) {
    data = window.parseVCD(vcdContent);
    signals = [];
    busGroups = [];
    markerA = null;
    markerB = null;

    // Detect duplicate short names so we can show fullName for disambiguation
    var nameCount = {};
    for (var j = 0; j < data.signals.length; j++) {
      var sn = data.signals[j].name;
      nameCount[sn] = (nameCount[sn] || 0) + 1;
    }

    for (var i = 0; i < data.signals.length; i++) {
      var sig = data.signals[i];
      // Use fullName if the short name is not unique
      var displayName = nameCount[sig.name] > 1 ? sig.fullName : sig.name;
      // Bus signals get taller rows (extra space for mode buttons)
      var isBus = sig.width > 1;
      var rowH = isBus ? 55 : signalRowHeight;
      signals.push({
        sig: sig,
        displayName: displayName,
        visible: true,
        color: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
        displayMode: isBus ? 'hex' : 'digital',
        invertBits: false,
        rowHeight: rowH,
      });
    }

    viewStart = 0;
    viewEnd = data.maxTime || 1;
    buildSignalList();
    self.resize();
  };

  this.resize = function () {
    dpr = window.devicePixelRatio || 1;
    sizeCanvas(overviewCanvas, null, 120);
    sizeCanvas(timeAxisCanvas, null, 20);
    // Waveform canvas fills remaining height — use parent's clientHeight
    var wrapH = waveformCanvas.parentElement.clientHeight;
    sizeCanvas(waveformCanvas, null, wrapH > 0 ? wrapH : 300);
    render();
  };

  this.destroy = function () {
    containerEl.innerHTML = '';
  };

  // ----- State persistence -----
  this.getState = function () {
    var sigStates = [];
    var busGroupStates = [];
    for (var i = 0; i < signals.length; i++) {
      var s = signals[i];
      if (s.isBusGroup) {
        // Save bus group separately with member fullNames
        var memberNames = [];
        if (s.memberIndices) {
          for (var mi = 0; mi < s.memberIndices.length; mi++) {
            var mIdx = s.memberIndices[mi];
            if (mIdx < signals.length && signals[mIdx]) {
              memberNames.push(signals[mIdx].sig.fullName);
            }
          }
        }
        busGroupStates.push({
          name: s.sig.name,
          memberFullNames: memberNames,
          color: s.color,
          displayMode: s.displayMode,
          invertBits: s.invertBits,
          visible: s.visible,
        });
      } else {
        sigStates.push({
          fullName: s.sig.fullName,
          color: s.color,
          visible: s.visible,
          displayMode: s.displayMode,
          invertBits: s.invertBits || false,
        });
      }
    }
    // Save signal order (by fullName) so we can restore it
    var order = [];
    for (var oi = 0; oi < signals.length; oi++) {
      order.push(signals[oi].sig.fullName);
    }
    return {
      signals: sigStates,
      busGroups: busGroupStates,
      signalOrder: order,
      viewStart: viewStart,
      viewEnd: viewEnd,
      markerA: markerA,
      markerB: markerB,
    };
  };

  this.applyState = function (state) {
    if (!state) {
      return;
    }
    // Build lookup from saved signal states by fullName
    var saved = {};
    if (state.signals) {
      for (var j = 0; j < state.signals.length; j++) {
        saved[state.signals[j].fullName] = state.signals[j];
      }
    }
    // Apply per-signal settings
    for (var i = 0; i < signals.length; i++) {
      var s = signals[i];
      var sv = saved[s.sig.fullName];
      if (sv) {
        s.color = sv.color || s.color;
        s.visible = sv.visible !== undefined ? sv.visible : s.visible;
        s.displayMode = sv.displayMode || s.displayMode;
        s.invertBits = sv.invertBits || false;
      }
    }
    // Recreate bus groups
    if (state.busGroups) {
      for (var gi = 0; gi < state.busGroups.length; gi++) {
        var bg = state.busGroups[gi];
        // Find member indices by fullName
        var indices = [];
        for (var ni = 0; ni < bg.memberFullNames.length; ni++) {
          for (var si = 0; si < signals.length; si++) {
            if (signals[si].sig.fullName === bg.memberFullNames[ni]) {
              indices.push(si);
              break;
            }
          }
        }
        if (indices.length >= 2) {
          var members = indices.map(function (idx) {
            return signals[idx];
          });
          var mergedChanges = computeBusGroupChanges(members);
          // Hide members
          for (var hi = 0; hi < indices.length; hi++) {
            signals[indices[hi]].visible = false;
          }
          var insertPos = indices[indices.length - 1] + 1;
          signals.splice(insertPos, 0, {
            sig: {
              name: bg.name,
              fullName: bg.name,
              width: indices.length,
              type: 'bus_group',
              changes: mergedChanges,
            },
            displayName: bg.name,
            visible: bg.visible !== undefined ? bg.visible : true,
            color: bg.color || members[0].color,
            displayMode: bg.displayMode || 'hex',
            invertBits: bg.invertBits || false,
            rowHeight: 55,
            isBusGroup: true,
            memberIndices: indices,
          });
        }
      }
    }
    // Apply view range (only if data loaded and range is valid and non-zero)
    if (data && state.viewStart !== undefined && state.viewEnd !== undefined) {
      var savedRange = state.viewEnd - state.viewStart;
      if (
        savedRange > 0 &&
        state.viewEnd <= data.maxTime &&
        state.viewStart >= 0
      ) {
        viewStart = state.viewStart;
        viewEnd = state.viewEnd;
      }
    }
    // Apply markers
    if (state.markerA !== undefined) {
      markerA = state.markerA;
    }
    if (state.markerB !== undefined) {
      markerB = state.markerB;
    }
    // Restore signal order
    if (state.signalOrder && state.signalOrder.length > 0) {
      var orderMap = {};
      for (var oi = 0; oi < state.signalOrder.length; oi++) {
        orderMap[state.signalOrder[oi]] = oi;
      }
      signals.sort(function (a, b) {
        var posA =
          orderMap[a.sig.fullName] !== undefined
            ? orderMap[a.sig.fullName]
            : 9999;
        var posB =
          orderMap[b.sig.fullName] !== undefined
            ? orderMap[b.sig.fullName]
            : 9999;
        return posA - posB;
      });
    }
    buildSignalList();
    render();
  };

  // =========================================================
  // Zoom / Pan
  // =========================================================
  function zoomFit() {
    if (!data) {
      return;
    }
    viewStart = 0;
    viewEnd = data.maxTime || 1;
    render();
  }

  function zoom(centerTime, factor) {
    if (!data) {
      return;
    }
    var range = viewEnd - viewStart;
    var newRange = range * factor;
    // Clamp minimum zoom (at least 10 time units visible)
    if (newRange < 10) {
      newRange = 10;
    }
    // Clamp maximum zoom (full range)
    if (newRange > data.maxTime) {
      newRange = data.maxTime;
    }
    var ratio = (centerTime - viewStart) / range;
    viewStart = centerTime - newRange * ratio;
    viewEnd = viewStart + newRange;
    // Clamp to data bounds
    if (viewStart < 0) {
      viewEnd -= viewStart;
      viewStart = 0;
    }
    if (viewEnd > data.maxTime) {
      viewStart -= viewEnd - data.maxTime;
      viewEnd = data.maxTime;
      if (viewStart < 0) {
        viewStart = 0;
      }
    }
    render();
  }

  function pan(deltaTime) {
    if (!data) {
      return;
    }
    viewStart += deltaTime;
    viewEnd += deltaTime;
    if (viewStart < 0) {
      viewEnd -= viewStart;
      viewStart = 0;
    }
    if (viewEnd > data.maxTime) {
      viewStart -= viewEnd - data.maxTime;
      viewEnd = data.maxTime;
    }
    render();
  }

  // =========================================================
  // Event handlers
  // =========================================================
  function onWheelWaveform(e) {
    e.preventDefault();
    var rect = waveformCanvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var range = viewEnd - viewStart;
    var centerTime = viewStart + (mx / rect.width) * range;
    var factor = e.deltaY > 0 ? 1.3 : 1 / 1.3;
    zoom(centerTime, factor);
  }

  var dragState = null;

  // Marker handle height in pixels (triangle at top of waveform)
  var MARKER_HANDLE_H = 16;
  var MARKER_HIT_PX = 8; // pixel proximity to detect marker hit

  function getMarkerX(time) {
    if (time === null) {
      return -999;
    }
    var rect = waveformCanvas.getBoundingClientRect();
    var range = viewEnd - viewStart;
    if (range <= 0) {
      return -999;
    }
    return ((time - viewStart) / range) * rect.width;
  }

  function hitTestMarker(mx) {
    // Returns 'A', 'B', or null
    var xA = getMarkerX(markerA);
    var xB = getMarkerX(markerB);
    var distA = markerA !== null ? Math.abs(mx - xA) : Infinity;
    var distB = markerB !== null ? Math.abs(mx - xB) : Infinity;
    // Prefer the closer marker
    if (distA <= MARKER_HIT_PX && distA <= distB) {
      return 'A';
    }
    if (distB <= MARKER_HIT_PX) {
      return 'B';
    }
    return null;
  }

  function onMouseDownWaveform(e) {
    if (e.button !== 0) {
      return;
    }
    e.preventDefault();
    var startX = e.clientX;
    var rect = waveformCanvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var range = viewEnd - viewStart;
    var timePerPx = range / rect.width;

    // Check if clicking near an existing marker (drag it)
    var hitMarker = hitTestMarker(mx);

    if (hitMarker) {
      // --- Drag existing marker ---
      draggingMarker = hitMarker;
      waveformCanvas.style.cursor = 'ew-resize';

      function onDragMove(ev) {
        var dmx = ev.clientX - rect.left;
        var newTime = Math.round(viewStart + dmx * timePerPx);
        if (newTime < 0) {
          newTime = 0;
        }
        if (data && newTime > data.maxTime) {
          newTime = data.maxTime;
        }
        if (draggingMarker === 'A') {
          markerA = newTime;
        } else {
          markerB = newTime;
        }
        render();
      }

      function onDragUp() {
        draggingMarker = null;
        waveformCanvas.style.cursor = '';
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragUp);
      }

      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup', onDragUp);
      return;
    }

    // --- Pan or click-to-place-marker ---
    var startViewStart = viewStart;
    var startViewEnd = viewEnd;
    var moved = false;
    waveformCanvas.style.cursor = 'grabbing';

    function onMove(ev) {
      var dx = ev.clientX - startX;
      if (Math.abs(dx) >= 3) {
        moved = true;
      }
      var dt = -dx * timePerPx;
      viewStart = startViewStart + dt;
      viewEnd = startViewEnd + dt;
      if (viewStart < 0) {
        viewEnd -= viewStart;
        viewStart = 0;
      }
      if (data && viewEnd > data.maxTime) {
        viewStart -= viewEnd - data.maxTime;
        viewEnd = data.maxTime;
      }
      render();
    }

    function onUp(ev) {
      waveformCanvas.style.cursor = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);

      if (!moved && data) {
        // Click without drag — place marker
        var cmx = ev.clientX - rect.left;
        var time = Math.round(viewStart + cmx * timePerPx);
        if (time < 0) {
          time = 0;
        }
        if (time > data.maxTime) {
          time = data.maxTime;
        }

        if (ev.shiftKey) {
          markerA = time;
        } else if (ev.ctrlKey) {
          markerB = time;
        } else {
          if (nextMarker === 'A') {
            markerA = time;
            nextMarker = 'B';
          } else {
            markerB = time;
            nextMarker = 'A';
          }
        }
        render();
      }
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function onMouseDownOverview(e) {
    if (!data) {
      return;
    }
    var rect = overviewCanvas.getBoundingClientRect();
    var clickRatio = (e.clientX - rect.left) / rect.width;
    var clickTime = clickRatio * data.maxTime;
    var range = viewEnd - viewStart;
    viewStart = clickTime - range / 2;
    viewEnd = viewStart + range;
    if (viewStart < 0) {
      viewEnd -= viewStart;
      viewStart = 0;
    }
    if (viewEnd > data.maxTime) {
      viewStart -= viewEnd - data.maxTime;
      viewEnd = data.maxTime;
    }
    render();

    // Allow drag
    function onMove2(ev) {
      var r2 = (ev.clientX - rect.left) / rect.width;
      var t2 = r2 * data.maxTime;
      viewStart = t2 - range / 2;
      viewEnd = viewStart + range;
      if (viewStart < 0) {
        viewEnd -= viewStart;
        viewStart = 0;
      }
      if (viewEnd > data.maxTime) {
        viewStart -= viewEnd - data.maxTime;
        viewEnd = data.maxTime;
      }
      render();
    }

    function onUp2() {
      document.removeEventListener('mousemove', onMove2);
      document.removeEventListener('mouseup', onUp2);
    }

    document.addEventListener('mousemove', onMove2);
    document.addEventListener('mouseup', onUp2);
  }

  // Hover tooltip for integer plots + marker cursor hint
  function onMouseMoveWaveform(e) {
    var tip = containerEl.querySelector('.wv-tooltip');
    if (!tip || !data) {
      return;
    }
    var rect = waveformCanvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;

    // Show resize cursor when hovering near a marker
    if (!draggingMarker) {
      var hit = hitTestMarker(mx);
      waveformCanvas.style.cursor = hit ? 'ew-resize' : '';
    }

    var rangeT = viewEnd - viewStart;
    if (rangeT <= 0) {
      tip.style.display = 'none';
      return;
    }
    var hoverTime = viewStart + (mx / rect.width) * rangeT;
    var scrollY = signalListEl.scrollTop;

    // Find which signal lane the cursor is in
    var yOffset = 0;
    var found = null;
    for (var i = 0; i < signals.length; i++) {
      var s = signals[i];
      if (!s.visible) {
        continue;
      }
      var rh = s.rowHeight || signalRowHeight;
      var laneTop = yOffset - scrollY;
      var laneBottom = laneTop + rh;
      yOffset += rh;
      if (
        my >= laneTop &&
        my < laneBottom &&
        s.displayMode === 'int' &&
        s.sig.width > 1
      ) {
        found = s;
        break;
      }
    }

    if (!found) {
      tip.style.display = 'none';
      return;
    }

    var rawVal = getValueAtTime(found.sig, hoverTime);
    if (rawVal === '\u2014') {
      tip.style.display = 'none';
      return;
    }
    var intVal = parseInt(maybeInvert(rawVal, found.invertBits), 2);
    if (isNaN(intVal)) {
      tip.style.display = 'none';
      return;
    }

    tip.textContent = String(intVal);
    tip.style.display = '';
    // Position tooltip near cursor, offset slightly
    var tipX = mx + 12;
    var tipY = my - 20;
    if (tipX + 60 > rect.width) {
      tipX = mx - 60;
    }
    if (tipY < 0) {
      tipY = my + 12;
    }
    tip.style.left = tipX + 'px';
    tip.style.top = tipY + 'px';
  }

  function onMouseLeaveWaveform() {
    var tip = containerEl.querySelector('.wv-tooltip');
    if (tip) {
      tip.style.display = 'none';
    }
  }

  var nextMarker = 'A'; // alternates between A and B

  // =========================================================
  // Signal list (HTML)
  // =========================================================
  var dragSrcIdx = null; // drag-and-drop source index

  function buildSignalList() {
    signalListEl.innerHTML = '';
    measurementEl.innerHTML = '';

    // Split into visible and disabled signal indices (preserving order)
    var visibleIdxs = [];
    var disabledIdxs = [];
    for (var k = 0; k < signals.length; k++) {
      if (signals[k].visible) {
        visibleIdxs.push(k);
      } else {
        disabledIdxs.push(k);
      }
    }

    // --- Visible signals (these match the waveform canvas exactly) ---
    for (var vi = 0; vi < visibleIdxs.length; vi++) {
      (function (idx) {
        var s = signals[idx];
        var row = buildSignalRow(idx, s, true);
        signalListEl.appendChild(row);

        // Measurement row (matches waveform lane)
        var rh = s.rowHeight || signalRowHeight;
        var mRow = el('div', 'wv-meas-row');
        mRow.style.height = rh + 'px';
        mRow.id = 'meas-' + idx;
        mRow.innerHTML = '<span>\u2014</span>';
        measurementEl.appendChild(mRow);
      })(visibleIdxs[vi]);
    }

    // Drop zone after last visible signal (allows dragging to the end)
    if (visibleIdxs.length > 0) {
      var lastVisIdx = visibleIdxs[visibleIdxs.length - 1];
      var dropEnd = el('div', 'wv-drop-end');
      dropEnd.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        dropEnd.classList.add('wv-drag-over');
      });
      dropEnd.addEventListener('dragleave', function () {
        dropEnd.classList.remove('wv-drag-over');
      });
      dropEnd.addEventListener('drop', function (e) {
        e.preventDefault();
        dropEnd.classList.remove('wv-drag-over');
        var fromIdx = dragSrcIdx;
        if (fromIdx !== null) {
          // Move to after the last visible signal
          var targetIdx = lastVisIdx;
          if (fromIdx !== targetIdx && fromIdx !== targetIdx + 1) {
            moveSignalToEnd(fromIdx, targetIdx);
          }
        }
      });
      signalListEl.appendChild(dropEnd);
    }

    // --- Disabled signals separator + rows ---
    if (disabledIdxs.length > 0) {
      var sep = el(
        'div',
        'wv-disabled-separator',
        'Disabled (' + disabledIdxs.length + ')'
      );
      signalListEl.appendChild(sep);

      // Measurement separator (matching height)
      var mSep = el('div', 'wv-disabled-separator', '');
      measurementEl.appendChild(mSep);

      for (var di = 0; di < disabledIdxs.length; di++) {
        (function (idx) {
          var s = signals[idx];
          var row = buildSignalRow(idx, s, false);
          signalListEl.appendChild(row);

          // Measurement row for disabled signal
          var mRow = el('div', 'wv-meas-row wv-meas-disabled');
          mRow.style.height = '24px';
          mRow.id = 'meas-' + idx;
          mRow.innerHTML = '<span>\u2014</span>';
          measurementEl.appendChild(mRow);
        })(disabledIdxs[di]);
      }
    }
  }

  function buildSignalRow(idx, s, isDraggable) {
    var isBus = s.sig.width > 1;
    var rh = s.visible ? s.rowHeight || signalRowHeight : 24;
    var row = el('div', 'wv-signal-row');
    row.style.height = rh + 'px';
    if (!s.visible) {
      row.classList.add('wv-disabled');
    }
    if (selectedIndices[idx]) {
      row.classList.add('wv-selected');
    }

    // Drag handle + drag-and-drop
    var handle = el('span', 'wv-drag-handle', '\u2261');
    handle.title = 'Drag to reorder';
    row.appendChild(handle);

    row.draggable = true;
    row.dataset.idx = idx;
    row.addEventListener('dragstart', function (e) {
      dragSrcIdx = idx;
      row.classList.add('wv-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));
    });
    row.addEventListener('dragend', function () {
      row.classList.remove('wv-dragging');
      dragSrcIdx = null;
      // Remove all drop indicators
      var allRows = signalListEl.querySelectorAll('.wv-signal-row');
      for (var r = 0; r < allRows.length; r++) {
        allRows[r].classList.remove('wv-drag-over');
      }
    });
    row.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('wv-drag-over');
    });
    row.addEventListener('dragleave', function () {
      row.classList.remove('wv-drag-over');
    });
    row.addEventListener('drop', function (e) {
      e.preventDefault();
      row.classList.remove('wv-drag-over');
      var fromIdx = dragSrcIdx;
      var toIdx = idx;
      if (fromIdx !== null && fromIdx !== toIdx) {
        reorderSignal(fromIdx, toIdx);
      }
    });

    // Checkbox
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = s.visible;
    cb.addEventListener('change', function () {
      s.visible = cb.checked;
      buildSignalList();
      render();
    });
    row.appendChild(cb);

    // Color swatch with inline color input
    var swatch = el('div', 'wv-color-swatch');
    swatch.style.backgroundColor = s.color;
    var colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = s.color;
    colorInput.className = 'wv-color-input';
    colorInput.addEventListener('input', function () {
      s.color = colorInput.value;
      swatch.style.backgroundColor = s.color;
      render();
    });
    swatch.appendChild(colorInput);
    row.appendChild(swatch);

    // Top line: name + badge
    var topLine = el('div', 'wv-signal-top');

    // Name (use displayName for disambiguation)
    var nameEl = el('span', 'wv-signal-name', s.displayName);
    nameEl.title = s.sig.fullName;
    // Ctrl+click to select for bus grouping (1-bit signals only)
    nameEl.addEventListener('click', function (e) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        toggleSelection(idx);
      }
    });
    // Right-click context menu for bus groups
    if (s.isBusGroup) {
      nameEl.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        if (confirm('Ungroup "' + s.displayName + '"?')) {
          ungroupBus(idx);
        }
      });
    }
    topLine.appendChild(nameEl);

    // Width badge for buses
    if (isBus) {
      var badge = el('span', 'wv-width-badge', '[' + s.sig.width + ']');
      topLine.appendChild(badge);
    }

    row.appendChild(topLine);

    // Mode buttons for buses (hex/bin/int + invert toggle)
    if (isBus && s.visible) {
      var modeBtns = el('div', 'wv-mode-btns');
      var modes = [
        { label: 'HEX', mode: 'hex' },
        { label: 'BIN', mode: 'bin' },
        { label: 'INT', mode: 'int' },
        { label: 'ASCII', mode: 'ascii' },
      ];
      modes.forEach(function (m) {
        var btn = el('button', 'wv-mode-btn', m.label);
        if (s.displayMode === m.mode) {
          btn.classList.add('active');
        }
        btn.addEventListener('click', function () {
          s.displayMode = m.mode;
          buildSignalList();
          render();
        });
        modeBtns.appendChild(btn);
      });
      // INV toggle
      var invBtn = el('button', 'wv-mode-btn', 'INV');
      if (s.invertBits) {
        invBtn.classList.add('active');
      }
      invBtn.addEventListener('click', function () {
        s.invertBits = !s.invertBits;
        buildSignalList();
        render();
      });
      modeBtns.appendChild(invBtn);
      row.appendChild(modeBtns);
    }

    return row;
  }

  function reorderSignal(fromIdx, toIdx) {
    // Move signal from fromIdx to the position of toIdx in the signals array
    var item = signals.splice(fromIdx, 1)[0];
    // After splice, indices shift: if fromIdx < toIdx, toIdx is now one less
    var insertAt = fromIdx < toIdx ? toIdx - 1 : toIdx;
    signals.splice(insertAt, 0, item);

    // Update bus group memberIndices to reflect new positions
    for (var i = 0; i < signals.length; i++) {
      if (signals[i].isBusGroup && signals[i].memberIndices) {
        var newIndices = [];
        for (var mi = 0; mi < signals[i].memberIndices.length; mi++) {
          var oldIdx = signals[i].memberIndices[mi];
          // Map old index to new index after the move
          var newI = oldIdx;
          if (oldIdx === fromIdx) {
            newI = insertAt;
          } else {
            if (fromIdx < toIdx) {
              if (oldIdx > fromIdx && oldIdx <= insertAt) {
                newI = oldIdx - 1;
              }
            } else {
              if (oldIdx >= insertAt && oldIdx < fromIdx) {
                newI = oldIdx + 1;
              }
            }
          }
          newIndices.push(newI);
        }
        signals[i].memberIndices = newIndices;
      }
    }

    // Clear selection (indices changed)
    selectedIndices = {};
    buildSignalList();
    updateGroupButton();
    render();
  }

  function moveSignalToEnd(fromIdx, lastVisibleIdx) {
    // Move signal to after the last visible signal
    // We need to place it at position lastVisibleIdx + 1 in the array
    // But reorderSignal(from, to) places the item AT toIdx's position
    // So we use a direct splice approach
    var item = signals.splice(fromIdx, 1)[0];
    var insertAt =
      fromIdx <= lastVisibleIdx ? lastVisibleIdx : lastVisibleIdx + 1;
    signals.splice(insertAt, 0, item);
    selectedIndices = {};
    buildSignalList();
    updateGroupButton();
    render();
  }

  // =========================================================
  // Signal selection (for bus grouping)
  // =========================================================
  function toggleSelection(idx) {
    if (selectedIndices[idx]) {
      delete selectedIndices[idx];
    } else {
      selectedIndices[idx] = true;
    }
    buildSignalList();
    updateGroupButton();
  }

  function updateGroupButton() {
    var btn = containerEl.querySelector('.wv-btn-group');
    if (!btn) {
      return;
    }
    var count = Object.keys(selectedIndices).length;
    btn.disabled = count < 2;
    if (count >= 2) {
      btn.title = 'Group ' + count + ' selected signals as a bus';
    } else {
      btn.title =
        'Ctrl+click 2 or more signal names to select, then click here to group them as a bus';
    }
  }

  // =========================================================
  // Bus grouping
  // =========================================================
  function groupSelectedAsBus() {
    var indices = Object.keys(selectedIndices)
      .map(Number)
      .sort(function (a, b) {
        return a - b;
      });

    if (indices.length < 2) {
      return;
    }

    var name = prompt('Bus group name:', 'bus_group');
    if (!name) {
      return;
    }

    // Compute merged changes from member signals
    var members = indices.map(function (i) {
      return signals[i];
    });
    var mergedChanges = computeBusGroupChanges(members);

    // Hide member signals
    for (var i = 0; i < indices.length; i++) {
      signals[indices[i]].visible = false;
    }

    // Create bus group entry
    var busGroup = {
      sig: {
        name: name,
        fullName: name,
        width: indices.length,
        type: 'bus_group',
        changes: mergedChanges,
      },
      displayName: name,
      visible: true,
      color: members[0].color,
      displayMode: 'hex',
      invertBits: false,
      rowHeight: 55,
      isBusGroup: true,
      memberIndices: indices,
    };

    // Insert after the last member
    var insertPos = indices[indices.length - 1] + 1;
    signals.splice(insertPos, 0, busGroup);

    // Update memberIndices to account for the splice
    // (indices before insertPos are unchanged)

    selectedIndices = {};
    buildSignalList();
    updateGroupButton();
    render();
  }

  function computeBusGroupChanges(members) {
    // Collect all unique change times
    var timeSet = {};
    for (var m = 0; m < members.length; m++) {
      var changes = members[m].sig.changes;
      for (var c = 0; c < changes.length; c++) {
        timeSet[changes[c].time] = true;
      }
    }
    var times = Object.keys(timeSet)
      .map(Number)
      .sort(function (a, b) {
        return a - b;
      });

    // At each time, concatenate bit values (first member = MSB)
    var result = [];
    for (var t = 0; t < times.length; t++) {
      var time = times[t];
      var bits = '';
      for (var mi = 0; mi < members.length; mi++) {
        var val = getValueAtTime(members[mi].sig, time);
        if (val === '1') {
          bits += '1';
        } else if (val === '0') {
          bits += '0';
        } else {
          bits += 'x';
        }
      }
      result.push({ time: time, value: bits });
    }
    return result;
  }

  function ungroupBus(groupIdx) {
    var group = signals[groupIdx];
    if (!group || !group.isBusGroup) {
      return;
    }

    // Re-show member signals
    var memberIdxs = group.memberIndices;
    if (memberIdxs) {
      for (var i = 0; i < memberIdxs.length; i++) {
        // Account for the group entry shifting indices
        var mi = memberIdxs[i];
        if (mi >= groupIdx) {
          mi++;
        }
        if (mi < signals.length) {
          signals[mi].visible = true;
        }
      }
    }

    // Remove the group entry
    signals.splice(groupIdx, 1);

    buildSignalList();
    render();
  }

  // =========================================================
  // Rendering
  // =========================================================
  var renderQueued = false;

  function render() {
    if (renderQueued) {
      return;
    }
    renderQueued = true;
    requestAnimationFrame(function () {
      renderQueued = false;
      readColors();
      renderOverview();
      renderWaveform();
      renderTimeAxis();
      updateMeasurements();
    });
  }

  function readColors() {
    var s = getComputedStyle(document.documentElement);
    colors.bg = s.getPropertyValue('--ce-bg').trim() || '#f5f6f7';
    colors.bg2 = s.getPropertyValue('--ce-bg2').trim() || '#fff';
    colors.border = s.getPropertyValue('--ce-border').trim() || '#d5dadd';
    colors.text = s.getPropertyValue('--ce-text').trim() || '#333';
    colors.muted = s.getPropertyValue('--ce-muted').trim() || '#999';
    colors.accent = s.getPropertyValue('--ce-accent').trim() || '#63afcf';
  }

  // ----- Overview -----
  function renderOverview() {
    var ctx = getCtx(overviewCanvas);
    if (!ctx || !data) {
      return;
    }
    var w = overviewCanvas.clientWidth;
    var h = overviewCanvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, w, h);

    // Draw compressed signals
    var visSignals = signals.filter(function (s) {
      return s.visible;
    });
    var laneH = visSignals.length > 0 ? h / visSignals.length : h;

    for (var si = 0; si < visSignals.length; si++) {
      var s = visSignals[si];
      var sig = s.sig;
      var y0 = si * laneH;
      var y1 = y0 + laneH;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1;
      ctx.beginPath();

      for (var ci = 0; ci < sig.changes.length; ci++) {
        var ch = sig.changes[ci];
        var nextTime =
          ci + 1 < sig.changes.length ? sig.changes[ci + 1].time : data.maxTime;
        var x1 = (ch.time / data.maxTime) * w;
        var x2 = (nextTime / data.maxTime) * w;

        if (sig.width === 1) {
          var yVal = ch.value === '1' ? y0 + 2 : y1 - 2;
          if (ch.value === 'x' || ch.value === 'u') {
            yVal = (y0 + y1) / 2;
          }
          ctx.moveTo(x1, yVal);
          ctx.lineTo(x2, yVal);
        } else {
          // Bus: draw center line
          var yMid = (y0 + y1) / 2;
          ctx.moveTo(x1, yMid);
          ctx.lineTo(x2, yMid);
        }
      }
      ctx.stroke();
    }

    // Draw zoom region highlight
    if (data.maxTime > 0) {
      var zx1 = (viewStart / data.maxTime) * w;
      var zx2 = (viewEnd / data.maxTime) * w;
      ctx.fillStyle = 'rgba(100, 180, 255, 0.2)';
      ctx.fillRect(zx1, 0, zx2 - zx1, h);
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(zx1, 0, zx2 - zx1, h);
    }
  }

  // ----- Markers (drawn on waveform canvas) -----
  function drawMarkerOnWaveform(ctx, w, h, time, color, label) {
    if (time === null) {
      return;
    }
    var range = viewEnd - viewStart;
    if (range <= 0) {
      return;
    }
    var x = ((time - viewStart) / range) * w;
    if (x < -10 || x > w + 10) {
      return;
    }

    // Dashed vertical line spanning full height
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(x, MARKER_HANDLE_H);
    ctx.lineTo(x, h);
    ctx.stroke();
    ctx.restore();

    // Triangle handle at top
    var triH = MARKER_HANDLE_H;
    var triW = 8;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, triH); // point down
    ctx.lineTo(x - triW, 0);
    ctx.lineTo(x + triW, 0);
    ctx.closePath();
    ctx.fill();

    // Label inside triangle
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(label, x, 1);
    ctx.textBaseline = 'alphabetic';
  }

  // ----- Waveform (main canvas) -----
  function renderWaveform() {
    var ctx = getCtx(waveformCanvas);
    if (!ctx || !data) {
      return;
    }
    var w = waveformCanvas.clientWidth;
    var h = waveformCanvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = colors.bg2;
    ctx.fillRect(0, 0, w, h);

    var range = viewEnd - viewStart;
    if (range <= 0) {
      return;
    }

    var scrollY = signalListEl.scrollTop;
    var yOffset = 0; // cumulative Y position (variable row heights)

    for (var i = 0; i < signals.length; i++) {
      var s = signals[i];
      if (!s.visible) {
        continue;
      }

      var rh = s.rowHeight || signalRowHeight;
      var laneTop = yOffset - scrollY;
      var laneBottom = laneTop + rh;
      yOffset += rh;

      // Skip off-screen lanes
      if (laneBottom < 0 || laneTop > h) {
        continue;
      }

      // Draw lane separator
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, laneBottom);
      ctx.lineTo(w, laneBottom);
      ctx.stroke();

      if (s.sig.width === 1) {
        renderDigitalSignal(ctx, s, w, laneTop, laneBottom, range);
      } else {
        if (s.displayMode === 'int') {
          renderBusInteger(ctx, s, w, laneTop, laneBottom, range);
        } else {
          renderBusData(ctx, s, w, laneTop, laneBottom, range);
        }
      }
    }

    // Draw markers (triangle handles + dashed lines) on waveform
    drawMarkerOnWaveform(ctx, w, h, markerA, '#ff5722', 'A');
    drawMarkerOnWaveform(ctx, w, h, markerB, '#2196f3', 'B');

    // Draw signal values at marker crossing points
    drawMarkerValues(ctx, w, markerA, '#ff5722', 'left');
    drawMarkerValues(ctx, w, markerB, '#2196f3', 'right');
  }

  function formatValueForDisplay(s, rawVal) {
    if (rawVal === '\u2014') {
      return rawVal;
    }
    if (s.sig.width === 1) {
      return rawVal;
    }
    var binStr = maybeInvert(rawVal, s.invertBits);
    switch (s.displayMode) {
      case 'hex':
        return binToHex(binStr);
      case 'bin':
        return binStr;
      case 'int':
        var intVal = parseInt(binStr, 2);
        return isNaN(intVal) ? '?' : String(intVal);
      case 'ascii':
        return binToAscii(binStr);
      default:
        return binToHex(binStr);
    }
  }

  function drawMarkerValues(ctx, w, time, color, preferSide) {
    if (time === null || !data) {
      return;
    }
    var range = viewEnd - viewStart;
    if (range <= 0) {
      return;
    }
    var x = ((time - viewStart) / range) * w;
    if (x < -10 || x > w + 10) {
      return;
    }

    var scrollY = signalListEl.scrollTop;
    var yOffset = 0;
    var canvasH = waveformCanvas.clientHeight;

    ctx.save();
    ctx.font = '10px monospace';
    ctx.textBaseline = 'middle';

    for (var i = 0; i < signals.length; i++) {
      var s = signals[i];
      if (!s.visible) {
        continue;
      }

      var rh = s.rowHeight || signalRowHeight;
      var laneTop = yOffset - scrollY;
      var laneBottom = laneTop + rh;
      yOffset += rh;

      if (laneBottom < 0 || laneTop > canvasH) {
        continue;
      }

      var rawVal = getValueAtTime(s.sig, time);
      var displayVal = formatValueForDisplay(s, rawVal);

      var textWidth = ctx.measureText(displayVal).width;
      var pad = 4;
      var boxW = textWidth + pad * 2;
      var boxH = 14;
      var yCenter = (laneTop + laneBottom) / 2;
      var r = 3;

      // Position label to preferred side of marker, flip if no room
      var textX;
      if (preferSide === 'right' || preferSide === undefined) {
        textX = x + boxW + 6 < w ? x + 6 : x - boxW - 6;
      } else {
        textX = x - boxW - 6 >= 0 ? x - boxW - 6 : x + 6;
      }

      // Rounded-rect background pill
      var rx = textX - pad;
      var ry = yCenter - boxH / 2;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(rx + r, ry);
      ctx.lineTo(rx + boxW - r, ry);
      ctx.arcTo(rx + boxW, ry, rx + boxW, ry + r, r);
      ctx.lineTo(rx + boxW, ry + boxH - r);
      ctx.arcTo(rx + boxW, ry + boxH, rx + boxW - r, ry + boxH, r);
      ctx.lineTo(rx + r, ry + boxH);
      ctx.arcTo(rx, ry + boxH, rx, ry + boxH - r, r);
      ctx.lineTo(rx, ry + r);
      ctx.arcTo(rx, ry, rx + r, ry, r);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Value text
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(displayVal, textX, yCenter);
    }
    ctx.restore();
  }

  function renderDigitalSignal(ctx, s, w, laneTop, laneBottom, range) {
    var sig = s.sig;
    var pad = 4;
    var yHigh = laneTop + pad;
    var yLow = laneBottom - pad;
    var yMid = (yHigh + yLow) / 2;

    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    // Find first relevant change (binary search)
    var startIdx = bsearchTime(sig.changes, viewStart);
    if (startIdx > 0) {
      startIdx--;
    }

    var prevX = null;
    var prevY = null;

    for (var ci = startIdx; ci < sig.changes.length; ci++) {
      var ch = sig.changes[ci];
      var nextTime =
        ci + 1 < sig.changes.length ? sig.changes[ci + 1].time : data.maxTime;

      if (ch.time > viewEnd) {
        break;
      }

      var x1 = ((ch.time - viewStart) / range) * w;
      var x2 = ((nextTime - viewStart) / range) * w;

      var val = ch.value;
      var y;
      if (val === '1') {
        y = yHigh;
      } else if (val === '0') {
        y = yLow;
      } else {
        y = yMid; // x or u
      }

      // Draw transition from previous value
      if (prevY !== null && prevY !== y) {
        ctx.moveTo(x1, prevY);
        ctx.lineTo(x1, y);
      }

      // Draw horizontal line for this value period
      ctx.moveTo(x1, y);
      ctx.lineTo(Math.min(x2, ((viewEnd - viewStart) / range) * w), y);

      // X/U hatched fill — bright red, clearly visible
      if (val === 'x' || val === 'u' || val === 'z') {
        fillHatched(
          ctx,
          x1,
          yHigh,
          x2 - x1,
          yLow - yHigh,
          'rgba(210,30,30,0.5)'
        );
      }

      prevX = x2;
      prevY = y;
    }

    ctx.stroke();
  }

  function renderBusData(ctx, s, w, laneTop, laneBottom, range) {
    var sig = s.sig;
    var pad = 4;
    var yTop = laneTop + pad;
    var yBot = laneBottom - pad;
    var yMid = (yTop + yBot) / 2;
    var diagW = 5; // parallelogram diagonal width

    var startIdx = bsearchTime(sig.changes, viewStart);
    if (startIdx > 0) {
      startIdx--;
    }

    for (var ci = startIdx; ci < sig.changes.length; ci++) {
      var ch = sig.changes[ci];
      var nextTime =
        ci + 1 < sig.changes.length ? sig.changes[ci + 1].time : data.maxTime;

      if (ch.time > viewEnd) {
        break;
      }

      var x1 = ((ch.time - viewStart) / range) * w;
      var x2 = ((nextTime - viewStart) / range) * w;
      var pixW = x2 - x1;

      // Check for X/U
      var hasX = ch.value.indexOf('x') >= 0 || ch.value.indexOf('X') >= 0;
      var hasU = ch.value.indexOf('u') >= 0 || ch.value.indexOf('U') >= 0;
      var isUnknown = hasX || hasU;

      // Build parallelogram path (reused for fill, clip, and stroke)
      ctx.beginPath();
      ctx.moveTo(x1 + diagW, yTop);
      ctx.lineTo(x2 - diagW, yTop);
      ctx.lineTo(x2, yMid);
      ctx.lineTo(x2 - diagW, yBot);
      ctx.lineTo(x1 + diagW, yBot);
      ctx.lineTo(x1, yMid);
      ctx.closePath();

      if (isUnknown) {
        // Clip to parallelogram and fill with the same red hatch as 1-bit X/U
        ctx.save();
        ctx.clip();
        fillHatched(ctx, x1, yTop, pixW, yBot - yTop, 'rgba(210,30,30,0.5)');
        ctx.restore();
        // Redraw path for stroke (clip was released by restore)
        ctx.beginPath();
        ctx.moveTo(x1 + diagW, yTop);
        ctx.lineTo(x2 - diagW, yTop);
        ctx.lineTo(x2, yMid);
        ctx.lineTo(x2 - diagW, yBot);
        ctx.lineTo(x1 + diagW, yBot);
        ctx.lineTo(x1, yMid);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(210,30,30,0.9)';
      } else {
        ctx.fillStyle = hexToRgba(s.color, 0.2);
        ctx.fill();
        ctx.strokeStyle = s.color;
      }
      ctx.lineWidth = 1;
      ctx.stroke();

      // Value label
      if (pixW > 20) {
        var label;
        var dispVal = maybeInvert(ch.value, s.invertBits);
        if (hasX) {
          label = 'X';
        } else if (hasU) {
          label = 'U';
        } else if (s.displayMode === 'bin') {
          label = dispVal;
        } else if (s.displayMode === 'ascii') {
          label = binToAscii(dispVal);
        } else {
          // hex
          label = binToHex(dispVal);
        }
        ctx.fillStyle = colors.text;
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Clip label if too wide
        var maxChars = Math.floor(pixW / 7);
        if (label.length > maxChars) {
          label = label.substring(0, maxChars - 1) + '\u2026';
        }
        ctx.fillText(label, (x1 + x2) / 2, yMid);
      }
    }
  }

  function renderBusInteger(ctx, s, w, laneTop, laneBottom, range) {
    var sig = s.sig;
    var pad = 4;
    var yTop = laneTop + pad;
    var yBot = laneBottom - pad;
    var laneH = yBot - yTop;

    // Compute actual min/max from signal changes for auto-ranging
    var minVal = Infinity;
    var maxVal = -Infinity;
    for (var vi = 0; vi < sig.changes.length; vi++) {
      var v = parseInt(maybeInvert(sig.changes[vi].value, s.invertBits), 2);
      if (!isNaN(v)) {
        if (v < minVal) {
          minVal = v;
        }
        if (v > maxVal) {
          maxVal = v;
        }
      }
    }
    if (minVal === Infinity) {
      minVal = 0;
    }
    if (maxVal === -Infinity) {
      maxVal = 255;
    }
    // Avoid division by zero when signal is constant
    var valRange = maxVal - minVal;
    if (valRange === 0) {
      valRange = 1;
    }

    // Store min/max on the signal for hover tooltip
    s._intMin = minVal;
    s._intMax = maxVal;

    var startIdx = bsearchTime(sig.changes, viewStart);
    if (startIdx > 0) {
      startIdx--;
    }

    // Fill under the step line
    ctx.fillStyle = hexToRgba(s.color, 0.15);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    var started = false;

    for (var ci = startIdx; ci < sig.changes.length; ci++) {
      var ch = sig.changes[ci];
      var nextTime =
        ci + 1 < sig.changes.length ? sig.changes[ci + 1].time : data.maxTime;

      if (ch.time > viewEnd) {
        break;
      }

      var x1 = ((ch.time - viewStart) / range) * w;
      var x2 = ((nextTime - viewStart) / range) * w;
      var intVal = parseInt(maybeInvert(ch.value, s.invertBits), 2);
      if (isNaN(intVal)) {
        intVal = minVal;
      }
      var y = yBot - ((intVal - minVal) / valRange) * laneH;

      if (!started) {
        ctx.moveTo(x1, yBot);
        ctx.lineTo(x1, y);
        started = true;
      } else {
        ctx.lineTo(x1, y);
      }
      ctx.lineTo(x2, y);
    }

    // Close fill path
    if (started) {
      var lastX = ((viewEnd - viewStart) / range) * w;
      ctx.lineTo(lastX, yBot);
      ctx.closePath();
      ctx.fill();
      // Re-stroke the line (not the fill closing line)
      ctx.beginPath();
      started = false;
      for (var ci2 = startIdx; ci2 < sig.changes.length; ci2++) {
        var ch2 = sig.changes[ci2];
        var nextTime2 =
          ci2 + 1 < sig.changes.length
            ? sig.changes[ci2 + 1].time
            : data.maxTime;
        if (ch2.time > viewEnd) {
          break;
        }
        var xx1 = ((ch2.time - viewStart) / range) * w;
        var xx2 = ((nextTime2 - viewStart) / range) * w;
        var iv2 = parseInt(maybeInvert(ch2.value, s.invertBits), 2);
        if (isNaN(iv2)) {
          iv2 = minVal;
        }
        var yy = yBot - ((iv2 - minVal) / valRange) * laneH;
        if (!started) {
          ctx.moveTo(xx1, yy);
          started = true;
        } else {
          ctx.lineTo(xx1, yy);
        }
        ctx.lineTo(xx2, yy);
      }
      ctx.stroke();
    }

    // Draw min/max labels on the left edge
    ctx.fillStyle = colors.muted;
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(String(maxVal), 2, yTop);
    ctx.textBaseline = 'bottom';
    ctx.fillText(String(minVal), 2, yBot);
  }

  // ----- Time axis -----
  function renderTimeAxis() {
    var ctx = getCtx(timeAxisCanvas);
    if (!ctx || !data) {
      return;
    }
    var w = timeAxisCanvas.clientWidth;
    var h = timeAxisCanvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, w, h);

    var range = viewEnd - viewStart;
    if (range <= 0) {
      return;
    }

    // Calculate tick interval
    var targetTicks = Math.floor(w / 80);
    if (targetTicks < 2) {
      targetTicks = 2;
    }
    var rawStep = range / targetTicks;
    var tickStep = niceStep(rawStep);

    ctx.strokeStyle = colors.muted;
    ctx.fillStyle = colors.text;
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = 0.5;

    var firstTick = Math.ceil(viewStart / tickStep) * tickStep;
    for (var t = firstTick; t <= viewEnd; t += tickStep) {
      var x = ((t - viewStart) / range) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 5);
      ctx.stroke();
      ctx.fillText(formatTime(t, data.timescale), x, h - 2);
    }
  }

  // ----- Edge counting between markers -----
  function countEdges(sig, timeA, timeB) {
    if (!sig || !sig.changes || sig.changes.length === 0) {
      return { rising: 0, falling: 0, changes: 0 };
    }
    var tMin = Math.min(timeA, timeB);
    var tMax = Math.max(timeA, timeB);

    // Find first change index at or after tMin
    var startIdx = bsearchTime(sig.changes, tMin);
    // We need the value just before tMin to detect the first transition
    var prevIdx = startIdx > 0 ? startIdx - 1 : 0;

    var rising = 0;
    var falling = 0;
    var totalChanges = 0;

    var prevValue = sig.changes[prevIdx].value;
    for (var i = startIdx; i < sig.changes.length; i++) {
      var ch = sig.changes[i];
      if (ch.time > tMax) {
        break;
      }
      if (ch.time < tMin) {
        prevValue = ch.value;
        continue;
      }

      if (ch.value !== prevValue) {
        totalChanges++;
        if (sig.width === 1) {
          if (prevValue === '0' && ch.value === '1') {
            rising++;
          } else if (prevValue === '1' && ch.value === '0') {
            falling++;
          }
        }
        prevValue = ch.value;
      }
    }

    return { rising: rising, falling: falling, changes: totalChanges };
  }

  // ----- Marker info (top of measurement column) -----
  function updateMarkerInfo() {
    if (!markerInfoEl) {
      return;
    }
    markerInfoEl.innerHTML = '';

    // Row 1: Buttons — always shown
    var btnRow = el('div', 'wv-minfo-btns');
    var btnA = el(
      'button',
      'wv-minfo-btn wv-minfo-btn-a',
      markerA !== null ? 'A\u21ba' : '+A'
    );
    btnA.title =
      markerA !== null
        ? 'Move marker A to view center'
        : 'Place marker A at view center';
    btnA.addEventListener('click', function () {
      if (!data) {
        return;
      }
      markerA = Math.round((viewStart + viewEnd) / 2);
      if (nextMarker === 'A') {
        nextMarker = 'B';
      }
      render();
    });
    var btnB = el(
      'button',
      'wv-minfo-btn wv-minfo-btn-b',
      markerB !== null ? 'B\u21ba' : '+B'
    );
    btnB.title =
      markerB !== null
        ? 'Move marker B to view center'
        : 'Place marker B at view center';
    btnB.addEventListener('click', function () {
      if (!data) {
        return;
      }
      markerB = Math.round((viewStart + viewEnd) / 2);
      if (nextMarker === 'B') {
        nextMarker = 'A';
      }
      render();
    });
    btnRow.appendChild(btnA);
    btnRow.appendChild(btnB);
    if (markerA !== null || markerB !== null) {
      var btnClear = el('button', 'wv-minfo-btn wv-minfo-btn-clear', '\u2715');
      btnClear.title = 'Clear all markers';
      btnClear.addEventListener('click', function () {
        markerA = null;
        markerB = null;
        nextMarker = 'A';
        render();
      });
      btnRow.appendChild(btnClear);
    }
    markerInfoEl.appendChild(btnRow);

    // Rows 2-4: A time, B time, Delta — each on its own line
    if (data && markerA !== null) {
      var lineA = el('div', 'wv-minfo-time-line');
      lineA.innerHTML =
        '<span class="wv-minfo-label" style="color:#ff5722">A:</span> ' +
        formatTime(markerA, data.timescale);
      markerInfoEl.appendChild(lineA);
    }
    if (data && markerB !== null) {
      var lineB = el('div', 'wv-minfo-time-line');
      lineB.innerHTML =
        '<span class="wv-minfo-label" style="color:#2196f3">B:</span> ' +
        formatTime(markerB, data.timescale);
      markerInfoEl.appendChild(lineB);
    }
    if (data && markerA !== null && markerB !== null) {
      var lineD = el('div', 'wv-minfo-time-line');
      lineD.innerHTML =
        '<span class="wv-minfo-label">\u0394:</span> ' +
        formatTime(Math.abs(markerB - markerA), data.timescale);
      markerInfoEl.appendChild(lineD);
    }
  }

  // ----- Measurement panel -----
  function updateMeasurements() {
    updateMarkerInfo();

    // Update per-signal edge count rows
    for (var i = 0; i < signals.length; i++) {
      var mRow = document.getElementById('meas-' + i);
      if (!mRow) {
        continue;
      }
      var s = signals[i];

      if (markerA !== null && markerB !== null) {
        var edges = countEdges(s.sig, markerA, markerB);
        if (s.sig.width === 1) {
          mRow.innerHTML =
            '<span class="wv-edge-rising">\u2191' +
            edges.rising +
            '</span>' +
            '<span class="wv-edge-falling">\u2193' +
            edges.falling +
            '</span>';
        } else {
          mRow.innerHTML =
            '<span class="wv-edge-changes">\u0394' + edges.changes + '</span>';
        }
      } else {
        mRow.innerHTML = '<span>\u2014</span>';
      }
    }
  }

  // =========================================================
  // Utility functions
  // =========================================================
  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) {
      e.className = className;
    }
    if (text) {
      e.textContent = text;
    }
    return e;
  }

  function sizeCanvas(canvas, width, height) {
    var w = width || canvas.parentElement.clientWidth;
    var h = height || canvas.clientHeight;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  function getCtx(canvas) {
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function bsearchTime(changes, time) {
    var lo = 0;
    var hi = changes.length - 1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (changes[mid].time < time) {
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  function getValueAtTime(sig, time) {
    if (!sig.changes.length) {
      return '\u2014';
    }
    var idx = bsearchTime(sig.changes, time);
    // We want the last change at or before `time`
    if (idx >= sig.changes.length || sig.changes[idx].time > time) {
      idx--;
    }
    if (idx < 0) {
      return '\u2014';
    }
    return sig.changes[idx].value;
  }

  function fillHatched(ctx, x, y, w, h, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    // Diagonal hatch lines — full opacity dark red, dense step
    ctx.strokeStyle = color.replace(/[\d.]+\)$/, '0.9)');
    ctx.lineWidth = 1.5;
    var step = 5;
    ctx.beginPath();
    for (var i2 = -h; i2 < w; i2 += step) {
      ctx.moveTo(x + i2, y + h);
      ctx.lineTo(x + i2 + h, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function hexToRgba(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function maybeInvert(binStr, doInvert) {
    if (!doInvert) {
      return binStr;
    }
    return binStr.split('').reverse().join('');
  }

  function binToHex(binStr) {
    // Handle x/z in binary
    if (binStr.indexOf('x') >= 0 || binStr.indexOf('X') >= 0) {
      return 'X';
    }
    if (binStr.indexOf('z') >= 0 || binStr.indexOf('Z') >= 0) {
      return 'Z';
    }
    var val = parseInt(binStr, 2);
    if (isNaN(val)) {
      return '?';
    }
    var hex = val.toString(16).toUpperCase();
    // Pad to nibble boundary
    var nibbles = Math.ceil(binStr.length / 4);
    while (hex.length < nibbles) {
      hex = '0' + hex;
    }
    return '0x' + hex;
  }

  function binToAscii(binStr) {
    if (binStr.indexOf('x') >= 0 || binStr.indexOf('X') >= 0) {
      return 'X';
    }
    if (binStr.indexOf('z') >= 0 || binStr.indexOf('Z') >= 0) {
      return 'Z';
    }
    // Split binary string into 8-bit chunks and convert each to a character
    // Pad to multiple of 8 bits
    var padded = binStr;
    while (padded.length % 8 !== 0) {
      padded = '0' + padded;
    }
    var result = '';
    for (var i = 0; i < padded.length; i += 8) {
      var byte = parseInt(padded.substring(i, i + 8), 2);
      if (isNaN(byte)) {
        result += '?';
      } else if (byte >= 32 && byte <= 126) {
        // Printable ASCII
        result += String.fromCharCode(byte);
      } else {
        // Non-printable: show dot
        result += '.';
      }
    }
    return result;
  }

  function niceStep(raw) {
    var pow = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / pow;
    if (norm <= 1) {
      return pow;
    }
    if (norm <= 2) {
      return 2 * pow;
    }
    if (norm <= 5) {
      return 5 * pow;
    }
    return 10 * pow;
  }

  function formatTime(time, timescale) {
    var unit = 'ps';
    if (timescale) {
      var m = timescale.match(/(s|ms|us|ns|ps|fs)/);
      if (m) {
        unit = m[1];
      }
    }
    // Try to show in a reasonable unit
    if (unit === 'ps' && time >= 1e9) {
      return (time / 1e9).toFixed(1) + 'ms';
    }
    if (unit === 'ps' && time >= 1e6) {
      return (time / 1e6).toFixed(1) + 'us';
    }
    if (unit === 'ps' && time >= 1e3) {
      return (time / 1e3).toFixed(1) + 'ns';
    }
    return time + unit;
  }

  // =========================================================
  // Initialize
  // =========================================================
  buildDOM();
};
