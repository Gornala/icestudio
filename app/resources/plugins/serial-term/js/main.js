'use strict';

// ─── Node.js modules (available in NW.js) ────────────────────────────────────
var nodeFs = require('fs');

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
}

// ─── State ───────────────────────────────────────────────────────────────────
var state = {
  connId: null,
  connPath: null,
  connBaud: 115200,
  rxChunks: [], // [{data: Uint8Array, time: number, echo: boolean}]
  rxByteCount: 0,
  txByteCount: 0,
  rxFmt: 'ascii',
  txFmt: 'ascii',
  autoScroll: true,
  echo: true,
  timestamp: false,
  rxLineBreak: 'cr',
  rxWrapAt: 0,
  lineEnd: 'crlf',
  customTerm: '',
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
var elRxMulti = $('rx-multi');
var elTxInput = $('tx-input');
var elBtnRxClear = $('btn-rx-clear');
var elBtnRxSave = $('btn-rx-save');
var elBtnSend = $('btn-send');
var elChkTimestamp = $('chk-timestamp');
var elChkAutoscroll = $('chk-autoscroll');
var elChkEcho = $('chk-echo');
var elSelLineend = $('sel-lineend');
var elSelRxLinebreak = $('sel-rx-linebreak');
var elInpRxWrap = $('inp-rx-wrap');

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

function parseTerminator(str) {
  var bytes = [];
  var i = 0;
  while (i < str.length) {
    if (str[i] === '\\' && i + 1 < str.length) {
      i++;
      if (str[i] === 'n') {
        bytes.push(0x0a);
        i++;
      } else if (str[i] === 'r') {
        bytes.push(0x0d);
        i++;
      } else if (str[i] === 't') {
        bytes.push(0x09);
        i++;
      } else if (str[i] === '0') {
        bytes.push(0x00);
        i++;
      } else if (str[i] === '\\') {
        bytes.push(0x5c);
        i++;
      } else if (str[i] === 'x' && i + 2 < str.length) {
        bytes.push(parseInt(str.substr(i + 1, 2), 16) & 0xff);
        i += 3;
      } else {
        bytes.push(str.charCodeAt(i));
        i++;
      }
    } else {
      bytes.push(str.charCodeAt(i));
      i++;
    }
  }
  return new Uint8Array(bytes);
}

function lineEndBytes() {
  var le = state.lineEnd;
  if (le === 'crlf') return new Uint8Array([0x0d, 0x0a]);
  if (le === 'cr') return new Uint8Array([0x0d]);
  if (le === 'lf') return new Uint8Array([0x0a]);
  if (le === 'null') return new Uint8Array([0x00]);
  if (le === 'custom') return parseTerminator(state.customTerm || '');
  return new Uint8Array([]); // 'none'
}

// ─── RX line break detection ────────────────────────────────────────────────
function rxLineBreakSeq() {
  var lb = state.rxLineBreak;
  if (lb === 'cr') return [0x0d];
  if (lb === 'lf') return [0x0a];
  if (lb === 'crlf') return [0x0d, 0x0a];
  if (lb === 'null') return [0x00];
  return []; // 'none'
}

// ─── Timestamp formatting ───────────────────────────────────────────────────
function formatTimestamp(ms) {
  var d = new Date(ms);
  var hh = String(d.getHours()).padStart(2, '0');
  var mm = String(d.getMinutes()).padStart(2, '0');
  var ss = String(d.getSeconds()).padStart(2, '0');
  var mss = String(d.getMilliseconds()).padStart(3, '0');
  return '[' + hh + ':' + mm + ':' + ss + '.' + mss + ']';
}

// ─── RX buffer management ────────────────────────────────────────────────────
function getAllRxBytes() {
  var total = 0;
  for (var i = 0; i < state.rxChunks.length; i++) {
    total += state.rxChunks[i].data.length;
  }
  var out = new Uint8Array(total);
  var offset = 0;
  for (var j = 0; j < state.rxChunks.length; j++) {
    out.set(state.rxChunks[j].data, offset);
    offset += state.rxChunks[j].data.length;
  }
  return out;
}

function trimRxBuffer() {
  var total = 0;
  for (var i = 0; i < state.rxChunks.length; i++) {
    total += state.rxChunks[i].data.length;
  }
  while (total > state.maxBufBytes && state.rxChunks.length > 0) {
    total -= state.rxChunks[0].data.length;
    state.rxChunks.shift();
  }
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── ASCII display builder (with line breaks, timestamps, wrapping) ─────────
function buildAsciiDisplay() {
  var breakSeq = rxLineBreakSeq();
  var result = '';
  var atLineStart = true;
  var lineCharCount = 0;
  var pendingCR = false; // for cross-chunk CRLF detection

  for (var ci = 0; ci < state.rxChunks.length; ci++) {
    var chunk = state.rxChunks[ci];

    if (chunk.echo) {
      // Flush pending CR
      if (pendingCR) {
        if (breakSeq.length === 1 && breakSeq[0] === 0x0d) {
          result += '\n';
          atLineStart = true;
          lineCharCount = 0;
        }
        pendingCR = false;
      }
      // Render echo text directly
      var echoText = new TextDecoder('utf-8', { fatal: false }).decode(
        chunk.data
      );
      if (state.timestamp) {
        var ets = formatTimestamp(chunk.time) + ' ';
        var eParts = echoText.split('\n');
        for (var ep = 0; ep < eParts.length; ep++) {
          if (eParts[ep].length > 0) {
            result += ets + eParts[ep] + '\n';
          }
        }
      } else {
        result += echoText;
      }
      atLineStart = true;
      lineCharCount = 0;
      continue;
    }

    // Data chunk: process byte-by-byte
    var data = chunk.data;
    var ts = state.timestamp ? formatTimestamp(chunk.time) + ' ' : '';
    var bi = 0;

    // Handle pending CR from previous chunk (for CRLF mode)
    if (pendingCR) {
      pendingCR = false;
      if (
        breakSeq.length === 2 &&
        breakSeq[0] === 0x0d &&
        breakSeq[1] === 0x0a
      ) {
        if (data.length > 0 && data[0] === 0x0a) {
          // CR+LF matched across chunks
          result += '\n';
          atLineStart = true;
          lineCharCount = 0;
          bi = 1;
        }
        // else: stray CR, already skipped
      } else if (breakSeq.length === 1 && breakSeq[0] === 0x0d) {
        // CR is the break, emit newline
        result += '\n';
        atLineStart = true;
        lineCharCount = 0;
      }
    }

    while (bi < data.length) {
      // Check for line break sequence
      if (breakSeq.length > 0) {
        if (breakSeq.length === 2 && data[bi] === breakSeq[0]) {
          // CRLF mode: check for full pair
          if (bi + 1 < data.length) {
            if (data[bi + 1] === breakSeq[1]) {
              result += '\n';
              atLineStart = true;
              lineCharCount = 0;
              bi += 2;
              continue;
            }
            // CR not followed by LF: skip CR
            bi++;
            continue;
          } else {
            // CR at end of chunk: mark pending
            pendingCR = true;
            bi++;
            continue;
          }
        }
        if (breakSeq.length === 1 && data[bi] === breakSeq[0]) {
          result += '\n';
          atLineStart = true;
          lineCharCount = 0;
          bi++;
          continue;
        }
      }

      // Timestamp at line start
      if (atLineStart && state.timestamp) {
        result += ts;
      }
      atLineStart = false;

      // Character output
      var b = data[bi];
      if (b >= 32 && b < 127) {
        result += String.fromCharCode(b);
        lineCharCount++;
      } else if (b === 0x09) {
        result += '\t';
        lineCharCount++;
      } else if (b === 0x0d || b === 0x0a || b === 0x00) {
        // Stray control char not matched as line break — skip
        bi++;
        continue;
      } else {
        result += '.';
        lineCharCount++;
      }
      bi++;

      // Wrap at N chars
      if (state.rxWrapAt > 0 && lineCharCount >= state.rxWrapAt) {
        result += '\n';
        atLineStart = true;
        lineCharCount = 0;
      }
    }
  }
  return result;
}

// ─── HEX/BIN display builder (with line breaks, wrapping, timestamps) ───────
function buildHexBinDisplay(fmt) {
  var breakSeq = rxLineBreakSeq();
  var lines = [];
  var lineItems = [];
  var lineTs = 0;
  var atLineStart = true;

  for (var ci = 0; ci < state.rxChunks.length; ci++) {
    var chunk = state.rxChunks[ci];
    if (chunk.echo) {
      // Flush current line
      if (lineItems.length > 0) {
        var prefix =
          state.timestamp && lineTs ? formatTimestamp(lineTs) + ' ' : '';
        lines.push(prefix + lineItems.join(' '));
        lineItems = [];
      }
      // Show echo as-is in hex/bin view too
      var echoText = new TextDecoder('utf-8', { fatal: false })
        .decode(chunk.data)
        .replace(/\n$/, '');
      var ePrefix = state.timestamp ? formatTimestamp(chunk.time) + ' ' : '';
      lines.push(ePrefix + echoText);
      atLineStart = true;
      continue;
    }

    var data = chunk.data;
    for (var i = 0; i < data.length; i++) {
      // Check for line break sequence
      if (breakSeq.length > 0 && i + breakSeq.length <= data.length) {
        var match = true;
        for (var k = 0; k < breakSeq.length; k++) {
          if (data[i + k] !== breakSeq[k]) {
            match = false;
            break;
          }
        }
        if (match) {
          if (lineItems.length > 0) {
            var tsPrefix =
              state.timestamp && lineTs ? formatTimestamp(lineTs) + ' ' : '';
            lines.push(tsPrefix + lineItems.join(' '));
            lineItems = [];
          }
          atLineStart = true;
          i += breakSeq.length - 1;
          continue;
        }
      }

      if (atLineStart) {
        lineTs = chunk.time;
        atLineStart = false;
      }

      if (fmt === 'hex') {
        lineItems.push(data[i].toString(16).padStart(2, '0'));
      } else {
        lineItems.push(data[i].toString(2).padStart(8, '0'));
      }

      // Wrap at N items
      if (state.rxWrapAt > 0 && lineItems.length >= state.rxWrapAt) {
        var wPrefix =
          state.timestamp && lineTs ? formatTimestamp(lineTs) + ' ' : '';
        lines.push(wPrefix + lineItems.join(' '));
        lineItems = [];
        atLineStart = true;
      }
    }
  }
  if (lineItems.length > 0) {
    var fPrefix =
      state.timestamp && lineTs ? formatTimestamp(lineTs) + ' ' : '';
    lines.push(fPrefix + lineItems.join(' '));
  }
  return lines.join('\n');
}

// ─── Render RX display ──────────────────────────────────────────────────────
function rerenderRx() {
  if (state.rxFmt === 'multi') {
    rerenderMulti();
    return;
  }
  elRxMulti.classList.add('hidden');
  elRxOutput.classList.remove('hidden');

  var text;
  if (state.rxFmt === 'ascii') {
    text = buildAsciiDisplay();
  } else {
    text = buildHexBinDisplay(state.rxFmt);
  }
  elRxOutput.value = text;
  if (state.autoScroll) {
    elRxOutput.scrollTop = elRxOutput.scrollHeight;
  }
}

function rerenderMulti() {
  elRxOutput.classList.add('hidden');
  elRxMulti.classList.remove('hidden');

  var breakSeq = rxLineBreakSeq();
  var html = '';
  var atLineStart = true;
  var lineItemCount = 0;

  for (var ci = 0; ci < state.rxChunks.length; ci++) {
    var chunk = state.rxChunks[ci];

    if (chunk.echo) {
      var echoText = new TextDecoder('utf-8', { fatal: false })
        .decode(chunk.data)
        .replace(/\n$/, '');
      var eTs = state.timestamp ? formatTimestamp(chunk.time) + ' ' : '';
      html +=
        '<div class="multi-row">' +
        '<span class="multi-ts-echo">' +
        escapeHtml(eTs + echoText) +
        '</span></div>';
      atLineStart = true;
      lineItemCount = 0;
      continue;
    }

    var data = chunk.data;
    for (var i = 0; i < data.length; i++) {
      // Check for line break sequence
      if (breakSeq.length > 0 && i + breakSeq.length <= data.length) {
        var match = true;
        for (var k = 0; k < breakSeq.length; k++) {
          if (data[i + k] !== breakSeq[k]) {
            match = false;
            break;
          }
        }
        if (match) {
          html += '<div class="multi-break"></div>';
          atLineStart = true;
          lineItemCount = 0;
          i += breakSeq.length - 1;
          continue;
        }
      }

      // Timestamp at line start
      if (atLineStart && state.timestamp) {
        html +=
          '<span class="multi-ts">' +
          escapeHtml(formatTimestamp(chunk.time)) +
          '</span>';
      }
      atLineStart = false;

      var b = data[i];
      var printable = b >= 32 && b < 127;
      var ascii = printable ? escapeHtml(String.fromCharCode(b)) : '.';
      var hexVal = '0x' + b.toString(16).toUpperCase().padStart(2, '0');
      var binVal = '0b' + b.toString(2).padStart(8, '0');
      html +=
        '<span class="byte-cell">' +
        '<span class="bc-ascii">(' +
        ascii +
        ')</span>' +
        '<span class="bc-hex">' +
        hexVal +
        '</span>' +
        '<span class="bc-bin">' +
        binVal +
        '</span>' +
        '</span>';
      lineItemCount++;

      // Wrap at N items
      if (state.rxWrapAt > 0 && lineItemCount >= state.rxWrapAt) {
        html += '<div class="multi-break"></div>';
        atLineStart = true;
        lineItemCount = 0;
      }
    }
  }
  elRxMulti.innerHTML = html;
  if (state.autoScroll) {
    elRxMulti.scrollTop = elRxMulti.scrollHeight;
  }
}

// ─── Serial receive ──────────────────────────────────────────────────────────
chrome.serial.onReceive.addListener(function (info) {
  if (!state.connId || info.connectionId !== state.connId) {
    return;
  }
  var bytes = new Uint8Array(info.data);
  state.rxChunks.push({ data: bytes, time: Date.now(), echo: false });
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
    startReconnect();
  }
});

// ─── Auto-reconnect on device reset ─────────────────────────────────────────
var reconnectTimer = null;
var reconnectPort = null;
var reconnectOpts = null;
var RECONNECT_INTERVAL = 1500;
var RECONNECT_MAX_ATTEMPTS = 40;
var reconnectAttempts = 0;

function startReconnect() {
  if (reconnectTimer) {
    return;
  }
  reconnectPort = state.connPath;
  reconnectOpts = {
    bitrate: state.connBaud,
    dataBits: elSelDatabits.value,
    parityBit: elSelParity.value,
    stopBits: elSelStopbits.value,
    ctsFlowControl: elSelFlow.value === 'hardware',
  };
  reconnectAttempts = 0;

  var oldId = state.connId;
  state.connId = null;
  if (oldId) {
    chrome.serial.disconnect(oldId, function () {});
  }

  elStIndicator.classList.remove('connected');
  elStIndicator.classList.add('reconnecting');
  elStPort.textContent = reconnectPort + ' (reconnecting\u2026)';

  reconnectTimer = setInterval(tryReconnect, RECONNECT_INTERVAL);
  tryReconnect();
}

function tryReconnect() {
  reconnectAttempts++;
  if (reconnectAttempts > RECONNECT_MAX_ATTEMPTS) {
    stopReconnect(true);
    return;
  }
  elStPort.textContent =
    reconnectPort +
    ' (reconnecting ' +
    reconnectAttempts +
    '/' +
    RECONNECT_MAX_ATTEMPTS +
    '\u2026)';

  chrome.serial.connect(reconnectPort, reconnectOpts, function (info) {
    if (!info || !info.connectionId) {
      return;
    }
    state.connId = info.connectionId;
    state.connPath = reconnectPort;
    stopReconnect(false);
    elBtnConnect.classList.add('hidden');
    elBtnDisconnect.classList.remove('hidden');
    elStIndicator.classList.add('connected');
    applySignals();
    updateStatusBar();
    refreshPorts();
  });
}

function stopReconnect(gaveUp) {
  if (reconnectTimer) {
    clearInterval(reconnectTimer);
    reconnectTimer = null;
  }
  elStIndicator.classList.remove('reconnecting');
  if (gaveUp) {
    state.connId = null;
    state.connPath = null;
    state.connectedAt = null;
    elBtnConnect.classList.remove('hidden');
    elBtnDisconnect.classList.add('hidden');
    elStIndicator.classList.remove('connected');
    elStPort.textContent = 'Reconnect failed';
    elStBaud.textContent = '';
    elStUptime.textContent = '';
    refreshPorts();
  }
  reconnectPort = null;
  reconnectOpts = null;
  reconnectAttempts = 0;
}

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

    applySignals();
    saveSettings();
    updateStatusBar();
    refreshPorts();
  });
}

function doDisconnect() {
  if (reconnectTimer) {
    stopReconnect(false);
  }
  if (!state.connId) {
    state.connPath = null;
    state.connectedAt = null;
    elBtnConnect.classList.remove('hidden');
    elBtnDisconnect.classList.add('hidden');
    elStIndicator.classList.remove('connected');
    elStIndicator.classList.remove('reconnecting');
    elStPort.textContent = 'Not connected';
    elStBaud.textContent = '';
    elStUptime.textContent = '';
    refreshPorts();
    return;
  }
  chrome.serial.disconnect(state.connId, function () {
    state.connId = null;
    state.connPath = null;
    state.connectedAt = null;

    elBtnConnect.classList.remove('hidden');
    elBtnDisconnect.classList.add('hidden');
    elStIndicator.classList.remove('connected');
    elStIndicator.classList.remove('reconnecting');
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
  if (!text && state.txFmt === 'ascii') {
    // Send just the terminator (like pressing Enter in a real terminal)
  }
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
      var echoLine = '> ' + text + '\n';
      state.rxChunks.push({
        data: new TextEncoder().encode(echoLine),
        time: Date.now(),
        echo: true,
      });
      rerenderRx();
    }

    // Save to history
    if (text.trim()) {
      // Don't add duplicates at the top
      if (state.txHistory.length === 0 || state.txHistory[0] !== text) {
        state.txHistory.unshift(text);
        if (state.txHistory.length > 50) {
          state.txHistory.pop();
        }
      }
    }
    state.txHistIdx = -1;

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
    dotEl.classList.remove('unknown');
    dotEl.classList.add('unknown');
  }, 400);

  chrome.serial.connect(path, { bitrate: 9600 }, function (info) {
    clearTimeout(timeout);
    if (info && info.connectionId) {
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

// ─── Resize handle (sidebar only) ───────────────────────────────────────────
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

// ─── Save RX ─────────────────────────────────────────────────────────────────
function showSaveDialog(defaultName, callback) {
  nw.Window.get().showSaveDialog({ defaultFilename: defaultName }, callback);
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

// ─── Terminal input: Enter sends, Up/Down cycles history ─────────────────────
elTxInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    doSend();
    return;
  }
  // Command history: Up / Down
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (state.txHistIdx < state.txHistory.length - 1) {
      state.txHistIdx++;
      elTxInput.value = state.txHistory[state.txHistIdx];
      // Move cursor to end
      elTxInput.setSelectionRange(
        elTxInput.value.length,
        elTxInput.value.length
      );
    }
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (state.txHistIdx > 0) {
      state.txHistIdx--;
      elTxInput.value = state.txHistory[state.txHistIdx];
      elTxInput.setSelectionRange(
        elTxInput.value.length,
        elTxInput.value.length
      );
    } else {
      state.txHistIdx = -1;
      elTxInput.value = '';
    }
  }
});

elBtnRxClear.addEventListener('click', function () {
  state.rxChunks = [];
  state.rxByteCount = 0;
  elRxOutput.value = '';
  elRxMulti.innerHTML = '';
  updateStatusBar();
});

elChkAutoscroll.addEventListener('change', function () {
  state.autoScroll = elChkAutoscroll.checked;
});

elChkTimestamp.addEventListener('change', function () {
  state.timestamp = elChkTimestamp.checked;
  rerenderRx();
});

elChkEcho.addEventListener('change', function () {
  state.echo = elChkEcho.checked;
});

elSelLineend.addEventListener('change', function () {
  state.lineEnd = elSelLineend.value;
});

elSelRxLinebreak.addEventListener('change', function () {
  state.rxLineBreak = elSelRxLinebreak.value;
  rerenderRx();
});

elInpRxWrap.addEventListener('change', function () {
  state.rxWrapAt = parseInt(elInpRxWrap.value, 10) || 0;
  rerenderRx();
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
        maxBufBytes: state.maxBufBytes,
        rxLineBreak: state.rxLineBreak,
        rxWrapAt: state.rxWrapAt,
        timestamp: state.timestamp,
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
    if (s.maxBufBytes) {
      state.maxBufBytes = s.maxBufBytes;
      elSelMaxbuf.value = String(s.maxBufBytes);
    }
    if (s.rxLineBreak) {
      state.rxLineBreak = s.rxLineBreak;
      elSelRxLinebreak.value = s.rxLineBreak;
    }
    if (s.rxWrapAt !== undefined) {
      state.rxWrapAt = s.rxWrapAt;
      elInpRxWrap.value = String(s.rxWrapAt);
    }
    if (s.timestamp !== undefined) {
      state.timestamp = s.timestamp;
      elChkTimestamp.checked = s.timestamp;
    }
    var isCustom = elSelBaud.value === '-1';
    elCustomBaudRow.style.display = isCustom ? 'flex' : 'none';
  } catch (e) {}
}

// ─── Init ────────────────────────────────────────────────────────────────────
loadSettings();
refreshPorts();
registerEvents();
