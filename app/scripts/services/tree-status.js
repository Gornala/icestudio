//---------------------------------------------------------------------------
//-- tree-status.js: derive per-module test / formal status from the artifacts
//-- the code editor leaves in BUILD_DIR/blocks/<blockId>/.
//--
//-- The point of the tree panel is to be honest about coverage, so "green"
//-- always means "this artifact describes the code that is in the design right
//-- now". Staleness is detected by rebuilding the exact module.v the editor
//-- would have written and comparing it with the one on disk.
//--
//-- Loaded as a <script> tag; exposes window.iceTreeStatus.
//---------------------------------------------------------------------------
'use strict';

window.iceTreeStatus = (function () {
  var fs = require('fs');
  var nodePath = require('path');

  //-- Light states, worst-first when rolled up.
  var NONE = 'none'; //-- grey  — never run / absent
  var STALE = 'stale'; //-- amber — exists but not for the current code
  var BAD = 'bad'; //-- red   — ran and found something wrong
  var OK = 'ok'; //-- green — current and clean

  var AUTO_MARKER = '// --- END AUTO-GENERATED --- //';

  var readText = function (p) {
    try {
      return fs.readFileSync(p, 'utf8');
    } catch (e) {
      return null;
    }
  };

  var mtime = function (p) {
    try {
      return fs.statSync(p).mtimeMs;
    } catch (e) {
      return 0;
    }
  };

  //-- Normalise line endings so a CRLF round-trip is not mistaken for an edit.
  var norm = function (s) {
    return String(s === null || s === undefined ? '' : s).replace(
      /\r\n/g,
      '\n'
    );
  };

  //-- Count severities in the "## Issues" section formal_verify.py emits, e.g.
  //--   - 🔴 **CRITICAL:** msg
  var parseFormalIssues = function (md) {
    var counts = { CRITICAL: 0, WARNING: 0, INFO: 0, OK: 0 };
    if (!md) {
      return counts;
    }
    var section = md.split(/^##\s+Issues\s*$/m)[1];
    if (!section) {
      return counts;
    }
    section = section.split(/^##\s+/m)[0];
    var re = /\*\*(CRITICAL|WARNING|INFO|OK):\*\*/g;
    var m;
    while ((m = re.exec(section)) !== null) {
      counts[m[1]]++;
    }
    return counts;
  };

  //-- A testbench counts as real only when it has content past the marker the
  //-- generator writes; a bare auto-generated header tests nothing.
  var testbenchHasBody = function (tb) {
    if (!tb) {
      return false;
    }
    var idx = tb.indexOf(AUTO_MARKER);
    var body = idx === -1 ? tb : tb.substring(idx + AUTO_MARKER.length);
    return /[^\s]/.test(body.replace(/\/\/[^\n]*/g, ''));
  };

  //-- Did the simulation log report a failure?
  var simLooksFailed = function (log) {
    if (!log) {
      return false;
    }
    return /\berror\b|\bfailed\b|\bassertion\b.*\bfail/i.test(log);
  };

  var blockDirFor = function (buildDir, blockId) {
    return nodePath.join(buildDir, 'blocks', blockId);
  };

  //-- Status for a single code block.
  var scanCodeNode = function (node, buildDir) {
    var dir = blockDirFor(buildDir, node.id);
    var status = {
      dir: dir,
      testbench: NONE,
      sim: NONE,
      formal: NONE,
      issues: { CRITICAL: 0, WARNING: 0, INFO: 0, OK: 0 },
      current: false,
      detail: '',
    };

    var onDisk = readText(nodePath.join(dir, 'module.v'));
    //-- current: the artifacts in this dir were produced from the code that is
    //-- in the design right now.
    status.current = onDisk !== null && norm(onDisk) === norm(node.verilog);

    var tb = readText(nodePath.join(dir, 'testbench.v'));
    if (tb === null) {
      status.testbench = NONE;
    } else if (!testbenchHasBody(tb)) {
      status.testbench = STALE;
      status.detail = 'testbench has no test logic yet';
    } else {
      status.testbench = OK;
    }

    var vcd = nodePath.join(dir, 'sim.vcd');
    var vcdTime = mtime(vcd);
    if (!vcdTime) {
      status.sim = NONE;
    } else if (
      !status.current ||
      vcdTime < mtime(nodePath.join(dir, 'module.v'))
    ) {
      status.sim = STALE;
    } else if (simLooksFailed(readText(nodePath.join(dir, 'sim_output.txt')))) {
      status.sim = BAD;
    } else {
      status.sim = OK;
    }

    var mdPath = nodePath.join(dir, 'formal.md');
    var md = readText(mdPath);
    if (md === null) {
      status.formal = NONE;
    } else {
      status.issues = parseFormalIssues(md);
      if (!status.current) {
        status.formal = STALE;
      } else if (status.issues.CRITICAL > 0) {
        status.formal = BAD;
      } else if (status.issues.WARNING > 0) {
        status.formal = STALE;
      } else {
        status.formal = OK;
      }
    }

    return status;
  };

  //-- Status for a submodule's own integration testbench: the whole module
  //-- compiled and exercised as one unit, as opposed to its code blocks tested
  //-- individually. Keyed by dependency type, matching where the testbench
  //-- editor writes it.
  //-- compiledVerilog is supplied by the caller (only the Angular compiler can
  //-- produce it); pass null to skip the staleness check.
  var scanIntegration = function (depType, buildDir, compiledVerilog) {
    var dir = blockDirFor(buildDir, depType);
    var out = { dir: dir, integration: NONE, current: false };

    var tb = readText(nodePath.join(dir, 'testbench.v'));
    if (tb === null || !testbenchHasBody(tb)) {
      out.integration = tb === null ? NONE : STALE;
      return out;
    }

    //-- The testbench editor persists the compiled DUT as module.v.
    var onDisk = readText(nodePath.join(dir, 'module.v'));
    out.current =
      compiledVerilog === null || compiledVerilog === undefined
        ? true
        : onDisk !== null && norm(onDisk) === norm(compiledVerilog);

    var vcdTime = mtime(nodePath.join(dir, 'sim.vcd'));
    if (!vcdTime) {
      out.integration = STALE; //-- has a testbench, never run
    } else if (!out.current) {
      out.integration = STALE;
    } else if (simLooksFailed(readText(nodePath.join(dir, 'sim_output.txt')))) {
      out.integration = BAD;
    } else {
      out.integration = OK;
    }
    return out;
  };

  //-- Roll a submodule up from its descendants: the worst light wins, and a
  //-- branch with nothing testable in it stays grey.
  //-- Increasing badness. NONE ranks worse than STALE on purpose: in a coverage
  //-- map "never tested" is a bigger hole than "tested against older code", and
  //-- one untested child must never let its parent read green.
  var ORDER = [OK, STALE, NONE, BAD];
  var worst = function (a, b) {
    return ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a;
  };

  var rollUp = function (node) {
    if (node.kind === 'code') {
      return node.status;
    }
    var agg = {
      dir: null,
      //-- Seeded with the best state so the first contributing child sets the
      //-- baseline. A submodule with nothing testable under it never gets one
      //-- and stays grey, which is different from "all its children are green".
      testbench: OK,
      sim: OK,
      formal: OK,
      issues: { CRITICAL: 0, WARNING: 0, INFO: 0, OK: 0 },
      current: true,
      rolledUp: true,
      counts: { total: 0, tested: 0, proved: 0 },
    };
    var contributed = false;
    node.children.forEach(function (child) {
      var s = rollUp(child);
      if (!s) {
        return;
      }
      //-- An empty submodule contributes nothing rather than dragging the
      //-- parent down to grey.
      if (s.rolledUp && s.counts.total === 0) {
        return;
      }
      contributed = true;
      agg.testbench = worst(agg.testbench, s.testbench);
      agg.sim = worst(agg.sim, s.sim);
      agg.formal = worst(agg.formal, s.formal);
      if (s.rolledUp) {
        agg.counts.total += s.counts.total;
        agg.counts.tested += s.counts.tested;
        agg.counts.proved += s.counts.proved;
      } else {
        agg.counts.total += 1;
        agg.counts.tested += s.sim === OK ? 1 : 0;
        agg.counts.proved += s.formal === OK ? 1 : 0;
      }
      ['CRITICAL', 'WARNING', 'INFO', 'OK'].forEach(function (k) {
        agg.issues[k] += s.issues[k] || 0;
      });
    });
    if (!contributed) {
      agg.testbench = NONE;
      agg.sim = NONE;
      agg.formal = NONE;
    }
    //-- The node's own integration result is set by scan() before roll-up and
    //-- is deliberately not folded into the children's lights: "every part
    //-- works" and "the assembly works" are different claims.
    agg.integration = (node.status && node.status.integration) || NONE;
    node.status = agg;
    return agg;
  };

  //-- Public: fill in .status on every node of a tree built by iceTreeModel.
  //-- compiledFor: optional (depType -> compiled Verilog) map, used to tell
  //-- whether a submodule's integration artifacts are current.
  var scan = function (tree, buildDir, compiledFor) {
    if (!buildDir) {
      tree.all.forEach(function (n) {
        n.status = null;
      });
      return tree;
    }
    var compiled = compiledFor || {};
    tree.all.forEach(function (n) {
      if (n.kind === 'code') {
        n.status = scanCodeNode(n, buildDir);
      } else {
        n.status = scanIntegration(
          n.moduleKey,
          buildDir,
          Object.prototype.hasOwnProperty.call(compiled, n.moduleKey)
            ? compiled[n.moduleKey]
            : null
        );
      }
    });
    tree.roots.forEach(rollUp);
    return tree;
  };

  return {
    scan: scan,
    scanCodeNode: scanCodeNode,
    scanIntegration: scanIntegration,
    blockDirFor: blockDirFor,
    parseFormalIssues: parseFormalIssues,
    testbenchHasBody: testbenchHasBody,
    AUTO_MARKER: AUTO_MARKER,
    NONE: NONE,
    STALE: STALE,
    BAD: BAD,
    OK: OK,
  };
})();
