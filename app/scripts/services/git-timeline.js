'use strict';

/* global prompt, confirm, alert */

window.iceTimeline = (function () {
  var _open = false;
  var _commits = []; // oldest first
  var _head = '';
  var _selected = null;
  var _initialized = false;
  var _hideAutoSave = true;
  var _showHidden = false;
  var _hiddenBranches = [];
  var _panelH = 152; // current panel height — updated by resize drag

  // ── Layout constants ──────────────────────────────────────────────────────
  var COL_W = 82; // px per commit column
  var LANE_H = 58; // px per branch lane
  var DOT_Y = 24; // y of dot centre within a lane (from lane top)
  var PAD = 20; // left/right padding inside the track

  var LANE_COLORS = [
    '#3a82c4', // blue  – main / lane 0
    '#e67e22', // orange
    '#27ae60', // green
    '#8e44ad', // purple
    '#c0392b', // red
    '#16a085', // teal
  ];

  // ── Public: toggle panel ──────────────────────────────────────────────────
  function toggle() {
    _open = !_open;
    var panel = document.getElementById('tl-panel');
    if (!panel) {
      return;
    }
    if (_open) {
      panel.style.height = _panelH + 'px';
      panel.classList.add('tl-open');
      if (!_initialized) {
        init();
      }
      refresh();
    } else {
      panel.style.height = '0';
      panel.classList.remove('tl-open');
    }
  }

  // ── Public: refresh data and re-render ────────────────────────────────────
  function refresh() {
    if (!_open) {
      return;
    }
    var gm = window.iceGitManager;
    if (!gm || !gm.getDir()) {
      _renderEmpty('No project saved yet.');
      return;
    }
    gm.getHiddenBranches(function (err, hidden) {
      _hiddenBranches = hidden || [];
      gm.getLog(function (err2, commits) {
        _commits = (commits || []).slice().reverse(); // oldest → newest
        gm.getHead(function (headHash) {
          _head = headHash;
          _renderTrack();
          _renderBranchList();
        });
      });
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _esc(s) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(s || '')));
    return d.innerHTML;
  }

  function _fmtDate(iso) {
    if (!iso) {
      return '';
    }
    try {
      var d = new Date(iso);
      var mo = d.toLocaleString('default', { month: 'short' });
      return (
        mo +
        ' ' +
        d.getDate() +
        ' ' +
        ('0' + d.getHours()).slice(-2) +
        ':' +
        ('0' + d.getMinutes()).slice(-2)
      );
    } catch (e) {
      return '';
    }
  }

  function _parseRefs(refs) {
    var tags = [],
      heads = [],
      headBranch = '';
    if (!refs) {
      return { tags: tags, heads: heads, headBranch: headBranch };
    }
    var parts = refs.split(',');
    for (var i = 0; i < parts.length; i++) {
      var r = parts[i].trim();
      if (!r || r === 'HEAD') {
        continue;
      }
      if (r.indexOf('HEAD -> ') === 0) {
        headBranch = r.replace('HEAD -> ', '');
        heads.push(headBranch);
        continue;
      }
      if (r.indexOf('tag: ') === 0) {
        tags.push(r.replace('tag: ', ''));
        continue;
      }
      if (r.indexOf('origin/') === -1) {
        heads.push(r);
      }
    }
    return { tags: tags, heads: heads, headBranch: headBranch };
  }

  function _findCommit(hash) {
    for (var i = 0; i < _commits.length; i++) {
      if (_commits[i].hash === hash) {
        return _commits[i];
      }
    }
    return null;
  }

  // ── Render: empty state ───────────────────────────────────────────────────
  function _renderEmpty(msg) {
    var track = document.getElementById('tl-track');
    if (!track) {
      return;
    }
    track.style.height = '';
    track.style.width = '';
    track.innerHTML =
      '<span style="color:#999;font-size:11px;padding:0 16px">' +
      _esc(msg) +
      '</span>';
  }

  // ── Resolve parents through hidden commits ────────────────────────────────
  // For each parent hash: if it's in visibleSet return it; otherwise recurse
  // through allByHash until we reach a visible ancestor. This stitches the
  // graph when auto-saves (or any filtered commits) are hidden.
  function _resolveParents(parentHashes, visibleSet, allByHash) {
    var result = [];
    var queue = parentHashes.slice();
    var seen = {};
    while (queue.length > 0) {
      var ph = queue.shift();
      if (seen[ph]) {
        continue;
      }
      seen[ph] = true;
      if (visibleSet[ph]) {
        result.push(ph);
      } else {
        var p = allByHash[ph];
        if (p) {
          for (var k = 0; k < p.parents.length; k++) {
            queue.push(p.parents[k]);
          }
        }
      }
    }
    return result;
  }

  // ── Lane assignment (standard greedy algorithm) ───────────────────────────
  // Uses c._effParents (stitched parents) so filtered commits don't split lanes.
  function _assignLanes(commits) {
    // commits: oldest first, each must have ._effParents set
    var laneOf = {};
    var tips = []; // tips[i] = hash of the most recent commit on lane i, or null
    var i, c, ep, lane, l, free;

    for (i = 0; i < commits.length; i++) {
      c = commits[i];
      ep = c._effParents;
      lane = -1;

      // Find first lane whose tip is a direct (effective) parent of this commit
      for (l = 0; l < tips.length; l++) {
        if (tips[l] !== null && ep.indexOf(tips[l]) !== -1) {
          lane = l;
          break;
        }
      }

      if (lane === -1) {
        // No continuation found — open a free lane or a new one
        free = -1;
        for (l = 0; l < tips.length; l++) {
          if (tips[l] === null) {
            free = l;
            break;
          }
        }
        lane = free !== -1 ? free : tips.length;
        if (lane === tips.length) {
          tips.push(null);
        }
      }

      laneOf[c.hash] = lane;
      tips[lane] = c.hash;

      // Merge: free the lane(s) of absorbed parents
      if (ep.length > 1) {
        for (l = 0; l < tips.length; l++) {
          if (l !== lane && tips[l] !== null && ep.indexOf(tips[l]) !== -1) {
            tips[l] = null;
          }
        }
      }
    }

    var maxLane = 0;
    for (var h in laneOf) {
      if (laneOf[h] > maxLane) {
        maxLane = laneOf[h];
      }
    }
    return { laneOf: laneOf, numLanes: maxLane + 1 };
  }

  // ── Compute which commits belong exclusively to hidden branches ───────────
  // Returns a hash-keyed object of commits to hide.
  // A commit is hidden only if it is NOT reachable from HEAD or any
  // non-hidden branch tip — i.e. its only path to a ref is through hidden branches.
  function _computeHiddenCommits(commits, hiddenBranches, headHash) {
    if (!hiddenBranches || !hiddenBranches.length) {
      return {};
    }
    var i, j, h, c;
    var hiddenSet = {};
    for (i = 0; i < hiddenBranches.length; i++) {
      hiddenSet[hiddenBranches[i]] = true;
    }
    var byHash = {};
    for (i = 0; i < commits.length; i++) {
      byHash[commits[i].hash] = commits[i];
    }

    // Seed the visible queue with HEAD and all non-hidden branch tips
    var queue = [];
    if (headHash && byHash[headHash]) {
      queue.push(headHash);
    }
    for (i = 0; i < commits.length; i++) {
      c = commits[i];
      var refs = _parseRefs(c.refs);
      for (j = 0; j < refs.heads.length; j++) {
        if (!hiddenSet[refs.heads[j]]) {
          queue.push(c.hash);
          break;
        }
      }
    }

    // BFS backwards through parent links to mark all reachable commits visible
    var visible = {};
    while (queue.length) {
      h = queue.pop();
      if (visible[h]) {
        continue;
      }
      visible[h] = true;
      c = byHash[h];
      if (c) {
        for (j = 0; j < c.parents.length; j++) {
          queue.push(c.parents[j]);
        }
      }
    }

    var hidden = {};
    for (i = 0; i < commits.length; i++) {
      if (!visible[commits[i].hash]) {
        hidden[commits[i].hash] = true;
      }
    }
    return hidden;
  }

  // ── Render: git graph ─────────────────────────────────────────────────────
  function _renderTrack() {
    var wrapper = document.getElementById('tl-track-wrapper');
    var track = document.getElementById('tl-track');
    if (!track || !wrapper) {
      return;
    }

    if (_commits.length === 0) {
      _renderEmpty('No commits yet — save the project to create one.');
      return;
    }

    var hiddenCommits = _showHidden
      ? {}
      : _computeHiddenCommits(_commits, _hiddenBranches, _head);

    var visible = _commits.filter(function (c) {
      if (hiddenCommits[c.hash]) {
        return false;
      }
      if (_hideAutoSave && c.subject === 'Auto-save') {
        return false;
      }
      return true;
    });

    if (visible.length === 0) {
      _renderEmpty('All commits are auto-saves.');
      return;
    }

    var i, j, c, lane, col;

    // Build hash → commit maps and assign column indices
    var byHash = {};
    for (i = 0; i < visible.length; i++) {
      visible[i]._col = i;
      byHash[visible[i].hash] = visible[i];
    }

    // Full map (including hidden commits) for parent stitching
    var allByHash = {};
    for (i = 0; i < _commits.length; i++) {
      allByHash[_commits[i].hash] = _commits[i];
    }

    // Compute stitched parents for each visible commit
    var visibleSet = byHash; // same map, used as a set
    for (i = 0; i < visible.length; i++) {
      visible[i]._effParents = _resolveParents(
        visible[i].parents,
        visibleSet,
        allByHash
      );
    }

    var la = _assignLanes(visible);
    var laneOf = la.laneOf;
    var numLanes = la.numLanes;

    // Virtual branch nodes: branches that share the HEAD commit but have no
    // commits of their own yet. Rendered as separate dots on new lanes so the
    // user can see them diverging even before they've made any saves on them.
    var virtualNodes = [];
    for (i = 0; i < visible.length; i++) {
      c = visible[i];
      var cRefs = _parseRefs(c.refs);
      if (cRefs.headBranch && cRefs.heads.length > 1) {
        for (j = 0; j < cRefs.heads.length; j++) {
          if (cRefs.heads[j] !== cRefs.headBranch) {
            virtualNodes.push({
              col: c._col,
              hash: c.hash,
              branchName: cRefs.heads[j],
              lane: numLanes + virtualNodes.length,
            });
          }
        }
      }
    }
    var totalLanes = numLanes + virtualNodes.length;

    // Expand panel height to fit all lanes (user can shrink manually)
    var minH = totalLanes * LANE_H + 28;
    if (_panelH < minH) {
      _panelH = minH;
      var panel = document.getElementById('tl-panel');
      if (panel && _open) {
        panel.style.height = _panelH + 'px';
      }
    }

    var totalW = PAD + visible.length * COL_W + PAD;
    var totalH = totalLanes * LANE_H;

    // ── SVG connector lines ──
    var svgParts = [
      '<svg xmlns="http://www.w3.org/2000/svg"',
      ' style="position:absolute;left:0;top:0;width:',
      totalW,
      'px;height:',
      totalH,
      'px;pointer-events:none;overflow:visible">',
    ];

    for (i = 0; i < visible.length; i++) {
      c = visible[i];
      lane = laneOf[c.hash] !== undefined ? laneOf[c.hash] : 0;
      var x2 = PAD + c._col * COL_W + COL_W / 2;
      var y2 = lane * LANE_H + DOT_Y;

      for (j = 0; j < c._effParents.length; j++) {
        var par = byHash[c._effParents[j]];
        if (!par) {
          continue;
        }

        var pLane = laneOf[par.hash] !== undefined ? laneOf[par.hash] : 0;
        var x1 = PAD + par._col * COL_W + COL_W / 2;
        var y1 = pLane * LANE_H + DOT_Y;

        // Color follows the child's lane so branches have their own color
        col = LANE_COLORS[lane % LANE_COLORS.length];

        if (pLane === lane) {
          // Same lane — straight horizontal segment
          svgParts.push(
            '<line x1="',
            x1,
            '" y1="',
            y1,
            '" x2="',
            x2,
            '" y2="',
            y2,
            '" stroke="',
            col,
            '" stroke-width="2"/>'
          );
        } else {
          // Different lanes — cubic bezier elbow
          var mx = (x1 + x2) / 2;
          svgParts.push(
            '<path d="M',
            x1,
            ',',
            y1,
            ' C',
            mx,
            ',',
            y1,
            ' ',
            mx,
            ',',
            y2,
            ' ',
            x2,
            ',',
            y2,
            '" fill="none" stroke="',
            col,
            '" stroke-width="2"/>'
          );
        }
      }
    }
    // Dashed vertical lines from the HEAD dot down to each virtual branch dot
    var vn, vColor;
    for (i = 0; i < virtualNodes.length; i++) {
      vn = virtualNodes[i];
      var vBaseLane = laneOf[vn.hash] !== undefined ? laneOf[vn.hash] : 0;
      var vx = PAD + vn.col * COL_W + COL_W / 2;
      var vy1 = vBaseLane * LANE_H + DOT_Y;
      var vy2 = vn.lane * LANE_H + DOT_Y;
      vColor = LANE_COLORS[vn.lane % LANE_COLORS.length];
      svgParts.push(
        '<line x1="',
        vx,
        '" y1="',
        vy1,
        '" x2="',
        vx,
        '" y2="',
        vy2,
        '" stroke="',
        vColor,
        '" stroke-width="2" stroke-dasharray="4,3"/>'
      );
    }
    svgParts.push('</svg>');

    // ── Commit elements ──
    var dotParts = [];
    for (i = 0; i < visible.length; i++) {
      c = visible[i];
      lane = laneOf[c.hash] !== undefined ? laneOf[c.hash] : 0;
      var left = PAD + c._col * COL_W;
      var top = lane * LANE_H;
      col = LANE_COLORS[lane % LANE_COLORS.length];
      var refs = _parseRefs(c.refs);
      var isHead = c.hash === _head;
      var isSel = c.hash === _selected;

      var dotColor = isHead ? '#3a82c4' : col;
      var cls =
        'tl-commit' +
        (isHead ? ' tl-head' : '') +
        (isSel ? ' tl-selected' : '');

      dotParts.push(
        '<div class="',
        cls,
        '" data-hash="',
        _esc(c.hash),
        '" title="',
        _esc(c.subject),
        ' (',
        _esc(c.shortHash),
        ')"',
        ' style="left:',
        left,
        'px;top:',
        top,
        'px;width:',
        COL_W,
        'px;height:',
        LANE_H,
        'px">',

        // Subject label — above the dot
        '<div class="tl-label">',
        _esc(c.subject),
        '</div>',

        // The dot
        '<div class="tl-dot" style="background:',
        dotColor,
        ';box-shadow:0 0 0 2px ',
        dotColor,
        '"></div>',

        // Branch / tag refs — below the dot.
        // When this is the HEAD commit with floating branches, those branches
        // get their own virtual dots below, so only show the HEAD branch here.
        refs.tags.length
          ? '<div class="tl-tag">' + _esc(refs.tags[0]) + '</div>'
          : '',
        refs.headBranch && refs.heads.length > 1
          ? '<div class="tl-ref">' + _esc(refs.headBranch) + '</div>'
          : refs.heads
              .map(function (h) {
                return '<div class="tl-ref">' + _esc(h) + '</div>';
              })
              .join(''),
        // Date
        '<div class="tl-date">',
        _esc(_fmtDate(c.date)),
        '</div>',

        '</div>'
      );
    }

    // Virtual branch dots (one per floating branch, below the HEAD dot)
    for (i = 0; i < virtualNodes.length; i++) {
      vn = virtualNodes[i];
      var vleft = PAD + vn.col * COL_W;
      var vtop = vn.lane * LANE_H;
      vColor = LANE_COLORS[vn.lane % LANE_COLORS.length];
      var visSel = vn.hash === _selected;
      dotParts.push(
        '<div class="tl-commit tl-virtual',
        visSel ? ' tl-selected' : '',
        '" data-hash="',
        _esc(vn.hash),
        '" title="',
        _esc(vn.branchName),
        ' (no commits yet)"',
        ' style="left:',
        vleft,
        'px;top:',
        vtop,
        'px;width:',
        COL_W,
        'px;height:',
        LANE_H,
        'px">',
        '<div class="tl-dot" style="background:',
        vColor,
        ';box-shadow:0 0 0 2px ',
        vColor,
        ';opacity:0.55"></div>',
        '<div class="tl-ref">',
        _esc(vn.branchName),
        '</div>',
        '</div>'
      );
    }

    // Assemble and inject
    track.style.position = 'relative';
    track.style.width = totalW + 'px';
    track.style.height = totalH + 'px';
    track.style.minWidth = '0';
    track.innerHTML = svgParts.join('') + dotParts.join('');

    // Scroll selected commit into view, falling back to HEAD
    var scrollTarget = _selected
      ? track.querySelector('[data-hash="' + _selected + '"]')
      : track.querySelector('.tl-head');
    if (!scrollTarget) {
      scrollTarget = track.querySelector('.tl-head');
    }
    if (scrollTarget) {
      scrollTarget.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }

    // Click / double-click events
    var dots = track.querySelectorAll('.tl-commit');
    for (j = 0; j < dots.length; j++) {
      (function (el) {
        el.addEventListener('click', function () {
          _selected = el.getAttribute('data-hash');
          for (var k = 0; k < dots.length; k++) {
            dots[k].classList.remove('tl-selected');
          }
          el.classList.add('tl-selected');
          _renderActions();
        });
        el.addEventListener('dblclick', function () {
          _goHere(el.getAttribute('data-hash'));
        });
      })(dots[j]);
    }

    _renderActions();
  }

  // ── Render: action bar state ──────────────────────────────────────────────
  function _renderActions() {
    var actionsDiv = document.getElementById('tl-actions');
    var statusEl = document.getElementById('tl-status');
    if (!actionsDiv) {
      return;
    }

    if (!_selected) {
      actionsDiv.style.display = 'none';
      if (statusEl) {
        statusEl.textContent = '';
      }
      return;
    }
    actionsDiv.style.display = 'flex';
    var c = _findCommit(_selected);
    if (statusEl && c) {
      statusEl.textContent = c.shortHash + '  ' + c.subject;
    }
  }

  // ── Render: branch dropdown ───────────────────────────────────────────────
  function _renderBranchList() {
    var sel = document.getElementById('tl-branch-select');
    if (!sel) {
      return;
    }
    var gm = window.iceGitManager;
    if (!gm) {
      return;
    }
    gm.listBranches(function (err, branches) {
      var currentBranch = '';
      var hc = _findCommit(_head);
      if (hc) {
        var refs = _parseRefs(hc.refs);
        if (refs.heads.length > 0) {
          currentBranch = refs.heads[0];
        }
      }
      sel.innerHTML = branches
        .map(function (b) {
          var isH = _hiddenBranches.indexOf(b) !== -1;
          var label = isH ? '(hidden) ' + b : b;
          return (
            '<option value="' +
            _esc(b) +
            '"' +
            (b === currentBranch ? ' selected' : '') +
            '>' +
            _esc(label) +
            '</option>'
          );
        })
        .join('');
      _updateHideButton();
    });
  }

  function _updateHideButton() {
    var btn = document.getElementById('tl-btn-hide-branch');
    var sel = document.getElementById('tl-branch-select');
    if (!btn || !sel) {
      return;
    }
    var name = sel.value;
    btn.textContent =
      name && _hiddenBranches.indexOf(name) !== -1 ? 'Show' : 'Hide';
  }

  // ── Loading overlay (reuses the same spinner as project open) ────────────
  function _beginTask() {
    var spinner = document.getElementById('spin-blocking-task');
    if (spinner) {
      spinner.classList.add('waiting');
    }
    var menu = document.getElementById('menu');
    if (menu) {
      menu.classList.add('is-disabled');
    }
  }

  function _endTask() {
    var spinner = document.getElementById('spin-blocking-task');
    if (spinner) {
      spinner.classList.remove('waiting');
    }
    var menu = document.getElementById('menu');
    if (menu) {
      menu.classList.remove('is-disabled');
    }
  }

  // ── Action: go to commit (time travel) ────────────────────────────────────
  function _goHere(hash) {
    if (!hash) {
      return;
    }
    var gm = window.iceGitManager;
    if (!gm) {
      return;
    }
    _beginTask();
    gm.checkout(hash, function (err) {
      if (!err && window.icestudioTimeTravel) {
        window.icestudioTimeTravel();
      } else {
        _endTask();
      }
    });
  }

  // ── Resize: drag top border to change panel height ────────────────────────
  function _initResize() {
    var handle = document.getElementById('tl-resize-handle');
    var panel = document.getElementById('tl-panel');
    if (!handle || !panel) {
      return;
    }

    handle.addEventListener('mousedown', function (e) {
      var startY = e.clientY;
      var startH = panel.offsetHeight;
      e.preventDefault();

      var onMove = function (e) {
        var delta = startY - e.clientY; // drag up = more height
        _panelH = Math.max(80, Math.min(600, startH + delta));
        panel.style.height = _panelH + 'px';
      };
      var onUp = function () {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ── Init: wire up sidebar button events ──────────────────────────────────
  function init() {
    if (_initialized) {
      return;
    }
    _initialized = true;

    var btnGoHere = document.getElementById('tl-btn-goto');
    var btnBranch = document.getElementById('tl-btn-branch');
    var btnRename = document.getElementById('tl-btn-rename');
    var btnTag = document.getElementById('tl-btn-tag');
    var btnRetire = document.getElementById('tl-btn-retire');
    var branchSel = document.getElementById('tl-branch-select');
    var btnHideBranch = document.getElementById('tl-btn-hide-branch');
    var btnDelBranch = document.getElementById('tl-btn-del-branch');
    var btnExport = document.getElementById('tl-btn-export');
    var chkHide = document.getElementById('tl-chk-hide-autosave');
    var chkShowHidden = document.getElementById('tl-chk-show-hidden');

    if (chkHide) {
      chkHide.addEventListener('change', function () {
        _hideAutoSave = this.checked;
        _renderTrack();
      });
    }

    if (chkShowHidden) {
      chkShowHidden.addEventListener('change', function () {
        _showHidden = this.checked;
        _renderTrack();
      });
    }

    if (btnHideBranch) {
      btnHideBranch.addEventListener('click', function () {
        var name = branchSel ? branchSel.value : '';
        if (!name) {
          return;
        }
        var gm = window.iceGitManager;
        if (!gm) {
          return;
        }
        var isHidden = _hiddenBranches.indexOf(name) !== -1;
        if (isHidden) {
          gm.unhideBranch(name, function () {
            refresh();
          });
        } else {
          gm.hideBranch(name, function () {
            refresh();
          });
        }
      });
    }

    if (branchSel) {
      branchSel.addEventListener('change', function () {
        _updateHideButton();
      });
    }

    if (btnGoHere) {
      btnGoHere.addEventListener('click', function () {
        if (_selected) {
          _goHere(_selected);
        }
      });
    }

    if (btnBranch) {
      btnBranch.addEventListener('click', function () {
        if (!_selected) {
          return;
        }
        var name = prompt('New branch name:');
        if (name && name.trim()) {
          window.iceGitManager.createBranch(
            _selected,
            name.trim(),
            function (err) {
              if (err) {
                alert('Branch creation failed:\n' + err);
              } else {
                refresh();
              }
            }
          );
        }
      });
    }

    if (btnRename) {
      btnRename.addEventListener('click', function () {
        if (!_selected) {
          return;
        }
        var c = _findCommit(_selected);
        var newName = prompt('Rename commit:', c ? c.subject : '');
        if (newName !== null && newName.trim()) {
          window.iceGitManager.renameCommit(
            _selected,
            newName.trim(),
            function (err) {
              if (!err) {
                _selected = null;
                refresh();
              }
            }
          );
        }
      });
    }

    if (btnTag) {
      btnTag.addEventListener('click', function () {
        if (!_selected) {
          return;
        }
        var version = prompt('Version tag (e.g. v1.0.0):');
        if (version && version.trim()) {
          window.iceGitManager.createTag(
            _selected,
            version.trim(),
            function (err) {
              if (!err) {
                refresh();
              }
            }
          );
        }
      });
    }

    if (btnRetire) {
      btnRetire.addEventListener('click', function () {
        if (!_selected) {
          return;
        }
        if (
          confirm('Squash this commit into its parent? This rewrites history.')
        ) {
          window.iceGitManager.squashIntoParent(_selected, function (err) {
            if (!err) {
              _selected = null;
              refresh();
            }
          });
        }
      });
    }

    if (branchSel) {
      branchSel.addEventListener('change', function () {
        var name = branchSel.value;
        if (name) {
          _beginTask();
          window.iceGitManager.switchBranch(name, function (err) {
            if (!err && window.icestudioTimeTravel) {
              window.icestudioTimeTravel();
            } else {
              _endTask();
            }
          });
        }
      });
    }

    if (btnDelBranch) {
      btnDelBranch.addEventListener('click', function () {
        var name = branchSel ? branchSel.value : '';
        if (!name) {
          return;
        }
        if (confirm('Delete branch "' + name + '"?')) {
          window.iceGitManager.deleteBranch(name, function (err) {
            if (!err) {
              refresh();
            }
          });
        }
      });
    }

    if (btnExport) {
      btnExport.addEventListener('click', function () {
        var name = branchSel ? branchSel.value : '';
        if (!name) {
          alert('Select a branch to export.');
          return;
        }
        var input = document.createElement('input');
        input.type = 'file';
        input.setAttribute('nwdirectory', '');
        input.addEventListener('change', function () {
          if (input.files && input.files.length > 0) {
            var destDir = input.files[0].path;
            window.iceGitManager.exportAsNewProject(
              name,
              destDir,
              function (err, out) {
                if (err) {
                  alert('Export failed:\n' + err);
                } else {
                  alert('Exported to:\n' + out);
                }
              }
            );
          }
        });
        input.click();
      });
    }

    _initResize();
  }

  return { toggle: toggle, refresh: refresh, init: init };
})();
