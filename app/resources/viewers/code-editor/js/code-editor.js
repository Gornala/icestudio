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

// Embedded mode: this page is running in an <iframe> inside the main window
// (the tree panel), not in its own NW window. nw.Window.get() would then
// return the HOST window, so every geometry call has to be skipped — moving
// or resizing here would move the whole application.
var embedded = !!config.embedded;

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
// Track what was last sent to main window so we can warn on close
var _lastSentCode = null;

function initAceEditors() {
  codeEditor = ace.edit('ace-code');
  codeEditor.setTheme(
    theme === 'dark' ? 'ace/theme/monokai' : 'ace/theme/chrome'
  );
  codeEditor.session.setMode('ace/mode/verilog');
  codeEditor.setHighlightActiveLine(true);
  codeEditor.session.setValue(config.code || '');
  codeEditor.$blockScrolling = Infinity;
  _lastSentCode = config.code || '';

  // Project-level testbench: DUT code is compiled from the design, read-only
  if (config.projectTestbench) {
    codeEditor.setReadOnly(true);
    codeEditor.renderer.setStyle('ace_read-only-dim');
  }

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
    // Load saved testbench. For project testbenches, UUIDs in port
    // mappings change on every re-synthesis, so we merge: take the
    // auto-generated header (module decl + instance) from the fresh
    // testbench and preserve the user's custom test logic from the
    // saved one. The marker "// --- END AUTO-GENERATED --- //" splits
    // the two sections.
    var savedTb = readBlockFile('testbench.v');
    var moduleName = config.moduleName || 'dut';
    var tbContent;
    var AUTO_MARKER = '// --- END AUTO-GENERATED --- //';

    if (savedTb !== null && config.projectTestbench && config.testbench) {
      // Project testbench: merge fresh header with saved body
      var savedMarkerIdx = savedTb.indexOf(AUTO_MARKER);
      var freshMarkerIdx = config.testbench.indexOf(AUTO_MARKER);
      if (savedMarkerIdx !== -1 && freshMarkerIdx !== -1) {
        // Take header from fresh (up to and including marker),
        // body from saved (everything after marker)
        var freshHeader = config.testbench.substring(
          0,
          freshMarkerIdx + AUTO_MARKER.length
        );
        var savedBody = savedTb.substring(savedMarkerIdx + AUTO_MARKER.length);
        tbContent = freshHeader + savedBody;
      } else if (savedMarkerIdx === -1 && freshMarkerIdx !== -1) {
        // Old saved testbench has no marker (created before this
        // feature). Try to extract user body after module instance.
        var instanceEnd = savedTb.match(/\)\s*;\s*\n/);
        if (instanceEnd) {
          var bodyStart = instanceEnd.index + instanceEnd[0].length;
          var freshHeader2 = config.testbench.substring(
            0,
            freshMarkerIdx + AUTO_MARKER.length
          );
          var savedBody2 = '\n' + savedTb.substring(bodyStart);
          tbContent = freshHeader2 + savedBody2;
        } else {
          // Cannot parse old testbench — use fresh
          tbContent = config.testbench;
        }
      } else {
        tbContent = config.testbench;
      }
    } else if (savedTb !== null) {
      // Block-level testbench: patch module name if renamed
      if (savedTb.indexOf(moduleName + ' dut') !== -1) {
        tbContent = savedTb;
      } else {
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

    // Migrate block testbenches where the dump block ($dumpvars) is not yet
    // inside the auto-generated header (i.e. it appears after the marker, or
    // there is no marker at all).  Both cases need the same restructuring:
    // take everything after the $dumpvars line as the user stimulus body and
    // prepend a fresh header that already contains the dump block.
    if (!config.projectTestbench) {
      var migrMarkerPos = tbContent.indexOf(AUTO_MARKER);
      var dumpBeforeMarker =
        migrMarkerPos !== -1 &&
        /\$dumpvars/.test(tbContent.substring(0, migrMarkerPos));
      if (!dumpBeforeMarker) {
        var migrParams = mergeParams(
          getParams(),
          parseTestbenchParams(tbContent)
        );
        var dvMatch = tbContent.match(/\$dumpvars\([^)]*\);\s*\n/);
        if (dvMatch) {
          var stimBody = tbContent.substring(dvMatch.index + dvMatch[0].length);
          tbContent =
            generateTestbenchHeader(null, null, migrParams) +
            '\n  initial begin\n\n' +
            stimBody;
        } else if (migrMarkerPos !== -1) {
          tbContent =
            generateTestbenchHeader(null, null, migrParams) +
            tbContent.substring(migrMarkerPos + AUTO_MARKER.length);
        } else {
          tbContent = generateTestbench();
        }
      }
    }

    testbenchEditor.session.setValue(tbContent);
  }
}

// ============================================================
// Verilog identifier sanitizer
// ============================================================
// Verilog identifiers must start with a letter or underscore. UUID-based block
// names (e.g. "0e0732b8_ae33_...") start with a digit and cause syntax errors.
// Prefix with "m" to make them legal without changing anything else.
function sanitizeVerilogId(name) {
  return /^[0-9]/.test(name) ? 'm' + name : name;
}

// ============================================================
// Module parameter helpers
// ============================================================

// Parse #(parameter NAME = VALUE, ...) from a Verilog module declaration.
// Returns [{name, value}, ...] or [].
function parseModuleParams(verilogCode) {
  var m = verilogCode.match(/module\s+\w+\s*#\s*\(([\s\S]*?)\)\s*\(/);
  if (!m) {
    return [];
  }
  var params = [];
  var re = /\bparameter\b\s+(?:\w+\s+)?(\w+)\s*=\s*([^,\n)]+)/g;
  var pm;
  while ((pm = re.exec(m[1])) !== null) {
    params.push({ name: pm[1].trim(), value: pm[2].trim() });
  }
  return params;
}

// Parse the existing .NAME(value) entries from the #(...) block in a testbench.
// Returns {NAME: 'value', ...} so callers can look up current user values.
function parseTestbenchParams(tbContent) {
  var m = tbContent.match(/#\s*\(([\s\S]*?)\)\s*dut\s*\(/);
  if (!m) {
    return {};
  }
  var result = {};
  var re = /\.(\w+)\s*\(\s*([^)]+?)\s*\)/g;
  var pm;
  while ((pm = re.exec(m[1])) !== null) {
    result[pm[1]] = pm[2].trim();
  }
  return result;
}

// Get the module's parameter list from config.params (if set) or by parsing
// the DUT code panel.  Returns [{name, value}, ...].
function getParams() {
  if (config.params && config.params.length > 0) {
    return config.params;
  }
  var code = codeEditor ? codeEditor.getValue() : config.code || '';
  return parseModuleParams(code);
}

// Merge default params with values the user may have edited in the testbench.
// Any param name present in userValues replaces the default.
function mergeParams(defaultParams, userValues) {
  return defaultParams.map(function (p) {
    return {
      name: p.name,
      value: userValues.hasOwnProperty(p.name) ? userValues[p.name] : p.value,
    };
  });
}

// ============================================================
// Testbench auto-generator
// ============================================================

// Generates only the auto-managed header (timescale → module instance → marker).
// The marker line is the split point between auto-generated and user-editable code.
function generateTestbenchHeader(ports, moduleName, params) {
  ports = ports || config.ports || { in: [], out: [] };
  moduleName = sanitizeVerilogId(moduleName || config.moduleName || 'dut');
  // params undefined → auto-detect; null → force no params; array → use as-is
  if (params === undefined) {
    params = getParams();
  }
  var portsIn = ports.in || [];
  var portsOut = ports.out || [];
  var AUTO_MARKER = '// --- END AUTO-GENERATED --- //';

  var lines = [];
  lines.push('`timescale 1ns/1ps');
  lines.push('');
  lines.push('module tb_' + moduleName + ';');
  lines.push('');

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

  var portList = portsIn
    .concat(portsOut)
    .map(function (p) {
      var pname = p.name.charAt(0) === '@' ? p.name.substr(1) : p.name;
      return '    .' + pname + '(' + pname + ')';
    })
    .join(',\n');

  if (params && params.length > 0) {
    var paramList = params
      .map(function (p) {
        return '    .' + p.name + '(' + p.value + ')';
      })
      .join(',\n');
    lines.push('  ' + moduleName + ' #(');
    lines.push(paramList);
    lines.push('  ) dut (');
  } else {
    lines.push('  ' + moduleName + ' dut (');
  }
  if (portList) {
    lines.push(portList);
  }
  lines.push('  );');
  lines.push('');
  lines.push('');
  lines.push('  initial begin');
  lines.push('    $dumpfile("ce_sim.vcd");');
  lines.push('    $dumpvars(0, tb_' + moduleName + ');');
  lines.push('  end');
  lines.push(AUTO_MARKER);

  return lines.join('\n');
}

function generateTestbench() {
  var ports = config.ports || { in: [], out: [] };
  var portsIn = ports.in || [];
  var moduleName = sanitizeVerilogId(config.moduleName || 'dut');
  var params = getParams();

  var lines = [];
  lines.push(generateTestbenchHeader(ports, moduleName, params));
  lines.push('  initial begin');
  lines.push('');
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
  // Project-level testbench: DUT code is read-only, no save-back
  if (config.projectTestbench) {
    saveBlockFile('module.v', assembleVerilog());
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
  _lastSentCode = newCode;
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
      _lastSentCode = current;
    }
    showOk('Code loaded from main window.');
  });
}

// ============================================================
// Update testbench header from current design state
// Re-fetches fresh testbench from main window, replaces only the
// auto-generated header section, preserves the user's test logic.
// ============================================================
function updateTestbenchHeader() {
  if (!testbenchEditor) {
    return;
  }
  var AUTO_MARKER = '// --- END AUTO-GENERATED --- //';
  var currentTb = testbenchEditor.getValue();
  var markerIdx = currentTb.indexOf(AUTO_MARKER);
  var userBody =
    markerIdx !== -1
      ? currentTb.substring(markerIdx + AUTO_MARKER.length)
      : '\n  initial begin\n\n    // Add stimulus here\n    #1000;\n    $finish;\n  end\n\nendmodule\n';

  if (config.projectTestbench) {
    // Project testbench: re-compile from the current design via the main window
    findMainWindow(function (mainWin) {
      if (
        !mainWin ||
        typeof mainWin.icestudioGetFreshTestbench !== 'function'
      ) {
        showError('Cannot reach main window to refresh testbench header.');
        return;
      }
      var freshTb = mainWin.icestudioGetFreshTestbench();
      if (!freshTb) {
        showError(
          'Main window returned an empty testbench — is the design valid?'
        );
        return;
      }
      var freshMarkerIdx = freshTb.indexOf(AUTO_MARKER);
      if (freshMarkerIdx === -1) {
        showError(
          'Fresh testbench has no auto-generated marker — cannot split header.'
        );
        return;
      }
      var freshHeader = freshTb.substring(
        0,
        freshMarkerIdx + AUTO_MARKER.length
      );
      testbenchEditor.setValue(freshHeader + userBody, -1);
      showOk(
        'Testbench header updated — port/parameter UUIDs are now current.'
      );
    });
  } else {
    // Block-level testbench: regenerate header from the ports known to this editor
    // session, preserving any parameter values the user has already edited.
    var currentParamValues = parseTestbenchParams(currentTb);
    var updatedParams = mergeParams(getParams(), currentParamValues);
    userBody = userBody
      .replace(/[ \t]*\$dumpfile\b[^\n]*\n/g, '')
      .replace(/[ \t]*\$dumpvars\b[^\n]*\n/g, '');
    testbenchEditor.setValue(
      generateTestbenchHeader(null, null, updatedParams) + userBody,
      -1
    );
    showOk('Testbench header updated.');
  }
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
  // Project-level testbench: code is already complete compiled Verilog
  if (config.projectTestbench) {
    return codeEditor ? codeEditor.getValue() : config.code || '';
  }

  var ports = config.ports || { in: [], out: [] };
  var portsIn = ports.in || [];
  var portsOut = ports.out || [];
  var moduleName = sanitizeVerilogId(config.moduleName || 'ice_code_module');
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

// Embedded in the tree panel: tell it to re-read this block's artifacts, so a
// simulation or analysis run from here updates the coverage badges at once.
function notifyTreePanel() {
  if (!embedded) {
    return;
  }
  try {
    if (window.parent && window.parent.iceTreePanel) {
      window.parent.iceTreePanel.refresh();
    }
  } catch (e) {}
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
  // The main window only ever touches callerWin.window.icestudioVerifyResult,
  // so embedded in an iframe a plain shim around our own global is enough —
  // and it avoids clobbering that name on the host window.
  var myNWWin = embedded ? { window: window } : nw.Window.get();

  // Expose result receiver on this page's JS window so main window can call it
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
    notifyTreePanel();
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
      notifyTreePanel();
      // Find any .vcd produced in simDir (handles any $dumpfile name in the testbench)
      try {
        var vcdFiles = fs.readdirSync(simDir).filter(function (f) {
          return f.endsWith('.vcd');
        });
        if (vcdFiles.length > 0) {
          vcdPath = path.join(simDir, vcdFiles[0]);
          // Load waveform viewer
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
              showOk('Simulation done (waveform viewer failed to load VCD).');
            }
          } else {
            showOk('Simulation done.');
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
  var updateTbHeaderBtn = document.getElementById('btn-update-tb-header');
  if (updateTbHeaderBtn) {
    if (mode === 'testbench') {
      updateTbHeaderBtn.style.display = '';
    }
    updateTbHeaderBtn.addEventListener('click', updateTestbenchHeader);
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

  // Restore last position/size, then track changes.
  // Embedded in the tree panel there is no window of our own to place; we only
  // need to keep the waveform canvas in step with the iframe's size.
  var win = embedded ? null : nw.Window.get();
  if (embedded) {
    window.addEventListener('resize', function () {
      if (waveformViewer) {
        waveformViewer.resize();
      }
    });
  } else {
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
  }

  // Check whether the editor has unsent changes (code differs from last sent)
  var _hasUnsentChanges = function () {
    if (config.projectTestbench) {
      return false; // project testbench DUT is read-only, no send-back
    }
    if (!codeEditor || _lastSentCode === null) {
      return false;
    }
    return codeEditor.getValue() !== _lastSentCode;
  };

  // Persist this block's files and optionally push the code back to the main
  // window. Shared by the popup close path and by the tree panel, which flushes
  // the iframe before pointing it at a different block.
  var _flush = function (sendToMain, done) {
    var fired = false;
    var finish = function () {
      if (!fired) {
        fired = true;
        if (done) {
          done();
        }
      }
    };

    if (codeEditor) {
      saveBlockFile('module.v', assembleVerilog());
    }
    if (testbenchEditor) {
      saveBlockFile('testbench.v', testbenchEditor.getValue());
    }
    saveWaveformState();

    if (config.projectTestbench || !sendToMain) {
      finish();
      return;
    }
    setTimeout(finish, 1000);
    findMainWindow(function (mainWin) {
      if (mainWin && codeEditor) {
        mainWin.icestudioReceiveCodeSave(blockId, codeEditor.getValue());
      }
      finish();
    });
  };

  // Perform the actual close: persist files, optionally push to main, shut down
  var _performClose = function (self, sendToMain) {
    if (win) {
      _saveGeometry(win);
    }
    _flush(sendToMain, function () {
      self.close(true);
    });
  };

  // Embedded in the tree panel there is no window close event: the panel
  // flushes us through this hook before it navigates the iframe elsewhere.
  if (embedded) {
    window.iceCodeEditorFlush = function (cb) {
      _flush(true, cb || function () {});
    };
    window.iceCodeEditorHasUnsentChanges = _hasUnsentChanges;
  } else {
    // Guard: prevent the close handler from stacking while dialog is open
    var _closeDialogOpen = false;

    // Close handler: warn if there are unsent changes
    win.on('close', function () {
      var self = this;

      if (!_hasUnsentChanges()) {
        _performClose(self, true);
        return;
      }

      if (_closeDialogOpen) {
        return; // dialog already visible, ignore repeated close events
      }
      _closeDialogOpen = true;

      var dialog = document.getElementById('unsent-dialog');
      dialog.style.display = '';

      var btnCancel = document.getElementById('unsent-cancel');
      var btnDiscard = document.getElementById('unsent-discard');
      var btnSend = document.getElementById('unsent-send');

      var cleanup = function () {
        dialog.style.display = 'none';
        _closeDialogOpen = false;
        btnCancel.onclick = null;
        btnDiscard.onclick = null;
        btnSend.onclick = null;
      };

      btnCancel.onclick = function () {
        cleanup();
        // stay in editor
      };
      btnDiscard.onclick = function () {
        cleanup();
        _performClose(self, false);
      };
      btnSend.onclick = function () {
        cleanup();
        _performClose(self, true);
      };
    });
  }

  // Close this popup when the main window closes.
  // Embedded there is no separate window to close — the iframe goes with it.
  if (!embedded) {
    findMainNWWindow(function (mainNWWin) {
      if (mainNWWin) {
        mainNWWin.on('close', function () {
          win.close(true);
        });
      }
    });
  }
};
