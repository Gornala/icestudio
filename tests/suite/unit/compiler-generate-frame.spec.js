'use strict';
/**
 * Unit tests for the generate-frame compiler path in compiler/verilog.js.
 *
 * A generate frame (basic.generate) wraps contained blocks in a Verilog
 * generate-for loop.  The compiler emits:
 *   1. A wrapper frame module (e.g. main_gen_vgen001) with the generate loop
 *   2. An inner iteration module (main_gen_vgen001_iter) compiled from the
 *      contained blocks + artificial port blocks
 *
 * digestId note: 'gen001' has no dash → 'v' + 'gen001'.substring(0,6) = 'vgen001' (7 chars).
 *
 * Known compiler bug (documented by failing test marked KNOWN BUG):
 *   Contained code blocks are double-emitted — once at top level as main_vcode01
 *   (because the code-module loop runs before compileGenerateFrame sets
 *   _genContained), and again inside main_gen_vgen001_iter as
 *   main_gen_vgen001_iter_vcode01.  The test below that asserts the top-level
 *   module does NOT appear is expected to fail until the bug is fixed.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../../..');
const W = {};

/* eslint-disable no-new-func */
function loadScript(relPath) {
  const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  new Function('window', code)(W);
}
/* eslint-enable no-new-func */

// Real SHA1 digestId — the compiler creates internal IDs like 'gen-input-0'
// with dashes, so the no-dash shortcut alone is insufficient.
function digestId(id) {
  if (id.indexOf('-') !== -1) {
    return (
      'v' + crypto.createHash('sha1').update(id).digest('hex').substring(0, 6)
    );
  }
  return 'v' + id.substring(0, 6);
}

var compile; // verilogCompiler(name, project)

beforeAll(function () {
  loadScript('app/scripts/services/blocks/constants.js');
  loadScript('app/scripts/services/compiler/helpers.js');
  loadScript('app/scripts/services/compiler/verilog.js');

  var B = W._iceblocks;
  var helpersCtx = {
    blocks: B,
    utils: { digestId: digestId },
    common: { selectedBoard: { info: {}, rules: { output: [] } } },
    _package: { version: 'test' },
  };
  var helpers = W._icecompiler.helpers(helpersCtx);

  var vCtx = {
    blocks: B,
    utils: {
      digestId: digestId,
      clone: function (obj) {
        return JSON.parse(JSON.stringify(obj));
      },
      normalizeVerilogName: function (str) {
        return str.replace(/[^a-zA-Z0-9_]/g, '_');
      },
    },
    common: {
      selectedBoard: {
        info: { SysClkMhz: undefined },
        rules: { output: [] },
      },
    },
    currentLibrary: {},
    module: helpers.module,
    findBlock: helpers.findBlock,
    getInitPorts: helpers.getInitPorts,
    getInitPins: helpers.getInitPins,
  };

  compile = W._icecompiler.verilog(vCtx).verilogCompiler;
});

// ── Fixture builders ──────────────────────────────────────────────────────────

function makeProject(blocks, wires) {
  return {
    design: { board: '', graph: { blocks: blocks || [], wires: wires || [] } },
    package: { name: '', version: '', description: '', author: '', image: '' },
    dependencies: {},
  };
}

function inputBlock(id, opts) {
  opts = opts || {};
  return {
    id: id,
    type: 'basic.input',
    data: {
      name: opts.name || id,
      virtual: false,
      range: opts.range || '',
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
      virtual: false,
      range: opts.range || '',
      pins: [{ index: '0', value: opts.pin || 'D1' }],
    },
  };
}

// Generate frame block with position and size (required for containment check)
function generateFrame(id, opts) {
  opts = opts || {};
  return {
    id: id,
    type: 'basic.generate',
    data: {
      label: opts.label || 'gen_' + id,
      instanceCount: opts.instanceCount !== undefined ? opts.instanceCount : 4,
      ports: opts.ports || { in: [], out: [] },
    },
    position: opts.position || { x: 0, y: 0 },
    size: opts.size || { width: 400, height: 400 },
  };
}

// Code block placed INSIDE the frame rect (default: 50,50 within 0,0,400,400)
function containedCode(id, opts) {
  opts = opts || {};
  return {
    id: id,
    type: 'basic.code',
    data: {
      label: opts.label || id,
      params: opts.params || [],
      ports: {
        in: opts.portsIn || [],
        out: opts.portsOut || [],
      },
      code: opts.code || '',
    },
    position: opts.position || { x: 50, y: 50 },
    size: opts.size || { width: 100, height: 100 },
  };
}

// Constant block (parameter source). Constants carry no size in the saved
// project, so they are never seen as "contained" by the frame rect check.
function constantBlock(id, opts) {
  opts = opts || {};
  return {
    id: id,
    type: 'basic.constant',
    data: {
      name: opts.name || id,
      value: opts.value !== undefined ? opts.value : 0,
      local: false,
    },
    position: opts.position || { x: 10, y: 10 },
  };
}

// Parameter wire: constant block → target block parameter port
function paramWire(constId, tgtId, tgtPort) {
  return {
    source: { block: constId, port: 'constant-out' },
    target: { block: tgtId, port: tgtPort },
  };
}

// Boundary-in wire: frame internal port → contained block port
function bndIn(frameId, portName, containedId, containedPort, size) {
  var w = {
    source: { block: frameId, port: portName + '-int' },
    target: { block: containedId, port: containedPort },
  };
  if (size) {
    w.size = size;
  }
  return w;
}

// Boundary-out wire: contained block port → frame internal port
function bndOut(containedId, containedPort, frameId, portName, size) {
  var w = {
    source: { block: containedId, port: containedPort },
    target: { block: frameId, port: portName + '-int' },
  };
  if (size) {
    w.size = size;
  }
  return w;
}

// External wire into frame
function extIn(srcId, srcPort, frameId, portName) {
  return {
    source: { block: srcId, port: srcPort },
    target: { block: frameId, port: portName + '-ext' },
  };
}

// External wire out of frame
function extOut(frameId, portName, tgtId, tgtPort) {
  return {
    source: { block: frameId, port: portName + '-ext' },
    target: { block: tgtId, port: tgtPort },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
// digestId('gen001') = 'v' + 'gen001'.substring(0,6) = 'vgen001'
// genvar name      = 'gen_i_vgen001'
// wrapper name     = 'main_gen_vgen001'
// iter name        = 'main_gen_vgen001_iter'

describe('basic generate frame structure', function () {
  var output;
  beforeAll(function () {
    output = compile(
      'main',
      makeProject([
        generateFrame('gen001', {
          label: 'myloop',
          instanceCount: 3,
          ports: { in: [], out: [] },
        }),
        containedCode('code01', { code: '' }),
      ])
    );
  });

  test('wrapper frame module is emitted', function () {
    expect(output).toContain('main_gen_vgen001');
  });

  test('inner iteration module is emitted', function () {
    expect(output).toContain('main_gen_vgen001_iter');
  });

  test('genvar is declared', function () {
    expect(output).toContain('genvar gen_i_vgen001');
  });

  test('generate keyword is emitted', function () {
    expect(output).toContain('generate');
  });

  test('for loop uses correct instance count', function () {
    expect(output).toContain('gen_i_vgen001 < 3');
  });

  test('for loop label matches frame label', function () {
    expect(output).toContain('begin : myloop');
  });

  test('endgenerate is emitted', function () {
    expect(output).toContain('endgenerate');
  });

  test('wrapper instance appears in parent module', function () {
    expect(output).toContain('main_gen_vgen001 vgen001');
  });
});

describe('wrapper frame port widths', function () {
  test('iterable input port total width = iterSize × m', function () {
    // iterSize=1, m=4 → [3:0]
    var output = compile(
      'main',
      makeProject(
        [
          generateFrame('gen001', {
            instanceCount: 4,
            ports: {
              in: [{ name: 'data_in', genMode: 'iterable', size: 1 }],
              out: [],
            },
          }),
          containedCode('code01', { portsIn: [{ name: 'a' }], code: '' }),
        ],
        [bndIn('gen001', 'data_in', 'code01', 'a')]
      )
    );
    expect(output).toMatch(/input\s+\[3:0\]\s+data_in/);
  });

  test('direct input port total width = iterSize only (no ×m)', function () {
    // genMode 'direct', iterSize=1, m=4 → 1 bit → no range qualifier
    var output = compile(
      'main',
      makeProject(
        [
          generateFrame('gen001', {
            instanceCount: 4,
            ports: {
              in: [{ name: 'clk', genMode: 'direct', size: 1 }],
              out: [],
            },
          }),
          containedCode('code01', { portsIn: [{ name: 'c' }], code: '' }),
        ],
        [bndIn('gen001', 'clk', 'code01', 'c')]
      )
    );
    expect(output).toMatch(/input\s+clk/);
    expect(output).not.toMatch(/input\s+\[\d+:\d+\]\s+clk/);
  });

  test('iterative output port total width = iterSize × m', function () {
    // iterSize=1, m=4 → [3:0]
    var output = compile(
      'main',
      makeProject(
        [
          generateFrame('gen001', {
            instanceCount: 4,
            ports: {
              in: [],
              out: [{ name: 'q_out', genMode: 'iterative', size: 1 }],
            },
          }),
          containedCode('code01', { portsOut: [{ name: 'y' }], code: '' }),
        ],
        [bndOut('code01', 'y', 'gen001', 'q_out')]
      )
    );
    expect(output).toMatch(/output\s+\[3:0\]\s+q_out/);
  });

  test('multi-bit iterable port: total width = iterSize × m', function () {
    // iterSize=4 (wire.size=4), m=3 → 12 bits → [11:0]
    var output = compile(
      'main',
      makeProject(
        [
          generateFrame('gen001', {
            instanceCount: 3,
            ports: {
              in: [{ name: 'bus_in', genMode: 'iterable', size: 4 }],
              out: [],
            },
          }),
          containedCode('code01', { portsIn: [{ name: 'b' }], code: '' }),
        ],
        [bndIn('gen001', 'bus_in', 'code01', 'b', 4)]
      )
    );
    expect(output).toMatch(/input\s+\[11:0\]\s+bus_in/);
  });
});

describe('generate loop port connections', function () {
  test('single-bit iterable input uses array indexing in instantiation', function () {
    var output = compile(
      'main',
      makeProject(
        [
          generateFrame('gen001', {
            instanceCount: 3,
            ports: {
              in: [{ name: 'data_in', genMode: 'iterable', size: 1 }],
              out: [],
            },
          }),
          containedCode('code01', { portsIn: [{ name: 'a' }], code: '' }),
        ],
        [bndIn('gen001', 'data_in', 'code01', 'a')]
      )
    );
    expect(output).toContain('data_in[gen_i_vgen001]');
  });

  test('multi-bit iterable input uses +: slicing in instantiation', function () {
    var output = compile(
      'main',
      makeProject(
        [
          generateFrame('gen001', {
            instanceCount: 3,
            ports: {
              in: [{ name: 'bus_in', genMode: 'iterable', size: 4 }],
              out: [],
            },
          }),
          containedCode('code01', { portsIn: [{ name: 'b' }], code: '' }),
        ],
        [bndIn('gen001', 'bus_in', 'code01', 'b', 4)]
      )
    );
    expect(output).toContain('bus_in[gen_i_vgen001*4 +: 4]');
  });

  test('direct input passes through without indexing', function () {
    var output = compile(
      'main',
      makeProject(
        [
          generateFrame('gen001', {
            instanceCount: 4,
            ports: {
              in: [{ name: 'clk', genMode: 'direct', size: 1 }],
              out: [],
            },
          }),
          containedCode('code01', { portsIn: [{ name: 'c' }], code: '' }),
        ],
        [bndIn('gen001', 'clk', 'code01', 'c')]
      )
    );
    // Direct port: passed as-is, no bracket indexing
    expect(output).toContain('(clk)');
    expect(output).not.toContain('clk[gen_i_vgen001]');
  });

  test('single-bit iterative output uses array indexing in instantiation', function () {
    var output = compile(
      'main',
      makeProject(
        [
          generateFrame('gen001', {
            instanceCount: 3,
            ports: {
              in: [],
              out: [{ name: 'q_out', genMode: 'iterative', size: 1 }],
            },
          }),
          containedCode('code01', { portsOut: [{ name: 'y' }], code: '' }),
        ],
        [bndOut('code01', 'y', 'gen001', 'q_out')]
      )
    );
    expect(output).toContain('q_out[gen_i_vgen001]');
  });
});

describe('muxed output mode', function () {
  // m=4 → sel needs ⌈log2(4)⌉ = 2 bits
  var output;
  beforeAll(function () {
    output = compile(
      'main',
      makeProject(
        [
          generateFrame('gen001', {
            instanceCount: 4,
            ports: {
              in: [],
              out: [{ name: 'result', genMode: 'muxed', size: 1 }],
            },
          }),
          containedCode('code01', { portsOut: [{ name: 'y' }], code: '' }),
        ],
        [bndOut('code01', 'y', 'gen001', 'result')]
      )
    );
  });

  test('internal _all wire is declared', function () {
    expect(output).toContain('result_all');
  });

  test('sel input port is added with ⌈log2(m)⌉ bits', function () {
    expect(output).toMatch(/input\s+\[1:0\]\s+result_sel/);
  });

  test('mux assign selects from _all using sel', function () {
    expect(output).toContain('assign result = result_all[result_sel]');
  });
});

describe('OR-reduce output mode', function () {
  var output;
  beforeAll(function () {
    output = compile(
      'main',
      makeProject(
        [
          generateFrame('gen001', {
            instanceCount: 4,
            ports: {
              in: [],
              out: [{ name: 'any_hit', genMode: 'or', size: 1 }],
            },
          }),
          containedCode('code01', { portsOut: [{ name: 'h' }], code: '' }),
        ],
        [bndOut('code01', 'h', 'gen001', 'any_hit')]
      )
    );
  });

  test('internal _all wire is declared', function () {
    expect(output).toContain('any_hit_all');
  });

  test('OR-reduce assign is emitted', function () {
    expect(output).toContain('assign any_hit = |any_hit_all');
  });

  test('no sel input port for OR-reduce', function () {
    expect(output).not.toContain('any_hit_sel');
  });
});

describe('containment detection', function () {
  test('code block inside frame rect is compiled inside iter sub-module', function () {
    // code01 at (50,50) is inside frame at (0,0,400,400)
    var output = compile(
      'main',
      makeProject([
        generateFrame('gen001', {
          instanceCount: 2,
          ports: { in: [], out: [] },
        }),
        containedCode('code01', {
          position: { x: 50, y: 50 },
          size: { width: 100, height: 100 },
        }),
      ])
    );
    // The contained code block module should appear under the iter module name
    expect(output).toContain('main_gen_vgen001_iter_vcode01');
  });

  // KNOWN BUG: Contained code blocks are double-emitted.
  // The code-module loop in verilogCompiler runs BEFORE compileGenerateFrame
  // sets _genContained on the block, so main_vcode01 is also emitted at the
  // top level.  This test documents the DESIRED behavior (no top-level module)
  // and will fail until the bug is fixed.
  test('KNOWN BUG: code block inside frame should NOT be emitted at top level', function () {
    var output = compile(
      'main',
      makeProject([
        generateFrame('gen001', {
          instanceCount: 2,
          ports: { in: [], out: [] },
        }),
        containedCode('code01', {
          position: { x: 50, y: 50 },
          size: { width: 100, height: 100 },
        }),
      ])
    );
    expect(output).not.toContain('module main_vcode01');
  });

  test('code block outside frame rect is compiled as top-level module', function () {
    // code01 at (500,500) is OUTSIDE frame at (0,0,400,400)
    var output = compile(
      'main',
      makeProject([
        generateFrame('gen001', {
          instanceCount: 2,
          ports: { in: [], out: [] },
        }),
        {
          id: 'code01',
          type: 'basic.code',
          data: {
            label: 'Escaped',
            params: [],
            ports: { in: [], out: [] },
            code: '',
          },
          position: { x: 500, y: 500 },
          size: { width: 100, height: 100 },
        },
      ])
    );
    expect(output).toContain('module main_vcode01');
  });

  test('code block with no position is NOT contained (treated as top-level)', function () {
    // isBlockInsideRect returns false when block has no position/size
    var output = compile(
      'main',
      makeProject([
        generateFrame('gen001', {
          instanceCount: 2,
          ports: { in: [], out: [] },
        }),
        {
          id: 'code01',
          type: 'basic.code',
          data: {
            label: 'NoPosBlock',
            params: [],
            ports: { in: [], out: [] },
            code: '',
          },
          // intentionally no position or size
        },
      ])
    );
    expect(output).toContain('module main_vcode01');
  });
});

describe('frame with external wiring in parent', function () {
  var output;
  beforeAll(function () {
    output = compile(
      'main',
      makeProject(
        [
          inputBlock('inp001', { name: 'in_data' }),
          outputBlock('out001', { name: 'out_data' }),
          generateFrame('gen001', {
            instanceCount: 3,
            label: 'pipe',
            ports: {
              in: [{ name: 'data_in', genMode: 'iterable', size: 1 }],
              out: [{ name: 'data_out', genMode: 'iterative', size: 1 }],
            },
          }),
          containedCode('code01', {
            portsIn: [{ name: 'a' }],
            portsOut: [{ name: 'y' }],
            code: 'assign y = a;',
          }),
        ],
        [
          extIn('inp001', 'out', 'gen001', 'data_in'),
          bndIn('gen001', 'data_in', 'code01', 'a'),
          bndOut('code01', 'y', 'gen001', 'data_out'),
          extOut('gen001', 'data_out', 'out001', 'in'),
        ]
      )
    );
  });

  test('top module has standard input and output ports', function () {
    expect(output).toContain('vinp001');
    expect(output).toContain('vout001');
  });

  test('frame instance appears in top module', function () {
    expect(output).toContain('main_gen_vgen001 vgen001');
  });

  test('frame instance is wired to the input port', function () {
    expect(output).toContain('.data_in(');
  });

  test('frame instance is wired to the output port', function () {
    expect(output).toContain('.data_out(');
  });

  test('contained code block logic ends up in iter sub-module', function () {
    expect(output).toContain('assign y = a');
  });

  test('iter sub-module instantiates the contained code block', function () {
    expect(output).toContain('main_gen_vgen001_iter_vcode01');
  });
});

describe('iteration module port widths', function () {
  // The inner iteration module ports are built from artificial input/output
  // blocks named 'gen-input-N' / 'gen-output-N'.  Their width must come from
  // the boundary wire, otherwise a bus collapses to a single bit and the
  // frame instantiation truncates it.
  var inPort = digestId('gen-input-0');

  test('bus boundary input declares the full range in the iter module', function () {
    var output = compile(
      'main',
      makeProject(
        [
          generateFrame('gen001', {
            instanceCount: 4,
            ports: {
              in: [
                {
                  name: 'phase',
                  genMode: 'direct',
                  size: 32,
                  range: '[31:0]',
                },
              ],
              out: [],
            },
          }),
          containedCode('code01', {
            portsIn: [{ name: 'PHASE_ACC', range: '[31:0]', size: 32 }],
            code: '',
          }),
        ],
        [bndIn('gen001', 'phase', 'code01', 'PHASE_ACC', 32)]
      )
    );
    expect(output).toMatch(
      new RegExp('input\\s+\\[31:0\\]\\s+' + inPort + '\\b')
    );
  });

  test('single-bit boundary input has no range in the iter module', function () {
    var output = compile(
      'main',
      makeProject(
        [
          generateFrame('gen001', {
            instanceCount: 4,
            ports: {
              in: [{ name: 'clk', genMode: 'direct', size: 1 }],
              out: [],
            },
          }),
          containedCode('code01', { portsIn: [{ name: 'CLK' }], code: '' }),
        ],
        [bndIn('gen001', 'clk', 'code01', 'CLK')]
      )
    );
    expect(output).toMatch(new RegExp('input\\s+' + inPort + '\\b'));
    expect(output).not.toMatch(
      new RegExp('input\\s+\\[\\d+:\\d+\\]\\s+' + inPort + '\\b')
    );
  });

  test('bus boundary output declares the full range in the iter module', function () {
    var outPort = digestId('gen-output-0');
    var output = compile(
      'main',
      makeProject(
        [
          generateFrame('gen001', {
            instanceCount: 2,
            ports: {
              in: [],
              out: [{ name: 'sum', genMode: 'iterative', size: 8 }],
            },
          }),
          containedCode('code01', {
            portsOut: [{ name: 'Y', range: '[7:0]', size: 8 }],
            code: '',
          }),
        ],
        [bndOut('code01', 'Y', 'gen001', 'sum', 8)]
      )
    );
    expect(output).toMatch(
      new RegExp('output\\s+\\[7:0\\]\\s+' + outPort + '\\b')
    );
  });
});

describe('parameters crossing the frame boundary', function () {
  // A constant placed outside the frame that feeds a parameter of a block
  // inside it.  Parameters are not signals, so they never travel through a
  // frame port: the constant must be replicated inside the iter module.
  var output;
  beforeAll(function () {
    output = compile(
      'main',
      makeProject(
        [
          constantBlock('cst001', { name: 'N', value: 32 }),
          generateFrame('gen001', {
            instanceCount: 4,
            ports: { in: [], out: [] },
          }),
          containedCode('code01', {
            params: [{ name: 'N' }],
            code: 'reg [N-1:0] acc;',
          }),
        ],
        [paramWire('cst001', 'code01', 'N')]
      )
    );
  });

  test('iter module declares the replicated constant as a parameter', function () {
    expect(output).toMatch(
      new RegExp(
        'module main_gen_vgen001_iter[\\s\\S]*?parameter ' +
          digestId('cst001') +
          ' = 32'
      )
    );
  });

  test('contained code block is instantiated with the parameter override', function () {
    expect(output).toMatch(/main_gen_vgen001_iter_vcode01 #\(\s*\.N\(p\d+\)/);
  });

  test('parent module does not keep a dangling localparam for it', function () {
    var parent = output.split('module main_gen_vgen001')[0];
    expect(parent).not.toContain('localparam');
  });
});

describe('instanceCount edge cases', function () {
  test('default instanceCount is 4 when not specified', function () {
    var output = compile(
      'main',
      makeProject([
        generateFrame('gen001', { ports: { in: [], out: [] } }), // no instanceCount → default 4
        containedCode('code01'),
      ])
    );
    expect(output).toContain('gen_i_vgen001 < 4');
  });

  test('instanceCount of 1 produces a loop from 0 to 1', function () {
    var output = compile(
      'main',
      makeProject([
        generateFrame('gen001', {
          instanceCount: 1,
          ports: { in: [], out: [] },
        }),
        containedCode('code01'),
      ])
    );
    expect(output).toContain('gen_i_vgen001 < 1');
  });
});
