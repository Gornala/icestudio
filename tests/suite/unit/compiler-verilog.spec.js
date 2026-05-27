'use strict';
/**
 * Unit tests for the Verilog compiler (compiler/verilog.js + compiler/helpers.js).
 *
 * Scripts are loaded via new Function('window', code)(W) so they bind their
 * window.* globals to a local object W, completely decoupled from Node's global.
 *
 * Block IDs in fixtures have no dashes so digestId() is predictable:
 *   digestId(id) = 'v' + id.substring(0, 6)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');

const W = {}; // shared window-like object across all loaded scripts

/* eslint-disable no-new-func */
function loadScript(relPath) {
  const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  new Function('window', code)(W);
}
/* eslint-enable no-new-func */

// digestId stub — mirrors misc.service.js without the SHA-1 dependency.
// Test IDs must not contain '-'.
function digestId(id) {
  if (id.indexOf('-') !== -1) {
    throw new Error('Test block IDs must not contain dashes: "' + id + '"');
  }
  return 'v' + id.substring(0, 6);
}

var compile; // verilogCompiler(name, project, opt) — set in beforeAll

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

function makeProject(blocks, wires, deps) {
  return {
    design: { board: '', graph: { blocks: blocks || [], wires: wires || [] } },
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
      virtual: opts.virtual || false,
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
      virtual: opts.virtual || false,
      range: opts.range || '',
      pins: [{ index: '0', value: opts.pin || 'D1' }],
    },
  };
}

function codeBlock(id, opts) {
  opts = opts || {};
  return {
    id: id,
    type: 'basic.code',
    data: {
      label: opts.label || id,
      params: [],
      ports: {
        in: opts.portsIn || [],
        out: opts.portsOut || [],
      },
      code: opts.code || '',
    },
  };
}

function wire(fromBlock, fromPort, toBlock, toPort) {
  return {
    source: { block: fromBlock, port: fromPort },
    target: { block: toBlock, port: toPort },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('empty canvas', function () {
  var output;
  beforeAll(function () {
    output = compile('main', makeProject());
  });

  test('emits module declaration', function () {
    expect(output).toContain('module main');
  });

  test('emits endmodule', function () {
    expect(output).toContain('endmodule');
  });

  test('has no ports', function () {
    expect(output).not.toMatch(/\binput\b/);
    expect(output).not.toMatch(/\boutput\b/);
  });

  test('has no wires', function () {
    expect(output).not.toContain('wire ');
  });
});

describe('single input block', function () {
  var output;
  beforeAll(function () {
    output = compile(
      'main',
      makeProject([inputBlock('inp001', { name: 'clk' })])
    );
  });

  test('emits input port', function () {
    expect(output).toMatch(/\binput\b/);
  });

  test('port name is digested block id', function () {
    // digestId('inp001') = 'v' + 'inp001' = 'vinp001'
    expect(output).toContain('vinp001');
  });

  test('has no output ports', function () {
    expect(output).not.toMatch(/\boutput\b/);
  });
});

describe('input + output with connecting wire', function () {
  var output;
  beforeAll(function () {
    var blocks = [
      inputBlock('inp001', { name: 'my_in', pin: 'D0' }),
      outputBlock('out001', { name: 'my_out', pin: 'D1' }),
    ];
    var wires = [wire('inp001', 'out', 'out001', 'in')];
    output = compile('main', makeProject(blocks, wires));
  });

  test('declares both ports', function () {
    expect(output).toContain('vinp001');
    expect(output).toContain('vout001');
  });

  test('input port direction is input', function () {
    expect(output).toMatch(/input\s+vinp001/);
  });

  test('output port direction is output', function () {
    expect(output).toMatch(/output\s+vout001/);
  });

  test('declares a wire for the connection', function () {
    expect(output).toContain('wire w0');
  });

  test('assigns input to wire', function () {
    expect(output).toContain('assign w0 = vinp001');
  });

  test('assigns wire to output', function () {
    expect(output).toContain('assign vout001 = w0');
  });
});

describe('bus-width input', function () {
  test('includes range in port declaration', function () {
    var blocks = [inputBlock('inp001', { name: 'data', range: '[7:0]' })];
    var output = compile('main', makeProject(blocks));
    expect(output).toContain('[7:0]');
  });

  test('wire for a bus connection carries the bus range', function () {
    var blocks = [
      inputBlock('inp001', { name: 'data', range: '[7:0]' }),
      outputBlock('out001', { name: 'leds' }),
    ];
    var wires = [wire('inp001', 'out', 'out001', 'in')];
    var output = compile('main', makeProject(blocks, wires));
    expect(output).toMatch(/wire\s+\[7:0\]/);
  });
});

describe('code block', function () {
  var output;
  beforeAll(function () {
    var blocks = [
      inputBlock('inp001', { name: 'clk', pin: 'C1' }),
      codeBlock('code01', {
        label: 'Passthrough',
        portsIn: [{ name: 'clk_in' }],
        portsOut: [{ name: 'q_out' }],
        code: 'assign q_out = clk_in;',
      }),
      outputBlock('out001', { name: 'led', pin: 'D1' }),
    ];
    var wires = [
      wire('inp001', 'out', 'code01', 'clk_in'),
      wire('code01', 'q_out', 'out001', 'in'),
    ];
    output = compile('main', makeProject(blocks, wires));
  });

  test('emits a submodule named after the code block', function () {
    // digestId('code01') = 'vcode01', so module name = 'main_vcode01'
    expect(output).toContain('main_vcode01');
  });

  test('code block module declares its input port', function () {
    expect(output).toMatch(/input\s+clk_in/);
  });

  test('code block module declares its output port', function () {
    expect(output).toMatch(/output\s+q_out/);
  });

  test('code body appears in the submodule', function () {
    expect(output).toContain('assign q_out = clk_in');
  });

  test('instantiates the submodule in the top module', function () {
    expect(output).toMatch(/main_vcode01\s+vcode01\s*\(/);
  });

  test('instance wires up the input port', function () {
    expect(output).toContain('.clk_in(w0)');
  });

  test('instance wires up the output port', function () {
    expect(output).toContain('.q_out(w1)');
  });
});

describe('virtual input + output', function () {
  var output;
  beforeAll(function () {
    var blocks = [
      inputBlock('inp001', { name: 'sig', virtual: true, pin: '' }),
      outputBlock('out001', { name: 'led', virtual: true, pin: '' }),
    ];
    var wires = [wire('inp001', 'out', 'out001', 'in')];
    output = compile('main', makeProject(blocks, wires));
  });

  test('still declares both ports in the Verilog module', function () {
    expect(output).toContain('vinp001');
    expect(output).toContain('vout001');
  });

  test('still emits an assign', function () {
    expect(output).toContain('assign');
  });
});

describe('fanout: one source driving two outputs', function () {
  var output;
  beforeAll(function () {
    var blocks = [
      inputBlock('inp001', { name: 'sig' }),
      outputBlock('out001', { name: 'led1', pin: 'D0' }),
      outputBlock('out002', { name: 'led2', pin: 'D1' }),
    ];
    var wires = [
      wire('inp001', 'out', 'out001', 'in'),
      wire('inp001', 'out', 'out002', 'in'),
    ];
    output = compile('main', makeProject(blocks, wires));
  });

  test('assigns both output ports', function () {
    expect(output).toContain('assign vout001');
    expect(output).toContain('assign vout002');
  });

  test('emits dedup assign for the shared source', function () {
    // Second wire shares source with first; compiler emits 'assign w1 = w0;'
    expect(output).toContain('assign w1 = w0');
  });
});

// ── JSON input block ──────────────────────────────────────────────────────────

function jsonInputBlock(id, opts) {
  opts = opts || {};
  return {
    id: id,
    type: 'basic.jsonInput',
    data: {
      content: opts.content !== undefined ? opts.content : '{}',
      ports: opts.ports || [],
    },
  };
}

describe('JSON input block — module parameters', function () {
  test('JSON input block emits module parameter for each port', function () {
    // digestId('json01') = 'vjson01', port 'div' → parameter vjson01_div = 4
    var output = compile(
      'main',
      makeProject([
        jsonInputBlock('json01', { content: '{"div":4}', ports: ['div'] }),
      ])
    );
    expect(output).toContain('parameter vjson01_div = 4');
  });

  test('missing key in JSON content defaults parameter to 0', function () {
    var output = compile(
      'main',
      makeProject([jsonInputBlock('json01', { content: '{}', ports: ['div'] })])
    );
    expect(output).toContain('parameter vjson01_div = 0');
  });

  test('malformed JSON content defaults all parameters to 0', function () {
    var output = compile(
      'main',
      makeProject([
        jsonInputBlock('json01', { content: 'not-valid-json', ports: ['div'] }),
      ])
    );
    expect(output).toContain('parameter vjson01_div = 0');
  });

  test('JSON input port wired to code block generates localparam bridge', function () {
    var blocks = [
      jsonInputBlock('json01', { content: '{"div":4}', ports: ['div'] }),
      codeBlock('code01', {
        portsIn: [{ name: 'clk_in' }],
        portsOut: [{ name: 'q_out' }],
        code: '// passthrough',
      }),
    ];
    var wires = [
      {
        source: { block: 'json01', port: 'div' },
        target: { block: 'code01', port: 'clk_div' },
      },
    ];
    var output = compile('main', makeProject(blocks, wires));
    expect(output).toContain('localparam p0 = vjson01_div');
    expect(output).toContain('.clk_div(p0)');
  });
});

describe('constant block — code block parameter wiring', function () {
  test('constant wired via constant-out generates localparam', function () {
    var blocks = [
      {
        id: 'const1',
        type: 'basic.constant',
        data: { name: 'CLKDIV', value: '4', local: false },
      },
      codeBlock('code01', {
        portsIn: [{ name: 'clk_in' }],
        portsOut: [{ name: 'q' }],
        code: '',
      }),
    ];
    var wires = [
      {
        source: { block: 'const1', port: 'constant-out' },
        target: { block: 'code01', port: 'clk_div' },
      },
    ];
    var output = compile('main', makeProject(blocks, wires));
    // digestId('const1') = 'vconst1'
    expect(output).toContain('localparam p0 = vconst1');
  });

  test('code block instance includes #() parameter referencing the localparam', function () {
    var blocks = [
      {
        id: 'const1',
        type: 'basic.constant',
        data: { name: 'CLKDIV', value: '4', local: false },
      },
      codeBlock('code01', {
        portsIn: [{ name: 'clk_in' }],
        portsOut: [{ name: 'q' }],
        code: '',
      }),
    ];
    var wires = [
      {
        source: { block: 'const1', port: 'constant-out' },
        target: { block: 'code01', port: 'clk_div' },
      },
    ];
    var output = compile('main', makeProject(blocks, wires));
    expect(output).toContain('.clk_div(p0)');
    expect(output).toContain('main_vcode01 #(');
  });
});

describe('inout port direction', function () {
  test('input block with inout:true emits inout (not input) in module', function () {
    var block = {
      id: 'inp001',
      type: 'basic.input',
      data: {
        name: 'sda',
        virtual: false,
        range: '',
        pins: [{ index: '0', value: 'D0' }],
        inout: true,
      },
    };
    var output = compile('main', makeProject([block]));
    // digestId('inp001') = 'vinp001'
    expect(output).toMatch(/\binout\b.*\bvinp001\b/);
    expect(output).not.toMatch(/\binput\b.*\bvinp001\b/);
  });
});

describe('info and info-frame blocks are ignored', function () {
  test('info block produces no ports and no instance', function () {
    var info = {
      id: 'info01',
      type: 'basic.info',
      data: { info: 'a comment' },
    };
    var output = compile('main', makeProject([info]));
    expect(output).not.toContain('info01');
    expect(output).toContain('module main');
    expect(output).toContain('endmodule');
  });

  test('info-frame block produces no ports and no instance', function () {
    var frame = {
      id: 'frm001',
      type: 'basic.infoFrame',
      data: { info: 'a frame' },
    };
    var output = compile('main', makeProject([frame]));
    expect(output).not.toContain('frm001');
    expect(output).toContain('module main');
    expect(output).toContain('endmodule');
  });

  test('info block alongside valid input block does not affect input output', function () {
    var blocks = [
      inputBlock('inp001', { name: 'clk' }),
      { id: 'info01', type: 'basic.info', data: { info: 'label' } },
    ];
    var output = compile('main', makeProject(blocks));
    expect(output).toContain('vinp001');
    expect(output).not.toMatch(/\binput\b.*\binfo01\b/);
  });
});
