'use strict';

var fs = require('fs');
var path = require('path');

// ============================================================
// Config from URL params
// ============================================================
var urlParams = new URLSearchParams(window.location.search);
var config = JSON.parse(decodeURIComponent(urlParams.get('config')));

var icestudioMenuJsonPath = config.icestudioMenuJson;
var icestudioBoardsDir = config.icestudioBoardsDir;
var profilePath = config.profilePath;
var ownedBoards = config.ownedBoards || []; // array of board names currently owned
// Theme is handled by shared/theme.js (loaded in board-collection.html)

// ============================================================
// Load and render board list
// ============================================================
var allBoards = []; // [{family, name, label}]

function loadBoards() {
  allBoards = [];
  try {
    var menu = JSON.parse(fs.readFileSync(icestudioMenuJsonPath, 'utf8'));
    menu.forEach(function (familyEntry) {
      familyEntry.boards.forEach(function (boardName) {
        var label = boardName;
        try {
          var info = JSON.parse(
            fs.readFileSync(
              path.join(icestudioBoardsDir, boardName, 'info.json'),
              'utf8'
            )
          );
          label = info.label || boardName;
        } catch (e) {}
        allBoards.push({
          family: familyEntry.type,
          name: boardName,
          label: label,
        });
      });
    });
  } catch (e) {
    console.error('Failed to load boards', e);
  }
}

function renderBoardList() {
  var list = document.getElementById('board-list');
  list.innerHTML = '';

  // Group by family
  var families = {};
  allBoards.forEach(function (b) {
    if (!families[b.family]) families[b.family] = [];
    families[b.family].push(b);
  });

  Object.keys(families).forEach(function (family) {
    var header = document.createElement('li');
    header.className = 'family-header';
    header.textContent = family;
    list.appendChild(header);

    families[family].forEach(function (board) {
      var li = document.createElement('li');
      li.className = 'board-row';

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = 'cb-' + board.name;
      cb.checked = ownedBoards.indexOf(board.name) !== -1;
      cb.addEventListener('change', updateCount);

      var lbl = document.createElement('label');
      lbl.htmlFor = 'cb-' + board.name;
      lbl.title = board.name;

      var nameSpan = document.createElement('span');
      nameSpan.textContent = board.label;

      var idSpan = document.createElement('span');
      idSpan.className = 'board-id';
      if (board.label !== board.name) {
        idSpan.textContent = ' (' + board.name + ')';
      }

      lbl.appendChild(nameSpan);
      lbl.appendChild(idSpan);

      li.appendChild(cb);
      li.appendChild(lbl);

      // Clicking the row also toggles the checkbox
      li.addEventListener('click', function (e) {
        if (e.target !== cb && e.target !== lbl && !lbl.contains(e.target)) {
          cb.checked = !cb.checked;
          updateCount();
        }
      });

      list.appendChild(li);
    });
  });

  updateCount();
}

function getCheckedBoards() {
  return allBoards
    .map(function (b) {
      return b.name;
    })
    .filter(function (name) {
      var cb = document.getElementById('cb-' + name);
      return cb && cb.checked;
    });
}

function updateCount() {
  var checked = getCheckedBoards();
  var countEl = document.getElementById('selection-count');
  if (checked.length === 0) {
    countEl.innerHTML = 'All boards will be shown (nothing selected).';
  } else {
    countEl.innerHTML =
      '<span class="count-badge">' +
      checked.length +
      '</span> board' +
      (checked.length === 1 ? '' : 's') +
      ' selected — only these will appear in the Select menu.';
  }
}

// ============================================================
// Save
// ============================================================
function writeIfChanged(filepath, content) {
  try {
    var existing = '';
    try {
      existing = fs.readFileSync(filepath, 'utf8');
    } catch (e) {}
    if (existing !== content) fs.writeFileSync(filepath, content);
  } catch (e) {
    console.error('writeIfChanged failed', filepath, e);
  }
}

function saveCollection() {
  var checked = getCheckedBoards();
  try {
    var profileData = {};
    try {
      profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    } catch (e) {}
    profileData.ownedBoards = checked;
    writeIfChanged(profilePath, JSON.stringify(profileData, null, 2));
    // Close the window — the parent's on('closed') handler updates common.ownedBoards
    nw.Window.get().close();
  } catch (e) {
    showStatus('Failed to save: ' + e.message, 'err');
  }
}

function clearAll() {
  allBoards.forEach(function (b) {
    var cb = document.getElementById('cb-' + b.name);
    if (cb) cb.checked = false;
  });
  updateCount();
}

// ============================================================
// Status bar
// ============================================================
function showStatus(msg, type) {
  var bar = document.getElementById('status-bar');
  bar.className = 'status-visible status-' + (type === 'err' ? 'err' : 'ok');
  bar.textContent = msg;
  if (type !== 'err') {
    setTimeout(function () {
      bar.className = '';
      bar.textContent = '';
    }, 3000);
  }
}

// ============================================================
// Init
// ============================================================
window.onload = function () {
  loadBoards();
  renderBoardList();

  document.getElementById('btn-save').addEventListener('click', saveCollection);
  document.getElementById('btn-clear').addEventListener('click', clearAll);
};
