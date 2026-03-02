// ============================================================
//  collectionManager2 – events.js
//  Full-featured collection panel: search, tree/table view,
//  remove buttons, V/F/T/B status badges, add actions.
// ============================================================

// ---- State ----
var cmTree = false;
var cmView = 'tree';
var cmSearch = '';
var cmBadgeFilters = { V: false, F: false, T: false, B: false };
var cmBlockStatus = {};
var cmStatusFile = '';
var cmOpenFolders = {};
var cmSearchDebounce = null;
var cmBlocksRQ = [];
var preload = false;

// ---- Helpers ----

function cmEl(selector) {
  var result = iceStudio.gui.el(selector, pluginHost);
  if (!result) return [];
  if (result.length === undefined) return [result];
  return result;
}

function htmlEsc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cmClosest(el, cls) {
  while (el && el !== document) {
    if (el.classList && el.classList.contains(cls)) return el;
    el = el.parentNode;
  }
  return null;
}

// ---- Status file (block-status.json) ----

function loadBlockStatus() {
  cmStatusFile = nw.App.dataPath + '/block-status.json';
  try {
    var fs = require('fs');
    cmBlockStatus = JSON.parse(fs.readFileSync(cmStatusFile, 'utf8'));
  } catch (e) {
    cmBlockStatus = {};
  }
}

// ---- Theme ----

function applyTheme(env) {
  var theme = (env && env.profile && env.profile.uiTheme) || 'dark';
  var ct = (env && env.profile && env.profile.customTheme) || null;
  var v; // CSS variable map

  if (theme === 'custom' && ct) {
    v = {
      'bg': ct.bg || '#333333',
      'bg2': ct.sidebar || ct.bg || '#444444',
      'bg3': ct.bg2 || ct.bg || '#3a3a3a',
      'hover': ct.bg2 || '#555555',
      'border': ct.border || '#555555',
      'text': ct.text || '#dddddd',
      'text-dim': ct.text || '#aaaaaa', // same as text; dim via opacity in CSS
      'text-btn': ct.text || '#cccccc',
      'accent': ct.accent || '#007acc',
      'folder-color': ct.accent || '#ce9178',
      'coll-color': ct.accent || '#9cdcfe',
      'leaf-color': ct.text || '#d4d4d4',
    };
  } else if (theme === 'light') {
    v = {
      'bg': '#ffffff',
      'bg2': '#f5f6f7',
      'bg3': '#ffffff',
      'hover': '#e7e7e7',
      'border': '#ddd',
      'text': '#333333',
      'text-dim': '#888888',
      'text-btn': '#555555',
      'accent': '#007acc',
      'folder-color': '#a04000',
      'coll-color': '#0070c1',
      'leaf-color': '#333333',
    };
  } else {
    // dark (default) — matches icestudio's .ice-bar / .ajs-dialog palette
    v = {
      'bg': '#333333',
      'bg2': '#444444',
      'bg3': '#333333',
      'hover': '#555555',
      'border': '#555555',
      'text': '#ffffff',
      'text-dim': '#aaaaaa',
      'text-btn': '#cccccc',
      'accent': '#007acc',
      'folder-color': '#ce9178',
      'coll-color': '#9cdcfe',
      'leaf-color': '#d4d4d4',
    };
  }

  var keys = Object.keys(v);
  for (var ki = 0; ki < keys.length; ki++) {
    pluginHost.style.setProperty('--cm-' + keys[ki], v[keys[ki]]);
  }
}

// ---- Environment / indexing ----

function setupEnvironment(env) {
  preload = false;
  applyTheme(env);
  loadBlockStatus();
  iceStudio.bus.events.publish('collectionService.isIndexing');
}

function collectionsIndexStatus(status) {
  if (status.queue === 0 && status.indexing === false) {
    iceStudio.bus.events.publish('collectionService.getCollections');
  } else {
    if (preload === false) {
      preload = true;
      iceStudio.bus.events.publish('collectionService.getCollections');
    }
    setTimeout(function () {
      iceStudio.bus.events.publish('collectionService.isIndexing');
    }, 1000);
  }
}

function onIndexingEnd() {
  iceStudio.bus.events.publish('collectionService.getCollections');
}

// ---- Render entry point ----

function collectionsRender(tree) {
  if (tree === false) return;
  // The built-in 'Default collection' is always re-injected by collectionServiceWorker
  // even after deletion — hide it from the panel.
  cmTree = tree.filter(function (node) {
    return node.name !== 'Default collection';
  });
  loadBlockStatus();
  var loaderEls = cmEl('#cm-loader');
  if (loaderEls.length) loaderEls[0].style.display = 'none';
  cmRender();
}

function cmRender() {
  var contentEls = cmEl('#cm-content');
  if (!contentEls.length || !cmTree) return;
  var content = contentEls[0];

  // Save and detach loader before innerHTML wipe
  var loader = content.querySelector('#cm-loader');
  var loaderParent = loader ? loader.parentNode : null;
  if (loader) loader.parentNode.removeChild(loader);

  content.innerHTML =
    cmView === 'table' ? buildTableHTML(cmTree) : buildTreeHTML(cmTree);

  // Restore loader (hidden) at the top
  if (loader) {
    loader.style.display = 'none';
    content.insertBefore(loader, content.firstChild);
  }

  applyFilter();
  attachContentListeners(content);
}

// ---- Tree view ----

function buildTreeHTML(tree) {
  var html = '<div class="cm-tree">';
  for (var i = 0; i < tree.length; i++) {
    html += buildNodeHTML(tree[i], true, tree[i].path, tree[i].name);
  }
  html += '</div>';
  return html;
}

function buildNodeHTML(node, isRoot, collectionPath, collectionName) {
  if (node.isLeaf) return buildLeafHTML(node, collectionPath);
  if (node.isFolder)
    return buildFolderHTML(node, isRoot, collectionPath, collectionName);
  return '';
}

function buildFolderHTML(node, isRoot, collectionPath, collectionName) {
  var isOpen = !!cmOpenFolders[node.id];
  var classes =
    'cm-folder' +
    (isRoot ? ' cm-collection-root' : '') +
    (isOpen ? ' cm-open' : '');
  var html =
    '<div class="' +
    classes +
    '" data-nodeid="' +
    htmlEsc(node.id) +
    '" data-path="' +
    htmlEsc(node.path) +
    '" data-name="' +
    htmlEsc(node.name) +
    '">';

  html += '<div class="cm-folder-header">';
  html +=
    '<span class="cm-folder-toggle" data-nodeid="' +
    htmlEsc(node.id) +
    '">' +
    (isOpen ? '&#9660;' : '&#9658;') +
    '</span>';
  html +=
    '<span class="cm-folder-name" data-nodeid="' +
    htmlEsc(node.id) +
    '">' +
    htmlEsc(node.name) +
    '</span>';

  if (isRoot) {
    html +=
      '<button class="cm-remove-btn cm-remove-collection" data-path="' +
      htmlEsc(node.path) +
      '" data-name="' +
      htmlEsc(node.name) +
      '" title="Remove collection">&#x2715;</button>';
  }
  html += '</div>';

  if (node.items && node.items.length > 0) {
    html +=
      '<div class="cm-folder-children"' +
      (isOpen ? '' : ' style="display:none"') +
      '>';
    var childCollPath = isRoot ? node.path : collectionPath;
    var childCollName = isRoot ? node.name : collectionName;
    for (var j = 0; j < node.items.length; j++) {
      html += buildNodeHTML(node.items[j], false, childCollPath, childCollName);
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function buildLeafHTML(node, collectionPath) {
  var status = cmBlockStatus[node.path] || {};
  var html =
    '<div class="cm-leaf" data-nodeid="' +
    htmlEsc(node.id) +
    '" data-path="' +
    htmlEsc(node.path) +
    '" data-name="' +
    htmlEsc(node.name) +
    '" data-collection="' +
    htmlEsc(collectionPath) +
    '">';

  html +=
    '<span class="cm-leaf-name">' +
    htmlEsc(node.name.replace(/\.ice$/, '')) +
    '</span>';

  html += '<span class="cm-badges">';
  html += buildBadgeHTML('V', status.V);
  html += buildBadgeHTML('F', status.F);
  html += buildBadgeHTML('T', status.T);
  html += buildBadgeHTML('B', status.B);
  html += '</span>';

  html +=
    '<button class="cm-remove-btn cm-remove-block" data-path="' +
    htmlEsc(node.path) +
    '" data-collection="' +
    htmlEsc(collectionPath) +
    '" title="Remove block">&#x2715;</button>';

  html += '</div>';
  return html;
}

function buildBadgeHTML(letter, value) {
  var cls = 'cm-badge cm-badge-' + letter;
  if (value === true) {
    cls += ' cm-badge-pass';
  } else if (value === false) {
    cls += ' cm-badge-fail';
  } else {
    cls += ' cm-badge-unknown';
  }
  return '<span class="' + cls + '">' + letter + '</span>';
}

// ---- Table view ----

function buildTableHTML(tree) {
  var leaves = flattenLeaves(tree);
  var html =
    '<table class="cm-table"><thead><tr>' +
    '<th>Name</th><th>Collection</th><th>V</th><th>F</th><th>T</th><th>B</th><th></th>' +
    '</tr></thead><tbody>';

  for (var i = 0; i < leaves.length; i++) {
    var leaf = leaves[i];
    var status = cmBlockStatus[leaf.path] || {};
    html +=
      '<tr class="cm-table-row" data-nodeid="' +
      htmlEsc(leaf.id) +
      '" data-path="' +
      htmlEsc(leaf.path) +
      '" data-name="' +
      htmlEsc(leaf.name) +
      '" data-collection="' +
      htmlEsc(leaf.collectionPath) +
      '">';
    html +=
      '<td class="cm-table-name">' +
      htmlEsc(leaf.name.replace(/\.ice$/, '')) +
      '</td>';
    html +=
      '<td class="cm-table-coll">' + htmlEsc(leaf.collectionName) + '</td>';
    html += '<td>' + buildBadgeHTML('V', status.V) + '</td>';
    html += '<td>' + buildBadgeHTML('F', status.F) + '</td>';
    html += '<td>' + buildBadgeHTML('T', status.T) + '</td>';
    html += '<td>' + buildBadgeHTML('B', status.B) + '</td>';
    html +=
      '<td><button class="cm-remove-btn cm-remove-block" data-path="' +
      htmlEsc(leaf.path) +
      '" data-collection="' +
      htmlEsc(leaf.collectionPath) +
      '" title="Remove">&#x2715;</button></td>';
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

function flattenLeaves(tree) {
  var result = [];
  for (var i = 0; i < tree.length; i++) {
    var node = tree[i];
    if (node.isFolder) {
      result = result.concat(collectFolderLeaves(node, node.name, node.path));
    }
  }
  return result;
}

function collectFolderLeaves(node, collectionName, collectionPath) {
  var result = [];
  if (!node.items) return result;
  for (var i = 0; i < node.items.length; i++) {
    var child = node.items[i];
    if (child.isLeaf) {
      result.push({
        id: child.id,
        name: child.name,
        path: child.path,
        collectionName: collectionName,
        collectionPath: collectionPath,
      });
    } else if (child.isFolder) {
      result = result.concat(
        collectFolderLeaves(child, collectionName, collectionPath)
      );
    }
  }
  return result;
}

// ---- Filter ----

function applyFilter() {
  var search = cmSearch.toLowerCase().trim();
  var hasSearch = search.length > 0;
  var hasBadgeFilter = false;
  var bKeys = Object.keys(cmBadgeFilters);
  for (var bi = 0; bi < bKeys.length; bi++) {
    if (cmBadgeFilters[bKeys[bi]]) {
      hasBadgeFilter = true;
      break;
    }
  }

  if (!hasSearch && !hasBadgeFilter) {
    var allLeaves = cmEl('.cm-leaf');
    for (var li = 0; li < allLeaves.length; li++)
      allLeaves[li].style.display = '';
    var allFolders = cmEl('.cm-folder');
    for (var fi = 0; fi < allFolders.length; fi++)
      allFolders[fi].style.display = '';
    var allRows = cmEl('.cm-table-row');
    for (var ri = 0; ri < allRows.length; ri++) allRows[ri].style.display = '';
    return;
  }

  if (cmView === 'table') {
    applyFilterTable(search, hasBadgeFilter);
  } else {
    applyFilterTree(search, hasBadgeFilter);
  }
}

function matchesBadge(path) {
  var status = cmBlockStatus[path] || {};
  var keys = Object.keys(cmBadgeFilters);
  for (var i = 0; i < keys.length; i++) {
    if (cmBadgeFilters[keys[i]] && status[keys[i]] !== true) return false;
  }
  return true;
}

function applyFilterTree(search, hasBadgeFilter) {
  var leaves = cmEl('.cm-leaf');
  var visibleFolderIds = {};

  for (var i = 0; i < leaves.length; i++) {
    var leaf = leaves[i];
    var name = (leaf.dataset.name || '').toLowerCase();
    var path = (leaf.dataset.path || '').toLowerCase();
    var matchSearch =
      !search || name.indexOf(search) !== -1 || path.indexOf(search) !== -1;
    var matchBadge = !hasBadgeFilter || matchesBadge(leaf.dataset.path || '');

    if (matchSearch && matchBadge) {
      leaf.style.display = '';
      var p = leaf.parentNode;
      while (p && p.dataset) {
        if (p.dataset.nodeid) visibleFolderIds[p.dataset.nodeid] = true;
        p = p.parentNode;
      }
    } else {
      leaf.style.display = 'none';
    }
  }

  var folders = cmEl('.cm-folder');
  for (var j = 0; j < folders.length; j++) {
    var folder = folders[j];
    var fId = folder.dataset.nodeid;
    if (visibleFolderIds[fId]) {
      folder.style.display = '';
      var children = folder.querySelector('.cm-folder-children');
      if (children) children.style.display = '';
    } else {
      folder.style.display = 'none';
    }
  }
}

function applyFilterTable(search, hasBadgeFilter) {
  var rows = cmEl('.cm-table-row');
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var name = (row.dataset.name || '').toLowerCase();
    var coll = (row.dataset.collection || '').toLowerCase();
    var path = (row.dataset.path || '').toLowerCase();
    var matchSearch =
      !search ||
      name.indexOf(search) !== -1 ||
      coll.indexOf(search) !== -1 ||
      path.indexOf(search) !== -1;
    var matchBadge = !hasBadgeFilter || matchesBadge(row.dataset.path || '');
    row.style.display = matchSearch && matchBadge ? '' : 'none';
  }
}

// ---- Folder toggle ----

function cmToggleFolder(nodeId) {
  if (cmOpenFolders[nodeId]) {
    delete cmOpenFolders[nodeId];
  } else {
    cmOpenFolders[nodeId] = true;
  }
  var isOpen = !!cmOpenFolders[nodeId];

  var folders = cmEl('.cm-folder');
  for (var i = 0; i < folders.length; i++) {
    if (folders[i].dataset.nodeid === nodeId) {
      var children = folders[i].querySelector('.cm-folder-children');
      if (children) children.style.display = isOpen ? '' : 'none';
      var toggle = folders[i].querySelector('.cm-folder-toggle');
      if (toggle) toggle.innerHTML = isOpen ? '&#9660;' : '&#9658;';
      if (isOpen) {
        folders[i].classList.add('cm-open');
      } else {
        folders[i].classList.remove('cm-open');
      }
      break;
    }
  }
}

// ---- Block retrieval (add to canvas) ----

function blockRetrieved(item) {
  for (var i = 0; i < cmBlocksRQ.length; i++) {
    if (cmBlocksRQ[i].id === item.id) {
      iceStudio.bus.events.publish('block.addFromFile', item.path);
      cmBlocksRQ.splice(i, 1);
      return;
    }
  }
}

function addBlockToCanvas(nodeId) {
  var item = { id: nodeId, store: 'blockAssets', block: false };
  var transaction = {
    database: { dbId: 'Collections', storages: ['blockAssets'], version: 1 },
    data: item,
  };
  cmBlocksRQ.push(item);
  iceStudio.bus.events.publish('localDatabase.retrieve', transaction);

  var leafEls = cmEl('.cm-leaf');
  for (var i = 0; i < leafEls.length; i++) {
    if (leafEls[i].dataset.nodeid === nodeId)
      leafEls[i].classList.add('cm-in-use');
  }
  var rowEls = cmEl('.cm-table-row');
  for (var j = 0; j < rowEls.length; j++) {
    if (rowEls[j].dataset.nodeid === nodeId)
      rowEls[j].classList.add('cm-in-use');
  }
}

// ---- Content listeners (attached only once — survives re-renders) ----

function attachContentListeners(content) {
  // Guard: only attach once — cmRender() is called on every collection reload
  // so without this guard every render would stack another event listener.
  if (content._cmListenersAttached) return;
  content._cmListenersAttached = true;

  // Click handles folder toggles and remove buttons only.
  content.addEventListener('click', function (e) {
    var target = e.target;

    // Folder toggle (click on the arrow or the name text)
    var folderToggle = cmClosest(target, 'cm-folder-toggle');
    if (!folderToggle) folderToggle = cmClosest(target, 'cm-folder-name');
    if (folderToggle && folderToggle.dataset.nodeid) {
      cmToggleFolder(folderToggle.dataset.nodeid);
      return;
    }

    // Remove collection
    var removeCollBtn = cmClosest(target, 'cm-remove-collection');
    if (removeCollBtn) {
      e.stopPropagation();
      iceStudio.bus.events.publish('collectionManager2.removeCollection', {
        path: removeCollBtn.dataset.path,
        name: removeCollBtn.dataset.name,
      });
      return;
    }

    // Remove block
    var removeBlockBtn = cmClosest(target, 'cm-remove-block');
    if (removeBlockBtn) {
      e.stopPropagation();
      iceStudio.bus.events.publish('collectionManager2.removeBlock', {
        blockPath: removeBlockBtn.dataset.path,
        collectionPath: removeBlockBtn.dataset.collection,
      });
      return;
    }
  });

  // Mousedown on a leaf / table-row starts the "drag to canvas" flow.
  // Using mousedown (not click) means:
  //   - The block attaches to the cursor immediately when you press.
  //   - Dragging it to the canvas and clicking places it there.
  //   - A quick click without moving also works (block placed near cursor).
  content.addEventListener('mousedown', function (e) {
    // Ignore right-click and middle-click
    if (e.button !== 0) return;
    // Don't trigger on remove buttons or folder headers
    if (
      cmClosest(e.target, 'cm-remove-btn') ||
      cmClosest(e.target, 'cm-folder-toggle') ||
      cmClosest(e.target, 'cm-folder-name')
    ) {
      return;
    }

    var leaf = cmClosest(e.target, 'cm-leaf');
    if (leaf && leaf.dataset.nodeid) {
      addBlockToCanvas(leaf.dataset.nodeid);
      return;
    }

    var tableRow = cmClosest(e.target, 'cm-table-row');
    if (tableRow && tableRow.dataset.nodeid) {
      addBlockToCanvas(tableRow.dataset.nodeid);
    }
  });
}

// ---- Toolbar & search (set up once after DOM is ready) ----

function setupToolbarEvents() {
  var addBtnEls = cmEl('#cm-btn-add');
  var addMenuEls = cmEl('#cm-add-menu');

  if (addBtnEls.length && addMenuEls.length) {
    var addBtn = addBtnEls[0];
    var addMenu = addMenuEls[0];

    addBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (addMenu.classList.contains('hidden')) {
        addMenu.classList.remove('hidden');
      } else {
        addMenu.classList.add('hidden');
      }
    });

    addMenu.addEventListener('click', function (e) {
      var action = e.target.dataset.action;
      if (!action) return;
      addMenu.classList.add('hidden');
      if (action === 'add-zip') {
        iceStudio.bus.events.publish('collectionManager2.addZip');
      } else if (action === 'add-folder') {
        iceStudio.bus.events.publish('collectionManager2.addFolder');
      } else if (action === 'add-block') {
        var rootFolders = cmEl('.cm-collection-root');
        var targetPath = rootFolders.length ? rootFolders[0].dataset.path : '';
        iceStudio.bus.events.publish('collectionManager2.addBlock', {
          targetCollectionPath: targetPath,
        });
      }
    });

    document.addEventListener('click', function () {
      addMenu.classList.add('hidden');
    });
  }

  var treeBtnEls = cmEl('#cm-btn-tree');
  var tableBtnEls = cmEl('#cm-btn-table');

  if (treeBtnEls.length) {
    treeBtnEls[0].addEventListener('click', function () {
      cmView = 'tree';
      treeBtnEls[0].classList.add('active');
      if (tableBtnEls.length) tableBtnEls[0].classList.remove('active');
      cmRender();
    });
  }
  if (tableBtnEls.length) {
    tableBtnEls[0].addEventListener('click', function () {
      cmView = 'table';
      tableBtnEls[0].classList.add('active');
      if (treeBtnEls.length) treeBtnEls[0].classList.remove('active');
      cmRender();
    });
  }

  var searchEls = cmEl('#cm-search');
  if (searchEls.length) {
    searchEls[0].addEventListener('input', function () {
      cmSearch = this.value;
      if (cmSearchDebounce) clearTimeout(cmSearchDebounce);
      cmSearchDebounce = setTimeout(applyFilter, 200);
    });
  }

  var badgeBtns = cmEl('.cm-badge-btn');
  for (var i = 0; i < badgeBtns.length; i++) {
    badgeBtns[i].addEventListener('click', function () {
      var badge = this.dataset.badge;
      cmBadgeFilters[badge] = !cmBadgeFilters[badge];
      if (cmBadgeFilters[badge]) {
        this.classList.add('active');
      } else {
        this.classList.remove('active');
      }
      applyFilter();
    });
  }
}

// ---- Bus event registrations ----

function registerEvents() {
  iceStudio.bus.events.subscribe(
    'pluginManager.env',
    setupEnvironment,
    false,
    pluginUUID
  );
  iceStudio.bus.events.subscribe(
    'pluginManager.updateEnv',
    setupEnvironment,
    false,
    pluginUUID
  );
  iceStudio.bus.events.subscribe(
    'collectionService.indexStatus',
    collectionsIndexStatus,
    false,
    pluginUUID
  );
  iceStudio.bus.events.subscribe(
    'collectionService.collections',
    collectionsRender,
    false,
    pluginUUID
  );
  iceStudio.bus.events.subscribe(
    'collectionService.indexingEnd',
    onIndexingEnd,
    false,
    pluginUUID
  );
  iceStudio.bus.events.subscribe(
    'localDatabase.retrieved',
    blockRetrieved,
    false,
    pluginUUID
  );
}
