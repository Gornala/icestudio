'use strict';

(function () {
  var nodePath = require('path');
  var nodeFs = require('fs');
  var childProcess = require('child_process');

  // ── Parse config from URL ──────────────────────────────────────────────
  var urlParams = new URLSearchParams(window.location.search);
  var config = {};
  try {
    config = JSON.parse(decodeURIComponent(urlParams.get('config')));
  } catch (e) {
    console.error('Failed to parse config:', e);
  }

  var projectDir = config.projectDir || '';
  var datasheetFile = projectDir
    ? nodePath.join(projectDir, '.icestudio_datasheets.json')
    : '';

  // Current thumbnail image (URI-encoded SVG string)
  // Image is passed via main window global (too large for URL params)
  var currentImage = '';

  // ── Window geometry persistence ────────────────────────────────────────
  var geoFile = nodePath.join(nw.App.dataPath, 'pi_window_geometry.json');

  function saveGeo() {
    var win = nw.Window.get();
    var geo = { x: win.x, y: win.y, width: win.width, height: win.height };
    try {
      nodeFs.writeFileSync(geoFile, JSON.stringify(geo));
    } catch (e) {}
  }

  function restoreGeo() {
    try {
      var geo = JSON.parse(nodeFs.readFileSync(geoFile, 'utf8'));
      var win = nw.Window.get();
      win.moveTo(geo.x, geo.y);
      win.resizeTo(geo.width, geo.height);
    } catch (e) {}
  }

  // ── Resize handle ──────────────────────────────────────────────────────
  function setupResize() {
    var handle = document.getElementById('resize-handle');
    var left = document.getElementById('panel-left');
    var dragging = false;

    handle.addEventListener('mousedown', function (e) {
      dragging = true;
      e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
      if (!dragging) {
        return;
      }
      var appRect = document.getElementById('app').getBoundingClientRect();
      var newWidth = e.clientX - appRect.left;
      if (newWidth >= 200 && newWidth <= appRect.width - 200) {
        left.style.flex = 'none';
        left.style.width = newWidth + 'px';
      }
    });

    document.addEventListener('mouseup', function () {
      dragging = false;
    });
  }

  // ── Build Statistics ───────────────────────────────────────────────────
  function renderBuildStats() {
    var container = document.getElementById('build-stats');
    var res = config.fpgaResources || {};
    var npnr = res.nextpnr;

    if (!npnr) {
      container.innerHTML =
        '<div class="stat-empty">No build data — run Build first.</div>';
      return;
    }

    var fields = [
      npnr.Field0,
      npnr.Field1,
      npnr.Field2,
      npnr.Field3,
      npnr.Field10,
      npnr.Field11,
      npnr.Field12,
      npnr.Field13,
    ];

    var html = '<table class="stat-table">';

    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (!f || f.name === '-') {
        continue;
      }
      var used = parseInt(f.used, 10);
      var total = parseInt(f.total, 10);
      var pct =
        f.percentage && f.percentage !== '-'
          ? parseFloat(f.percentage)
          : total > 0
            ? ((used / total) * 100).toFixed(1)
            : 0;
      var barClass =
        pct < 50 ? 'usage-low' : pct < 80 ? 'usage-mid' : 'usage-high';

      html +=
        '<tr>' +
        '<td>' +
        escHtml(f.name) +
        '</td>' +
        '<td>' +
        escHtml(f.used) +
        ' / ' +
        escHtml(f.total) +
        '<div class="usage-bar"><div class="usage-bar-fill ' +
        barClass +
        '" style="width:' +
        pct +
        '%"></div></div>' +
        '</td>' +
        '<td>' +
        pct +
        '%</td>' +
        '</tr>';
    }

    // MaxFreq
    if (npnr.MF && npnr.MF.value && npnr.MF.value !== 0) {
      html +=
        '<tr><td>Max Frequency</td><td>' +
        escHtml(String(npnr.MF.value)) +
        ' MHz</td><td></td></tr>';
    }

    // Build time
    if (npnr.BUILDT && npnr.BUILDT.value && npnr.BUILDT.value !== '-') {
      html +=
        '<tr><td>Build Time</td><td>' +
        escHtml(npnr.BUILDT.value) +
        ' ' +
        escHtml(npnr.BUILDT.unit || '') +
        '</td><td></td></tr>';
    }

    html += '</table>';
    container.innerHTML = html;
  }

  // ── Design Statistics ──────────────────────────────────────────────────
  function renderDesignStats() {
    var container = document.getElementById('design-stats');
    var counts = config.designCounts || {};

    var rows = [
      ['Modules (Generic)', counts.generic || 0],
      ['Code blocks', counts.code || 0],
      ['Input ports', counts.inputs || 0],
      ['Output ports', counts.outputs || 0],
      ['Labels', counts.labels || 0],
      ['Constants', counts.constants || 0],
      ['Memory blocks', counts.memory || 0],
      ['Info blocks', counts.info || 0],
      ['JSON blocks', counts.json || 0],
      ['Wires', counts.wires || 0],
    ];

    var html = '<table class="stat-table">';
    for (var i = 0; i < rows.length; i++) {
      html +=
        '<tr><td>' +
        rows[i][0] +
        '</td><td>' +
        rows[i][1] +
        '</td><td></td></tr>';
    }
    html += '</table>';
    container.innerHTML = html;
  }

  // ── Project Settings (editable) ────────────────────────────────────────
  function populateSettings() {
    var pkg = config.packageInfo || {};
    document.getElementById('proj-name').value = pkg.name || '';
    document.getElementById('proj-version').value = pkg.version || '';
    document.getElementById('proj-description').value = pkg.description || '';
    document.getElementById('proj-author').value = pkg.author || '';
    document.getElementById('proj-board').textContent = config.boardName || '—';

    renderThumbnail();
  }

  function decodeSvgImage(img) {
    if (!img) {
      return '';
    }
    // Try URI-decoding first
    var decoded = img;
    try {
      decoded = decodeURI(img);
    } catch (e) {
      decoded = img;
    }
    // Strip XML declaration / whitespace before <svg
    var idx = decoded.indexOf('<svg');
    if (idx >= 0) {
      return decoded.substring(idx);
    }
    return '';
  }

  function renderThumbnail() {
    var preview = document.getElementById('thumb-preview');
    var svg = decodeSvgImage(currentImage);
    if (svg) {
      preview.innerHTML = svg;
    } else {
      preview.innerHTML =
        '<span style="color:var(--app-muted);font-size:11px">No image</span>';
    }
  }

  function setupThumbnailActions() {
    // Open SVG file
    var fileInput = document.getElementById('input-open-svg');
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files.length > 0) {
        var filepath = fileInput.files[0].path;
        nodeFs.readFile(filepath, 'utf8', function (err, data) {
          if (!err && data) {
            currentImage = encodeURI(data);
            renderThumbnail();
          }
        });
        fileInput.value = '';
      }
    });

    // Reset
    document
      .getElementById('btn-thumb-reset')
      .addEventListener('click', function () {
        currentImage = '';
        renderThumbnail();
      });

    // Thumbnail Editor toggle
    var thumbMaker = null;
    var editorPanel = document.getElementById('thumb-editor-panel');

    document
      .getElementById('btn-thumb-editor')
      .addEventListener('click', function () {
        if (editorPanel.classList.contains('thumb-editor-hidden')) {
          editorPanel.classList.remove('thumb-editor-hidden');
          if (!thumbMaker && window.ThumbnailMaker) {
            thumbMaker = new window.ThumbnailMaker(editorPanel);
            thumbMaker.init();
            // Only load image if it's a small ThumbnailMaker SVG (< 10 KB).
            // Complex external SVGs freeze the 64x64 pixel editor.
            var svgForEditor = decodeSvgImage(currentImage);
            if (svgForEditor && svgForEditor.length < 10000) {
              thumbMaker.loadSVG(svgForEditor);
            }
          }
        } else {
          editorPanel.classList.add('thumb-editor-hidden');
        }
      });

    // Listen for thumbnail editor Apply button
    document.addEventListener('click', function (e) {
      if (e.target && e.target.id === 'tm-apply') {
        if (thumbMaker) {
          var svgString = thumbMaker.exportSVG();
          currentImage = encodeURI(svgString);
          renderThumbnail();
        }
      }
    });
  }

  // ── Find main Icestudio window ──────────────────────────────────────────
  function findMainWindow(cb) {
    nw.Window.getAll(function (wins) {
      for (var i = 0; i < wins.length; i++) {
        if (
          wins[i].window &&
          typeof wins[i].window.icestudioSaveProjectInfo === 'function'
        ) {
          cb(wins[i].window);
          return;
        }
      }
      cb(null);
    });
  }

  // ── Save settings back to main window (called on close) ─────────────────
  function saveSettings() {
    var newValues = [
      document.getElementById('proj-name').value,
      document.getElementById('proj-version').value,
      document.getElementById('proj-description').value,
      document.getElementById('proj-author').value,
      currentImage,
    ];

    // Synchronous search — getAll is async but close happens fast,
    // so we cache the main window ref at init time.
    if (cachedMainWin) {
      cachedMainWin.icestudioSaveProjectInfo(newValues);
    }
  }

  var cachedMainWin = null;

  function cacheMainWindow() {
    findMainWindow(function (win) {
      cachedMainWin = win;
    });
  }

  // ── Git Section ────────────────────────────────────────────────────────
  function git(args, cb) {
    if (!projectDir) {
      return cb('No project directory');
    }
    childProcess.exec(
      'git ' + args,
      { cwd: projectDir, timeout: 10000 },
      function (err, stdout, stderr) {
        cb(err ? stderr || err.message : null, stdout ? stdout.trim() : '');
      }
    );
  }

  function refreshGit() {
    var branchEl = document.getElementById('git-branch');
    var statusEl = document.getElementById('git-status');
    var logEl = document.getElementById('git-log');
    var remoteInput = document.getElementById('git-remote-url');

    git('rev-parse --is-inside-work-tree', function (err) {
      if (err) {
        branchEl.textContent = 'Not a git repo';
        statusEl.textContent = '—';
        logEl.textContent = '';
        return;
      }

      git('branch --show-current', function (err2, branch) {
        branchEl.textContent = err2 ? '?' : branch || '(detached)';
      });

      git('status --short', function (err2, out) {
        if (err2) {
          statusEl.textContent = '?';
        } else if (!out) {
          statusEl.textContent = 'Clean';
          statusEl.style.color = 'var(--app-success)';
        } else {
          var lines = out.split('\n').length;
          statusEl.textContent =
            lines + ' changed file' + (lines > 1 ? 's' : '');
          statusEl.style.color = 'var(--app-warning)';
        }
      });

      git('remote get-url origin', function (err2, url) {
        if (!err2 && url) {
          remoteInput.value = url;
        }
      });

      git('log --oneline -10', function (err2, out) {
        logEl.textContent = err2 ? 'No commits yet' : out;
      });
    });
  }

  function setupGitActions() {
    document
      .getElementById('btn-git-open')
      .addEventListener('click', function () {
        var url = document.getElementById('git-remote-url').value.trim();
        if (url) {
          var webUrl = url
            .replace(/\.git$/, '')
            .replace(/^git@([^:]+):/, 'https://$1/');
          nw.Shell.openExternal(webUrl);
        }
      });

    document
      .getElementById('btn-git-pull')
      .addEventListener('click', function () {
        appendGitLog('> git pull ...');
        git('pull', function (err, out) {
          appendGitLog(err || out || 'Done.');
          refreshGit();
        });
      });

    document
      .getElementById('btn-git-push')
      .addEventListener('click', function () {
        appendGitLog('> git push ...');
        git('push', function (err, out) {
          appendGitLog(err || out || 'Done.');
          refreshGit();
        });
      });

    document
      .getElementById('btn-git-branch')
      .addEventListener('click', function () {
        var name = prompt('New branch name:');
        if (name && name.trim()) {
          appendGitLog('> git checkout -b ' + name.trim() + ' ...');
          git('checkout -b ' + name.trim(), function (err, out) {
            appendGitLog(err || out || 'Done.');
            refreshGit();
          });
        }
      });
  }

  function appendGitLog(text) {
    var logEl = document.getElementById('git-log');
    logEl.textContent += '\n' + text;
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ── Datasheets ─────────────────────────────────────────────────────────
  var datasheets = [];

  function loadDatasheets() {
    if (!datasheetFile) {
      return;
    }
    try {
      datasheets = JSON.parse(nodeFs.readFileSync(datasheetFile, 'utf8'));
    } catch (e) {
      datasheets = [];
    }
  }

  function saveDatasheets() {
    if (!datasheetFile) {
      return;
    }
    try {
      nodeFs.writeFileSync(datasheetFile, JSON.stringify(datasheets, null, 2));
    } catch (e) {
      console.error('Failed to save datasheets:', e);
    }
  }

  function renderDatasheets() {
    var container = document.getElementById('datasheet-list');
    if (datasheets.length === 0) {
      container.innerHTML =
        '<div class="stat-empty">No datasheets added yet.</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < datasheets.length; i++) {
      var ds = datasheets[i];
      html +=
        '<div class="ds-item" data-index="' +
        i +
        '">' +
        '<span class="ds-item-name" data-path="' +
        escHtml(ds.path) +
        '">' +
        escHtml(ds.name) +
        '</span>' +
        '<span class="ds-item-remove" data-index="' +
        i +
        '">&times;</span>' +
        '</div>';
    }
    container.innerHTML = html;

    container.querySelectorAll('.ds-item-name').forEach(function (el) {
      el.addEventListener('click', function () {
        var p = el.getAttribute('data-path');
        if (p) {
          nw.Shell.openExternal(p);
        }
      });
    });

    container.querySelectorAll('.ds-item-remove').forEach(function (el) {
      el.addEventListener('click', function () {
        var idx = parseInt(el.getAttribute('data-index'), 10);
        datasheets.splice(idx, 1);
        saveDatasheets();
        renderDatasheets();
      });
    });
  }

  function setupDatasheetActions() {
    document
      .getElementById('btn-ds-add')
      .addEventListener('click', function () {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf,.PDF,.html,.htm,.txt,.md';
        input.addEventListener('change', function () {
          if (input.files && input.files.length > 0) {
            var file = input.files[0];
            datasheets.push({
              name: file.name,
              path: file.path,
            });
            saveDatasheets();
            renderDatasheets();
          }
        });
        input.click();
      });
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  function escHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ── Fetch image from main window ─────────────────────────────────────────
  function fetchImageFromMain() {
    nw.Window.getAll(function (wins) {
      for (var i = 0; i < wins.length; i++) {
        if (
          wins[i].window &&
          typeof wins[i].window.icestudioProjectImage === 'string'
        ) {
          currentImage = wins[i].window.icestudioProjectImage;
          renderThumbnail();
          return;
        }
      }
    });
  }

  // ── Init ───────────────────────────────────────────────────────────────
  window.onload = function () {
    restoreGeo();
    nw.Window.get().show();

    setupResize();
    renderBuildStats();
    renderDesignStats();
    populateSettings();
    fetchImageFromMain();
    setupThumbnailActions();
    cacheMainWindow();

    refreshGit();
    setupGitActions();

    loadDatasheets();
    renderDatasheets();
    setupDatasheetActions();

    nw.Window.get().on('close', function () {
      saveSettings();
      saveGeo();
      this.close(true);
    });
  };
})();
