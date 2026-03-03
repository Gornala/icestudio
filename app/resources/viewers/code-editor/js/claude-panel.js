'use strict';

/* global nw, codeEditor, testbenchEditor, mode, config, DocManager */

// ============================================================
// Claude AI Panel
// Provides an in-editor AI assistant with full hardware context:
// board info, pinout, current module code, ports, errors, and
// user-managed reference documents (datasheets, etc.)
// ============================================================

var ClaudePanel = (function () {
  // ---- state ----
  var _settingsFile = null;
  var _settings = { apiKey: '', model: 'claude-sonnet-4-6', panelWidth: 340 };
  var _messages = []; // conversation history [{role, content}]
  var _isStreaming = false;
  var _lastErrors = [];
  var _boardInfo = null;
  var _boardPinout = null;
  var _docMgr = null;

  // ---- DOM refs ----
  var _panelEl = null;
  var _messagesEl = null;
  var _inputEl = null;
  var _sendBtn = null;
  var _contextBarEl = null;

  // ============================================================
  // Public API
  // ============================================================

  function init(boardInfo, boardPinout, docMgr) {
    _boardInfo = boardInfo || null;
    _boardPinout = boardPinout || [];
    _docMgr = docMgr || null;

    var path = require('path');
    _settingsFile = path.join(nw.App.dataPath, 'claude-settings.json');
    _loadSettings();
    _bindDom();
    _applyPanelWidth();
    _updateContextBar();
    _renderWelcome();
  }

  function setErrors(errors) {
    _lastErrors = Array.isArray(errors) ? errors : [];
    _updateContextBar();
  }

  // ============================================================
  // Settings persistence
  // ============================================================

  function _loadSettings() {
    var fs = require('fs');
    try {
      var raw = fs.readFileSync(_settingsFile, 'utf8');
      _settings = JSON.parse(raw);
    } catch (e) {}
    if (!_settings.model) {
      _settings.model = 'claude-sonnet-4-6';
    }
  }

  function _saveSettings() {
    var fs = require('fs');
    try {
      fs.writeFileSync(_settingsFile, JSON.stringify(_settings, null, 2));
    } catch (e) {}
  }

  // ============================================================
  // DOM binding
  // ============================================================

  function _bindDom() {
    _panelEl = document.getElementById('panel-claude');
    _messagesEl = document.getElementById('cp-messages');
    _inputEl = document.getElementById('cp-input');
    _sendBtn = document.getElementById('cp-send');
    _contextBarEl = document.getElementById('cp-context-bar');

    // Toolbar toggle
    document
      .getElementById('btn-claude')
      .addEventListener('click', _togglePanel);

    // Send message
    _sendBtn.addEventListener('click', _onSend);
    _inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        _onSend();
      }
    });

    // Action buttons
    document
      .getElementById('cp-action-design')
      .addEventListener('click', function () {
        _submitWithPrompt(
          'Analyze my current module ports and write a complete, synthesizable Verilog implementation. ' +
            'Include inline comments. Make it suitable for the target FPGA.'
        );
      });

    document
      .getElementById('cp-action-testbench')
      .addEventListener('click', function () {
        _submitWithPrompt(
          'Write a comprehensive testbench for this module. Include: ' +
            'clock generation (if applicable), reset sequence, realistic stimulus for all input ports, ' +
            'edge cases, and $dumpfile/$dumpvars for VCD output. Use `timescale 1ns/1ps.'
        );
      });

    document
      .getElementById('cp-action-explain')
      .addEventListener('click', function () {
        if (!_lastErrors.length) {
          _appendSystemMsg(
            'No errors captured yet — run Verify or Run Sim first, then try again.'
          );
          return;
        }
        _submitWithPrompt(
          'Explain these errors and tell me exactly how to fix them in my Verilog code:\n\n' +
            _lastErrors.join('\n')
        );
      });

    document
      .getElementById('cp-action-review')
      .addEventListener('click', function () {
        _submitWithPrompt(
          'Review my Verilog code for: synthesis issues, latch inference, clock domain crossings, ' +
            'undriven outputs, incomplete sensitivity lists, and FPGA best practices. ' +
            'Be specific and actionable.'
        );
      });

    document
      .getElementById('cp-action-clear')
      .addEventListener('click', function () {
        _messages = [];
        _messagesEl.innerHTML = '';
        _renderWelcome();
      });

    // Settings
    document
      .getElementById('cp-settings-btn')
      .addEventListener('click', _showSettings);
    document
      .getElementById('cp-settings-cancel')
      .addEventListener('click', _hideSettings);
    document
      .getElementById('cp-settings-save')
      .addEventListener('click', _saveSettingsFromForm);
    var testKeyBtn = document.getElementById('cp-test-key-btn');
    if (testKeyBtn) {
      testKeyBtn.addEventListener('click', _testApiKey);
    }

    document
      .getElementById('cp-settings-key')
      .addEventListener('input', function () {
        var keyVal = this.value.trim();
        var status = document.getElementById('cp-key-status');
        if (status) {
          status.textContent = keyVal.startsWith('sk-ant-')
            ? '✓ looks valid'
            : keyVal
              ? '? unexpected format'
              : '';
          status.style.color = keyVal.startsWith('sk-ant-')
            ? 'var(--ce-ok-text)'
            : 'var(--ce-muted)';
        }
      });

    // Resize handle
    var resizeHandle = document.getElementById('cp-resize-handle');
    if (resizeHandle) {
      resizeHandle.addEventListener('mousedown', _onResizeStart);
    }

    // Apply code to editors (event delegation on message area)
    _messagesEl.addEventListener('click', function (e) {
      var target = e.target;
      if (target.classList.contains('cp-apply-code')) {
        var pre = target.closest('.cp-code-wrap').querySelector('pre code');
        if (pre && typeof codeEditor !== 'undefined' && codeEditor) {
          codeEditor.setValue(pre.textContent, -1);
          _appendSystemMsg('Applied to code editor.');
        }
        return;
      }
      if (target.classList.contains('cp-apply-tb')) {
        var pre2 = target.closest('.cp-code-wrap').querySelector('pre code');
        if (pre2 && typeof testbenchEditor !== 'undefined' && testbenchEditor) {
          testbenchEditor.setValue(pre2.textContent, -1);
          _appendSystemMsg('Applied to testbench editor.');
        }
        return;
      }
    });
  }

  function _togglePanel() {
    var hidden = _panelEl.classList.toggle('cp-hidden');
    document
      .getElementById('btn-claude')
      .classList.toggle('btn-active', !hidden);
    var handle = document.getElementById('cp-resize-handle');
    if (handle) {
      handle.classList.toggle('cp-hidden', hidden);
    }
    if (!hidden) {
      _inputEl.focus();
    }
  }

  function _showSettings() {
    document.getElementById('cp-settings-modal').style.display = 'flex';
    document.getElementById('cp-settings-key').value = _settings.apiKey || '';
    document.getElementById('cp-settings-model').value =
      _settings.model || 'claude-sonnet-4-6';
  }

  function _hideSettings() {
    document.getElementById('cp-settings-modal').style.display = 'none';
  }

  function _saveSettingsFromForm() {
    _settings.apiKey = (
      document.getElementById('cp-settings-key').value || ''
    ).trim();
    _settings.model = (
      document.getElementById('cp-settings-model').value || 'claude-sonnet-4-6'
    ).trim();
    _saveSettings();
    _hideSettings();
    _appendSystemMsg('Settings saved.');
  }

  // ============================================================
  // Panel resize
  // ============================================================

  function _maxPanelWidth() {
    return Math.floor(window.innerWidth * 0.5);
  }

  function _applyPanelWidth() {
    if (_panelEl && _settings.panelWidth) {
      var w = Math.min(_settings.panelWidth, _maxPanelWidth());
      _panelEl.style.width = w + 'px';
    }
  }

  function _onResizeStart(e) {
    e.preventDefault();
    var handle = document.getElementById('cp-resize-handle');
    var startX = e.clientX;
    var startWidth = _panelEl ? _panelEl.offsetWidth : 340;
    if (handle) {
      handle.classList.add('cp-dragging');
    }

    var onMove = function (ev) {
      if (!_panelEl) {
        return;
      }
      // dragging handle left → panel grows; right → panel shrinks
      var dx = startX - ev.clientX;
      var newWidth = Math.max(260, Math.min(_maxPanelWidth(), startWidth + dx));
      _panelEl.style.width = newWidth + 'px';
    };

    var onUp = function () {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (handle) {
        handle.classList.remove('cp-dragging');
      }
      if (_panelEl) {
        _settings.panelWidth = _panelEl.offsetWidth;
        _saveSettings();
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function _testApiKey() {
    var keyInput = document.getElementById('cp-settings-key');
    var status = document.getElementById('cp-key-status');
    var testBtn = document.getElementById('cp-test-key-btn');
    var key = (keyInput ? keyInput.value : '').trim();

    if (!key) {
      if (status) {
        status.textContent = 'Enter a key first.';
        status.style.color = 'var(--ce-muted)';
      }
      return;
    }

    if (status) {
      status.textContent = 'Testing…';
      status.style.color = 'var(--ce-muted)';
    }
    if (testBtn) {
      testBtn.disabled = true;
    }

    var https = require('https');
    var body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 5,
      messages: [{ role: 'user', content: 'Hi' }],
    });

    var options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    var req = https.request(options, function (res) {
      var data = '';
      res.on('data', function (chunk) {
        data += chunk.toString();
      });
      res.on('end', function () {
        if (testBtn) {
          testBtn.disabled = false;
        }
        if (res.statusCode === 200) {
          if (status) {
            status.textContent = '✓ Connection OK — key is valid!';
            status.style.color = 'var(--ce-ok-text)';
          }
        } else {
          var msg = 'HTTP ' + res.statusCode;
          try {
            var parsed = JSON.parse(data);
            msg = (parsed.error && parsed.error.message) || msg;
          } catch (e) {}
          if (status) {
            status.textContent = '✗ ' + msg;
            status.style.color = '#e57373';
          }
        }
      });
    });

    req.on('error', function (e) {
      if (testBtn) {
        testBtn.disabled = false;
      }
      if (status) {
        status.textContent = '✗ Network error: ' + e.message;
        status.style.color = '#e57373';
      }
    });

    req.write(body);
    req.end();
  }

  // ============================================================
  // Context bar (shows what context is active)
  // ============================================================

  function _updateContextBar() {
    if (!_contextBarEl) {
      return;
    }
    var parts = [];
    var modName = config && config.moduleName ? config.moduleName : null;
    if (modName) {
      parts.push('module: ' + modName);
    }
    if (_boardInfo && _boardInfo.name) {
      parts.push(
        'board: ' +
          (_boardInfo.info && _boardInfo.info.label
            ? _boardInfo.info.label
            : _boardInfo.name)
      );
    }
    if (_boardPinout && _boardPinout.length) {
      parts.push(_boardPinout.length + ' pins');
    }
    if (_docMgr) {
      var dcnt = _docMgr.count();
      if (dcnt > 0) {
        parts.push('docs: ' + dcnt);
      }
    }
    if (_lastErrors.length) {
      parts.push(_lastErrors.length + ' error(s)');
    }
    _contextBarEl.textContent = parts.length
      ? parts.join(' · ')
      : 'No context loaded';
  }

  // ============================================================
  // Message submission
  // ============================================================

  function _onSend() {
    var text = (_inputEl.value || '').trim();
    if (!text || _isStreaming) {
      return;
    }
    _inputEl.value = '';
    _submitMessage(text);
  }

  function _submitWithPrompt(prompt) {
    if (_panelEl.classList.contains('cp-hidden')) {
      _togglePanel();
    }
    _inputEl.value = prompt;
    _onSend();
  }

  function _submitMessage(text) {
    if (!_settings.apiKey) {
      _appendSystemMsg(
        'No API key set. Click ⚙ Settings to configure your Anthropic API key.'
      );
      return;
    }

    _messages.push({ role: 'user', content: text });
    _renderMessage({ role: 'user', content: text });

    var systemPrompt = _buildSystemPrompt(text);
    var streamEl = _appendStreamingMessage();
    _isStreaming = true;
    _updateSendBtn();

    var accumulated = '';

    _callClaude(
      _messages,
      systemPrompt,
      function onChunk(chunk) {
        accumulated += chunk;
        streamEl.innerHTML = _renderMarkdown(accumulated);
        _messagesEl.scrollTop = _messagesEl.scrollHeight;
      },
      function onDone() {
        _isStreaming = false;
        _messages.push({ role: 'assistant', content: accumulated });
        streamEl.classList.remove('cp-streaming');
        _updateSendBtn();
        _messagesEl.scrollTop = _messagesEl.scrollHeight;
      },
      function onError(err) {
        _isStreaming = false;
        streamEl.classList.remove('cp-streaming');
        streamEl.innerHTML =
          '<span class="cp-error">API error: ' +
          _escHtml(String(err.message || err)) +
          '</span>';
        _updateSendBtn();
      }
    );
  }

  // ============================================================
  // System prompt / context assembly
  // ============================================================

  function _buildSystemPrompt(query) {
    var parts = [];

    parts.push(
      'You are an expert FPGA and Verilog hardware design assistant embedded in Icestudio, ' +
        'a visual block-based FPGA design tool. You help users write synthesizable Verilog modules, ' +
        'testbenches, interpret Verilator/Yosys errors, and review HDL code.\n\n' +
        'Always write synthesizable, lint-clean Verilog (no $display in synthesized modules, ' +
        'no blocking assignments in clocked always blocks for state, etc.) unless the user ' +
        'explicitly asks for simulation-only code. Use the hardware context below.'
    );

    // Board info
    if (_boardInfo) {
      var binfo = _boardInfo.info || {};
      parts.push('\n## Target Board');
      parts.push('Board: ' + (binfo.label || _boardInfo.name));
      if (binfo.fpga) {
        parts.push('FPGA device: ' + binfo.fpga);
      }
      if (binfo.fpgaFamily) {
        parts.push('FPGA family: ' + binfo.fpgaFamily);
      }
      if (binfo.clock) {
        parts.push('System clock: ' + binfo.clock + ' MHz');
      }
      if (binfo.maxFreq) {
        parts.push('Max recommended freq: ' + binfo.maxFreq + ' MHz');
      }
      if (binfo.luts) {
        parts.push('LUTs: ' + binfo.luts);
      }
      if (binfo.brams) {
        parts.push('BRAMs: ' + binfo.brams);
      }
      if (binfo.dsps) {
        parts.push('DSPs: ' + binfo.dsps);
      }
      parts.push('Synthesis toolchain: Yosys + nextpnr (open source)');
    }

    // Pinout (top 80 pins to stay within context budget)
    if (_boardPinout && _boardPinout.length) {
      parts.push('\n## Available FPGA Pins');
      parts.push('(Name → physical pin [type])');
      var limit = Math.min(_boardPinout.length, 80);
      var pinLines = [];
      for (var i = 0; i < limit; i++) {
        var p = _boardPinout[i];
        var line = '- ' + p.name + ' → ' + p.value;
        if (p.type && p.type !== 'io') {
          line += ' [' + p.type + ']';
        }
        pinLines.push(line);
      }
      parts.push(pinLines.join('\n'));
      if (_boardPinout.length > limit) {
        parts.push(
          '... (' + (_boardPinout.length - limit) + ' more pins not shown)'
        );
      }
    }

    // Current module code and ports
    parts.push('\n## Current Module Under Edit');
    var modName = config && config.moduleName ? config.moduleName : 'unknown';
    parts.push('Module name: ' + modName);

    var ports = (config && config.ports) || {};
    var portsIn = ports['in'] || [];
    var portsOut = ports['out'] || [];
    var paramsIn = (config && config.params) || [];

    if (portsIn.length || portsOut.length || paramsIn.length) {
      var portLines = [];
      portsIn.forEach(function (p) {
        var pname = (p.name || '').replace(/^[@#]/, '');
        portLines.push('  input ' + (p.range ? p.range + ' ' : '') + pname);
      });
      portsOut.forEach(function (p) {
        var pname = (p.name || '').replace(/^[@#]/, '');
        portLines.push('  output ' + (p.range ? p.range + ' ' : '') + pname);
      });
      paramsIn.forEach(function (p) {
        var pname = (p.name || '').replace(/^[@#]/, '');
        portLines.push(
          '  parameter ' + pname + (p.value ? ' = ' + p.value : '')
        );
      });
      parts.push('Ports and parameters:\n' + portLines.join('\n'));
    }

    var code =
      typeof codeEditor !== 'undefined' && codeEditor
        ? codeEditor.getValue()
        : (config && config.code) || '';
    if (code && code.trim()) {
      parts.push('Current code:\n```verilog\n' + code.trim() + '\n```');
    } else {
      parts.push('(No code written yet — module is empty)');
    }

    // Testbench (only in testbench mode)
    if (
      typeof mode !== 'undefined' &&
      mode === 'testbench' &&
      typeof testbenchEditor !== 'undefined' &&
      testbenchEditor
    ) {
      var tb = testbenchEditor.getValue();
      if (tb && tb.trim()) {
        parts.push(
          '\n## Current Testbench\n```verilog\n' + tb.trim() + '\n```'
        );
      }
    }

    // Recent errors
    if (_lastErrors.length) {
      parts.push('\n## Recent Tool Errors (from last Verify/Sim run)');
      parts.push(_lastErrors.slice(0, 30).join('\n'));
    }

    // Reference documentation (relevant sections)
    if (_docMgr) {
      var docCtx = _docMgr.getRelevantContext(query);
      if (docCtx) {
        parts.push('\n## Reference Documentation (relevant sections)');
        parts.push(docCtx);
      }
    }

    return parts.join('\n');
  }

  // ============================================================
  // Anthropic API call (streaming via Node.js https)
  // ============================================================

  function _callClaude(messages, systemPrompt, onChunk, onDone, onError) {
    var https = require('https');

    var body = JSON.stringify({
      model: _settings.model || 'claude-sonnet-4-6',
      max_tokens: 4096,
      stream: true,
      system: systemPrompt,
      messages: messages,
    });

    var options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': _settings.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    var done = false;

    var req = https.request(options, function (res) {
      // Non-200: body is plain JSON error, not SSE
      if (res.statusCode !== 200) {
        var errData = '';
        res.on('data', function (chunk) {
          errData += chunk.toString();
        });
        res.on('end', function () {
          if (!done) {
            done = true;
            var msg = 'HTTP ' + res.statusCode;
            try {
              var parsed = JSON.parse(errData);
              msg = (parsed.error && parsed.error.message) || msg;
            } catch (e) {}
            onError(new Error(msg));
          }
        });
        return;
      }

      var buf = '';

      res.on('data', function (chunk) {
        buf += chunk.toString();
        var lines = buf.split('\n');
        buf = lines.pop(); // keep any incomplete line

        lines.forEach(function (line) {
          if (!line.startsWith('data: ')) {
            return;
          }
          var raw = line.slice(6).trim();
          if (!raw || raw === '[DONE]') {
            return;
          }
          try {
            var evt = JSON.parse(raw);
            if (
              evt.type === 'content_block_delta' &&
              evt.delta &&
              evt.delta.type === 'text_delta'
            ) {
              onChunk(evt.delta.text);
            } else if (evt.type === 'error' && !done) {
              done = true;
              onError(
                new Error((evt.error && evt.error.message) || 'API error')
              );
            }
          } catch (e) {
            // ignore parse errors on partial chunks
          }
        });
      });

      res.on('end', function () {
        if (!done) {
          done = true;
          onDone();
        }
      });

      res.on('error', function (e) {
        if (!done) {
          done = true;
          onError(e);
        }
      });
    });

    req.on('error', function (e) {
      if (!done) {
        done = true;
        onError(e);
      }
    });

    req.write(body);
    req.end();
  }

  // ============================================================
  // DOM helpers
  // ============================================================

  function _renderWelcome() {
    var el = document.createElement('div');
    el.className = 'cp-msg cp-msg-system';
    var board =
      _boardInfo && _boardInfo.info && _boardInfo.info.label
        ? _boardInfo.info.label
        : _boardInfo && _boardInfo.name
          ? _boardInfo.name
          : 'unknown';
    var pinCount =
      _boardPinout && _boardPinout.length ? _boardPinout.length : 0;
    el.innerHTML =
      '<strong>Claude AI Assistant</strong><br>' +
      'I have context about: your module code and ports, ' +
      (pinCount ? board + ' board (' + pinCount + ' pins), ' : '') +
      'any docs you add, and errors from your last run.<br>' +
      'Use the action buttons above or ask anything about your design.';
    _messagesEl.appendChild(el);
  }

  function _appendSystemMsg(text) {
    var el = document.createElement('div');
    el.className = 'cp-msg cp-msg-system';
    el.textContent = text;
    _messagesEl.appendChild(el);
    _messagesEl.scrollTop = _messagesEl.scrollHeight;
  }

  function _renderMessage(msg) {
    var el = document.createElement('div');
    el.className = 'cp-msg cp-msg-' + msg.role;
    if (msg.role === 'assistant') {
      el.innerHTML = _renderMarkdown(msg.content);
    } else {
      el.textContent = msg.content;
    }
    _messagesEl.appendChild(el);
    _messagesEl.scrollTop = _messagesEl.scrollHeight;
    return el;
  }

  function _appendStreamingMessage() {
    var el = document.createElement('div');
    el.className = 'cp-msg cp-msg-assistant cp-streaming';
    el.innerHTML = '<span class="cp-cursor">▋</span>';
    _messagesEl.appendChild(el);
    _messagesEl.scrollTop = _messagesEl.scrollHeight;
    return el;
  }

  function _updateSendBtn() {
    if (_sendBtn) {
      _sendBtn.disabled = _isStreaming;
      _sendBtn.textContent = _isStreaming ? '...' : 'Send';
    }
    if (_inputEl) {
      _inputEl.disabled = _isStreaming;
    }
  }

  // ============================================================
  // Markdown renderer (handles Verilog code blocks with Apply buttons)
  // ============================================================

  function _escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _renderMarkdown(text) {
    var html = '';
    var lines = text.split('\n');
    var inCode = false;
    var codeLang = '';
    var codeLines = [];
    var inList = false;

    function flushList() {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
    }

    function flushCode(partial) {
      var isVerilog =
        codeLang === 'verilog' ||
        codeLang === 'sv' ||
        codeLang === 'systemverilog' ||
        codeLang === 'v' ||
        codeLang === '';
      var codeHtml =
        '<div class="cp-code-wrap">' +
        '<pre class="cp-code-block">' +
        (codeLang
          ? '<span class="cp-code-lang">' + _escHtml(codeLang) + '</span>'
          : '') +
        '<code>' +
        _escHtml(codeLines.join('\n')) +
        '</code>' +
        '</pre>';
      if (!partial && isVerilog) {
        codeHtml +=
          '<div class="cp-code-actions">' +
          '<button class="cp-apply-code">Apply to Code</button>' +
          '<button class="cp-apply-tb">Apply to Testbench</button>' +
          '</div>';
      }
      codeHtml += '</div>';
      return codeHtml;
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      // Code fence start/end
      if (!inCode && line.startsWith('```')) {
        flushList();
        inCode = true;
        codeLang = line.slice(3).trim().toLowerCase();
        codeLines = [];
        continue;
      }
      if (inCode) {
        if (line.startsWith('```')) {
          inCode = false;
          html += flushCode(false);
          codeLines = [];
          codeLang = '';
        } else {
          codeLines.push(line);
        }
        continue;
      }

      // Headers
      if (line.startsWith('### ')) {
        flushList();
        html += '<h4>' + _inlineMd(line.slice(4)) + '</h4>';
        continue;
      }
      if (line.startsWith('## ')) {
        flushList();
        html += '<h3>' + _inlineMd(line.slice(3)) + '</h3>';
        continue;
      }
      if (line.startsWith('# ')) {
        flushList();
        html += '<h2>' + _inlineMd(line.slice(2)) + '</h2>';
        continue;
      }

      // List items
      if (line.match(/^[-*] /)) {
        if (!inList) {
          html += '<ul>';
          inList = true;
        }
        html += '<li>' + _inlineMd(line.slice(2)) + '</li>';
        continue;
      }
      if (line.match(/^\d+\. /)) {
        if (!inList) {
          html += '<ul>';
          inList = true;
        }
        html += '<li>' + _inlineMd(line.replace(/^\d+\. /, '')) + '</li>';
        continue;
      }

      flushList();

      // Horizontal rule
      if (line.match(/^---+$/) || line.match(/^\*\*\*+$/)) {
        html += '<hr>';
        continue;
      }

      // Blank line
      if (!line.trim()) {
        html += '<br>';
        continue;
      }

      // Normal paragraph line
      html += '<p>' + _inlineMd(line) + '</p>';
    }

    flushList();

    // Unclosed code block (streaming — still being received)
    if (inCode && codeLines.length) {
      html += flushCode(true);
    }

    return html;
  }

  function _inlineMd(text) {
    // Escape HTML first
    text = _escHtml(text);
    // Bold **...**
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic *...*
    text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    // Inline code `...`
    text = text.replace(/`([^`]+)`/g, '<code class="cp-inline-code">$1</code>');
    return text;
  }

  // ============================================================
  // Public interface
  // ============================================================

  return {
    init: init,
    setErrors: setErrors,
  };
})();
