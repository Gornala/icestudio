'use strict';

// ─── Plugin boilerplate ──────────────────────────────────────────────────────
var pluginUUID = 'serialTermV2UUID';
var appEnv = null;

function registerEvents() {
  iceStudio.bus.events.subscribe(
    'pluginManager.env',
    setupEnvironment,
    false,
    pluginUUID
  );
  iceStudio.bus.events.subscribe(
    'pluginManager.updateEnv',
    setupEnvironment,
    false,
    pluginUUID
  );
}

function setupEnvironment(data) {
  appEnv = data;
  applyTheme(data.uiTheme || 'dark', data.customTheme || null);
}

// ─── Theme ───────────────────────────────────────────────────────────────────
function applyTheme(theme, ct) {
  var root = document.documentElement;
  document.body.classList.remove('theme-light');
  if (theme === 'light') {
    document.body.classList.add('theme-light');
  } else if (theme === 'custom' && ct) {
    if (ct.bg) root.style.setProperty('--st-bg', ct.bg);
    if (ct.bg2) root.style.setProperty('--st-bg2', ct.bg2);
    if (ct.text) root.style.setProperty('--st-text', ct.text);
    if (ct.border) root.style.setProperty('--st-border', ct.border);
    if (ct.sidebar) root.style.setProperty('--st-sidebar', ct.sidebar);
    if (ct.accent) root.style.setProperty('--st-accent', ct.accent);
    // derive input/btn colors from bg2
    if (ct.bg2) {
      root.style.setProperty('--st-input-bg', ct.bg2);
      root.style.setProperty('--st-rx-bg', ct.bg2);
      root.style.setProperty('--st-tx-bg', ct.bg2);
    }
  }
}

// ─── State ───────────────────────────────────────────────────────────────────
var state = {
  connId: null,
  connPath: null,
  connBaud: 115200,
  rxBytes: [], // raw byte arrays (Uint8Array chunks)
  rxByteCount: 0,
  txByteCount: 0,
  rxFmt: 'ascii',
  txFmt: 'ascii',
  autoScroll: true,
  echo: true,
  timestamp: false,
  flushOnEnter: true,
  hexTrigger: false,
  hexTriggerByte: 0x0a,
  lineEnd: 'crlf',
  maxBufBytes: 102400,
  connectedAt: null,
  autoRefreshId: null,
  selectedPort: null,
  txHistory: [],
  txHistIdx: -1,
  dtr: false,
  rts: false,
};

// ─── DOM refs ────────────────────────────────────────────────────────────────
var $ = function (id) {
  return document.getElementById(id);
};

var elPortList = $('port-list');
var elPortEmpty = $('port-empty');
var elBtnRefresh = $('btn-refresh');
var elChkAutoRef = $('chk-auto-refresh');
var elSelBaud = $('sel-baud');
var elInpCustomBaud = $('inp-custom-baud');
var elCustomBaudRow = $('custom-baud-row');
var elSelDatabits = $('sel-databits');
var elSelParity = $('sel-parity');
var elSelStopbits = $('sel-stopbits');
var elSelFlow = $('sel-flow');
var elSelMaxbuf = $('sel-maxbuf');
var elBtnConnect = $('btn-connect');
var elBtnDisconnect = $('btn-disconnect');
var elChkDtr = $('chk-dtr');
var elChkRts = $('chk-rts');

var elRxOutput = $('rx-output');
var elTxInput = $('tx-input');
var elBtnRxClear = $('btn-rx-clear');
var elBtnRxSave = $('btn-rx-save');
var elBtnTxLoad = $('btn-tx-load');
var elBtnTxSave = $('btn-tx-save');
var elBtnSend = $('btn-send');
var elChkTimestamp = $('chk-timestamp');
var elChkAutoscroll = $('chk-autoscroll');
var elChkEcho = $('chk-echo');
var elChkHexTrig = $('chk-hextrigger');
var elSelHexTrig = $('sel-hextrigger');
var elChkFlushEnter = $('chk-flush-enter');
var elSelLineend = $('sel-lineend');

var elStIndicator = $('st-indicator');
var elStPort = $('st-port');
var elStBaud = $('st-baud');
var elStRxCount = $('st-rx-count');
var elStTxCount = $('st-tx-count');
var elStUptime = $('st-uptime');

// ─── Format conversion ───────────────────────────────────────────────────────
function toDisplay(bytes, fmt) {
  if (fmt === 'hex') {
    return Array.prototype.map
      .call(bytes, function (b) {
        return b.toString(16).padStart(2, '0');
      })
      .join(' ');
  }
  if (fmt === 'bin') {
    return Array.prototype.map
      .call(bytes, function (b) {
        return b.toString(2).padStart(8, '0');
      })
      .join(' ');
  }
  // ascii
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch (e) {
    return String.fromCharCode.apply(null, bytes);
  }
}

function fromDisplay(text, fmt) {
  if (fmt === 'hex') {
    var parts = text.trim().split(/\s+/);
    var arr = [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i]) {
        arr.push(parseInt(parts[i], 16) & 0xff);
      }
    }
    return new Uint8Array(arr);
  }
  if (fmt === 'bin') {
    var parts2 = text.trim().split(/\s+/);
    var arr2 = [];
    for (var j = 0; j < parts2.length; j++) {
      if (parts2[j]) {
        arr2.push(parseInt(parts2[j], 2) & 0xff);
      }
    }
    return new Uint8Array(arr2);
  }
  return new TextEncoder().encode(text);
}

function lineEndBytes() {
  var le = state.lineEnd;
  if (le === 'crlf') return new Uint8Array([0x0d, 0x0a]);
  if (le === 'cr') return new Uint8Array([0x0d]);
  if (le === 'lf') return new Uint8Array([0x0a]);
  return new Uint8Array([]);
}

// ─── RX buffer management ────────────────────────────────────────────────────
function getAllRxBytes() {
  var total = 0;
  for (var i = 0; i < state.rxBytes.length; i++) {
    total += state.rxBytes[i].length;
  }
  var out = new Uint8Array(total);
  var offset = 0;
  for (var j = 0; j < state.rxBytes.length; j++) {
    out.set(state.rxBytes[j], offset);
    offset += state.rxBytes[j].length;
  }
  return out;
}

function trimRxBuffer() {
  var total = 0;
  for (var i = 0; i < state.rxBytes.length; i++) {
    total += state.rxBytes[i].length;
  }
  while (total > state.maxBufBytes && state.rxBytes.length > 0) {
    total -= state.rxBytes[0].length;
    state.rxBytes.shift();
  }
}

function rerenderRx() {
  var all = getAllRxBytes();
  var text;
  if (state.hexTrigger) {
    // Insert newlines at trigger byte boundaries
    var lines = [];
    var cur = [];
    for (var i = 0; i < all.length; i++) {
      cur.push(all[i]);
      if (all[i] === state.hexTriggerByte) {
        lines.push(new Uint8Array(cur));
        cur = [];
      }
    }
    if (cur.length) {
      lines.push(new Uint8Array(cur));
    }
    text = lines
      .map(function (l) {
        return toDisplay(l, state.rxFmt);
      })
      .join('\n');
  } else {
    text = toDisplay(all, state.rxFmt);
  }
  // Add timestamps by re-splitting text at newlines if timestamp enabled
  elRxOutput.value = text;
  if (state.autoScroll) {
    elRxOutput.scrollTop = elRxOutput.scrollHeight;
  }
}

// ─── Serial receive ──────────────────────────────────────────────────────────
chrome.serial.onReceive.addListener(function (info) {
  if (!state.connId || info.connectionId !== state.connId) {
    return;
  }
  var bytes = new Uint8Array(info.data);
  state.rxBytes.push(bytes);
  state.rxByteCount += bytes.length;
  trimRxBuffer();
  rerenderRx();
  updateStatusBar();
});

chrome.serial.onReceiveError.addListener(function (info) {
  if (!state.connId || info.connectionId !== state.connId) {
    return;
  }
  if (info.error === 'disconnected' || info.error === 'device_lost') {
    doDisconnect();
  }
});

// ─── Connect / Disconnect ────────────────────────────────────────────────────
function doConnect() {
  if (!state.selectedPort) {
    alert('Please select a port first.');
    return;
  }
  var baud = parseInt(elSelBaud.value, 10);
  if (baud === -1) {
    baud = parseInt(elInpCustomBaud.value, 10);
    if (!baud || baud <= 0) {
      alert('Enter a valid custom baud rate.');
      return;
    }
  }
  state.connBaud = baud;

  var opts = {
    bitrate: baud,
    dataBits: elSelDatabits.value,
    parityBit: elSelParity.value,
    stopBits: elSelStopbits.value,
    ctsFlowControl: elSelFlow.value === 'hardware',
  };

  chrome.serial.connect(state.selectedPort, opts, function (info) {
    if (!info) {
      alert(
        'Could not connect to ' +
          state.selectedPort +
          '.\nPort may be in use or unavailable.'
      );
      return;
    }
    state.connId = info.connectionId;
    state.connPath = state.selectedPort;
    state.connectedAt = Date.now();
    state.rxByteCount = 0;
    state.txByteCount = 0;

    elBtnConnect.classList.add('hidden');
    elBtnDisconnect.classList.remove('hidden');
    elStIndicator.classList.add('connected');

    // Apply DTR/RTS
    applySignals();
    saveSettings();
    updateStatusBar();
    refreshPorts(); // re-scan to update port colors
  });
}

function doDisconnect() {
  if (!state.connId) {
    return;
  }
  chrome.serial.disconnect(state.connId, function () {
    state.connId = null;
    state.connPath = null;
    state.connectedAt = null;

    elBtnConnect.classList.remove('hidden');
    elBtnDisconnect.classList.add('hidden');
    elStIndicator.classList.remove('connected');
    elStPort.textContent = 'Not connected';
    elStBaud.textContent = '';
    elStUptime.textContent = '';

    refreshPorts();
  });
}

// ─── Send ────────────────────────────────────────────────────────────────────
function doSend() {
  if (!state.connId) {
    alert('Not connected.');
    return;
  }
  var text = elTxInput.value;
  var data = fromDisplay(text, state.txFmt);
  var ending = lineEndBytes();
  var full = new Uint8Array(data.length + ending.length);
  full.set(data, 0);
  full.set(ending, data.length);

  chrome.serial.send(state.connId, full.buffer, function (sendInfo) {
    if (!sendInfo || sendInfo.error) {
      return;
    }
    state.txByteCount += full.length;
    updateStatusBar();

    if (state.echo) {
      var echoText = '\u2191 ' + toDisplay(full, state.rxFmt) + '\n';
      state.rxBytes.push(new TextEncoder().encode(echoText));
      rerenderRx();
    }

    // Save to history
    if (text.trim()) {
      state.txHistory.unshift(text);
      if (state.txHistory.length > 50) {
        state.txHistory.pop();
      }
      state.txHistIdx = -1;
    }

    elTxInput.value = '';
  });
}

// ─── DTR / RTS signals ───────────────────────────────────────────────────────
function applySignals() {
  if (!state.connId) {
    return;
  }
  chrome.serial.setControlSignals(
    state.connId,
    {
      dtr: state.dtr,
      rts: state.rts,
    },
    function () {}
  );
}

// ─── Port scanning ───────────────────────────────────────────────────────────
function refreshPorts() {
  chrome.serial.getDevices(function (devices) {
    elPortList.innerHTML = '';

    if (!devices || devices.length === 0) {
      var empty = document.createElement('li');
      empty.id = 'port-empty';
      empty.textContent = 'No ports found';
      elPortList.appendChild(empty);
      return;
    }

    // For each device, render a list item and probe its status
    devices.forEach(function (dev) {
      var li = document.createElement('li');
      var dot = document.createElement('span');
      dot.className = 'port-dot';
      var name = document.createElement('span');
      name.className = 'port-name';
      name.textContent = dev.path;
      li.appendChild(dot);
      li.appendChild(name);
      li.dataset.path = dev.path;

      if (state.connId && state.connPath === dev.path) {
        dot.classList.add('active');
        li.classList.add('selected');
      } else {
        // Probe port
        dot.classList.add('unknown');
        probePort(dev.path, dot);
      }

      if (state.selectedPort === dev.path) {
        li.classList.add('selected');
      }

      li.addEventListener('click', function () {
        state.selectedPort = dev.path;
        document.querySelectorAll('#port-list li').forEach(function (el) {
          el.classList.remove('selected');
        });
        li.classList.add('selected');
        saveSettings();
      });

      elPortList.appendChild(li);
    });
  });
}

function probePort(path, dotEl) {
  var timeout = setTimeout(function () {
    // Still unknown after 400ms
    dotEl.classList.remove('unknown');
    dotEl.classList.add('unknown');
  }, 400);

  chrome.serial.connect(path, { bitrate: 9600 }, function (info) {
    clearTimeout(timeout);
    if (info && info.connectionId) {
      // Port is free — disconnect the probe immediately
      chrome.serial.disconnect(info.connectionId, function () {});
      dotEl.classList.remove('unknown');
      dotEl.classList.add('free');
    } else {
      dotEl.classList.remove('unknown');
      dotEl.classList.add('busy');
    }
  });
}

// ─── Status bar ──────────────────────────────────────────────────────────────
function formatBytes(n) {
  if (n < 1024) {
    return n + ' B';
  }
  if (n < 1048576) {
    return (n / 1024).toFixed(1) + ' KB';
  }
  return (n / 1048576).toFixed(1) + ' MB';
}

function formatUptime(ms) {
  var s = Math.floor(ms / 1000);
  var h = Math.floor(s / 3600);
  var m = Math.floor((s % 3600) / 60);
  var sec = s % 60;
  return (h ? h + 'h ' : '') + (m ? m + 'm ' : '') + sec + 's';
}

function updateStatusBar() {
  elStRxCount.textContent = 'RX: ' + formatBytes(state.rxByteCount);
  elStTxCount.textContent = 'TX: ' + formatBytes(state.txByteCount);
  if (state.connId) {
    elStPort.textContent = state.connPath;
    elStBaud.textContent = state.connBaud + ' bps';
    elStUptime.textContent = formatUptime(Date.now() - state.connectedAt);
  }
}

setInterval(updateStatusBar, 1000);

// ─── Resize handles ───────────────────────────────────────────────────────────
function initResizeHandle(handleEl, getSize, setSize, axis) {
  var dragging = false;
  var startPos = 0;
  var startSize = 0;

  handleEl.addEventListener('mousedown', function (e) {
    dragging = true;
    startPos = axis === 'x' ? e.clientX : e.clientY;
    startSize = getSize();
    handleEl.classList.add('dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', function (e) {
    if (!dragging) {
      return;
    }
    var delta = (axis === 'x' ? e.clientX : e.clientY) - startPos;
    setSize(startSize + delta);
  });

  document.addEventListener('mouseup', function () {
    if (dragging) {
      dragging = false;
      handleEl.classList.remove('dragging');
    }
  });
}

// Sidebar width
var sidebar = document.getElementById('sidebar');
initResizeHandle(
  document.getElementById('sidebar-handle'),
  function () {
    return sidebar.offsetWidth;
  },
  function (w) {
    var clamped = Math.max(160, Math.min(400, w));
    sidebar.style.width = clamped + 'px';
  },
  'x'
);

// RX/TX split
var rxPanel = document.getElementById('rx-panel');
var mainArea = document.getElementById('main-area');
initResizeHandle(
  document.getElementById('rxtx-handle'),
  function () {
    return rxPanel.offsetHeight;
  },
  function (h) {
    var mainH = mainArea.offsetHeight;
    // send-bar is roughly 32px, handle 9px
    var available = mainH - 9 - 32;
    var clamped = Math.max(60, Math.min(available - 60, h));
    rxPanel.style.flex = 'none';
    rxPanel.style.height = clamped + 'px';
  },
  'y'
);

// ─── Format button groups ─────────────────────────────────────────────────────
document.querySelectorAll('.fmt-btns').forEach(function (group) {
  var panel = group.dataset.panel;
  group.querySelectorAll('.fmt-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      group.querySelectorAll('.fmt-btn').forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      if (panel === 'rx') {
        state.rxFmt = btn.dataset.fmt;
        rerenderRx();
      } else {
        state.txFmt = btn.dataset.fmt;
      }
    });
  });
});

// ─── Save / Load ─────────────────────────────────────────────────────────────
var nodeFs = require('fs');

function showSaveDialog(defaultName, callback) {
  nw.Window.get().showSaveDialog({ defaultFilename: defaultName }, callback);
}

function showOpenDialog(callback) {
  nw.Window.get().showOpenDialog({ acceptTypes: ['*/*'] }, function (files) {
    if (files && files.length) {
      callback(files[0]);
    }
  });
}

elBtnRxSave.addEventListener('click', function () {
  showSaveDialog('rx_data.txt', function (path) {
    if (path) {
      try {
        nodeFs.writeFileSync(path, elRxOutput.value, 'utf8');
      } catch (e) {
        alert('Save failed: ' + e.message);
      }
    }
  });
});

elBtnTxSave.addEventListener('click', function () {
  showSaveDialog('tx_data.txt', function (path) {
    if (path) {
      try {
        nodeFs.writeFileSync(path, elTxInput.value, 'utf8');
      } catch (e) {
        alert('Save failed: ' + e.message);
      }
    }
  });
});

elBtnTxLoad.addEventListener('click', function () {
  showOpenDialog(function (path) {
    try {
      elTxInput.value = nodeFs.readFileSync(path, 'utf8');
    } catch (e) {
      alert('Load failed: ' + e.message);
    }
  });
});

// ─── UI event listeners ───────────────────────────────────────────────────────
elBtnRefresh.addEventListener('click', refreshPorts);

elChkAutoRef.addEventListener('change', function () {
  if (elChkAutoRef.checked) {
    state.autoRefreshId = setInterval(refreshPorts, 3000);
  } else {
    clearInterval(state.autoRefreshId);
    state.autoRefreshId = null;
  }
});

elSelBaud.addEventListener('change', function () {
  var isCustom = elSelBaud.value === '-1';
  elCustomBaudRow.style.display = isCustom ? 'flex' : 'none';
});

elBtnConnect.addEventListener('click', doConnect);
elBtnDisconnect.addEventListener('click', doDisconnect);

elBtnSend.addEventListener('click', doSend);

elTxInput.addEventListener('keydown', function (e) {
  if (state.flushOnEnter && e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    doSend();
    return;
  }
  // Command history: Alt+Up / Alt+Down
  if (e.altKey && e.key === 'ArrowUp') {
    e.preventDefault();
    if (state.txHistIdx < state.txHistory.length - 1) {
      state.txHistIdx++;
      elTxInput.value = state.txHistory[state.txHistIdx];
    }
    return;
  }
  if (e.altKey && e.key === 'ArrowDown') {
    e.preventDefault();
    if (state.txHistIdx > 0) {
      state.txHistIdx--;
      elTxInput.value = state.txHistory[state.txHistIdx];
    } else {
      state.txHistIdx = -1;
      elTxInput.value = '';
    }
  }
});

elBtnRxClear.addEventListener('click', function () {
  state.rxBytes = [];
  state.rxByteCount = 0;
  elRxOutput.value = '';
  updateStatusBar();
});

elChkAutoscroll.addEventListener('change', function () {
  state.autoScroll = elChkAutoscroll.checked;
});

elChkTimestamp.addEventListener('change', function () {
  state.timestamp = elChkTimestamp.checked;
});

elChkEcho.addEventListener('change', function () {
  state.echo = elChkEcho.checked;
});

elChkHexTrig.addEventListener('change', function () {
  state.hexTrigger = elChkHexTrig.checked;
  rerenderRx();
});

elSelHexTrig.addEventListener('change', function () {
  state.hexTriggerByte = parseInt(elSelHexTrig.value, 16);
  rerenderRx();
});

elSelLineend.addEventListener('change', function () {
  state.lineEnd = elSelLineend.value;
});

elChkFlushEnter.addEventListener('change', function () {
  state.flushOnEnter = elChkFlushEnter.checked;
});

elSelMaxbuf.addEventListener('change', function () {
  state.maxBufBytes = parseInt(elSelMaxbuf.value, 10);
  trimRxBuffer();
  rerenderRx();
});

elChkDtr.addEventListener('change', function () {
  state.dtr = elChkDtr.checked;
  applySignals();
});

elChkRts.addEventListener('change', function () {
  state.rts = elChkRts.checked;
  applySignals();
});

// ─── Settings persistence ─────────────────────────────────────────────────────
function saveSettings() {
  try {
    localStorage.setItem(
      'st_settings',
      JSON.stringify({
        selectedPort: state.selectedPort,
        baud: elSelBaud.value,
        databits: elSelDatabits.value,
        parity: elSelParity.value,
        stopbits: elSelStopbits.value,
        flow: elSelFlow.value,
        lineend: elSelLineend.value,
        echo: state.echo,
        flushOnEnter: state.flushOnEnter,
        maxBufBytes: state.maxBufBytes,
      })
    );
  } catch (e) {}
}

function loadSettings() {
  try {
    var raw = localStorage.getItem('st_settings');
    if (!raw) {
      return;
    }
    var s = JSON.parse(raw);
    if (s.selectedPort) {
      state.selectedPort = s.selectedPort;
    }
    if (s.baud) {
      elSelBaud.value = s.baud;
    }
    if (s.databits) {
      elSelDatabits.value = s.databits;
    }
    if (s.parity) {
      elSelParity.value = s.parity;
    }
    if (s.stopbits) {
      elSelStopbits.value = s.stopbits;
    }
    if (s.flow) {
      elSelFlow.value = s.flow;
    }
    if (s.lineend) {
      elSelLineend.value = s.lineend;
      state.lineEnd = s.lineend;
    }
    if (s.echo !== undefined) {
      state.echo = s.echo;
      elChkEcho.checked = s.echo;
    }
    if (s.flushOnEnter !== undefined) {
      state.flushOnEnter = s.flushOnEnter;
      elChkFlushEnter.checked = s.flushOnEnter;
    }
    if (s.maxBufBytes) {
      state.maxBufBytes = s.maxBufBytes;
      elSelMaxbuf.value = String(s.maxBufBytes);
    }
    var isCustom = elSelBaud.value === '-1';
    elCustomBaudRow.style.display = isCustom ? 'flex' : 'none';
  } catch (e) {}
}

// ─── Init ────────────────────────────────────────────────────────────────────
loadSettings();
refreshPorts();
registerEvents();
