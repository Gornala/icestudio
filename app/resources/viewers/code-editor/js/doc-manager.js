'use strict';

/* global nw */

// ============================================================
// DocManager — Reference document storage and search
//
// Stores text documents (datasheets, manuals, notes) in:
//   nw.App.dataPath/claude_docs/index.json   — index
//   nw.App.dataPath/claude_docs/<id>.txt     — content
//
// Keyword search returns relevant paragraphs for Claude context.
// ============================================================

var DocManager = (function () {
  var _docsDir = null;
  var _indexFile = null;
  var _docs = []; // [{id, name, tags, addedDate, content}]

  // DOM refs
  var _listEl = null;
  var _countBadge = null;

  // ============================================================
  // Public API
  // ============================================================

  function init() {
    var path = require('path');
    var fs = require('fs');
    _docsDir = path.join(nw.App.dataPath, 'claude_docs');
    _indexFile = path.join(_docsDir, 'index.json');
    try {
      fs.mkdirSync(_docsDir, { recursive: true });
    } catch (e) {}
    _loadDocs();
    _bindDom();
    _renderDocList();
  }

  function count() {
    return _docs.length;
  }

  function addDoc(name, content) {
    var fs = require('fs');
    var path = require('path');
    var id = 'doc_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
    var filePath = path.join(_docsDir, id + '.txt');
    try {
      fs.writeFileSync(filePath, content, 'utf8');
      _docs.push({
        id: id,
        name: name,
        tags: [],
        addedDate: new Date().toISOString(),
        content: content,
      });
      _saveIndex();
      _renderDocList();
    } catch (e) {
      alert('Failed to save document: ' + e.message);
    }
  }

  function removeDoc(id) {
    var fs = require('fs');
    var path = require('path');
    _docs = _docs.filter(function (d) {
      return d.id !== id;
    });
    try {
      fs.unlinkSync(path.join(_docsDir, id + '.txt'));
    } catch (e) {}
    _saveIndex();
    _renderDocList();
  }

  // Returns a formatted string of the most relevant paragraphs for the given query.
  // Used to inject into Claude's system prompt.
  function getRelevantContext(query) {
    if (!query || !_docs.length) {
      return '';
    }

    var stopWords = {
      the: 1,
      a: 1,
      an: 1,
      is: 1,
      it: 1,
      in: 1,
      of: 1,
      for: 1,
      to: 1,
      and: 1,
      or: 1,
      how: 1,
      what: 1,
      does: 1,
      can: 1,
      i: 1,
      be: 1,
      this: 1,
      that: 1,
      my: 1,
      me: 1,
      do: 1,
      with: 1,
      are: 1,
      if: 1,
      else: 1,
      use: 1,
      will: 1,
      should: 1,
      about: 1,
      from: 1,
      your: 1,
      have: 1,
    };

    var keywords = query
      .toLowerCase()
      .split(/\W+/)
      .filter(function (w) {
        return w.length > 3 && !stopWords[w];
      });

    if (!keywords.length) {
      return '';
    }

    var results = [];

    _docs.forEach(function (doc) {
      // Split by double newlines or section headers
      var paragraphs = doc.content.split(/\n{2,}|\r\n{2,}/);

      paragraphs.forEach(function (para) {
        para = para.trim();
        if (para.length < 30) {
          return; // skip very short fragments
        }

        var lower = para.toLowerCase();
        var score = 0;

        keywords.forEach(function (kw) {
          var idx = lower.indexOf(kw);
          while (idx !== -1) {
            score++;
            idx = lower.indexOf(kw, idx + 1);
          }
        });

        if (score > 0) {
          results.push({
            docName: doc.name,
            text: para,
            score: score,
          });
        }
      });
    });

    // Sort by relevance score descending
    results.sort(function (a, b) {
      return b.score - a.score;
    });

    // Take top results, cap total chars to avoid blowing context window
    var top = [];
    var totalChars = 0;
    var maxChars = 3000;

    for (var i = 0; i < results.length && totalChars < maxChars; i++) {
      var txt = results[i].text;
      if (totalChars + txt.length > maxChars) {
        txt = txt.slice(0, maxChars - totalChars) + '...';
      }
      top.push({ docName: results[i].docName, text: txt });
      totalChars += txt.length;
    }

    if (!top.length) {
      return '';
    }

    return top
      .map(function (r) {
        return '### From: ' + r.docName + '\n' + r.text;
      })
      .join('\n\n');
  }

  // ============================================================
  // Persistence
  // ============================================================

  function _loadDocs() {
    var fs = require('fs');
    var path = require('path');
    var index = [];
    try {
      index = JSON.parse(fs.readFileSync(_indexFile, 'utf8'));
    } catch (e) {}

    _docs = [];
    index.forEach(function (entry) {
      var filePath = path.join(_docsDir, entry.id + '.txt');
      try {
        var content = fs.readFileSync(filePath, 'utf8');
        _docs.push({
          id: entry.id,
          name: entry.name,
          tags: entry.tags || [],
          addedDate: entry.addedDate || '',
          content: content,
        });
      } catch (e) {
        // file missing — skip entry
      }
    });
  }

  function _saveIndex() {
    var fs = require('fs');
    var index = _docs.map(function (d) {
      return { id: d.id, name: d.name, tags: d.tags, addedDate: d.addedDate };
    });
    try {
      fs.writeFileSync(_indexFile, JSON.stringify(index, null, 2), 'utf8');
    } catch (e) {}
  }

  // ============================================================
  // DOM binding
  // ============================================================

  function _bindDom() {
    _listEl = document.getElementById('cp-doc-list');
    _countBadge = document.getElementById('cp-docs-count');

    // Drawer toggle
    var toggleBtn = document.getElementById('cp-docs-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        var drawer = document.getElementById('cp-docs-drawer');
        if (!drawer) {
          return;
        }
        var open = drawer.classList.toggle('cp-open');
        toggleBtn.classList.toggle('cp-active', open);
      });
    }

    // Add doc button (opens modal)
    var addBtn = document.getElementById('cp-add-doc-btn');
    if (addBtn) {
      addBtn.addEventListener('click', _showAddModal);
    }

    // Modal buttons
    var cancelBtn = document.getElementById('cp-doc-modal-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', _hideAddModal);
    }

    var saveBtn = document.getElementById('cp-doc-modal-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', _saveDocFromForm);
    }

    var importBtn = document.getElementById('cp-doc-import-btn');
    if (importBtn) {
      importBtn.addEventListener('click', _importFromFile);
    }
  }

  function _renderDocList() {
    if (_countBadge) {
      _countBadge.textContent = _docs.length ? '(' + _docs.length + ')' : '';
    }
    if (!_listEl) {
      return;
    }
    _listEl.innerHTML = '';

    if (!_docs.length) {
      var em = document.createElement('em');
      em.className = 'cp-doc-empty';
      em.textContent =
        'No documents yet. Add datasheets, application notes, or any text reference.';
      _listEl.appendChild(em);
      return;
    }

    _docs.forEach(function (doc) {
      var row = document.createElement('div');
      row.className = 'cp-doc-row';

      var nameEl = document.createElement('span');
      nameEl.className = 'cp-doc-name';
      var kbSize = Math.round((doc.content.length / 1024) * 10) / 10;
      nameEl.title =
        kbSize +
        ' KB — added ' +
        (doc.addedDate ? doc.addedDate.slice(0, 10) : '');
      nameEl.textContent = doc.name;

      var removeBtn = document.createElement('button');
      removeBtn.className = 'cp-doc-remove';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove "' + doc.name + '"';

      // Capture id in closure
      (function (docId, docName) {
        removeBtn.addEventListener('click', function () {
          if (confirm('Remove document "' + docName + '"?')) {
            removeDoc(docId);
          }
        });
      })(doc.id, doc.name);

      row.appendChild(nameEl);
      row.appendChild(removeBtn);
      _listEl.appendChild(row);
    });
  }

  // ============================================================
  // Add document modal
  // ============================================================

  function _showAddModal() {
    var modal = document.getElementById('cp-doc-modal');
    if (!modal) {
      return;
    }
    document.getElementById('cp-doc-modal-name').value = '';
    document.getElementById('cp-doc-modal-content').value = '';
    modal.style.display = 'flex';
    document.getElementById('cp-doc-modal-name').focus();
  }

  function _hideAddModal() {
    var modal = document.getElementById('cp-doc-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  function _saveDocFromForm() {
    var name = (
      document.getElementById('cp-doc-modal-name').value || ''
    ).trim();
    var content = (
      document.getElementById('cp-doc-modal-content').value || ''
    ).trim();
    if (!name) {
      alert('Please enter a document name.');
      return;
    }
    if (!content) {
      alert('Please paste some document content.');
      return;
    }
    addDoc(name, content);
    _hideAddModal();
  }

  // Import a .txt / .md / .v file directly from disk
  function _importFromFile() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.md,.text,.v,.vhd,.vhdl,.sv,.rst,.pdf';
    input.onchange = function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) {
        return;
      }
      // For text files, read directly
      if (!file.name.endsWith('.pdf')) {
        var reader = new FileReader();
        reader.onload = function (re) {
          document.getElementById('cp-doc-modal-name').value = file.name;
          document.getElementById('cp-doc-modal-content').value =
            re.target.result || '';
        };
        reader.readAsText(file);
        return;
      }
      // PDF: try to read as text (will be binary, but at least captures searchable text from some PDFs)
      // Full PDF parsing would require a library; inform the user to paste text instead.
      alert(
        'PDF files cannot be read directly.\n\n' +
          'Please open the PDF, copy the relevant text sections, and paste them into the content field.'
      );
      document.getElementById('cp-doc-modal-name').value = file.name.replace(
        '.pdf',
        ''
      );
    };
    input.click();
  }

  // ============================================================
  // Public interface
  // ============================================================

  return {
    init: init,
    count: count,
    addDoc: addDoc,
    removeDoc: removeDoc,
    getRelevantContext: getRelevantContext,
  };
})();
