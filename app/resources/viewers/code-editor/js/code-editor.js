'use strict';

var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');

// ============================================================
// Config from URL params
// ============================================================
var urlParams = new URLSearchParams(window.location.search);
var config = JSON.parse(decodeURIComponent(urlParams.get('config')));

var mode = config.mode || 'full';
var blockId = config.blockId;
var theme = config.theme || 'light'; // used for ACE editor highlight theme (monokai/chrome)
var buildDir = config.buildDir || '';
var blockDir = config.blockDir || '';
var toolchainBinDir = config.toolchainBinDir || '';
var isWin32 = config.isWin32 || false;
var formalVerifyPyPath = config.formalVerifyPyPath || '';
var pythonCmd = config.pythonCmd || 'python';
var sourcePath = config.sourcePath || '';

// Board context for Claude panel (passed in config from graph.js)
var boardInfo = config.boardInfo || null;
var boardPinout = config.boardPinout || [];

// ============================================================
// Block status persistence (V/F/T/B badges in collection panel)
// ============================================================
var _statusFile = path.join(nw.App.dataPath, 'block-status.json');
var writeBlockStatus = function (field, value) {
  var key = sourcePath || blockId;
  if (!key) {
    return;
  }
  var st = {};
  try {
    st = JSON.parse(fs.readFileSync(_statusFile, 'utf8'));
  } catch (e) {}
  if (!st[key]) {
    st[key] = { V: null, F: null, T: null, B: null };
  }
  st[key][field] = value;
  try {
    fs.writeFileSync(_statusFile, JSON.stringify(st, null, 2));
  } catch (e) {}
};

// ============================================================
// Toolchain binary helper — uses apio-managed bin dir
// ============================================================
function getBin(name) {
  if (!toolchainBinDir) {
    return name;
  }
  var exe = isWin32 ? name + '.exe' : name;
  var full = path.join(toolchainBinDir, exe);
  try {
    fs.accessSync(full);
    return full;
  } catch (e) {
    return name;
  }
}

// ============================================================
// Per-block directory helpers
// ============================================================
function ensureBlockDir() {
  if (!blockDir) {
    return;
  }
  try {
    fs.mkdirSync(blockDir, { recursive: true });
  } catch (e) {}
}

function blockFile(filename) {
  return path.join(blockDir, filename);
}

function readBlockFile(filename) {
  try {
    return fs.readFileSync(blockFile(filename), 'utf8');
  } catch (e) {
    return null;
  }
}

function saveBlockFile(filename, content) {
  if (!blockDir) {
    return;
  }
  ensureBlockDir();
  writeIfChanged(blockFile(filename), content);
}

// ============================================================
// Window geometry persistence (global — same for all blocks/projects)
// Stored in nw.App.dataPath so the path is always the same.
// Key is the window mode so full/formal/testbench each remember separately.
// ============================================================
var _geoFile = path.join(nw.App.dataPath, 'ce_window_geometry.json');
var _geoSaveTimer = null;

function _loadAllGeo() {
  try {
    return JSON.parse(fs.readFileSync(_geoFile, 'utf8'));
  } catch (e) {
    return {};
  }
}

function _saveGeometry(win) {
  var all = _loadAllGeo();
  all[mode] = { x: win.x, y: win.y, width: win.width, height: win.height };
  try {
    fs.writeFileSync(_geoFile, JSON.stringify(all, null, 2));
  } catch (e) {}
}

function _restoreGeometry(win) {
  var geo = _loadAllGeo()[mode];
  if (geo) {
    win.moveTo(geo.x, geo.y);
    win.resizeTo(geo.width, geo.height);
  }
  win.show(); // window was opened with show:false; reveal it now at the correct position
}

function _scheduleGeoSave(win) {
  clearTimeout(_geoSaveTimer);
  _geoSaveTimer = setTimeout(function () {
    _saveGeometry(win);
  }, 500);
}

// ============================================================
// Apply theme — CSS vars handled by shared/theme.js loaded in HTML.
// This function only switches the ACE editor syntax-highlight theme.
// ============================================================
function applyAceTheme(themeVal) {
  var aceThemeStr =
    themeVal === 'dark' ? 'ace/theme/monokai' : 'ace/theme/chrome';
  if (codeEditor) {
    codeEditor.setTheme(aceThemeStr);
  }
  if (testbenchEditor) {
    testbenchEditor.setTheme(aceThemeStr);
  }
}

// Keep applyTheme as a no-op alias so the window.onload call below still works
var applyTheme = function () {};

// ============================================================
// Ace editors
// ============================================================
var codeEditor = null;
var testbenchEditor = null;

function initAceEditors() {
  codeEditor = ace.edit('ace-code');
  codeEditor.setTheme(
    theme === 'dark' ? 'ace/theme/monokai' : 'ace/theme/chrome'
  );
  codeEditor.session.setMode('ace/mode/verilog');
  codeEditor.setHighlightActiveLine(true);
  codeEditor.session.setValue(config.code || '');
  codeEditor.$blockScrolling = Infinity;

  // Clear annotations whenever the user edits
  codeEditor.session.on('change', function () {
    codeEditor.session.setAnnotations([]);
  });

  if (mode === 'testbench') {
    testbenchEditor = ace.edit('ace-testbench');
    testbenchEditor.setTheme(
      theme === 'dark' ? 'ace/theme/monokai' : 'ace/theme/chrome'
    );
    testbenchEditor.session.setMode('ace/mode/verilog');
    testbenchEditor.setHighlightActiveLine(true);
    testbenchEditor.$blockScrolling = Infinity;
    // Load saved testbench, updating module name references if the
    // module was renamed (e.g. user changed the label). Custom test
    // code is preserved — only the DUT name references are patched.
    var savedTb = readBlockFile('testbench.v');
    var moduleName = config.moduleName || 'dut';
    var tbContent;
    if (savedTb !== null) {
      if (savedTb.indexOf(moduleName + ' dut') !== -1) {
        // Module name matches — use saved testbench as-is
        tbContent = savedTb;
      } else {
        // Extract old module name from DUT instantiation: "<old> dut ("
        var nameMatch = savedTb.match(/^\s*(\w+)\s+dut\s*\(/m);
        if (nameMatch) {
          var oldName = nameMatch[1];
          tbContent = savedTb
            .replace(
              new RegExp('\\b' + oldName + '(\\s+dut\\b)'),
              moduleName + '$1'
            )
            .replace(
              new RegExp('\\btb_' + oldName + '\\b', 'g'),
              'tb_' + moduleName
            );
        } else {
          tbContent = generateTestbench();
        }
      }
    } else if (config.testbench) {
      // Use testbench from block data (e.g. collection block)
      tbContent = config.testbench;
      if (tbContent.indexOf(moduleName + ' dut') === -1) {
        var nameMatch2 = tbContent.match(/^\s*(\w+)\s+dut\s*\(/m);
        if (nameMatch2) {
          var oldName2 = nameMatch2[1];
          tbContent = tbContent
            .replace(
              new RegExp('\\b' + oldName2 + '(\\s+dut\\b)'),
              moduleName + '$1'
            )
            .replace(
              new RegExp('\\btb_' + oldName2 + '\\b', 'g'),
              'tb_' + moduleName
            );
        }
      }
    } else {
      tbContent = generateTestbench();
    }
    testbenchEditor.session.setValue(tbContent);
  }
}

// ============================================================
// Testbench auto-generator
// ============================================================
function generateTestbench() {
  var ports = config.ports || { in: [], out: [] };
  var portsIn = ports.in || [];
  var portsOut = ports.out || [];
  var moduleName = config.moduleName || 'dut';

  var lines = [];
  lines.push('`timescale 1ns/1ps');
  lines.push('');
  lines.push('module tb_' + moduleName + ';');
  lines.push('');

  // Declare regs for inputs, wires for outputs
  portsIn.forEach(function (p) {
    var pname = p.name.charAt(0) === '@' ? p.name.substr(1) : p.name;
    var r = p.range && p.range !== '' ? p.range + ' ' : '';
    lines.push('  reg ' + r + pname + ';');
  });
  portsOut.forEach(function (p) {
    var pname = p.name.charAt(0) === '@' ? p.name.substr(1) : p.name;
    var r = p.range && p.range !== '' ? p.range + ' ' : '';
    lines.push('  wire ' + r + pname + ';');
  });

  lines.push('');

  // Instantiate DUT
  var portList = portsIn
    .concat(portsOut)
    .map(function (p) {
      var pname = p.name.charAt(0) === '@' ? p.name.substr(1) : p.name;
      return '    .' + pname + '(' + pname + ')';
    })
    .join(',\n');
  lines.push('  ' + moduleName + ' dut (');
  if (portList) {
    lines.push(portList);
  }
  lines.push('  );');
  lines.push('');

  // Initial block
  lines.push('  initial begin');
  lines.push('    $dumpfile("ce_sim.vcd");');
  lines.push('    $dumpvars(0, tb_' + moduleName + ');');
  lines.push('');
  // Initialize inputs
  portsIn.forEach(function (p) {
    var pname = p.name.charAt(0) === '@' ? p.name.substr(1) : p.name;
    lines.push('    ' + pname + ' = 0;');
  });
  lines.push('    #100;');
  lines.push('    // Add stimulus here');
  lines.push('    #900;');
  lines.push('    $finish;');
  lines.push('  end');
  lines.push('');
  lines.push('endmodule');

  return lines.join('\n');
}

// ============================================================
// Main-window helpers (find the parent icestudio window)
// ============================================================
function findMainWindow(callback) {
  nw.Window.getAll(function (wins) {
    for (var i = 0; i < wins.length; i++) {
      if (
        wins[i].window &&
        typeof wins[i].window.icestudioReceiveCodeSave === 'function'
      ) {
        callback(wins[i].window);
        return;
      }
    }
    callback(null);
  });
}

// Returns the NW.js Window object (not JS window) for the main icestudio window
function findMainNWWindow(callback) {
  nw.Window.getAll(function (wins) {
    for (var i = 0; i < wins.length; i++) {
      if (
        wins[i].window &&
        typeof wins[i].window.icestudioReceiveCodeSave === 'function'
      ) {
        callback(wins[i]);
        return;
      }
    }
    callback(null);
  });
}

// ============================================================
// Save code back to main window + persist module.v to blockDir
// ============================================================
function saveCode() {
  if (!codeEditor) {
    return;
  }
  var newCode = codeEditor.getValue();
  findMainWindow(function (mainWin) {
    if (mainWin) {
      mainWin.icestudioReceiveCodeSave(blockId, newCode);
      if (typeof mainWin.icestudioSaveProject === 'function') {
        mainWin.icestudioSaveProject();
      }
    }
  });
  // Persist assembled module to per-block directory
  saveBlockFile('module.v', assembleVerilog());
}

// ============================================================
// Load code from main window (refresh from current block state)
// ============================================================
function loadCode() {
  findMainWindow(function (mainWin) {
    if (!mainWin || typeof mainWin.icestudioGetCode !== 'function') {
      showError('Cannot reach main window to load code.');
      return;
    }
    var current = mainWin.icestudioGetCode(blockId);
    if (codeEditor) {
      codeEditor.setValue(current, -1);
    }
    showOk('Code loaded from main window.');
  });
}

// ============================================================
// Write temp file helper
// ============================================================
function writeIfChanged(filepath, content) {
  try {
    var existing = '';
    try {
      existing = fs.readFileSync(filepath, 'utf8');
    } catch (e) {}
    if (existing !== content) {
      fs.writeFileSync(filepath, content);
    }
  } catch (e) {
    console.error('writeIfChanged failed', filepath, e);
  }
}

// ============================================================
// Assemble full Verilog module from ports + code body
// Mirrors the exact format used by icestudio's compiler.js
// ============================================================
function assembleVerilog() {
  var ports = config.ports || { in: [], out: [] };
  var portsIn = ports.in || [];
  var portsOut = ports.out || [];
  var moduleName = config.moduleName || 'ice_code_module';
  var code = codeEditor ? codeEditor.getValue() : config.code || '';

  var portDefs = [];
  portsIn.forEach(function (p) {
    var pname = p.name.charAt(0) === '@' ? p.name.substr(1) : p.name;
    var r = p.range && p.range !== '' ? p.range + ' ' : '';
    portDefs.push(' input ' + r + pname);
  });
  portsOut.forEach(function (p) {
    var pname = p.name.charAt(0) === '@' ? p.name.substr(1) : p.name;
    var r = p.range && p.range !== '' ? p.range + ' ' : '';
    portDefs.push(' output ' + r + pname);
  });

  var lines = [];
  lines.push('module ' + moduleName + ' (');
  lines.push(portDefs.join(',\n'));
  lines.push(');');
  lines.push('');
  lines.push(code);
  lines.push('');
  lines.push('endmodule');
  return lines.join('\n');
}

// ============================================================
// Error / status bar
// ============================================================
function showError(msg) {
  var bar = document.getElementById('error-bar');
  bar.className = 'err';
  bar.textContent = msg;
  // Forward errors to Claude panel so it has context for "Explain Errors"
  if (typeof ClaudePanel !== 'undefined') {
    ClaudePanel.setErrors(
      msg
        ? msg.split('\n').filter(function (l) {
            return l.trim();
          })
        : []
    );
  }
}

function showOk(msg) {
  var bar = document.getElementById('error-bar');
  bar.className = 'ok';
  bar.textContent = msg;
  setTimeout(function () {
    if (bar.className === 'ok') {
      bar.className = '';
      bar.textContent = '';
    }
  }, 4000);
}

function clearStatus() {
  var bar = document.getElementById('error-bar');
  bar.className = '';
  bar.textContent = '';
}

// ============================================================
// Verify: delegates to the main window's apio lint/verify
// (full mode only — formal mode runs formal_verify.py directly)
// ============================================================
function verifyCode() {
  var newCode = codeEditor ? codeEditor.getValue() : '';
  var myNWWin = nw.Window.get(); // This popup's NW.js window (for callback)

  // Expose result receiver on this popup's JS window so main window can call it
  myNWWin.window.icestudioVerifyResult = function (ok, outputText) {
    // Always clear stale annotations first
    if (codeEditor) {
      codeEditor.session.setAnnotations([]);
    }

    writeBlockStatus('V', ok ? true : false);

    if (ok) {
      showOk('Verify OK');
      return;
    }

    var allLines = (outputText || '').split('\n');

    // Classify each line into errors, main-file warnings, or summary
    var errors = [];
    var mainWarnings = [];
    var summaryLines = [];

    allLines.forEach(function (line) {
      if (!line.trim()) {
        return;
      }

      // Summary / build-system lines
      if (/error\(s\)|scons:|Took \d|={5}/.test(line)) {
        summaryLines.push(line);
        return;
      }

      // External library lines: contain a multi-segment path or known library names
      var isExternal =
        /[/\\][^/\\]+[/\\][^/\\]+\.v:/.test(line) ||
        /\.icestudio|packages|tools-oss|yosys|cells_sim/i.test(line);
      if (isExternal) {
        return;
      } // silently drop library noise

      if (/\berror\b/i.test(line)) {
        errors.push(line);
      } else if (/\bwarning\b/i.test(line)) {
        mainWarnings.push(line);
      } else {
        summaryLines.push(line);
      }
    });

    // Display: errors first, then warnings, then summary
    var displayLines = errors.concat(mainWarnings).concat(summaryLines);
    var msg = displayLines.join('\n') || outputText || 'Verification failed.';
    showError(msg);

    // Annotate identifiers mentioned in errors inside the Ace editor
    if (codeEditor && errors.length > 0) {
      var annotations = [];
      var editorLines = codeEditor.getValue().split('\n');
      var seen = {}; // avoid duplicate annotations for the same identifier

      errors.forEach(function (errLine) {
        // Verilog error notation: `ident'
        var match = errLine.match(/`(\w+)'/);
        if (!match) {
          return;
        }
        var ident = match[1];
        if (seen[ident]) {
          return;
        }
        seen[ident] = true;

        var identRegex = new RegExp('\\b' + ident + '\\b');
        editorLines.forEach(function (codeLine, rowIdx) {
          var col = codeLine.search(identRegex);
          if (col >= 0) {
            annotations.push({
              row: rowIdx,
              column: col,
              text: ident + ': ' + errLine.replace(/^[^:]+:\d+:\s*/, ''),
              type: 'error',
            });
          }
        });
      });

      if (annotations.length > 0) {
        codeEditor.session.setAnnotations(annotations);
      }
    }
  };

  // Remove stale temp files from buildDir before apio build sees them
  ['ce_dut.v', 'ce_tb.v', 'ce_verify_temp.v'].forEach(function (f) {
    var stale = path.join(buildDir, f);
    try {
      if (fs.existsSync(stale)) {
        fs.unlinkSync(stale);
      }
    } catch (e) {}
  });

  findMainWindow(function (mainWin) {
    if (!mainWin || typeof mainWin.icestudioRequestVerify !== 'function') {
      showError('Cannot reach main window to run verification.');
      return;
    }
    showOk('Verifying...');
    mainWin.icestudioRequestVerify(blockId, newCode, myNWWin);
  });
}

// ============================================================
// Formal verification: write temp .v + run formal_verify.py
// ============================================================
function runFormalVerify() {
  saveCode();
  var verilog = assembleVerilog();
  var tmpFile = path.join(blockDir, 'ce_verify_temp.v');
  var mdFile = tmpFile.replace(/\.v$/, '.formal.md');
  try {
    writeIfChanged(tmpFile, verilog);
  } catch (e) {
    showError('Cannot write temp file: ' + e.message);
    return;
  }

  var outputEl = document.getElementById('formal-output');
  outputEl.innerHTML = '<em>Running formal verification...</em>';

  var proc = childProcess.spawn(pythonCmd, [formalVerifyPyPath, tmpFile]);
  var stdout = '';
  var stderr = '';
  proc.stdout.on('data', function (d) {
    stdout += d.toString();
  });
  proc.stderr.on('data', function (d) {
    stderr += d.toString();
  });
  proc.on('close', function (code) {
    // Read the .formal.md file if it exists
    var mdContent = '';
    try {
      mdContent = fs.readFileSync(mdFile, 'utf8');
    } catch (e) {
      mdContent = stdout || stderr || 'No output generated.';
    }
    outputEl.innerHTML = renderMarkdown(mdContent);
    // Persist to per-block directory
    saveBlockFile('formal.md', mdContent);
    // Render any mermaid diagrams in the output
    if (typeof mermaid !== 'undefined' && outputEl.querySelector('.mermaid')) {
      try {
        mermaid.init(undefined, outputEl.querySelectorAll('.mermaid'));
      } catch (e) {}
    }
    writeBlockStatus('F', code === 0 ? true : false);
    if (code !== 0) {
      showError(
        'formal_verify.py exited with code ' +
          code +
          (stderr ? ': ' + stderr : '')
      );
    } else {
      clearStatus();
    }
  });
  proc.on('error', function (err) {
    outputEl.innerHTML =
      '<em>Error running formal_verify.py: ' + err.message + '</em>';
    showError(
      'Cannot run ' +
        pythonCmd +
        '. Check pythonCmd path. (' +
        err.message +
        ')'
    );
  });
}

// ============================================================
// Simple Markdown-to-HTML renderer (with Mermaid support)
// ============================================================
function renderMarkdown(md) {
  // 1. Extract mermaid blocks BEFORE HTML-escaping so their content is preserved
  var mermaidBlocks = [];
  md = md.replace(/```mermaid\r?\n([\s\S]*?)```/g, function (_, content) {
    var idx = mermaidBlocks.length;
    mermaidBlocks.push(content.trim());
    return 'MERMAID_BLOCK_' + idx + '_END';
  });

  // 2. Extract markdown tables into placeholders so the \n→<br> step can't
  //    corrupt them. Cell content is HTML-escaped here.
  var tableBlocks = [];
  md = md.replace(/((?:^\|.+\|[ \t]*\r?\n?)+)/gm, function (block) {
    var lines = block.split(/\r?\n/).filter(function (l) {
      return l.trim();
    });
    if (lines.length < 1) {
      return block;
    }

    function escHtml(s) {
      return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
    function isSep(line) {
      return /^\|[\s\-:|]+\|$/.test(line.trim());
    }
    function parseCells(line, tag) {
      var inner = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '');
      return (
        '<tr>' +
        inner
          .split('|')
          .map(function (c) {
            var content = escHtml(c.trim());
            // Strip inline markdown markers inside cells (same as outside tables)
            content = content.replace(/`([^`]+)`/g, '$1');
            content = content.replace(/\*\*(.+?)\*\*/g, '$1');
            content = content.replace(/\*(.+?)\*/g, '$1');
            return '<' + tag + '>' + content + '</' + tag + '>';
          })
          .join('') +
        '</tr>'
      );
    }

    var hasSep = lines.length >= 2 && isSep(lines[1]);
    var bodyLines = (hasSep ? lines.slice(2) : lines.slice(1)).filter(
      function (l) {
        return !isSep(l);
      }
    );

    var tableHtml = '<table><thead>' + parseCells(lines[0], 'th') + '</thead>';
    if (bodyLines.length > 0) {
      tableHtml +=
        '<tbody>' +
        bodyLines
          .map(function (l) {
            return parseCells(l, 'td');
          })
          .join('') +
        '</tbody>';
    }
    tableHtml += '</table>';

    var tIdx = tableBlocks.length;
    tableBlocks.push(tableHtml);
    return 'TABLE_BLOCK_' + tIdx + '_END\n';
  });

  var html = md
    // Escape HTML special chars first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Code blocks (``` ... ```) — non-mermaid
    .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    // Inline code — strip backticks, show plain text
    .replace(/`([^`]+)`/g, '$1')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold — strip markers, show plain text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    // Italic — strip markers, show plain text
    .replace(/\*(.+?)\*/g, '$1')
    // Horizontal rule
    .replace(/^---$/gm, '<hr>')
    // Unordered list items
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    // Paragraphs (double newlines)
    .replace(/\n\n+/g, '</p><p>')
    // Single newlines
    .replace(/\n/g, '<br>');

  // 3. Restore mermaid blocks (content must NOT be HTML-escaped)
  mermaidBlocks.forEach(function (content, idx) {
    html = html.replace(
      'MERMAID_BLOCK_' + idx + '_END',
      '<div class="mermaid">' + content + '</div>'
    );
  });

  // 4. Restore table blocks — handle both 'placeholder<br>' and bare 'placeholder'
  tableBlocks.forEach(function (tableHtml, idx) {
    var key = 'TABLE_BLOCK_' + idx + '_END';
    html = html.split(key + '<br>').join(tableHtml);
    html = html.split(key).join(tableHtml);
  });

  return '<p>' + html + '</p>';
}

// ============================================================
// Simulation (testbench mode)
// ============================================================
var vcdPath = '';
var runningSimProc = null; // track the active vvp process for Stop button
var gtkwaveProc = null; // track the GTKWave process for kill-on-rerun
var waveformViewer = null; // embedded waveform viewer instance

// ============================================================
// Waveform viewer state persistence
// ============================================================
function saveWaveformState() {
  if (!waveformViewer || !blockDir) {
    return;
  }
  try {
    var state = waveformViewer.getState();
    // Don't save empty/default state (no data loaded yet)
    if (!state.signals || state.signals.length === 0) {
      return;
    }
    saveBlockFile('waveform_state.json', JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('saveWaveformState:', e.message);
  }
}

function loadWaveformState() {
  var json = readBlockFile('waveform_state.json');
  if (!json) {
    return null;
  }
  try {
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

function stopSimulation() {
  if (runningSimProc) {
    try {
      runningSimProc.kill();
    } catch (e) {}
    runningSimProc = null;
  }
}

function runSimulation() {
  // Use blockDir for sim files if available, otherwise fall back to buildDir
  var simDir = blockDir || buildDir;
  var dutFile = path.join(simDir, 'module.v');
  var tbFile = path.join(simDir, 'testbench.v');
  var simVvp = path.join(simDir, 'sim.vvp');
  vcdPath = path.join(simDir, 'sim.vcd');

  var dutCode = assembleVerilog();
  var tbCode = testbenchEditor ? testbenchEditor.getValue() : '';

  // Persist both source files to blockDir before compiling
  saveBlockFile('module.v', dutCode);
  saveBlockFile('testbench.v', tbCode);

  try {
    ensureBlockDir();
    writeIfChanged(dutFile, dutCode);
    writeIfChanged(tbFile, tbCode);
  } catch (e) {
    showError('Cannot write simulation files: ' + e.message);
    return;
  }

  var logEl = document.getElementById('sim-log');
  logEl.textContent = 'Compiling...';

  var gtkBtn = document.getElementById('btn-gtkwave');
  if (gtkBtn) {
    gtkBtn.disabled = true;
  }

  var iverilog = getBin('iverilog');
  // Inject toolchain bin/ and lib/ into PATH so OSS CAD Suite DLLs are found.
  // On Windows the DLLs live in lib/ (sibling of bin/), not in bin/ itself.
  var childEnv = Object.assign({}, process.env);
  if (toolchainBinDir) {
    var toolchainLibDir = path.join(toolchainBinDir, '..', 'lib');
    childEnv.PATH =
      toolchainBinDir +
      path.delimiter +
      toolchainLibDir +
      path.delimiter +
      (childEnv.PATH || '');
  }
  // Run both iverilog and vvp with cwd=simDir so $dumpfile relative paths land there
  var spawnOpts = { cwd: simDir, env: childEnv };
  var compileProc = childProcess.spawn(
    iverilog,
    ['-o', simVvp, tbFile, dutFile],
    spawnOpts
  );
  var compileOut = '';
  compileProc.stderr.on('data', function (d) {
    compileOut += d.toString();
  });
  compileProc.stdout.on('data', function (d) {
    compileOut += d.toString();
  });
  compileProc.on('error', function (err) {
    logEl.textContent = 'iverilog error: ' + err.message;
    showError('iverilog not found at: ' + iverilog);
  });
  compileProc.on('close', function (code) {
    if (code !== 0) {
      var errText = 'Compile errors:\n' + (compileOut || 'exit ' + code);
      logEl.textContent = errText;
      saveBlockFile('sim_output.txt', errText);
      showError('Compile failed');
      return;
    }
    logEl.textContent = 'Compiled OK. Running simulation...\n';
    var simOutput = 'Compiled OK. Running simulation...\n';
    var vvp = getBin('vvp');
    var simProc = childProcess.spawn(vvp, [simVvp], spawnOpts);
    runningSimProc = simProc;

    // Show Stop button while sim runs
    var stopBtn = document.getElementById('btn-stop-sim');
    var runBtn = document.getElementById('btn-run-sim');
    if (stopBtn) {
      stopBtn.style.display = '';
    }
    if (runBtn) {
      runBtn.disabled = true;
    }

    // Show elapsed seconds while vvp runs so it's clear it's still going
    var simStart = Date.now();
    var simTimer = setInterval(function () {
      var secs = ((Date.now() - simStart) / 1000).toFixed(0);
      showOk('Simulation running... ' + secs + 's');
    }, 1000);

    simProc.stdout.on('data', function (d) {
      var s = d.toString();
      logEl.textContent += s;
      simOutput += s;
    });
    simProc.stderr.on('data', function (d) {
      var s = d.toString();
      logEl.textContent += s;
      simOutput += s;
    });
    simProc.on('error', function (err) {
      clearInterval(simTimer);
      runningSimProc = null;
      if (stopBtn) {
        stopBtn.style.display = 'none';
      }
      if (runBtn) {
        runBtn.disabled = false;
      }
      var s = '\nvvp error: ' + err.message;
      logEl.textContent += s;
      simOutput += s;
      showError('vvp not found at: ' + vvp);
    });
    simProc.on('close', function (simCode) {
      clearInterval(simTimer);
      runningSimProc = null;
      if (stopBtn) {
        stopBtn.style.display = 'none';
      }
      if (runBtn) {
        runBtn.disabled = false;
      }
      var footer = '\n--- Simulation finished (exit ' + simCode + ') ---';
      logEl.textContent += footer;
      simOutput += footer;
      saveBlockFile('sim_output.txt', simOutput);
      writeBlockStatus('T', simCode === 0 ? true : false);
      // Find any .vcd produced in simDir (handles any $dumpfile name in the testbench)
      try {
        var vcdFiles = fs.readdirSync(simDir).filter(function (f) {
          return f.endsWith('.vcd');
        });
        if (vcdFiles.length > 0) {
          vcdPath = path.join(simDir, vcdFiles[0]);
          if (gtkBtn) {
            gtkBtn.disabled = false;
          }
          // Load waveform viewer if available, otherwise fall back to GTKWave
          if (waveformViewer) {
            try {
              // Save current state BEFORE loading new VCD so re-run preserves settings
              saveWaveformState();

              // Make panel visible BEFORE loading data so layout is stable for sizing
              var wvPanel = document.getElementById('panel-waveform');
              if (wvPanel) {
                wvPanel.classList.add('visible');
                document.body.classList.add('waveform-open');
              }

              var vcdContent = fs.readFileSync(vcdPath, 'utf8');

              // Use rAF to ensure the grid layout has settled before sizing canvases
              requestAnimationFrame(function () {
                waveformViewer.loadVCD(vcdContent);
                // Restore saved colors, visibility, zoom, markers, signal order
                var savedState = loadWaveformState();
                if (savedState) {
                  waveformViewer.applyState(savedState);
                }
                waveformViewer.resize();
              });

              showOk('Simulation done \u2014 waveform loaded.');
            } catch (loadErr) {
              console.error('Failed to load VCD:', loadErr);
              showOk('Simulation done \u2014 opening GTKWave...');
              setTimeout(launchGTKWave, 300);
            }
          } else {
            showOk('Simulation done \u2014 opening GTKWave...');
            setTimeout(launchGTKWave, 300);
          }
        } else {
          vcdPath = '';
          showOk('Simulation done (no VCD file generated).');
        }
      } catch (e) {
        showOk('Simulation done.');
      }
    });
  });
}

function findGTKWave() {
  // 1. Explicit path resolved by graph.js at launch time (checks next to app folder)
  if (config.gtkwavePath) {
    return config.gtkwavePath;
  }

  // 2. Check apio toolchain bin dir
  var fromBin = getBin('gtkwave');
  if (fromBin !== 'gtkwave') {
    return fromBin;
  }

  // 3. Check relative to toolchainBinDir's ancestor (covers custom apio setups)
  if (isWin32) {
    var candidates = [
      // Known user location (icestudio-relative)
      'C:\\Users\\gewac\\Documents\\code\\ice_studio_modded\\icestudio\\GTKWave\\bin\\gtkwave.exe',
      // Common install locations
      'C:\\Program Files\\GTKWave\\bin\\gtkwave.exe',
      'C:\\Program Files (x86)\\GTKWave\\bin\\gtkwave.exe',
      'C:\\Program Files\\gtkwave64\\bin\\gtkwave.exe',
      'C:\\gtkwave\\bin\\gtkwave.exe',
    ];
    for (var i = 0; i < candidates.length; i++) {
      try {
        fs.accessSync(candidates[i]);
        return candidates[i];
      } catch (e) {}
    }
  }

  // 4. Fall back to bare name (works if GTKWave is on the PATH NW.js sees)
  return 'gtkwave';
}

function launchGTKWave() {
  if (!vcdPath || !fs.existsSync(vcdPath)) {
    showError('No VCD file found. Run simulation first.');
    return;
  }

  // Close old GTKWave if running, then open a fresh instance
  if (gtkwaveProc) {
    try {
      gtkwaveProc.kill();
    } catch (e) {}
    gtkwaveProc = null;
  }

  var gtkwave = findGTKWave();
  var gtkwaveDir = path.dirname(gtkwave);

  // Small delay after kill so the old process is fully gone
  setTimeout(function () {
    _spawnGTKWave(gtkwave, gtkwaveDir);
  }, 300);
}

// ============================================================
// VCD parser — extracts signal hierarchy and max simulation time.
// Used to build the .gtkw save file before GTKWave opens so that
// zoom is pre-calculated and written into the file (the only
// reliable way: GTKWave reads the save file during C-level display
// init, after any Tcl -S script, so it cannot be overridden).
// ============================================================
function parseVCDForGTKWave(vcdFilePath) {
  var result = { signals: [], maxTime: 0 };
  try {
    var content = fs.readFileSync(vcdFilePath, 'utf8');

    // Scan entire file for the largest #time stamp
    var timeRe = /^#(\d+)/gm;
    var tm;
    while ((tm = timeRe.exec(content)) !== null) {
      var t = parseInt(tm[1], 10);
      if (t > result.maxTime) {
        result.maxTime = t;
      }
    }

    // Parse signal declarations from the header (before $enddefinitions)
    var endDefs = content.indexOf('$enddefinitions');
    var header = endDefs >= 0 ? content.substring(0, endDefs) : content;
    var tokens = header.split(/\s+/).filter(Boolean);
    var scopeStack = [];
    var seen = {};
    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i] === '$scope' && i + 3 < tokens.length) {
        // $scope <type> <name> $end
        scopeStack.push(tokens[i + 2]);
        i += 3;
      } else if (tokens[i] === '$upscope') {
        scopeStack.pop();
        if (tokens[i + 1] === '$end') {
          i++;
        }
      } else if (tokens[i] === '$var' && i + 4 < tokens.length) {
        // $var <type> <width> <id> <name> [$bit_index] $end
        var sigName = tokens[i + 4];
        if (
          sigName &&
          sigName !== '$end' &&
          sigName[0] !== '[' &&
          sigName[0] !== '$'
        ) {
          var full =
            (scopeStack.length ? scopeStack.join('.') + '.' : '') + sigName;
          if (!seen[full]) {
            seen[full] = true;
            result.signals.push(full);
          }
        }
        while (i < tokens.length - 1 && tokens[i] !== '$end') {
          i++;
        }
      }
    }
  } catch (e) {
    console.error('parseVCDForGTKWave:', e.message);
  }
  return result;
}

// Write a minimal .gtkw save file with zoom pre-set for zoom-to-fit.
// GTKWave zoom formula: pxns = 10^zoom  (pixels per time unit)
//   zoom-to-fit: zoom = log10(window_width_px / max_time)
// We assume ~1200 px for the wave area; GTKWave will be slightly
// zoomed-out if the window is narrower, which is fine.
function writeGTKWSaveFile(saveFilePath, signals, maxTime) {
  var zoom = maxTime > 0 ? Math.log10(1200.0 / maxTime) : 0;
  var lines = [
    '[timestart] 0',
    '*' + zoom.toFixed(6) + ' 0',
    '[signals_save_mode] 0',
  ].concat(signals);
  try {
    fs.writeFileSync(saveFilePath, lines.join('\n') + '\n');
    return true;
  } catch (e) {
    console.error('writeGTKWSaveFile:', e.message);
    return false;
  }
}

function _spawnGTKWave(gtkwave, gtkwaveDir) {
  var tclScript = blockFile('gtkwave_init.tcl');

  var tclContent = [
    'set nfacs [ gtkwave::getNumFacs ]',
    'set all_facs [list]',
    'for {set i 0} {$i < $nfacs } {incr i} {',
    '    set facname [ gtkwave::getFacName $i ]',
    '    lappend all_facs "$facname"',
    '}',
    'set num_added [ gtkwave::addSignalsFromList $all_facs ]',
    'gtkwave::/Time/Zoom/Zoom_Full',
    '',
  ].join('\n');

  writeIfChanged(tclScript, tclContent);

  var args = [vcdPath, '-S', tclScript];

  showOk('Launching GTKWave');

  var spawnOpts = { cwd: gtkwaveDir, stdio: 'ignore' };
  if (!isWin32) {
    spawnOpts.detached = true;
  }

  gtkwaveProc = childProcess.spawn(gtkwave, args, spawnOpts);
  if (!isWin32) {
    gtkwaveProc.unref();
  }

  gtkwaveProc.on('error', function (err) {
    showError('GTKWave failed: ' + err.message + '\nPath: ' + gtkwave);
    gtkwaveProc = null;
    if (isWin32) {
      var cmd = 'start "" "' + gtkwave + '" "' + vcdPath + '"';
      childProcess.exec(cmd, function (err2) {
        if (err2) {
          showError('GTKWave fallback also failed: ' + err2.message);
        }
      });
    }
  });

  gtkwaveProc.on('close', function () {
    gtkwaveProc = null;
  });
}

// ============================================================
// Panel resize handles
// ============================================================
function _makeColResizer(handle, onDrag) {
  handle.addEventListener('mousedown', function (e) {
    e.preventDefault();
    handle.classList.add('dragging');
    var lastX = e.clientX;
    var onMove = function (ev) {
      var dx = ev.clientX - lastX;
      lastX = ev.clientX;
      if (dx !== 0) {
        onDrag(dx);
      }
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

function _makeRowResizer(handle, onDrag) {
  handle.addEventListener('mousedown', function (e) {
    e.preventDefault();
    handle.classList.add('dragging');
    var lastY = e.clientY;
    var onMove = function (ev) {
      var dy = ev.clientY - lastY;
      lastY = ev.clientY;
      if (dy !== 0) {
        onDrag(dy);
      }
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

function _initResizeHandles() {
  var panelsEl = document.getElementById('panels');

  // ---- Formal mode: vertical handle between code and formal output ----
  if (mode === 'formal') {
    var formalHandle = document.getElementById('formal-resize-handle');
    var panelCode = document.getElementById('panel-full-editor');
    if (formalHandle && panelCode) {
      _makeColResizer(formalHandle, function (dx) {
        var currentW = panelCode.offsetWidth;
        var totalW = panelsEl.offsetWidth;
        var newW = Math.max(100, Math.min(totalW - 105, currentW + dx));
        panelCode.style.flex = 'none';
        panelCode.style.width = newW + 'px';
      });
    }
  }

  // ---- Testbench mode: column and row handles ----
  if (mode === 'testbench') {
    var tbHandle1 = document.getElementById('tb-handle-1');
    var tbHandle2 = document.getElementById('tb-handle-2');
    var tbHandleWv = document.getElementById('tb-handle-wv');

    var col1W = Math.round(panelsEl.offsetWidth * 0.35);
    var col5W = Math.round(panelsEl.offsetWidth * 0.25);

    var updateTbCols = function () {
      var total = panelsEl.offsetWidth;
      col1W = Math.max(80, Math.min(total - col5W - 100, col1W));
      col5W = Math.max(80, Math.min(total - col1W - 100, col5W));
      panelsEl.style.gridTemplateColumns =
        col1W + 'px 9px 1fr 9px ' + col5W + 'px';
    };

    if (tbHandle1) {
      _makeColResizer(tbHandle1, function (dx) {
        col1W += dx;
        updateTbCols();
      });
    }

    if (tbHandle2) {
      _makeColResizer(tbHandle2, function (dx) {
        col5W -= dx;
        updateTbCols();
      });
    }

    var topH = -1;
    if (tbHandleWv) {
      _makeRowResizer(tbHandleWv, function (dy) {
        if (topH < 0) {
          topH = Math.round(panelsEl.offsetHeight / 2);
        }
        topH += dy;
        var total = panelsEl.offsetHeight;
        topH = Math.max(60, Math.min(total - 65, topH));
        panelsEl.style.gridTemplateRows = topH + 'px 9px 1fr';
      });
    }
  }
}

// ============================================================
// Init
// ============================================================
window.onload = function () {
  applyTheme();

  // Ensure per-block directory exists
  ensureBlockDir();

  // Initialize Mermaid (disable auto-scan; we call mermaid.init() manually after render)
  if (typeof mermaid !== 'undefined') {
    mermaid.initialize({
      startOnLoad: false,
      theme: theme === 'dark' ? 'dark' : 'default',
    });
  }

  // Set body class for layout mode
  document.body.classList.add('mode-' + mode);

  // Update title
  var titles = {
    full: 'Full Editor',
    formal: 'Formal Test',
    testbench: 'Testbench',
  };
  document.getElementById('toolbar-title').textContent =
    titles[mode] || 'Code Editor';

  initAceEditors();

  // Keep ACE syntax-highlight theme in sync with live theme changes from shared/theme.js
  if (window.AppTheme) {
    window.AppTheme.onChange(applyAceTheme);
  }

  // Wire up buttons
  document.getElementById('btn-load').addEventListener('click', loadCode);
  document.getElementById('btn-save').addEventListener('click', saveCode);

  document.getElementById('btn-verify').addEventListener('click', function () {
    if (mode === 'formal') {
      // Formal mode: write temp file + run formal_verify.py directly (no iverilog needed)
      runFormalVerify();
    } else {
      // Full mode: delegate to main window's apio lint/verify
      verifyCode();
    }
  });

  // Update verify button label for formal mode
  if (mode === 'formal') {
    var verifyBtn = document.getElementById('btn-verify');
    if (verifyBtn) {
      verifyBtn.textContent = '\u25BA Verify & Analyze';
    }
  }

  document
    .getElementById('btn-run-sim')
    .addEventListener('click', runSimulation);
  document
    .getElementById('btn-stop-sim')
    .addEventListener('click', function () {
      stopSimulation();
      showError('Simulation stopped.');
    });
  document
    .getElementById('btn-gtkwave')
    .addEventListener('click', launchGTKWave);

  // Disable GTKWave on start until simulation runs
  var gtkBtn = document.getElementById('btn-gtkwave');
  if (gtkBtn) {
    gtkBtn.disabled = true;
  }

  // Initialize waveform viewer (testbench mode only)
  if (mode === 'testbench' && typeof WaveformViewer === 'function') {
    var wvContainer = document.getElementById('waveform-viewer');
    if (wvContainer) {
      waveformViewer = new WaveformViewer(wvContainer, { theme: theme });
    }
  }

  // Initialize Claude AI panel (available in all modes)
  if (typeof DocManager !== 'undefined' && typeof ClaudePanel !== 'undefined') {
    DocManager.init();
    ClaudePanel.init(boardInfo, boardPinout, DocManager);
  }

  // Initialize panel resize handles
  _initResizeHandles();

  // Restore last position/size, then track changes
  var win = nw.Window.get();
  _restoreGeometry(win);
  win.on('move', function () {
    _scheduleGeoSave(win);
  });
  win.on('resize', function () {
    _scheduleGeoSave(win);
    if (waveformViewer) {
      waveformViewer.resize();
    }
  });

  // Auto-save all work when the window is closed
  win.on('close', function () {
    var self = this;
    var done = false;
    function doClose() {
      if (!done) {
        done = true;
        self.close(true);
      }
    }

    // Persist final window position immediately
    _saveGeometry(win);

    // Kill GTKWave if it is open
    if (gtkwaveProc) {
      try {
        gtkwaveProc.kill();
      } catch (e) {}
      gtkwaveProc = null;
    }

    // Sync: save block files immediately (no async risk)
    if (codeEditor) {
      saveBlockFile('module.v', assembleVerilog());
    }
    if (testbenchEditor) {
      saveBlockFile('testbench.v', testbenchEditor.getValue());
    }
    // Persist waveform viewer state (colors, zoom, markers)
    saveWaveformState();

    // Async: push code change to main window, then close
    // Fallback: close after 1 s if main window doesn't respond
    setTimeout(doClose, 1000);
    findMainWindow(function (mainWin) {
      if (mainWin && codeEditor) {
        mainWin.icestudioReceiveCodeSave(blockId, codeEditor.getValue());
      }
      doClose();
    });
  });

  // Close this popup (and GTKWave via the close handler above) when the main window closes
  findMainNWWindow(function (mainNWWin) {
    if (mainNWWin) {
      mainNWWin.on('close', function () {
        win.close(true);
      });
    }
  });
};
