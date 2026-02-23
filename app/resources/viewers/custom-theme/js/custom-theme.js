'use strict';

var fs = require('fs');
var path = require('path');

// ============================================================
// Config from URL params
// ============================================================
var urlParams = new URLSearchParams(window.location.search);
var config = JSON.parse(decodeURIComponent(urlParams.get('config')));

var profilePath = config.profilePath;

// Default presets
var LIGHT_DEFAULTS = {
  bg: '#f5f6f7',
  bg2: '#ffffff',
  sidebar: '#f5f6f7',
  border: '#d5dadd',
  text: '#333333',
  accent: '#63afcf',
};

var DARK_DEFAULTS = {
  bg: '#2e2e2e',
  bg2: '#3a3a3a',
  sidebar: '#252525',
  border: '#555555',
  text: '#dddddd',
  accent: '#63afcf',
};

// Current working colors (starts from saved custom or light preset)
var colors = Object.assign({}, LIGHT_DEFAULTS, config.customTheme || {});

// ============================================================
// Color picker IDs
// ============================================================
var FIELDS = ['bg', 'bg2', 'sidebar', 'border', 'text', 'accent'];

// ============================================================
// Preview CSS variable mapping
// ============================================================
function updatePreview() {
  var pw = document.getElementById('preview-window');
  pw.style.setProperty('--prev-bg', colors.bg);
  pw.style.setProperty('--prev-bg2', colors.bg2);
  pw.style.setProperty('--prev-sidebar', colors.sidebar);
  pw.style.setProperty('--prev-border', colors.border);
  pw.style.setProperty('--prev-text', colors.text);
  pw.style.setProperty('--prev-text-label', colors.text);
  pw.style.setProperty('--prev-muted', colors.text);
  pw.style.setProperty('--prev-accent', colors.accent);
  pw.style.setProperty('--prev-input-bg', colors.bg2);
  pw.style.setProperty('--prev-active', colors.border);
}

function fillPickers() {
  FIELDS.forEach(function (field) {
    var input = document.getElementById('color-' + field);
    var hexEl = document.getElementById('hex-' + field);
    if (input) {
      input.value = colors[field] || '#000000';
    }
    if (hexEl) {
      hexEl.textContent = colors[field] || '';
    }
  });
}

function bindPickers() {
  FIELDS.forEach(function (field) {
    var input = document.getElementById('color-' + field);
    var hexEl = document.getElementById('hex-' + field);
    if (!input) return;
    input.addEventListener('input', function () {
      colors[field] = this.value;
      if (hexEl) hexEl.textContent = this.value;
      updatePreview();
    });
  });
}

// ============================================================
// Save to profile
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

function applyAndClose() {
  try {
    var profileData = {};
    try {
      profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    } catch (e) {}
    profileData.customTheme = Object.assign({}, colors);
    profileData.uiTheme = 'custom';
    writeIfChanged(profilePath, JSON.stringify(profileData, null, 2));
  } catch (e) {
    console.error('Failed to save custom theme', e);
  }
  window.close();
}

// ============================================================
// Init
// ============================================================
window.onload = function () {
  fillPickers();
  bindPickers();
  updatePreview();

  document.getElementById('btn-light').addEventListener('click', function () {
    colors = Object.assign({}, LIGHT_DEFAULTS);
    fillPickers();
    updatePreview();
  });

  document.getElementById('btn-dark').addEventListener('click', function () {
    colors = Object.assign({}, DARK_DEFAULTS);
    fillPickers();
    updatePreview();
  });

  document.getElementById('btn-apply').addEventListener('click', applyAndClose);
  document.getElementById('btn-cancel').addEventListener('click', function () {
    window.close();
  });
};
