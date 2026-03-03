/**
 * Shared theme utility for Icestudio popup windows.
 *
 * Include this script in any NW.js popup window to get automatic theme
 * synchronization with the main app's Preferences → UI Theme setting.
 *
 * Sets a canonical set of --app-* CSS custom properties on
 * document.documentElement (as inline styles, highest specificity).
 * Each window's own CSS uses var(--app-*) aliases so existing selectors
 * keep working unchanged.
 *
 * Live updates: watches profile.json with fs.watchFile so an already-open
 * window updates within ~800 ms of a theme change in Preferences.
 *
 * Exposes: window.AppTheme.apply() — call to force an immediate re-read.
 */
'use strict';

(function () {
  var nodeFs = require('fs');
  var nodePath = require('path');

  // ── Palettes ────────────────────────────────────────────────────────────────
  // Colors match the existing code-editor / board-collection dark/light palette,
  // which was designed to match the main Icestudio application theme.

  var DARK = {
    '--app-bg': '#2e2e2e',
    '--app-bg2': '#3a3a3a',
    '--app-sidebar': '#252525',
    '--app-text': '#dddddd',
    '--app-muted': '#999999',
    '--app-border': '#555555',
    '--app-accent': '#63afcf',
    '--app-accent-hover': '#4a9bbf',
    '--app-input-bg': '#3a3a3a',
    '--app-btn-bg': '#3a3a3a',
    '--app-btn-hover': '#4a4a4a',
    '--app-active': '#2a4a5a',
    '--app-success': '#70c070',
    '--app-danger': '#e08080',
    '--app-warning': '#c0a060',
    '--app-ok-bg': '#1e3d0a',
    '--app-ok-text': '#a0e060',
    '--app-err-bg': '#3d1010',
    '--app-err-text': '#e07070',
  };

  var LIGHT = {
    '--app-bg': '#f5f6f7',
    '--app-bg2': '#ffffff',
    '--app-sidebar': '#e8eaec',
    '--app-text': '#333333',
    '--app-muted': '#888888',
    '--app-border': '#d5dadd',
    '--app-accent': '#63afcf',
    '--app-accent-hover': '#4a9bbf',
    '--app-input-bg': '#ffffff',
    '--app-btn-bg': '#e8eaec',
    '--app-btn-hover': '#d5dadd',
    '--app-active': '#d8eef8',
    '--app-success': '#27ae60',
    '--app-danger': '#dc2626',
    '--app-warning': '#d97706',
    '--app-ok-bg': '#d4ffad',
    '--app-ok-text': '#2d5a1b',
    '--app-err-bg': '#fde8e8',
    '--app-err-text': '#c0392b',
  };

  var ALL_PROPS = Object.keys(DARK);

  // ── Core apply ──────────────────────────────────────────────────────────────
  function applyTheme(theme, ct) {
    var root = document.documentElement;

    // Clear any previously-set inline props so switching themes is clean
    ALL_PROPS.forEach(function (p) {
      root.style.removeProperty(p);
    });

    // Apply base palette (dark is the default)
    var base = theme === 'light' ? LIGHT : DARK;
    ALL_PROPS.forEach(function (p) {
      root.style.setProperty(p, base[p]);
    });

    // Overlay custom theme colors when provided
    if (theme === 'custom' && ct) {
      if (ct.bg) root.style.setProperty('--app-bg', ct.bg);
      if (ct.bg2) root.style.setProperty('--app-bg2', ct.bg2);
      if (ct.sidebar) root.style.setProperty('--app-sidebar', ct.sidebar);
      if (ct.text) root.style.setProperty('--app-text', ct.text);
      if (ct.border) root.style.setProperty('--app-border', ct.border);
      if (ct.accent) {
        root.style.setProperty('--app-accent', ct.accent);
        root.style.setProperty('--app-accent-hover', ct.accent);
      }
      // Derive secondary surfaces and controls from the provided base colors
      var bg2 = ct.bg2 || ct.bg;
      if (bg2) {
        root.style.setProperty('--app-input-bg', bg2);
        root.style.setProperty('--app-btn-bg', bg2);
      }
      if (ct.border) {
        root.style.setProperty('--app-btn-hover', ct.border);
        root.style.setProperty('--app-active', ct.border);
      }
    }

    // Notify any listeners registered via AppTheme.onChange()
    if (window.AppTheme && window.AppTheme._listeners) {
      window.AppTheme._listeners.forEach(function (fn) {
        try {
          fn(theme, ct);
        } catch (e) {}
      });
    }
  }

  // ── Read from disk ──────────────────────────────────────────────────────────
  function readAndApplyTheme() {
    try {
      var profilePath = nodePath.join(nw.App.dataPath, 'profile.json');
      var pd = JSON.parse(nodeFs.readFileSync(profilePath, 'utf8'));
      applyTheme(pd.uiTheme || 'dark', pd.customTheme || null);
    } catch (e) {
      // If profile can't be read fall back to dark (CSS :root defaults cover it)
    }
  }

  // Apply immediately on script load
  readAndApplyTheme();

  // Watch for live changes while the window is open
  try {
    var watchPath = nodePath.join(nw.App.dataPath, 'profile.json');
    nodeFs.watchFile(
      watchPath,
      { interval: 800, persistent: false },
      function () {
        readAndApplyTheme();
      }
    );
  } catch (e) {}

  // ── Public API ──────────────────────────────────────────────────────────────
  window.AppTheme = {
    /** Force an immediate re-read and re-apply from profile.json */
    apply: readAndApplyTheme,

    /**
     * Register a callback that fires whenever the theme changes.
     * cb(theme: string, customTheme: object|null)
     */
    onChange: function (cb) {
      if (!window.AppTheme._listeners) {
        window.AppTheme._listeners = [];
      }
      window.AppTheme._listeners.push(cb);
    },

    _listeners: [],
  };
})();
