//---------------------------------------------------------------------------
//-- tree-panel.js: the textual projection of the design.
//--
//-- The canvas shows how blocks connect but has nowhere to put the files that
//-- belong to a module (code, testbench, formal report). A tree shows those
//-- naturally but hides connectivity. This panel is the second projection: it
//-- covers the canvas, lists the hierarchy, and states per module whether it
//-- has a testbench and a formal analysis.
//--
//-- It never adds structure. Existing code can be edited, and a missing
//-- testbench or formal report can be created — that is all.
//--
//-- Loaded as a <script> tag; exposes window.iceTreePanel.
//---------------------------------------------------------------------------
'use strict';

window.iceTreePanel = (function () {
  var fs = require('fs');
  var nodePath = require('path');
  var childProcess = require('child_process');

  var _open = false;
  var _tree = null;
  var _selectedPath = null;
  var _mode = 'full';
  var _analysing = false;

  var S = null; //-- window.iceTreeStatus, resolved lazily
  var M = null; //-- window.iceTreeModel, resolved lazily

  var el = function (id) {
    return document.getElementById(id);
  };

  var injector = function () {
    try {
      return angular.element(document.body).injector();
    } catch (e) {
      return null;
    }
  };

  var svc = function (name) {
    var inj = injector();
    return inj ? inj.get(name) : null;
  };

  // ── Data ──────────────────────────────────────────────────────────────────

  var buildDir = function () {
    var common = svc('common');
    return (common && common.BUILD_DIR) || '';
  };

  //-- Is the project saved to a real location? Until it is, BUILD_DIR points at
  //-- a temp dir that disappears with the session, so every artifact written
  //-- from here would be lost and every status would read grey.
  var projectIsSaved = function () {
    var project = svc('project');
    return !!(project && project.path);
  };

  var rebuild = function () {
    M = window.iceTreeModel;
    S = window.iceTreeStatus;
    var project = svc('project');
    var common = svc('common');
    if (!project || !M || !S) {
      _tree = { roots: [], all: [] };
      return;
    }
    //-- Pull the paper into the project before reading it. At the top level
    //-- update() refreshes project.design.graph; inside a submodule it leaves
    //-- the graph alone and commitSubmoduleEdits() flushes that level into
    //-- allDependencies instead. Without both, the tree shows the design as it
    //-- was at the last save rather than as it is.
    if (typeof common.commitSubmoduleEdits === 'function') {
      common.commitSubmoduleEdits();
    }
    try {
      project.update({ deps: false });
    } catch (e) {
      //-- A half-built graph must not stop the panel from opening.
    }
    _tree = M.build(project.get(), common.allDependencies || {});

    //-- Compile each distinct submodule once so its integration artifacts can
    //-- be checked against what the module actually is right now.
    var compiled = {};
    var compileFn = nw.Window.get().window.icestudioCompileSubmodule;
    if (typeof compileFn === 'function') {
      _tree.all.forEach(function (n) {
        if (n.kind !== 'submodule' || n.recursive) {
          return;
        }
        if (Object.prototype.hasOwnProperty.call(compiled, n.moduleKey)) {
          return;
        }
        try {
          compiled[n.moduleKey] = compileFn(n.moduleKey);
        } catch (e) {
          //-- A module that will not compile cannot be judged stale or fresh.
          compiled[n.moduleKey] = null;
        }
      });
    }
    S.scan(_tree, buildDir(), compiled);
  };

  // ── Rendering ─────────────────────────────────────────────────────────────

  var LIGHT_TITLE = {
    none: 'never run',
    stale: 'not current with the code',
    bad: 'problems found',
    ok: 'current and clean',
  };

  var badge = function (kind, state, title) {
    return (
      '<span class="tree-badge tree-badge--' +
      (state || 'none') +
      '" title="' +
      kind +
      ': ' +
      (title || LIGHT_TITLE[state || 'none']) +
      '">' +
      kind +
      '</span>'
    );
  };

  var escapeHtml = function (s) {
    return String(s === null || s === undefined ? '' : s).replace(
      /[&<>"]/g,
      function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      }
    );
  };

  var rowHtml = function (node) {
    var st = node.status || {};
    var twisty = node.hasChildren
      ? '<span class="tree-twisty">' + (node.expanded ? '▾' : '▸') + '</span>'
      : '<span class="tree-twisty tree-twisty--leaf"></span>';

    var icon =
      node.kind === 'code'
        ? '<i class="fas fa-file-code tree-icon tree-icon--code"></i>'
        : '<i class="fas fa-cube tree-icon tree-icon--module"></i>';

    var badges =
      badge('T', st.testbench) + badge('S', st.sim) + badge('F', st.formal);
    if (node.kind === 'submodule') {
      //-- "The assembly works", separate from "every part works".
      badges += badge(
        'I',
        st.integration,
        {
          none: 'no integration testbench',
          stale: 'integration testbench not run against the current module',
          bad: 'integration simulation failed',
          ok: 'module simulated as a whole',
        }[st.integration || 'none']
      );
    }

    var note = '';
    if (node.recursive) {
      note = '<span class="tree-note">recursive</span>';
    } else if (st.rolledUp && st.counts && st.counts.total) {
      note =
        '<span class="tree-note">' +
        st.counts.tested +
        '/' +
        st.counts.total +
        ' tested · ' +
        st.counts.proved +
        '/' +
        st.counts.total +
        ' analysed</span>';
    } else if (st.formal === 'stale' && !st.rolledUp) {
      //-- The report exists but describes different code, so whatever it found
      //-- says nothing about what is in the design now.
      note = '<span class="tree-note tree-note--warn">re-analyse</span>';
    } else if (st.issues && st.issues.CRITICAL) {
      note =
        '<span class="tree-note tree-note--bad">' +
        st.issues.CRITICAL +
        ' critical</span>';
    } else if (st.issues && st.issues.WARNING) {
      note =
        '<span class="tree-note tree-note--warn">' +
        st.issues.WARNING +
        ' warning' +
        (st.issues.WARNING > 1 ? 's' : '') +
        '</span>';
    }

    return (
      '<div class="tree-row' +
      (node.path === _selectedPath ? ' tree-row--selected' : '') +
      '" data-path="' +
      escapeHtml(node.path) +
      '" style="padding-left:' +
      (6 + node.depth * 16) +
      'px">' +
      twisty +
      icon +
      '<span class="tree-label">' +
      escapeHtml(node.label) +
      '</span>' +
      note +
      '<span class="tree-badges">' +
      badges +
      '</span>' +
      '</div>'
    );
  };

  var renderTree = function () {
    var host = el('tree-rows');
    if (!host) {
      return;
    }
    if (!_tree || !_tree.roots.length) {
      host.innerHTML =
        '<div class="tree-empty">No modules in this design yet.</div>';
      return;
    }
    host.innerHTML = M.flatten(_tree.roots).map(rowHtml).join('');
  };

  var renderBanner = function () {
    var banner = el('tree-banner');
    if (!banner) {
      return;
    }
    if (projectIsSaved()) {
      banner.style.display = 'none';
      return;
    }
    banner.style.display = '';
    banner.textContent =
      'This project has never been saved, so its build directory is temporary. ' +
      'Save the project first — otherwise testbenches and reports written here are lost on exit.';
  };

  // ── Editor pane ───────────────────────────────────────────────────────────

  var selectedNode = function () {
    return _tree && _selectedPath ? M.findByPath(_tree, _selectedPath) : null;
  };

  //-- Persist whatever the iframe is currently holding before we point it
  //-- somewhere else; navigating an iframe fires no close event.
  var flushEditor = function (done) {
    var frame = el('tree-editor-frame');
    var inner = frame && frame.contentWindow;
    if (!inner || typeof inner.iceCodeEditorFlush !== 'function') {
      done();
      return;
    }
    var fired = false;
    var once = function () {
      if (!fired) {
        fired = true;
        done();
      }
    };
    setTimeout(once, 1500); //-- never block the UI on a wedged flush
    try {
      inner.iceCodeEditorFlush(once);
    } catch (e) {
      once();
    }
  };

  var loadEditor = function () {
    var frame = el('tree-editor-frame');
    var empty = el('tree-editor-empty');
    var node = selectedNode();
    if (!frame) {
      return;
    }
    var config = null;

    if (node && node.kind === 'submodule') {
      //-- A submodule has no code of its own; what it does have is an
      //-- integration testbench over the whole compiled module.
      if (_mode !== 'testbench') {
        frame.style.display = 'none';
        frame.removeAttribute('src');
        if (empty) {
          empty.style.display = '';
          empty.textContent =
            '"' +
            node.label +
            '" is a submodule. Pick Testbench to exercise it as a whole, or ' +
            'select one of the code modules inside it.';
        }
        return;
      }
      var tbBuilder = nw.Window.get().window.icestudioSubmoduleTestbenchConfig;
      config =
        typeof tbBuilder === 'function' ? tbBuilder(node.moduleKey) : null;
      if (!config) {
        frame.style.display = 'none';
        frame.removeAttribute('src');
        if (empty) {
          empty.style.display = '';
          empty.textContent =
            'Could not compile "' + node.label + '" to Verilog.';
        }
        return;
      }
    } else if (!node) {
      frame.style.display = 'none';
      frame.removeAttribute('src');
      if (empty) {
        empty.style.display = '';
        empty.textContent = 'Select a module on the left.';
      }
      return;
    } else {
      var builder = nw.Window.get().window.icestudioCodeEditorConfig;
      if (typeof builder !== 'function') {
        frame.style.display = 'none';
        frame.removeAttribute('src');
        if (empty) {
          empty.style.display = '';
          empty.textContent =
            'The code editor bridge is not ready yet — open a design first.';
        }
        return;
      }
      config = builder(node.id, _mode, node.block.data);
    }

    config.embedded = true;
    if (empty) {
      empty.style.display = 'none';
    }
    frame.style.display = '';
    frame.src =
      'resources/viewers/code-editor/code-editor.html?config=' +
      encodeURIComponent(JSON.stringify(config));
  };

  var setMode = function (mode) {
    _mode = mode;
    Array.prototype.forEach.call(
      document.querySelectorAll('.tree-tab'),
      function (b) {
        b.classList.toggle(
          'tree-tab--active',
          b.getAttribute('data-mode') === mode
        );
      }
    );
    flushEditor(loadEditor);
  };

  var selectPath = function (path) {
    flushEditor(function () {
      _selectedPath = path;
      //-- A submodule has no code of its own, so Code and Formal have nothing
      //-- to show for it. Land on the integration testbench instead of an
      //-- explanatory dead end.
      var node = M.findByPath(_tree, path);
      if (node && node.kind === 'submodule' && _mode !== 'testbench') {
        setMode('testbench');
        renderTree();
        return;
      }
      renderTree();
      loadEditor();
    });
  };

  // ── Creating a missing testbench ──────────────────────────────────────────

  //-- The testbench header the code editor would generate for this module.
  var testbenchStub = function (node) {
    var d = node.block.data || {};
    var ports = d.ports || { in: [], out: [] };
    var name = node.moduleName;
    var lines = [];
    var decl = [];
    var conn = [];

    (ports.in || []).forEach(function (p) {
      var pname = p.name.charAt(0) === '@' ? p.name.substr(1) : p.name;
      var r = p.range && p.range !== '' ? p.range + ' ' : '';
      decl.push('reg ' + r + pname + ';');
      conn.push('  .' + pname + '(' + pname + ')');
    });
    (ports.out || []).forEach(function (p) {
      var pname = p.name.charAt(0) === '@' ? p.name.substr(1) : p.name;
      var r = p.range && p.range !== '' ? p.range + ' ' : '';
      decl.push('wire ' + r + pname + ';');
      conn.push('  .' + pname + '(' + pname + ')');
    });

    lines.push('`timescale 1ns/1ps');
    lines.push('');
    lines.push('module ' + name + '_tb;');
    lines.push('');
    decl.forEach(function (l) {
      lines.push(l);
    });
    lines.push('');
    lines.push(name + ' dut (');
    lines.push(conn.join(',\n'));
    lines.push(');');
    lines.push('');
    lines.push('initial begin');
    lines.push('  $dumpfile("sim.vcd");');
    lines.push('  $dumpvars(0, ' + name + '_tb);');
    lines.push('end');
    lines.push('');
    lines.push(S.AUTO_MARKER);
    lines.push('');
    lines.push('initial begin');
    lines.push('  // Drive the inputs and check the outputs here.');
    lines.push('  #100 $finish;');
    lines.push('end');
    lines.push('');
    lines.push('endmodule');
    return lines.join('\n');
  };

  var addTestbench = function (node) {
    var dir = S.blockDirFor(buildDir(), node.id);
    try {
      fs.mkdirSync(dir, { recursive: true });
      var target = nodePath.join(dir, 'testbench.v');
      if (fs.existsSync(target)) {
        alertify.warning('This module already has a testbench.');
      } else {
        fs.writeFileSync(target, testbenchStub(node), 'utf8');
        fs.writeFileSync(
          nodePath.join(dir, 'module.v'),
          M.assembleVerilog(node.block),
          'utf8'
        );
        alertify.success('Testbench created for ' + node.moduleName);
      }
    } catch (e) {
      alertify.error('Could not create testbench: ' + e.message);
      return;
    }
    refresh();
    selectPath(node.path);
    setMode('testbench');
  };

  // ── Formal analysis over every code module ────────────────────────────────

  //-- formal_verify.py is a static analyser, not a prover: it reports registers,
  //-- dataflow, path coverage and an issue list. Running it across the whole
  //-- design is what turns the tree into a coverage map.
  var analyseAll = function () {
    if (_analysing) {
      return;
    }
    var codeNodes = (_tree ? _tree.all : []).filter(function (n) {
      return n.kind === 'code';
    });
    if (!codeNodes.length) {
      alertify.warning('No code modules in this design.');
      return;
    }
    var builder = nw.Window.get().window.icestudioCodeEditorConfig;
    if (typeof builder !== 'function') {
      return;
    }
    var sample = builder(codeNodes[0].id, 'formal', codeNodes[0].block.data);
    if (!sample.formalVerifyPyPath) {
      alertify.error('formal_verify.py path is not configured.');
      return;
    }

    _analysing = true;
    var progress = el('tree-progress');
    var done = 0;
    var failed = 0;

    var report = function () {
      if (progress) {
        progress.textContent =
          'Analysing ' + done + '/' + codeNodes.length + '…';
      }
    };
    report();

    var next = function (i) {
      if (i >= codeNodes.length) {
        _analysing = false;
        if (progress) {
          progress.textContent =
            'Analysed ' +
            (codeNodes.length - failed) +
            '/' +
            codeNodes.length +
            (failed ? ' (' + failed + ' failed)' : '');
        }
        refresh();
        return;
      }
      var node = codeNodes[i];
      var dir = S.blockDirFor(buildDir(), node.id);
      var step = function () {
        done++;
        report();
        next(i + 1);
      };
      try {
        fs.mkdirSync(dir, { recursive: true });
        var moduleV = M.assembleVerilog(node.block);
        fs.writeFileSync(nodePath.join(dir, 'module.v'), moduleV, 'utf8');
        var tmpV = nodePath.join(dir, 'ce_verify_temp.v');
        fs.writeFileSync(tmpV, moduleV, 'utf8');

        var proc = childProcess.spawn(sample.pythonCmd, [
          sample.formalVerifyPyPath,
          tmpV,
        ]);
        proc.on('error', function () {
          failed++;
          step();
        });
        proc.on('close', function () {
          var mdSrc = tmpV.replace(/\.v$/, '.formal.md');
          try {
            if (fs.existsSync(mdSrc)) {
              fs.writeFileSync(
                nodePath.join(dir, 'formal.md'),
                fs.readFileSync(mdSrc, 'utf8'),
                'utf8'
              );
            } else {
              failed++;
            }
            fs.unlinkSync(tmpV);
          } catch (e) {
            /* leave the temp file; not worth failing the run over */
          }
          step();
        });
      } catch (e) {
        failed++;
        step();
      }
    };
    next(0);
  };

  // ── Panel plumbing ────────────────────────────────────────────────────────

  var refresh = function () {
    if (!_open) {
      return;
    }
    rebuild();
    renderBanner();
    renderTree();
  };

  //-- Pin the panel between the menu bar and the footer. Both are laid out by
  //-- Angular/bootstrap and their heights vary with theme and zoom, so they are
  //-- measured rather than hard-coded.
  var positionPanel = function (panel) {
    var nav = document.querySelector('.navbar');
    var footer = document.querySelector('.footer');
    if (nav) {
      panel.style.top = Math.round(nav.getBoundingClientRect().bottom) + 'px';
    }
    if (footer) {
      panel.style.bottom =
        Math.round(footer.getBoundingClientRect().height) + 'px';
    }
  };

  window.addEventListener('resize', function () {
    var panel = el('tree-panel');
    if (_open && panel) {
      positionPanel(panel);
    }
  });

  var toggle = function () {
    _open = !_open;
    var panel = el('tree-panel');
    if (!panel) {
      return;
    }
    panel.classList.toggle('tree-open', _open);
    if (_open) {
      positionPanel(panel);
      refresh();
      loadEditor();
    } else {
      flushEditor(function () {
        var frame = el('tree-editor-frame');
        if (frame) {
          frame.removeAttribute('src');
        }
      });
    }
  };

  var isOpen = function () {
    return _open;
  };

  // ── Events ────────────────────────────────────────────────────────────────
  //
  //-- The panel's markup arrives with design.html through ng-include, which
  //-- resolves long after this script runs, so nothing here may bind to those
  //-- elements directly. Everything is delegated from document instead.

  var onDocumentClick = function (event) {
    var target = event.target;
    if (!target || !target.closest) {
      return;
    }
    if (!target.closest('#tree-panel')) {
      return;
    }

    var btn = target.closest('.tree-action, .tree-tab');
    if (btn) {
      if (btn.id === 'tree-btn-close') {
        toggle();
      } else if (btn.id === 'tree-btn-refresh') {
        refresh();
      } else if (btn.id === 'tree-btn-analyse') {
        analyseAll();
      } else if (btn.id === 'tree-btn-add-tb') {
        onAddTestbench();
      } else if (btn.classList.contains('tree-tab')) {
        setMode(btn.getAttribute('data-mode'));
      }
      return;
    }

    var row = target.closest('.tree-row');
    if (!row || !_tree) {
      return;
    }
    var node = M.findByPath(_tree, row.getAttribute('data-path'));
    if (!node) {
      return;
    }
    if (target.classList.contains('tree-twisty') && node.hasChildren) {
      node.expanded = !node.expanded;
      renderTree();
      return;
    }
    selectPath(node.path);
  };

  var onDocumentDblClick = function (event) {
    var target = event.target;
    if (!target || !target.closest || !target.closest('#tree-panel')) {
      return;
    }
    var row = target.closest('.tree-row');
    if (!row || !_tree) {
      return;
    }
    var node = M.findByPath(_tree, row.getAttribute('data-path'));
    if (node && node.hasChildren) {
      node.expanded = !node.expanded;
      renderTree();
    }
  };

  var onAddTestbench = function () {
    var node = selectedNode();
    if (!node) {
      alertify.warning('Select a module first.');
      return;
    }
    if (node.kind === 'submodule') {
      //-- The compiler generates the integration testbench header on the fly;
      //-- opening the tab is all it takes to start one.
      setMode('testbench');
      return;
    }
    addTestbench(node);
  };

  //-- Horizontal splitter between the tree and the editor.
  var _dragging = false;

  var onDocumentMouseDown = function (event) {
    if (event.target && event.target.id === 'tree-split') {
      _dragging = true;
      event.preventDefault();
    }
  };

  var onDocumentMouseMove = function (event) {
    if (!_dragging) {
      return;
    }
    var body = el('tree-panel-body');
    var pane = el('tree-pane');
    if (!body || !pane) {
      return;
    }
    var rect = body.getBoundingClientRect();
    var w = Math.min(
      Math.max(event.clientX - rect.left, 200),
      rect.width - 320
    );
    pane.style.width = w + 'px';
  };

  var onDocumentMouseUp = function () {
    _dragging = false;
  };

  document.addEventListener('click', onDocumentClick);
  document.addEventListener('dblclick', onDocumentDblClick);
  document.addEventListener('mousedown', onDocumentMouseDown);
  document.addEventListener('mousemove', onDocumentMouseMove);
  document.addEventListener('mouseup', onDocumentMouseUp);

  return {
    toggle: toggle,
    refresh: refresh,
    isOpen: isOpen,
    analyseAll: analyseAll,
  };
})();
