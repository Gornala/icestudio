'use strict';
/**
 * Unit tests for compiler/constraints.js — pcfCompiler and lpfCompiler.
 *
 * PCF (iCE40): maps each input/output block to 'set_io <name> <pin>'
 * LPF (ECP5):  maps to 'LOCATE COMP / IOBUF PORT' with pull-mode from pinout
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const W = {};

/* eslint-disable no-new-func */
function loadScript(relPath) {
  const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  new Function('window', code)(W);
}
/* eslint-enable no-new-func */

function digestId(id) {
  if (id.indexOf('-') !== -1) {
    throw new Error('Test IDs must not contain dashes: "' + id + '"');
  }
  return 'v' + id.substring(0, 6);
}

var pcfCompiler;
var lpfCompiler;

// Mock pinout used for LPF tests
var MOCK_PINOUT = [
  { value: 'D0', pullmode: 'UP' },
  { value: 'D1', pullmode: 'DOWN' },
  { value: 'D2', pullmode: 'NONE' },
  { value: 'D3', pullmode: 'UP' },
];

beforeAll(function () {
  loadScript('app/scripts/services/blocks/constants.js');
  loadScript('app/scripts/services/compiler/helpers.js');
  loadScript('app/scripts/services/compiler/constraints.js');

  var B = W._iceblocks;
  var helpersCtx = {
    blocks: B,
    utils: { digestId: digestId },
    common: { selectedBoard: { info: {}, rules: { output: [] } } },
    _package: { version: 'test' },
  };
  var helpers = W._icecompiler.helpers(helpersCtx);

  var constraintsCtx = {
    blocks: B,
    utils: { digestId: digestId },
    common: {
      selectedBoard: {
        name: 'TestBoard',
        rules: { output: [] },
        info: {},
        pinout: MOCK_PINOUT,
      },
    },
    getInitPorts: helpers.getInitPorts,
    getInitPins: helpers.getInitPins,
  };
  var mod = W._icecompiler.constraints(constraintsCtx);
  pcfCompiler = mod.pcfCompiler;
  lpfCompiler = mod.lpfCompiler;
});

// ── Fixture builders ──────────────────────────────────────────────────────────

function makeProject(blocks) {
  return {
    design: { graph: { blocks: blocks || [], wires: [] } },
    dependencies: {},
  };
}

function inputBlock(id, opts) {
  opts = opts || {};
  var pin = opts.hasOwnProperty('pin') ? opts.pin : 'D0';
  return {
    id: id,
    type: 'basic.input',
    data: {
      name: opts.name || id,
      virtual: opts.virtual || false,
      pins: opts.pins || [{ index: '0', value: pin }],
    },
  };
}

function outputBlock(id, opts) {
  opts = opts || {};
  var pin = opts.hasOwnProperty('pin') ? opts.pin : 'D1';
  return {
    id: id,
    type: 'basic.output',
    data: {
      name: opts.name || id,
      virtual: opts.virtual || false,
      pins: opts.pins || [{ index: '0', value: pin }],
    },
  };
}

// ── PCF tests ─────────────────────────────────────────────────────────────────

describe('PCF — empty canvas', function () {
  test('produces empty string', function () {
    expect(pcfCompiler(makeProject())).toBe('');
  });
});

describe('PCF — single-pin blocks', function () {
  test('input block maps to set_io with its pin', function () {
    var output = pcfCompiler(
      makeProject([inputBlock('inp001', { pin: 'D0' })])
    );
    // digestId('inp001') = 'vinp001'
    expect(output).toContain('set_io vinp001 D0');
  });

  test('output block maps to set_io with its pin', function () {
    var output = pcfCompiler(
      makeProject([outputBlock('out001', { pin: 'D1' })])
    );
    expect(output).toContain('set_io vout001 D1');
  });

  test('both input and output appear', function () {
    var output = pcfCompiler(
      makeProject([
        inputBlock('inp001', { pin: 'D0' }),
        outputBlock('out001', { pin: 'D1' }),
      ])
    );
    expect(output).toContain('set_io vinp001 D0');
    expect(output).toContain('set_io vout001 D1');
  });

  test('each entry ends with a newline', function () {
    var output = pcfCompiler(
      makeProject([inputBlock('inp001', { pin: 'D0' })])
    );
    expect(output).toMatch(/set_io vinp001 D0\n/);
  });
});

describe('PCF — virtual blocks', function () {
  test('virtual input emits set_io with empty pin value', function () {
    var output = pcfCompiler(
      makeProject([inputBlock('inp001', { virtual: true, pin: '' })])
    );
    // virtual pin → value = '' → 'set_io vinp001 '
    expect(output).toContain('set_io vinp001 ');
    expect(output).not.toContain('set_io vinp001 D');
  });

  test('virtual output emits set_io with empty pin value', function () {
    var output = pcfCompiler(
      makeProject([outputBlock('out001', { virtual: true, pin: '' })])
    );
    expect(output).toContain('set_io vout001 ');
  });
});

describe('PCF — multi-pin (bus) blocks', function () {
  test('multi-pin input uses indexed notation', function () {
    var block = inputBlock('bus001', {
      pins: [
        { index: '0', value: 'D0' },
        { index: '1', value: 'D1' },
      ],
    });
    var output = pcfCompiler(makeProject([block]));
    expect(output).toContain('set_io vbus001[0] D0');
    expect(output).toContain('set_io vbus001[1] D1');
  });

  test('multi-pin output uses indexed notation', function () {
    var block = outputBlock('led001', {
      pins: [
        { index: '0', value: 'D2' },
        { index: '1', value: 'D3' },
      ],
    });
    var output = pcfCompiler(makeProject([block]));
    expect(output).toContain('set_io vled001[0] D2');
    expect(output).toContain('set_io vled001[1] D3');
  });
});

describe('PCF — non-port blocks are ignored', function () {
  test('info block produces no PCF output', function () {
    var blocks = [
      inputBlock('inp001', { pin: 'D0' }),
      { id: 'info01', type: 'basic.info', data: { info: 'comment' } },
    ];
    var output = pcfCompiler(makeProject(blocks));
    expect(output).toBe('set_io vinp001 D0\n');
  });
});

// ── LPF tests ─────────────────────────────────────────────────────────────────

describe('LPF — single-pin blocks', function () {
  test('input with pullmode UP emits LOCATE COMP and IOBUF PORT with PULLMODE=UP', function () {
    // D0 has pullmode 'UP' in MOCK_PINOUT
    var output = lpfCompiler(
      makeProject([inputBlock('inp001', { pin: 'D0' })])
    );
    expect(output).toContain('LOCATE COMP "vinp001" SITE "D0"');
    expect(output).toContain('IOBUF PORT "vinp001"');
    expect(output).toContain('PULLMODE=UP');
  });

  test('output with pullmode NONE emits PULLMODE=NONE', function () {
    // D2 has pullmode 'NONE' in MOCK_PINOUT
    var output = lpfCompiler(
      makeProject([outputBlock('out001', { pin: 'D2' })])
    );
    expect(output).toContain('LOCATE COMP "vout001" SITE "D2"');
    expect(output).toContain('PULLMODE=NONE');
  });

  test('LPF header contains board name', function () {
    var output = lpfCompiler(makeProject([]));
    expect(output).toContain('TestBoard');
  });
});

describe('LPF — multi-pin bus blocks', function () {
  test('each pin gets its own LOCATE and IOBUF pair', function () {
    var block = inputBlock('bus001', {
      pins: [
        { index: '0', value: 'D0' },
        { index: '1', value: 'D1' },
      ],
    });
    var output = lpfCompiler(makeProject([block]));
    expect(output).toContain('LOCATE COMP "vbus001[0]" SITE "D0"');
    expect(output).toContain('LOCATE COMP "vbus001[1]" SITE "D1"');
    expect(output).toContain('IOBUF PORT "vbus001[0]"');
    expect(output).toContain('IOBUF PORT "vbus001[1]"');
  });
});
