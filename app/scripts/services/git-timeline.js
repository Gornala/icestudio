'use strict';

/* global prompt, confirm, alert */

window.iceTimeline = (function () {
  var _open = false;
  var _commits = []; // oldest first
  var _head = '';
  var _selected = null;
  var _initialized = false;

  // ── Public: toggle panel ──────────────────────────────────────────────────
  function toggle() {
    _open = !_open;
    var panel = document.getElementById('tl-panel');
    if (!panel) {
      return;
    }
    if (_open) {
      panel.classList.add('tl-open');
      if (!_initialized) {
        init();
      }
      refresh();
    } else {
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
    gm.getLog(function (err, commits) {
      _commits = (commits || []).slice().reverse(); // oldest → newest
      gm.getHead(function (headHash) {
        _head = headHash;
        _renderTrack();
        _renderBranchList();
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
      var day = d.getDate();
      var h = ('0' + d.getHours()).slice(-2);
      var m = ('0' + d.getMinutes()).slice(-2);
      return mo + ' ' + day + ' ' + h + ':' + m;
    } catch (e) {
      return '';
    }
  }

  function _parseRefs(refs) {
    var tags = [],
      heads = [];
    if (!refs) {
      return { tags: tags, heads: heads };
    }
    var parts = refs.split(',');
    for (var i = 0; i < parts.length; i++) {
      var r = parts[i].trim();
      if (!r || r === 'HEAD') {
        continue;
      }
      if (r.indexOf('HEAD -> ') === 0) {
        heads.push(r.replace('HEAD -> ', ''));
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
    return { tags: tags, heads: heads };
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
    if (track) {
      track.innerHTML =
        '<span style="color:#999;font-size:11px;padding:0 16px">' +
        _esc(msg) +
        '</span>';
    }
  }

  // ── Render: commit dots ───────────────────────────────────────────────────
  function _renderTrack() {
    var track = document.getElementById('tl-track');
    if (!track) {
      return;
    }

    if (_commits.length === 0) {
      _renderEmpty('No commits yet — save the project to create one.');
      return;
    }

    var html = '';
    for (var i = 0; i < _commits.length; i++) {
      var c = _commits[i];
      var refs = _parseRefs(c.refs);
      var isHead = c.hash === _head;
      var isSel = c.hash === _selected;

      var cls = 'tl-commit';
      if (isHead) {
        cls += ' tl-head';
      }
      if (isSel) {
        cls += ' tl-selected';
      }

      html +=
        '<div class="' +
        cls +
        '" data-hash="' +
        _esc(c.hash) +
        '" title="' +
        _esc(c.subject) +
        ' (' +
        _esc(c.shortHash) +
        ')">';

      if (refs.tags.length > 0) {
        html += '<div class="tl-tag">' + _esc(refs.tags[0]) + '</div>';
      }
      if (refs.heads.length > 0) {
        html += '<div class="tl-ref">' + _esc(refs.heads[0]) + '</div>';
      }

      html += '<div class="tl-dot"></div>';
      html += '<div class="tl-label">' + _esc(c.subject) + '</div>';
      html += '<div class="tl-date">' + _esc(_fmtDate(c.date)) + '</div>';
      html += '</div>';
    }
    track.innerHTML = html;

    var headEl = track.querySelector('.tl-head');
    if (headEl) {
      headEl.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }

    var dots = track.querySelectorAll('.tl-commit');
    for (var j = 0; j < dots.length; j++) {
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
          return (
            '<option value="' +
            _esc(b) +
            '"' +
            (b === currentBranch ? ' selected' : '') +
            '>' +
            _esc(b) +
            '</option>'
          );
        })
        .join('');
    });
  }

  // ── Action: go to commit (time travel) ───────────────────────────────────
  function _goHere(hash) {
    if (!hash) {
      return;
    }
    var gm = window.iceGitManager;
    if (!gm) {
      return;
    }
    gm.checkout(hash, function (err) {
      if (!err && window.icestudioTimeTravel) {
        window.icestudioTimeTravel();
      }
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
    var btnDelBranch = document.getElementById('tl-btn-del-branch');
    var btnExport = document.getElementById('tl-btn-export');

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
              if (!err) {
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
          window.iceGitManager.switchBranch(name, function (err) {
            if (!err && window.icestudioTimeTravel) {
              window.icestudioTimeTravel();
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
  }

  return {
    toggle: toggle,
    refresh: refresh,
    init: init,
  };
})();
