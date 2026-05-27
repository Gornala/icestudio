'use strict';
/**
 * Unit tests for compiler/testbench.js — testbenchCompiler(project).
 *
 * The testbench wraps the main module in a simulation harness:
 *   - reg declarations for every input
 *   - wire declarations for every output
 *   - 'main MAIN (...)' instantiation
 *   - initial begin / $dumpfile / $finish
 *   - automatic clock generator when an input is named 'clk'
 *   - localparam + #() parameters for non-local constant blocks
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

var testbench; // testbenchCompiler(project)

beforeAll(function () {
  loadScript('app/scripts/services/blocks/constants.js');
  loadScript('app/scripts/services/compiler/helpers.js');
  loadScript('app/scripts/services/compiler/testbench.js');

  var B = W._iceblocks;
  var helpersCtx = {
    blocks: B,
    utils: { digestId: digestId },
    common: { selectedBoard: { info: {}, rules: { output: [] } } },
    _package: { version: 'test' },
  };
  var helpers = W._icecompiler.helpers(helpersCtx);

  var tCtx = {
    blocks: B,
    utils: { digestId: digestId },
    module: helpers.module,
    mainIO: helpers.mainIO,
  };
  testbench = W._icecompiler.testbench(tCtx).testbenchCompiler;
});

// ── Fixture builders ──────────────────────────────────────────────────────────

function makeProject(blocks, deps) {
  return {
    design: { graph: { blocks: blocks || [], wires: [] } },
    package: { name: '', version: '', description: '', author: '', image: '' },
    dependencies: deps || {},
  };
}

function inputBlock(id, opts) {
  opts = opts || {};
  return {
    id: id,
    type: 'basic.input',
    data: {
      name: opts.name || id,
      range: opts.range || '',
      virtual: false,
      pins: [{ index: '0', value: opts.pin || 'D0' }],
    },
  };
}

function outputBlock(id, opts) {
  opts = opts || {};
  return {
    id: id,
    type: 'basic.output',
    data: {
      name: opts.name || id,
      range: opts.range || '',
      virtual: false,
      pins: [{ index: '0', value: opts.pin || 'D1' }],
    },
  };
}

function constantBlock(id, opts) {
  opts = opts || {};
  return {
    id: id,
    type: 'basic.constant',
    data: {
      name: opts.name || id,
      value: opts.value || '0',
      local: opts.local || false,
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('testbench boilerplate', function () {
  var output;
  beforeAll(function () {
    output = testbench(makeProject());
  });

  test('emits timescale and default_nettype directives', function () {
    expect(output).toContain('`timescale');
    expect(output).toContain('`default_nettype none');
  });

  test('wraps output in module main_tb', function () {
    expect(output).toContain('module main_tb');
    expect(output).toContain('endmodule');
  });

  test('declares DURATION parameter', function () {
    expect(output).toContain('parameter DURATION = 10');
  });

  test('initial block has $dumpfile', function () {
    expect(output).toContain('$dumpfile');
  });

  test('initial block has $dumpvars for main_tb', function () {
    expect(output).toContain('$dumpvars(0, main_tb)');
  });

  test('initial block ends with $finish', function () {
    expect(output).toContain('$finish');
  });

  test('has end-of-auto-generated marker', function () {
    expect(output).toContain('END AUTO-GENERATED');
  });
});

describe('input signals', function () {
  var output;
  beforeAll(function () {
    output = testbench(makeProject([inputBlock('inp001', { name: 'enable' })]));
  });

  test('declares input as reg', function () {
    expect(output).toMatch(/\breg\b.*\benable\b/);
  });

  test('connects input port in instance', function () {
    // digestId('inp001') = 'vinp001'
    expect(output).toContain('.vinp001(enable)');
  });

  test('initialises input to 0 in initial block', function () {
    expect(output).toContain('enable = 0;');
  });

  test('instance uses main MAIN', function () {
    expect(output).toContain('main MAIN');
  });
});

describe('output signals', function () {
  var output;
  beforeAll(function () {
    output = testbench(makeProject([outputBlock('out001', { name: 'led' })]));
  });

  test('declares output as wire', function () {
    expect(output).toMatch(/\bwire\b.*\bled\b/);
  });

  test('connects output port in instance', function () {
    // digestId('out001') = 'vout001'
    expect(output).toContain('.vout001(led)');
  });

  test('output is not initialised in initial block (only regs are)', function () {
    expect(output).not.toContain('led = 0');
  });
});

describe('bus signals', function () {
  test('bus input declares reg with range', function () {
    var output = testbench(
      makeProject([inputBlock('inp001', { name: 'data', range: '[7:0]' })])
    );
    expect(output).toMatch(/reg\s+\[7:0\]\s+data/);
  });

  test('bus output declares wire with range', function () {
    var output = testbench(
      makeProject([outputBlock('out001', { name: 'result', range: '[3:0]' })])
    );
    expect(output).toMatch(/wire\s+\[3:0\]\s+result/);
  });
});

describe('clock detection', function () {
  test('input named clk generates always block', function () {
    var output = testbench(
      makeProject([inputBlock('inp001', { name: 'clk' })])
    );
    expect(output).toContain('always #0.5 clk = ~clk');
  });

  test('input named CLK (uppercase) does generate always block (case-insensitive check)', function () {
    // toLowerCase() matches 'CLK' → hasClk=true, but the block hardcodes lowercase 'clk'
    var output = testbench(
      makeProject([inputBlock('inp001', { name: 'CLK' })])
    );
    expect(output).toContain('always #0.5 clk = ~clk');
  });

  test('input not named clk does not generate always block', function () {
    var output = testbench(
      makeProject([inputBlock('inp001', { name: 'reset' })])
    );
    expect(output).not.toContain('always #0.5');
  });

  test('empty canvas has no always block', function () {
    var output = testbench(makeProject([]));
    expect(output).not.toContain('always #0.5');
  });
});

describe('constant block parameters', function () {
  test('non-local constant emits localparam and passes it via #()', function () {
    var output = testbench(
      makeProject([
        constantBlock('const1', { name: 'freq', value: '12', local: false }),
      ])
    );
    expect(output).toContain('localparam constant_freq = 12');
    expect(output).toContain('.vconst1(constant_freq)');
  });

  test('local constant is excluded from testbench parameters', function () {
    var output = testbench(
      makeProject([
        constantBlock('const1', { name: 'freq', value: '12', local: true }),
      ])
    );
    expect(output).not.toContain('localparam constant_freq');
    expect(output).not.toContain('.vconst1');
  });

  test('unnamed constant gets auto-numbered name', function () {
    var block = {
      id: 'const1',
      type: 'basic.constant',
      data: { name: '', value: '7', local: false },
    };
    var output = testbench(makeProject([block]));
    expect(output).toContain('localparam constant_0 = 7');
  });

  test('two constants with same name get unique suffixes', function () {
    var output = testbench(
      makeProject([
        constantBlock('con001', { name: 'val', value: '1', local: false }),
        constantBlock('con002', { name: 'val', value: '2', local: false }),
      ])
    );
    expect(output).toContain('localparam constant_val = 1');
    expect(output).toContain('localparam constant_val_2 = 2');
  });
});

describe('combined input + output circuit', function () {
  var output;
  beforeAll(function () {
    output = testbench(
      makeProject([
        inputBlock('inp001', { name: 'clk' }),
        inputBlock('inp002', { name: 'reset', pin: 'D2' }),
        outputBlock('out001', { name: 'led' }),
      ])
    );
  });

  test('declares both inputs as reg', function () {
    expect(output).toMatch(/\breg\b.*\bclk\b/);
    expect(output).toMatch(/\breg\b.*\breset\b/);
  });

  test('declares output as wire', function () {
    expect(output).toMatch(/\bwire\b.*\bled\b/);
  });

  test('instance ports connect all signals', function () {
    expect(output).toContain('.vinp001(clk)');
    expect(output).toContain('.vinp002(reset)');
    expect(output).toContain('.vout001(led)');
  });

  test('initial block initialises all inputs to 0', function () {
    expect(output).toContain('clk = 0;');
    expect(output).toContain('reset = 0;');
  });
});
