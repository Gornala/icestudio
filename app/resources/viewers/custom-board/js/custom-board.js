'use strict';

var fs = require('fs');
var path = require('path');

// ============================================================
// Configuration from URL parameters
// ============================================================
var urlParams = new URLSearchParams(window.location.search);
var config = JSON.parse(decodeURIComponent(urlParams.get('config')));

var apioResourcesDir = config.apioResourcesPath;
var icestudioBoardsDir = config.icestudioBoardsDir;
var icestudioMenuJsonPath = config.icestudioMenuJson;
var customBoardsDir = config.customBoardsDir;
var customBoardsJsonPath = path.join(customBoardsDir, 'custom-boards.json');

// ============================================================
// State
// ============================================================
var currentStep = 1;
var totalSteps = 4;
var pinoutTable = null;
var editingBoardId = null; // null = new board, string = editing existing custom board
var copyingBoardId = null; // set when copying a built-in board (so validation allows new ID)

// Loaded data
var apioFpgas = {};
var apioProgrammers = {};
var apioBoards = {};
var apioMenu = [];
var customBoardsRegistry = {};
var icestudioAllBoards = []; // [{family, name, label, dir}] — all boards from menu.json

// ============================================================
// Initialization
// ============================================================
window.onload = function () {
  loadApioResources();
  loadCustomBoards();
  loadIcestudioBoards();
  initPinoutTable();
  bindEvents();
  renderBoardList();
};

// Theme is handled by shared/theme.js (loaded in custom-board.html)

// ============================================================
// Load apio data for comboboxes
// ============================================================
function loadApioResources() {
  if (!apioResourcesDir || !fs.existsSync(apioResourcesDir)) {
    showStatus(
      'Warning: apio resources directory not found. FPGA/programmer lists will be empty.',
      'warn'
    );
    return;
  }
  try {
    apioFpgas = JSON.parse(
      fs.readFileSync(path.join(apioResourcesDir, 'fpgas.json'), 'utf8')
    );
  } catch (e) {
    console.error('fpgas.json', e);
  }
  try {
    apioProgrammers = JSON.parse(
      fs.readFileSync(path.join(apioResourcesDir, 'programmers.json'), 'utf8')
    );
  } catch (e) {
    console.error('programmers.json', e);
  }
  try {
    apioBoards = JSON.parse(
      fs.readFileSync(path.join(apioResourcesDir, 'boards.json'), 'utf8')
    );
  } catch (e) {
    console.error('boards.json', e);
  }
  try {
    apioMenu = JSON.parse(
      fs.readFileSync(path.join(apioResourcesDir, 'menu.json'), 'utf8')
    );
  } catch (e) {
    console.error('apio menu.json', e);
  }

  populateFpgaSelect();
  populateProgrammerSelect();
  populateFamilySelect();
}

// ============================================================
// Load custom boards registry
// ============================================================
function loadCustomBoards() {
  customBoardsRegistry = {};
  if (fs.existsSync(customBoardsJsonPath)) {
    try {
      customBoardsRegistry = JSON.parse(
        fs.readFileSync(customBoardsJsonPath, 'utf8')
      );
    } catch (e) {
      console.error('Failed to load custom-boards.json', e);
    }
  }
}

// ============================================================
// Load all icestudio boards from menu.json + info.json files
// ============================================================
function loadIcestudioBoards() {
  icestudioAllBoards = [];
  try {
    var menu = JSON.parse(fs.readFileSync(icestudioMenuJsonPath, 'utf8'));
    menu.forEach(function (familyEntry) {
      familyEntry.boards.forEach(function (boardName) {
        var boardDir = path.join(icestudioBoardsDir, boardName);
        var infoPath = path.join(boardDir, 'info.json');
        var label = boardName;
        try {
          var info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
          label = info.label || boardName;
        } catch (e) {}
        icestudioAllBoards.push({
          family: familyEntry.type,
          name: boardName,
          label: label,
          dir: boardDir,
        });
      });
    });
  } catch (e) {
    console.error('Failed to load icestudio boards', e);
  }
}

// ============================================================
// Populate comboboxes
// ============================================================
function populateFpgaSelect() {
  var sel = document.getElementById('fpga-select');
  Object.keys(apioFpgas)
    .sort()
    .forEach(function (k) {
      var opt = document.createElement('option');
      opt.value = k;
      opt.textContent = k;
      sel.appendChild(opt);
    });
}

function populateProgrammerSelect() {
  var sel = document.getElementById('programmer-select');
  Object.keys(apioProgrammers)
    .sort()
    .forEach(function (k) {
      var opt = document.createElement('option');
      opt.value = k;
      opt.textContent = k + ' (' + (apioProgrammers[k].command || '') + ')';
      sel.appendChild(opt);
    });
}

function populateFamilySelect() {
  var sel = document.getElementById('fpga-family');
  var families = {};
  apioMenu.forEach(function (f) {
    families[f.type] = true;
  });
  try {
    JSON.parse(fs.readFileSync(icestudioMenuJsonPath, 'utf8')).forEach(
      function (f) {
        families[f.type] = true;
      }
    );
  } catch (e) {}
  Object.keys(families)
    .sort()
    .forEach(function (f) {
      var opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      sel.appendChild(opt);
    });
}

// ============================================================
// Pinout table (jspreadsheet)
// ============================================================
function initPinoutTable(data) {
  var container = document.getElementById('pinout-table-container');
  container.innerHTML = '';
  var initialData = data && data.length ? data : [['input', '', '', '']];

  // jspreadsheet-ce v4 uses jspreadsheet global (from index.js)
  var lib =
    typeof jspreadsheet !== 'undefined'
      ? jspreadsheet
      : typeof jexcel !== 'undefined'
        ? jexcel
        : null;

  if (!lib) {
    container.innerHTML =
      '<div style="padding:10px;color:#c0392b">jspreadsheet library not loaded. Check node_modules paths.</div>';
    return;
  }

  pinoutTable = lib(container, {
    data: initialData,
    columns: [
      {
        title: 'Type',
        type: 'dropdown',
        source: ['input', 'output', 'inout'],
        width: 90,
      },
      { title: 'Name', type: 'text', width: 170 },
      { title: 'Value (Pin)', type: 'text', width: 110 },
      {
        title: 'Pullmode',
        type: 'dropdown',
        source: ['', 'UP', 'DOWN', 'NONE'],
        width: 90,
      },
    ],
    minDimensions: [4, 1],
    tableOverflow: true,
    tableHeight: '260px',
    allowInsertColumn: false,
    allowDeleteColumn: false,
    contextMenu: false,
  });
}

// ============================================================
// Event bindings
// ============================================================
function bindEvents() {
  document.getElementById('btn-prev').addEventListener('click', prevStep);
  document.getElementById('btn-next').addEventListener('click', nextStep);
  document.getElementById('btn-save').addEventListener('click', saveBoard);
  document.getElementById('btn-new-board').addEventListener('click', newBoard);

  document
    .getElementById('fpga-new-toggle')
    .addEventListener('change', function () {
      toggleHidden('fpga-new-fields', this.checked);
      clearFieldError('err-fpga');
    });
  document
    .getElementById('programmer-new-toggle')
    .addEventListener('change', function () {
      toggleHidden('programmer-new-fields', this.checked);
      clearFieldError('err-programmer');
    });

  // Import buttons — use NW.js-compatible file open trigger
  setupFileImport('btn-import-info', 'file-import-info', importInfoJson);
  setupFileImport('btn-import-pinout', 'file-import-pinout', importPinoutJson);
  setupFileImport(
    'btn-import-constraint',
    'file-import-constraint',
    importConstraintFile
  );
  setupFileImport('btn-import-rules', 'file-import-rules', importRulesJson);

  // Pinout row management
  document
    .getElementById('btn-add-pin-row')
    .addEventListener('click', function () {
      if (pinoutTable) pinoutTable.insertRow();
    });
  document
    .getElementById('btn-remove-pin-row')
    .addEventListener('click', function () {
      if (!pinoutTable) return;
      var data = pinoutTable.getData();
      if (data.length > 1) pinoutTable.deleteRow(data.length - 1);
    });

  document
    .getElementById('btn-auto-constraint')
    .addEventListener('click', generateConstraintFile);

  // Inline validation on blur
  bindFieldValidation('board-id', 'err-board-id', validateBoardId);
  bindFieldValidation('board-label', 'err-board-label', function (v) {
    return v.trim() ? '' : 'Board label is required';
  });
  bindFieldValidation('sys-clk', 'err-clk', function (v) {
    return parseInt(v) > 0 ? '' : 'Must be a positive number';
  });
  bindFieldValidation('usb-vid', 'err-vid', function (v) {
    return !v || /^[0-9a-fA-F]{4}$/.test(v)
      ? ''
      : 'Must be 4 hex chars (e.g. 0403)';
  });
  bindFieldValidation('usb-pid', 'err-pid', function (v) {
    return !v || /^[0-9a-fA-F]{4}$/.test(v)
      ? ''
      : 'Must be 4 hex chars (e.g. 6010)';
  });
  document
    .getElementById('fpga-select')
    .addEventListener('change', function () {
      clearFieldError('err-fpga');
    });
  document
    .getElementById('programmer-select')
    .addEventListener('change', function () {
      clearFieldError('err-programmer');
    });
  document
    .getElementById('fpga-family')
    .addEventListener('change', function () {
      clearFieldError('err-family');
    });
}

// ============================================================
// File import — NW.js compatible
// ============================================================
function setupFileImport(btnId, fileInputId, handler) {
  var btn = document.getElementById(btnId);
  var fileInput = document.getElementById(fileInputId);
  if (!btn || !fileInput) return;

  // In NW.js popup windows, programmatically clicking a hidden file input works
  // when triggered from a real user click event
  btn.addEventListener('click', function (e) {
    e.preventDefault();
    fileInput.value = '';
    fileInput.click();
  });

  fileInput.addEventListener('change', function () {
    if (this.files && this.files.length > 0) {
      // NW.js gives us the real filesystem path via file.path
      var filepath = this.files[0].path || this.files[0].name;
      if (filepath) handler(filepath);
      this.value = '';
    }
  });
}

// ============================================================
// Inline validation helpers
// ============================================================
function bindFieldValidation(inputId, errorId, validator) {
  var el = document.getElementById(inputId);
  if (!el) return;
  el.addEventListener('blur', function () {
    var msg = validator(this.value);
    setFieldError(inputId, errorId, msg);
  });
  el.addEventListener('input', function () {
    // Clear error while typing
    clearFieldError(errorId);
    this.classList.remove('field-invalid');
  });
}

function setFieldError(inputId, errorId, msg) {
  var errEl = document.getElementById(errorId);
  var inputEl = document.getElementById(inputId);
  if (!errEl) return;
  if (msg) {
    errEl.textContent = msg;
    if (inputEl) inputEl.classList.add('field-invalid');
  } else {
    errEl.textContent = '';
    if (inputEl) inputEl.classList.remove('field-invalid');
  }
}

function clearFieldError(errorId) {
  var errEl = document.getElementById(errorId);
  if (errEl) errEl.textContent = '';
}

function showFieldErrors(errors) {
  // Map error text to field IDs where possible and show in status bar
  showStatus(errors.join(' — '), 'err');
}

function validateBoardId(value) {
  var v = value.trim();
  if (!v) return 'Board ID is required';
  if (!/^[A-Za-z0-9_-]+$/.test(v))
    return 'Only letters, numbers, hyphens, underscores';
  if (!editingBoardId && !copyingBoardId) {
    if (apioBoards[v] || customBoardsRegistry[v])
      return 'ID "' + v + '" already exists';
  } else if (editingBoardId && v !== editingBoardId) {
    if (apioBoards[v] || (customBoardsRegistry[v] && v !== editingBoardId))
      return 'ID "' + v + '" already exists';
  }
  return '';
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

function clearStatus() {
  var bar = document.getElementById('status-bar');
  bar.className = '';
  bar.textContent = '';
}

function toggleHidden(elementId, show) {
  var el = document.getElementById(elementId);
  if (!el) return;
  el.classList.toggle('hidden', !show);
}

// ============================================================
// File import functions
// ============================================================
function importInfoJson(filepath) {
  try {
    var info = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    if (info.label) document.getElementById('board-label').value = info.label;
    if (info.SysClkMhz)
      document.getElementById('sys-clk').value = info.SysClkMhz;
    if (info.datasheet)
      document.getElementById('datasheet-url').value = info.datasheet;
    if (info.interface)
      document.getElementById('board-interface').value = info.interface;
    if (info.FPGAResources) {
      var r = info.FPGAResources;
      if (r.ffs !== undefined) document.getElementById('res-ffs').value = r.ffs;
      if (r.luts !== undefined)
        document.getElementById('res-luts').value = r.luts;
      if (r.pios !== undefined)
        document.getElementById('res-pios').value = r.pios;
      if (r.plbs !== undefined)
        document.getElementById('res-plbs').value = r.plbs;
      if (r.brams !== undefined)
        document.getElementById('res-brams').value = r.brams;
    }
    // If ecp5, pre-select arch
    if (info.arch === 'ecp5')
      document.getElementById('fpga-new-arch').value = 'ecp5';
    showStatus('Imported info.json', 'ok');
  } catch (e) {
    showStatus('Failed to read info.json: ' + e.message, 'err');
  }
}

function importPinoutJson(filepath) {
  try {
    var pinout = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    if (!Array.isArray(pinout)) {
      showStatus('pinout.json must be an array', 'err');
      return;
    }
    var data = pinout.map(function (pin) {
      return [
        pin.type || 'input',
        pin.name || '',
        pin.value || '',
        pin.pullmode || '',
      ];
    });
    initPinoutTable(data);
    showStatus('Imported ' + data.length + ' pins from pinout.json', 'ok');
  } catch (e) {
    showStatus('Failed to read pinout.json: ' + e.message, 'err');
  }
}

function importConstraintFile(filepath) {
  try {
    var content = fs.readFileSync(filepath, 'utf8');
    document.getElementById('constraint-content').value = content;
    showStatus(
      'Imported constraint file (' + content.split('\n').length + ' lines)',
      'ok'
    );
  } catch (e) {
    showStatus('Failed to read constraint file: ' + e.message, 'err');
  }
}

function importRulesJson(filepath) {
  try {
    var rules = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    if (rules.input && rules.input[0]) {
      document.getElementById('rule-clk-port').value =
        rules.input[0].port || '';
      document.getElementById('rule-clk-pin').value = rules.input[0].pin || '';
    }
    if (rules.input && rules.input[1]) {
      document.getElementById('rule-rst-port').value =
        rules.input[1].port || '';
      document.getElementById('rule-rst-pin').value = rules.input[1].pin || '';
    }
    showStatus('Imported rules.json', 'ok');
  } catch (e) {
    showStatus('Failed to read rules.json: ' + e.message, 'err');
  }
}

// ============================================================
// Auto-generate constraint file from pinout table
// ============================================================
function generateConstraintFile() {
  if (!pinoutTable) return;
  var data = pinoutTable.getData();
  var arch = getSelectedArch();
  var lines = [];

  if (arch === 'ecp5') {
    lines.push('BLOCK RESETPATHS;');
    lines.push('BLOCK ASYNCPATHS;');
    lines.push('');
    data.forEach(function (row) {
      var name = row[1];
      var pin = row[2];
      var pull = row[3] || 'NONE';
      if (!name || !pin) return;
      lines.push('LOCATE COMP "' + name + '" SITE "' + pin + '";');
      lines.push(
        'IOBUF PORT "' + name + '" IO_TYPE=LVCMOS33 PULLMODE=' + pull + ';'
      );
    });
  } else {
    data.forEach(function (row) {
      var name = row[1];
      var pin = row[2];
      if (!name || !pin) return;
      lines.push('set_io --warn-no-port ' + name + ' ' + pin);
    });
  }
  document.getElementById('constraint-content').value = lines.join('\n');
  showStatus(
    'Constraint file generated (' +
      data.filter(function (r) {
        return r[1] && r[2];
      }).length +
      ' pins)',
    'ok'
  );
}

function getSelectedArch() {
  if (document.getElementById('fpga-new-toggle').checked) {
    return document.getElementById('fpga-new-arch').value;
  }
  var fpgaId = document.getElementById('fpga-select').value;
  if (fpgaId && apioFpgas[fpgaId]) return apioFpgas[fpgaId].arch || 'ice40';
  return 'ice40';
}

// ============================================================
// Wizard navigation
// ============================================================
function prevStep() {
  if (currentStep > 1) goToStep(currentStep - 1);
}

function nextStep() {
  var errors = validateStep(currentStep);
  if (errors.length > 0) {
    showStatus(errors[0], 'err');
    // Mark specific fields invalid
    highlightStepErrors(currentStep, errors);
    return;
  }
  clearStatus();
  if (currentStep < totalSteps) goToStep(currentStep + 1);
}

function goToStep(step) {
  document.querySelectorAll('.wizard-step').forEach(function (s) {
    s.classList.remove('active');
  });
  document.getElementById('step' + step).classList.add('active');

  document.querySelectorAll('.step-indicator').forEach(function (ind) {
    ind.classList.toggle(
      'active',
      parseInt(ind.getAttribute('data-step')) === step
    );
  });

  document.getElementById('btn-prev').disabled = step === 1;

  if (step === totalSteps) {
    document.getElementById('btn-next').classList.add('hidden');
    document.getElementById('btn-save').classList.remove('hidden');
    populateReview();
  } else {
    document.getElementById('btn-next').classList.remove('hidden');
    document.getElementById('btn-save').classList.add('hidden');
  }
  currentStep = step;
  clearStatus();
}

// ============================================================
// Validation
// ============================================================
function validateStep(step) {
  var errors = [];
  if (step === 1) {
    var idErr = validateBoardId(document.getElementById('board-id').value);
    if (idErr) errors.push(idErr);
    if (!document.getElementById('board-label').value.trim())
      errors.push('Board label is required');
    if (document.getElementById('fpga-new-toggle').checked) {
      if (!document.getElementById('fpga-new-id').value.trim())
        errors.push('New FPGA ID is required');
      if (!document.getElementById('fpga-new-type').value.trim())
        errors.push('FPGA Type is required');
      if (!document.getElementById('fpga-new-size').value.trim())
        errors.push('FPGA Size is required');
      if (!document.getElementById('fpga-new-pack').value.trim())
        errors.push('FPGA Package is required');
    } else {
      if (!document.getElementById('fpga-select').value)
        errors.push('Please select an FPGA');
    }
    var family =
      document.getElementById('fpga-family').value ||
      document.getElementById('fpga-family-custom').value.trim();
    if (!family) errors.push('FPGA Family is required');
    if (parseInt(document.getElementById('sys-clk').value) <= 0)
      errors.push('SysClk must be a positive number');
  }
  if (step === 2) {
    if (!pinoutTable) {
      errors.push('Pinout table not initialized');
      return errors;
    }
    var data = pinoutTable.getData().filter(function (r) {
      return r[1] || r[2];
    });
    if (data.length === 0) errors.push('At least one pin must be defined');
    data.forEach(function (row, i) {
      if (!['input', 'output', 'inout'].includes(row[0]))
        errors.push('Row ' + (i + 1) + ': invalid type "' + row[0] + '"');
      if (!row[1]) errors.push('Row ' + (i + 1) + ': name is required');
      if (!row[2]) errors.push('Row ' + (i + 1) + ': pin value is required');
    });
    if (!document.getElementById('constraint-content').value.trim())
      errors.push('Constraint file is required — import or auto-generate');
  }
  if (step === 3) {
    if (document.getElementById('programmer-new-toggle').checked) {
      if (!document.getElementById('prog-new-id').value.trim())
        errors.push('Programmer ID is required');
      if (!document.getElementById('prog-new-cmd').value.trim())
        errors.push('Programmer command is required');
    } else {
      if (!document.getElementById('programmer-select').value)
        errors.push('Please select a programmer');
    }
    var vid = document.getElementById('usb-vid').value.trim();
    var pid = document.getElementById('usb-pid').value.trim();
    if (vid && !/^[0-9a-fA-F]{4}$/.test(vid))
      errors.push('USB VID must be 4 hex chars');
    if (pid && !/^[0-9a-fA-F]{4}$/.test(pid))
      errors.push('USB PID must be 4 hex chars');
  }
  return errors;
}

function highlightStepErrors(step, errors) {
  // Mark specific fields red based on error text
  if (step === 1) {
    if (
      errors.some(function (e) {
        return e.toLowerCase().includes('board id');
      })
    ) {
      setFieldError(
        'board-id',
        'err-board-id',
        errors.find(function (e) {
          return e.toLowerCase().includes('board id');
        })
      );
    }
    if (
      errors.some(function (e) {
        return e.toLowerCase().includes('label');
      })
    ) {
      setFieldError('board-label', 'err-board-label', 'Required');
    }
    if (
      errors.some(function (e) {
        return (
          e.toLowerCase().includes('fpga') ||
          e.toLowerCase().includes('select an')
        );
      })
    ) {
      document.getElementById('fpga-select').classList.add('field-invalid');
    }
    if (
      errors.some(function (e) {
        return e.toLowerCase().includes('family');
      })
    ) {
      document.getElementById('fpga-family').classList.add('field-invalid');
    }
  }
  if (step === 2) {
    if (
      errors.some(function (e) {
        return e.toLowerCase().includes('pin') && !e.includes('Row');
      })
    ) {
      document.getElementById('err-pinout').textContent =
        'Define at least one pin';
    }
    if (
      errors.some(function (e) {
        return e.toLowerCase().includes('constraint');
      })
    ) {
      document
        .getElementById('constraint-content')
        .classList.add('field-invalid');
      document.getElementById('err-constraint').textContent = 'Required';
    }
  }
  if (step === 3) {
    if (
      errors.some(function (e) {
        return e.toLowerCase().includes('programmer');
      })
    ) {
      document
        .getElementById('programmer-select')
        .classList.add('field-invalid');
    }
  }
}

// ============================================================
// Build data objects
// ============================================================
function buildInfoJson() {
  var info = {
    label: document.getElementById('board-label').value.trim(),
    SysClkMhz: parseInt(document.getElementById('sys-clk').value) || 12,
    datasheet: document.getElementById('datasheet-url').value.trim(),
    interface: document.getElementById('board-interface').value,
    FPGAResources: {
      ffs: parseInt(document.getElementById('res-ffs').value) || 0,
      luts: parseInt(document.getElementById('res-luts').value) || 0,
      pios: parseInt(document.getElementById('res-pios').value) || 0,
      plbs: parseInt(document.getElementById('res-plbs').value) || 0,
      brams: parseInt(document.getElementById('res-brams').value) || 0,
    },
  };
  if (getSelectedArch() === 'ecp5') info.arch = 'ecp5';
  return info;
}

function buildPinoutJson() {
  if (!pinoutTable) return [];
  return pinoutTable
    .getData()
    .filter(function (row) {
      return row[1] && row[2];
    })
    .map(function (row) {
      var pin = { type: row[0] || 'input', name: row[1], value: row[2] };
      if (row[3]) pin.pullmode = row[3];
      return pin;
    });
}

function buildRulesJson() {
  var rules = { input: [], output: [] };
  var clkPort = document.getElementById('rule-clk-port').value.trim();
  var clkPin = document.getElementById('rule-clk-pin').value.trim();
  if (clkPort && clkPin) rules.input.push({ port: clkPort, pin: clkPin });
  var rstPort = document.getElementById('rule-rst-port').value.trim();
  var rstPin = document.getElementById('rule-rst-pin').value.trim();
  if (rstPort && rstPin) rules.input.push({ port: rstPort, pin: rstPin });
  return rules;
}

function buildApioBoardEntry() {
  var fpgaId = document.getElementById('fpga-new-toggle').checked
    ? document.getElementById('fpga-new-id').value.trim()
    : document.getElementById('fpga-select').value;
  var progType = document.getElementById('programmer-new-toggle').checked
    ? document.getElementById('prog-new-id').value.trim()
    : document.getElementById('programmer-select').value;

  var entry = {
    name: document.getElementById('board-label').value.trim(),
    fpga: fpgaId,
    programmer: { type: progType },
  };
  var extraArgs = document.getElementById('prog-extra-args').value.trim();
  if (extraArgs) entry.programmer.extra_args = extraArgs;
  var vid = document.getElementById('usb-vid').value.trim();
  var pid = document.getElementById('usb-pid').value.trim();
  if (vid && pid) entry.usb = { vid: vid, pid: pid };
  var ftdi = document.getElementById('ftdi-desc').value.trim();
  if (ftdi) entry.ftdi = { desc: ftdi };
  var tiny = document.getElementById('tinyprog-desc').value.trim();
  if (tiny) entry.tinyprog = { desc: tiny };
  return entry;
}

function getFamily() {
  return (
    document.getElementById('fpga-family').value ||
    document.getElementById('fpga-family-custom').value.trim()
  );
}

function getBoardId() {
  return document.getElementById('board-id').value.trim();
}

// ============================================================
// Review step
// ============================================================
function populateReview() {
  var allErrors = [];
  for (var s = 1; s <= 3; s++) allErrors = allErrors.concat(validateStep(s));

  var panel = document.getElementById('validation-panel');
  if (allErrors.length === 0) {
    panel.innerHTML =
      '<div class="val-ok">&#10003; All checks passed — ready to save.</div>';
  } else {
    panel.innerHTML =
      '<div class="val-err"><strong>Issues to fix before saving:</strong><ul>' +
      allErrors
        .map(function (e) {
          return '<li>' + escapeHtml(e) + '</li>';
        })
        .join('') +
      '</ul></div>';
  }

  var info = buildInfoJson();
  var pinout = buildPinoutJson();
  var rules = buildRulesJson();
  var apio = buildApioBoardEntry();
  var constraint = document.getElementById('constraint-content').value;

  document.getElementById('preview-info').textContent = JSON.stringify(
    info,
    null,
    2
  );

  var pinoutPreview = pinout.slice(0, 10);
  if (pinout.length > 10)
    pinoutPreview = pinoutPreview.concat([
      '... (' + (pinout.length - 10) + ' more)',
    ]);
  document.getElementById('preview-pinout').textContent = JSON.stringify(
    pinoutPreview,
    null,
    2
  );

  document.getElementById('preview-constraint').textContent =
    constraint.substring(0, 600) + (constraint.length > 600 ? '\n...' : '');
  document.getElementById('preview-rules').textContent = JSON.stringify(
    rules,
    null,
    2
  );
  document.getElementById('preview-apio-board').textContent = JSON.stringify(
    apio,
    null,
    2
  );
}

function escapeHtml(str) {
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ============================================================
// Save board
// ============================================================
function saveBoard() {
  var allErrors = [];
  for (var s = 1; s <= 3; s++) allErrors = allErrors.concat(validateStep(s));
  if (allErrors.length > 0) {
    showStatus('Fix errors before saving: ' + allErrors[0], 'err');
    return;
  }

  var boardId = getBoardId();
  var info = buildInfoJson();
  var pinout = buildPinoutJson();
  var rules = buildRulesJson();
  var constraintContent = document.getElementById('constraint-content').value;
  var apioEntry = buildApioBoardEntry();
  var family = getFamily();
  var constraintExt = getSelectedArch() === 'ecp5' ? 'lpf' : 'pcf';

  // Ensure custom-boards dir exists
  if (!fs.existsSync(customBoardsDir))
    fs.mkdirSync(customBoardsDir, { recursive: true });

  // Write board files to ~/.icestudio/custom-boards/{boardId}/
  var boardDir = path.join(customBoardsDir, boardId);
  if (!fs.existsSync(boardDir)) fs.mkdirSync(boardDir, { recursive: true });
  writeIfChanged(
    path.join(boardDir, 'info.json'),
    JSON.stringify(info, null, 2)
  );
  writeIfChanged(
    path.join(boardDir, 'pinout.json'),
    JSON.stringify(pinout, null, 2)
  );
  writeIfChanged(
    path.join(boardDir, 'pinout.' + constraintExt),
    constraintContent
  );
  writeIfChanged(
    path.join(boardDir, 'rules.json'),
    JSON.stringify(rules, null, 2)
  );

  // Build registry entry
  var registryEntry = {
    apio: { board: apioEntry, fpga: null, programmer: null },
    family: family,
  };

  if (document.getElementById('fpga-new-toggle').checked) {
    var fpgaId = document.getElementById('fpga-new-id').value.trim();
    var fpgaData = {
      arch: document.getElementById('fpga-new-arch').value,
      type: document.getElementById('fpga-new-type').value.trim(),
      size: document.getElementById('fpga-new-size').value.trim(),
      pack: document.getElementById('fpga-new-pack').value.trim(),
    };
    var idcode = document.getElementById('fpga-new-idcode').value.trim();
    if (idcode) fpgaData.idcode = idcode;
    registryEntry.apio.fpga = { id: fpgaId, data: fpgaData };
  }

  if (document.getElementById('programmer-new-toggle').checked) {
    var progId = document.getElementById('prog-new-id').value.trim();
    var progData = {
      command: document.getElementById('prog-new-cmd').value.trim(),
      args: document.getElementById('prog-new-args').value.trim(),
    };
    var pip = document.getElementById('prog-new-pip').value.trim();
    if (pip)
      progData.pip_packages = pip.split(',').map(function (s) {
        return s.trim();
      });
    registryEntry.apio.programmer = { id: progId, data: progData };
  }

  // If renaming while editing, remove old key
  if (editingBoardId && editingBoardId !== boardId) {
    delete customBoardsRegistry[editingBoardId];
  }
  customBoardsRegistry[boardId] = registryEntry;
  writeIfChanged(
    customBoardsJsonPath,
    JSON.stringify(customBoardsRegistry, null, 2)
  );

  // Patch apio resources
  patchApioResources();

  // Sync into icestudio board dirs (only writes if changed, so no grunt watch loop)
  syncIcestudioBoard(boardId, boardDir, family);

  // Refresh state
  editingBoardId = boardId;
  copyingBoardId = null;

  // Write selected board to profile so it is chosen after any grunt-triggered restart.
  // Always add the new board to ownedBoards so it appears checked in Board Collection.
  // If ownedBoards was empty (show-all mode), first populate it with all boards from
  // menu.json so no existing boards are hidden after switching to explicit-list mode.
  if (config.profilePath) {
    try {
      var profileData = {};
      try {
        profileData = JSON.parse(fs.readFileSync(config.profilePath, 'utf8'));
      } catch (e) {}
      profileData.board = boardId;
      var owned = (profileData.ownedBoards || []).slice();
      if (owned.length === 0) {
        // Populate with all boards currently in menu.json (syncIcestudioBoard already
        // added boardId there, so it will be included automatically).
        try {
          var menuData = JSON.parse(
            fs.readFileSync(icestudioMenuJsonPath, 'utf8')
          );
          menuData.forEach(function (f) {
            f.boards.forEach(function (b) {
              if (owned.indexOf(b) === -1) owned.push(b);
            });
          });
        } catch (e) {}
      }
      if (owned.indexOf(boardId) === -1) {
        owned.push(boardId);
      }
      profileData.ownedBoards = owned;
      writeIfChanged(config.profilePath, JSON.stringify(profileData, null, 2));
    } catch (e) {
      console.error('saveBoard: failed to update profile', e);
    }
  }

  // Tell the parent window which board to select after this window closes
  try {
    global.icestudioLastSavedBoard = boardId;
  } catch (e) {}

  // Close the window — parent's on('closed') handler will reload + select the board
  try {
    nw.Window.get().close();
  } catch (e) {
    // Fallback: stay open and show status if close fails
    loadIcestudioBoards();
    renderBoardList();
    showStatus('Board "' + boardId + '" saved.', 'ok');
  }
}

// Write file only if content has changed — prevents triggering grunt watch loop
function writeIfChanged(filepath, content) {
  try {
    var existing = '';
    try {
      existing = fs.readFileSync(filepath, 'utf8');
    } catch (e) {}
    if (existing !== content) fs.writeFileSync(filepath, content);
  } catch (e) {
    console.error('writeIfChanged failed for', filepath, e);
  }
}

// ============================================================
// Patch apio resources
// ============================================================
function patchApioResources() {
  if (!apioResourcesDir || !fs.existsSync(apioResourcesDir)) return;
  var boardIds = Object.keys(customBoardsRegistry);

  patchJsonFile(path.join(apioResourcesDir, 'boards.json'), function (data) {
    boardIds.forEach(function (id) {
      if (
        customBoardsRegistry[id].apio &&
        customBoardsRegistry[id].apio.board
      ) {
        data[id] = customBoardsRegistry[id].apio.board;
      }
    });
    return data;
  });

  patchJsonFile(path.join(apioResourcesDir, 'fpgas.json'), function (data) {
    boardIds.forEach(function (id) {
      if (customBoardsRegistry[id].apio && customBoardsRegistry[id].apio.fpga) {
        var f = customBoardsRegistry[id].apio.fpga;
        data[f.id] = f.data;
      }
    });
    return data;
  });

  patchJsonFile(
    path.join(apioResourcesDir, 'programmers.json'),
    function (data) {
      boardIds.forEach(function (id) {
        if (
          customBoardsRegistry[id].apio &&
          customBoardsRegistry[id].apio.programmer
        ) {
          var p = customBoardsRegistry[id].apio.programmer;
          data[p.id] = p.data;
        }
      });
      return data;
    }
  );

  patchJsonFile(path.join(apioResourcesDir, 'menu.json'), function (data) {
    boardIds.forEach(function (id) {
      var fam = customBoardsRegistry[id].family;
      if (!fam) return;
      var entry = data.find(function (f) {
        return f.type === fam;
      });
      if (entry) {
        if (entry.boards.indexOf(id) === -1) entry.boards.push(id);
      } else {
        data.push({ type: fam, boards: [id] });
      }
    });
    return data;
  });
}

function patchJsonFile(filepath, mutator) {
  try {
    var data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    var result = mutator(data);
    writeIfChanged(filepath, JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('patchJsonFile failed for', filepath, e);
  }
}

// ============================================================
// Sync a custom board into icestudio's resources/boards/
// ============================================================
function syncIcestudioBoard(boardId, srcDir, family) {
  var destDir = path.join(icestudioBoardsDir, boardId);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  [
    'info.json',
    'pinout.json',
    'rules.json',
    'pinout.pcf',
    'pinout.lpf',
  ].forEach(function (f) {
    var src = path.join(srcDir, f);
    if (!fs.existsSync(src)) return;
    var dest = path.join(destDir, f);
    var srcContent = fs.readFileSync(src, 'utf8');
    var destContent = '';
    try {
      destContent = fs.readFileSync(dest, 'utf8');
    } catch (e) {}
    if (srcContent !== destContent) fs.writeFileSync(dest, srcContent);
  });

  // Update icestudio menu.json — only write if changed
  patchJsonFile(icestudioMenuJsonPath, function (menu) {
    var fEntry = menu.find(function (f) {
      return f.type === family;
    });
    if (fEntry) {
      if (fEntry.boards.indexOf(boardId) === -1) fEntry.boards.push(boardId);
    } else {
      menu.push({ type: family, boards: [boardId] });
    }
    return menu;
  });
}

// ============================================================
// Board list sidebar — custom boards + ALL boards with copy
// ============================================================
function renderBoardList() {
  renderCustomBoardList();
  renderAllBoardList();
}

function renderCustomBoardList() {
  var list = document.getElementById('board-list-custom');
  list.innerHTML = '';

  var ids = Object.keys(customBoardsRegistry).sort();
  if (ids.length === 0) {
    var li = document.createElement('li');
    li.className = 'sidebar-empty';
    li.textContent = 'None yet';
    list.appendChild(li);
    return;
  }

  ids.forEach(function (id) {
    var li = document.createElement('li');
    li.className =
      'board-item custom-board' + (id === editingBoardId ? ' active' : '');

    var name = document.createElement('span');
    name.className = 'board-name';
    name.textContent = id;
    var label =
      customBoardsRegistry[id].apio && customBoardsRegistry[id].apio.board
        ? customBoardsRegistry[id].apio.board.name || id
        : id;
    name.title = label;

    var actions = document.createElement('span');
    actions.className = 'board-actions';

    var btnEdit = makeActionButton('Edit', false, function () {
      editBoard(id);
    });
    var btnCopy = makeActionButton('Copy', false, function () {
      copyCustomBoard(id);
    });
    var btnDel = makeActionButton('Del', true, function () {
      removeBoard(id);
    });
    actions.appendChild(btnEdit);
    actions.appendChild(btnCopy);
    actions.appendChild(btnDel);

    li.appendChild(name);
    li.appendChild(actions);
    list.appendChild(li);
  });
}

function renderAllBoardList() {
  var list = document.getElementById('board-list-all');
  list.innerHTML = '';

  if (icestudioAllBoards.length === 0) {
    var empty = document.createElement('li');
    empty.className = 'sidebar-empty';
    empty.textContent = 'No boards found';
    list.appendChild(empty);
    return;
  }

  // Group by family
  var families = {};
  icestudioAllBoards.forEach(function (b) {
    if (!families[b.family]) families[b.family] = [];
    families[b.family].push(b);
  });

  Object.keys(families)
    .sort()
    .forEach(function (family) {
      // Family header
      var header = document.createElement('li');
      header.className = 'board-family-header';
      header.textContent = family;
      list.appendChild(header);

      families[family].forEach(function (board) {
        var isCustom = !!customBoardsRegistry[board.name];
        var li = document.createElement('li');
        li.className =
          'board-item' +
          (isCustom ? ' custom-board' : '') +
          (board.name === editingBoardId ? ' active' : '');

        var name = document.createElement('span');
        name.className = 'board-name';
        name.textContent = board.label;
        name.title = board.name;

        var actions = document.createElement('span');
        actions.className = 'board-actions';

        if (isCustom) {
          // Custom board: show Edit/Del
          var btnEdit = makeActionButton(
            'Edit',
            false,
            (function (id) {
              return function () {
                editBoard(id);
              };
            })(board.name)
          );
          var btnDel = makeActionButton(
            'Del',
            true,
            (function (id) {
              return function () {
                removeBoard(id);
              };
            })(board.name)
          );
          actions.appendChild(btnEdit);
          actions.appendChild(btnDel);
        } else {
          // Built-in board: show Copy to use as template
          var btnCopy = makeActionButton(
            'Copy',
            false,
            (function (b) {
              return function () {
                copyBuiltinBoard(b);
              };
            })(board)
          );
          actions.appendChild(btnCopy);
        }

        li.appendChild(name);
        li.appendChild(actions);
        list.appendChild(li);
      });
    });
}

function makeActionButton(text, isDanger, onClick) {
  var btn = document.createElement('button');
  btn.className = 'btn-board-action' + (isDanger ? ' danger' : '');
  btn.textContent = text;
  btn.addEventListener('click', onClick);
  return btn;
}

// ============================================================
// Edit a custom board (load into wizard)
// ============================================================
function editBoard(boardId) {
  var entry = customBoardsRegistry[boardId];
  if (!entry) return;

  editingBoardId = boardId;
  copyingBoardId = null;

  document.getElementById('board-id').value = boardId;
  document.getElementById('board-id').disabled = false;

  var boardDir = path.join(customBoardsDir, boardId);
  loadBoardFilesIntoForm(boardDir);

  // FPGA
  if (entry.apio && entry.apio.fpga) {
    document.getElementById('fpga-new-toggle').checked = true;
    toggleHidden('fpga-new-fields', true);
    document.getElementById('fpga-new-id').value = entry.apio.fpga.id;
    document.getElementById('fpga-new-arch').value =
      entry.apio.fpga.data.arch || 'ice40';
    document.getElementById('fpga-new-type').value =
      entry.apio.fpga.data.type || '';
    document.getElementById('fpga-new-size').value =
      entry.apio.fpga.data.size || '';
    document.getElementById('fpga-new-pack').value =
      entry.apio.fpga.data.pack || '';
    document.getElementById('fpga-new-idcode').value =
      entry.apio.fpga.data.idcode || '';
  } else if (entry.apio && entry.apio.board) {
    document.getElementById('fpga-new-toggle').checked = false;
    toggleHidden('fpga-new-fields', false);
    document.getElementById('fpga-select').value = entry.apio.board.fpga || '';
  }

  // Family
  setFamilyValue(entry.family);

  // Programmer
  if (entry.apio && entry.apio.programmer) {
    document.getElementById('programmer-new-toggle').checked = true;
    toggleHidden('programmer-new-fields', true);
    document.getElementById('prog-new-id').value = entry.apio.programmer.id;
    document.getElementById('prog-new-cmd').value =
      entry.apio.programmer.data.command || '';
    document.getElementById('prog-new-args').value =
      entry.apio.programmer.data.args || '';
    var pip = entry.apio.programmer.data.pip_packages;
    document.getElementById('prog-new-pip').value = pip ? pip.join(', ') : '';
  } else if (entry.apio && entry.apio.board && entry.apio.board.programmer) {
    document.getElementById('programmer-new-toggle').checked = false;
    toggleHidden('programmer-new-fields', false);
    document.getElementById('programmer-select').value =
      entry.apio.board.programmer.type || '';
    document.getElementById('prog-extra-args').value =
      entry.apio.board.programmer.extra_args || '';
  }

  // USB / descriptors
  if (entry.apio && entry.apio.board) {
    var b = entry.apio.board;
    document.getElementById('usb-vid').value = b.usb ? b.usb.vid : '';
    document.getElementById('usb-pid').value = b.usb ? b.usb.pid : '';
    document.getElementById('ftdi-desc').value = b.ftdi ? b.ftdi.desc : '';
    document.getElementById('tinyprog-desc').value = b.tinyprog
      ? b.tinyprog.desc
      : '';
  }

  goToStep(1);
  renderBoardList();
}

// ============================================================
// Copy a built-in (non-custom) board as a template
// ============================================================
function copyBuiltinBoard(board) {
  clearForm();
  editingBoardId = null;
  copyingBoardId = board.name;

  // Leave board-id blank so user picks a new name
  document.getElementById('board-id').value = '';
  document.getElementById('board-id').disabled = false;

  // Load files from icestudio boards dir
  loadBoardFilesIntoForm(board.dir);

  // Try to infer FPGA from apio boards.json
  var apioEntry = apioBoards[board.name];
  if (apioEntry) {
    document.getElementById('fpga-new-toggle').checked = false;
    toggleHidden('fpga-new-fields', false);
    document.getElementById('fpga-select').value = apioEntry.fpga || '';
    if (apioEntry.programmer) {
      document.getElementById('programmer-new-toggle').checked = false;
      toggleHidden('programmer-new-fields', false);
      document.getElementById('programmer-select').value =
        apioEntry.programmer.type || '';
      document.getElementById('prog-extra-args').value =
        apioEntry.programmer.extra_args || '';
    }
    if (apioEntry.usb) {
      document.getElementById('usb-vid').value = apioEntry.usb.vid || '';
      document.getElementById('usb-pid').value = apioEntry.usb.pid || '';
    }
    if (apioEntry.ftdi)
      document.getElementById('ftdi-desc').value = apioEntry.ftdi.desc || '';
  }

  goToStep(1);
  renderBoardList();
  showStatus(
    'Loaded "' +
      board.label +
      '" as template — give it a new Board ID to save.',
    'ok'
  );
}

// ============================================================
// Copy a custom board
// ============================================================
function copyCustomBoard(boardId) {
  var entry = customBoardsRegistry[boardId];
  if (!entry) return;

  // Temporarily use editBoard logic but then clear the ID
  editBoard(boardId);
  editingBoardId = null;
  copyingBoardId = boardId;
  document.getElementById('board-id').value = '';
  showStatus(
    'Copied "' + boardId + '" as template — give it a new Board ID to save.',
    'ok'
  );
}

// ============================================================
// Helper: load board files from a directory into form fields
// ============================================================
function loadBoardFilesIntoForm(boardDir) {
  var infoPath = path.join(boardDir, 'info.json');
  var pinoutPath = path.join(boardDir, 'pinout.json');
  var pcfPath = path.join(boardDir, 'pinout.pcf');
  var lpfPath = path.join(boardDir, 'pinout.lpf');
  var rulesPath = path.join(boardDir, 'rules.json');

  if (fs.existsSync(infoPath)) importInfoJson(infoPath);
  if (fs.existsSync(pinoutPath)) importPinoutJson(pinoutPath);
  if (fs.existsSync(lpfPath)) importConstraintFile(lpfPath);
  else if (fs.existsSync(pcfPath)) importConstraintFile(pcfPath);
  if (fs.existsSync(rulesPath)) importRulesJson(rulesPath);
}

function setFamilyValue(family) {
  var sel = document.getElementById('fpga-family');
  var found = false;
  for (var i = 0; i < sel.options.length; i++) {
    if (sel.options[i].value === family) {
      sel.value = family;
      found = true;
      break;
    }
  }
  if (!found) {
    sel.value = '';
    document.getElementById('fpga-family-custom').value = family || '';
  }
}

// ============================================================
// New board (clear form)
// ============================================================
function newBoard() {
  clearForm();
  editingBoardId = null;
  copyingBoardId = null;
  document.getElementById('board-id').disabled = false;
  goToStep(1);
  renderBoardList();
}

function clearForm() {
  document.getElementById('board-id').value = '';
  document.getElementById('board-label').value = '';
  document.getElementById('fpga-select').value = '';
  document.getElementById('fpga-new-toggle').checked = false;
  toggleHidden('fpga-new-fields', false);
  [
    'fpga-new-id',
    'fpga-new-type',
    'fpga-new-size',
    'fpga-new-pack',
    'fpga-new-idcode',
  ].forEach(function (id) {
    document.getElementById(id).value = '';
  });
  document.getElementById('fpga-new-arch').value = 'ice40';
  document.getElementById('fpga-family').value = '';
  document.getElementById('fpga-family-custom').value = '';
  document.getElementById('sys-clk').value = '12';
  document.getElementById('board-interface').value = 'FTDI';
  document.getElementById('datasheet-url').value = '';
  ['res-ffs', 'res-luts', 'res-pios', 'res-plbs', 'res-brams'].forEach(
    function (id) {
      document.getElementById(id).value = '0';
    }
  );

  initPinoutTable();
  document.getElementById('constraint-content').value = '';
  document.getElementById('rule-clk-port').value = '';
  document.getElementById('rule-clk-pin').value = '';
  document.getElementById('rule-rst-port').value = '';
  document.getElementById('rule-rst-pin').value = '';

  document.getElementById('programmer-select').value = '';
  document.getElementById('programmer-new-toggle').checked = false;
  toggleHidden('programmer-new-fields', false);
  [
    'prog-new-id',
    'prog-new-cmd',
    'prog-new-args',
    'prog-new-pip',
    'prog-extra-args',
    'usb-vid',
    'usb-pid',
    'ftdi-desc',
    'tinyprog-desc',
  ].forEach(function (id) {
    document.getElementById(id).value = '';
  });

  // Clear all field errors
  document.querySelectorAll('.field-error').forEach(function (el) {
    el.textContent = '';
  });
  document.querySelectorAll('.field-invalid').forEach(function (el) {
    el.classList.remove('field-invalid');
  });
  clearStatus();
}

// ============================================================
// Remove board
// ============================================================
function removeBoard(boardId) {
  if (
    !confirm(
      'Remove custom board "' +
        boardId +
        '"?\n\nThis deletes its files and removes it from all configurations.'
    )
  )
    return;

  delete customBoardsRegistry[boardId];
  writeIfChanged(
    customBoardsJsonPath,
    JSON.stringify(customBoardsRegistry, null, 2)
  );

  // Remove custom board directory
  deleteDirRecursive(path.join(customBoardsDir, boardId));

  // Remove icestudio board directory
  deleteDirRecursive(path.join(icestudioBoardsDir, boardId));

  // Remove from icestudio menu.json
  patchJsonFile(icestudioMenuJsonPath, function (menu) {
    menu.forEach(function (f) {
      var i = f.boards.indexOf(boardId);
      if (i !== -1) f.boards.splice(i, 1);
    });
    return menu.filter(function (f) {
      return f.boards.length > 0;
    });
  });

  // Remove from apio resources
  if (apioResourcesDir && fs.existsSync(apioResourcesDir)) {
    patchJsonFile(path.join(apioResourcesDir, 'boards.json'), function (d) {
      delete d[boardId];
      return d;
    });
    patchJsonFile(path.join(apioResourcesDir, 'menu.json'), function (menu) {
      menu.forEach(function (f) {
        var i = f.boards.indexOf(boardId);
        if (i !== -1) f.boards.splice(i, 1);
      });
      return menu.filter(function (f) {
        return f.boards.length > 0;
      });
    });
  }

  // Remove from ownedBoards in profile.json
  if (config.profilePath) {
    try {
      var profileData = {};
      try {
        profileData = JSON.parse(fs.readFileSync(config.profilePath, 'utf8'));
      } catch (e) {}
      var owned = profileData.ownedBoards || [];
      var idx = owned.indexOf(boardId);
      if (idx !== -1) {
        owned.splice(idx, 1);
        profileData.ownedBoards = owned;
        writeIfChanged(
          config.profilePath,
          JSON.stringify(profileData, null, 2)
        );
      }
    } catch (e) {
      console.error('removeBoard: failed to update ownedBoards', e);
    }
  }

  if (editingBoardId === boardId) {
    editingBoardId = null;
    clearForm();
  }

  loadIcestudioBoards();
  renderBoardList();
  showStatus('Board "' + boardId + '" removed.', 'ok');
}

function deleteDirRecursive(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  fs.readdirSync(dirPath).forEach(function (file) {
    var p = path.join(dirPath, file);
    if (fs.statSync(p).isDirectory()) deleteDirRecursive(p);
    else fs.unlinkSync(p);
  });
  fs.rmdirSync(dirPath);
}
