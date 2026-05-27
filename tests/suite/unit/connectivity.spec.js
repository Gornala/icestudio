'use strict';
/**
 * Unit tests for connectivity.js (collectErrors logic).
 *
 * Strategy: the browser scripts reference `window` and `alertify` as globals.
 * We load them with new Function('window', 'alertify', code)(W, ALERTIFY) so
 * those names are bound to our local objects without needing the real global
 * scope. All scripts share the same W object, so cross-script references like
 * `var B = window._iceblocks` resolve correctly.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');

// Shared 'window' object for all loaded scripts
const W = {};
// Shared alertify stub — mockClear()ed between tests
const ALERTIFY = { error: jest.fn() };

/* eslint-disable no-new-func */
function loadScript(relPath) {
  const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  new Function('window', 'alertify', code)(W, ALERTIFY);
}
/* eslint-enable no-new-func */

// ── One-time setup ────────────────────────────────────────────────────────────

beforeAll(function () {
  loadScript('app/scripts/services/blocks/constants.js');
  loadScript('app/scripts/services/tools/connectivity.js');
});

beforeEach(function () {
  ALERTIFY.error.mockClear();
});

// ── Fixture helpers ───────────────────────────────────────────────────────────

function project(blocks, wires, deps) {
  return {
    design: { graph: { blocks: blocks || [], wires: wires || [] } },
    dependencies: deps || {},
  };
}

function inputBlock(id, opts) {
  opts = opts || {};
  var pinValue = opts.hasOwnProperty('pin') ? opts.pin : 'D0';
  return {
    id: id,
    type: 'basic.input',
    data: {
      name: opts.name || id,
      virtual: opts.virtual || false,
      pins:
        opts.pins !== undefined ? opts.pins : [{ index: '0', value: pinValue }],
    },
  };
}

function outputBlock(id, opts) {
  opts = opts || {};
  var pinValue = opts.hasOwnProperty('pin') ? opts.pin : 'D1';
  return {
    id: id,
    type: 'basic.output',
    data: {
      name: opts.name || id,
      virtual: opts.virtual || false,
      pins:
        opts.pins !== undefined ? opts.pins : [{ index: '0', value: pinValue }],
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
      ports: {
        in: opts.portsIn || [],
        out: opts.portsOut || [],
      },
      code: opts.code || '',
    },
  };
}

function inputLabel(id, name) {
  return { id: id, type: 'basic.inputLabel', data: { name: name } };
}

function outputLabel(id, name) {
  return { id: id, type: 'basic.outputLabel', data: { name: name } };
}

function wire(fromBlock, fromPort, toBlock, toPort) {
  return {
    source: { block: fromBlock, port: fromPort || 'out' },
    target: { block: toBlock, port: toPort || 'in' },
  };
}

// Simple {{key}} interpolation matching gettextCatalog.getString
function getString(template, vars) {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, function (_, k) {
    return vars[k] !== undefined ? vars[k] : '';
  });
}

// Creates a fresh module instance and calls checkConnections
function run(proj) {
  var ctx = {
    project: {
      snapshot: jest.fn(),
      update: jest.fn(),
      get: jest.fn(function () {
        return proj;
      }),
      restoreSnapshot: jest.fn(),
    },
    graph: { errorHighlightCells: jest.fn() },
    gettextCatalog: { getString: getString },
  };
  return W._icetools.connectivity(ctx).checkConnections();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('empty / valid circuits', function () {
  test('empty canvas resolves with no errors', function () {
    return expect(run(project())).resolves.toBeUndefined();
  });

  test('input with valid pin resolves', function () {
    return expect(run(project([inputBlock('in1')]))).resolves.toBeUndefined();
  });

  test('input + output connected by wire resolves', function () {
    return expect(
      run(
        project(
          [inputBlock('in1'), outputBlock('out1')],
          [wire('in1', 'out', 'out1', 'in')]
        )
      )
    ).resolves.toBeUndefined();
  });

  test('multiple inputs and outputs all valid', function () {
    return expect(
      run(
        project(
          [
            inputBlock('in1'),
            inputBlock('in2', { pin: 'D2' }),
            outputBlock('out1'),
            outputBlock('out2', { pin: 'D3' }),
          ],
          [wire('in1', 'out', 'out1', 'in'), wire('in2', 'out', 'out2', 'in')]
        )
      )
    ).resolves.toBeUndefined();
  });
});

describe('input block errors', function () {
  test('NULL pin value reports error', async function () {
    await expect(
      run(project([inputBlock('in1', { pin: 'NULL' })]))
    ).rejects.toThrow('Undriven inputs');
    expect(ALERTIFY.error).toHaveBeenCalledWith(
      expect.stringContaining('has no physical pin assigned'),
      30
    );
  });

  test('empty pin string reports error', async function () {
    await expect(
      run(project([inputBlock('in1', { pin: '' })]))
    ).rejects.toThrow('Undriven inputs');
    expect(ALERTIFY.error).toHaveBeenCalledWith(
      expect.stringContaining('has no physical pin assigned'),
      30
    );
  });

  test('error message includes the block name', async function () {
    await expect(
      run(project([inputBlock('in1', { name: 'my_clock', pin: '' })]))
    ).rejects.toThrow();
    var [msg] = ALERTIFY.error.mock.calls[0];
    expect(msg).toContain('my_clock');
  });

  test('virtual input skips pin check even with no pin', function () {
    return expect(
      run(project([inputBlock('in1', { virtual: true, pin: '' })]))
    ).resolves.toBeUndefined();
  });

  test('virtual input with NULL pin still passes', function () {
    return expect(
      run(project([inputBlock('in1', { virtual: true, pin: 'NULL' })]))
    ).resolves.toBeUndefined();
  });
});

describe('output block errors', function () {
  test('output with no driving wire reports "not driven"', async function () {
    await expect(run(project([outputBlock('out1')]))).rejects.toThrow(
      'Undriven inputs'
    );
    expect(ALERTIFY.error).toHaveBeenCalledWith(
      expect.stringContaining('is not driven'),
      30
    );
  });

  test('output with NULL pin reports pin error', async function () {
    await expect(
      run(
        project(
          [inputBlock('in1'), outputBlock('out1', { pin: 'NULL' })],
          [wire('in1', 'out', 'out1', 'in')]
        )
      )
    ).rejects.toThrow('Undriven inputs');
    expect(ALERTIFY.error).toHaveBeenCalledWith(
      expect.stringContaining('has no physical pin assigned'),
      30
    );
  });

  test('output with empty pin reports pin error', async function () {
    await expect(
      run(
        project(
          [inputBlock('in1'), outputBlock('out1', { pin: '' })],
          [wire('in1', 'out', 'out1', 'in')]
        )
      )
    ).rejects.toThrow('Undriven inputs');
    expect(ALERTIFY.error).toHaveBeenCalledWith(
      expect.stringContaining('has no physical pin assigned'),
      30
    );
  });

  test('undriven output with no pin reports both errors', async function () {
    await expect(
      run(project([outputBlock('out1', { pin: '' })]))
    ).rejects.toThrow('Undriven inputs');
    var [msg] = ALERTIFY.error.mock.calls[0];
    expect(msg).toContain('is not driven');
    expect(msg).toContain('has no physical pin assigned');
  });

  test('virtual output skips pin check', function () {
    return expect(
      run(
        project(
          [inputBlock('in1'), outputBlock('out1', { virtual: true, pin: '' })],
          [wire('in1', 'out', 'out1', 'in')]
        )
      )
    ).resolves.toBeUndefined();
  });
});

describe('label blocks', function () {
  test('input label driven by wire passes', function () {
    return expect(
      run(
        project(
          [inputBlock('in1'), inputLabel('lbl1', 'sig')],
          [wire('in1', 'out', 'lbl1', 'inlabel')]
        )
      )
    ).resolves.toBeUndefined();
  });

  test('input label not wired reports error', async function () {
    await expect(run(project([inputLabel('lbl1', 'sig')]))).rejects.toThrow(
      'Undriven inputs'
    );
    expect(ALERTIFY.error).toHaveBeenCalledWith(
      expect.stringContaining('is not connected to any signal'),
      30
    );
  });

  test('output label with matching input label passes', function () {
    return expect(
      run(
        project(
          [
            inputBlock('in1'),
            inputLabel('lbl1', 'sig'),
            outputLabel('lbl2', 'sig'),
          ],
          [wire('in1', 'out', 'lbl1', 'inlabel')]
        )
      )
    ).resolves.toBeUndefined();
  });

  test('output label with no matching input label reports error', async function () {
    await expect(run(project([outputLabel('lbl2', 'sig')]))).rejects.toThrow(
      'Undriven inputs'
    );
    expect(ALERTIFY.error).toHaveBeenCalledWith(
      expect.stringContaining('has no matching input label'),
      30
    );
  });

  test('error message includes the label name', async function () {
    await expect(
      run(project([outputLabel('lbl2', 'my_signal')]))
    ).rejects.toThrow();
    var [msg] = ALERTIFY.error.mock.calls[0];
    expect(msg).toContain('my_signal');
  });
});

describe('code blocks', function () {
  test('code block with all input ports driven resolves', function () {
    var code = codeBlock('code1', {
      portsIn: [{ name: 'a' }, { name: 'b' }],
      portsOut: [{ name: 'y' }],
    });
    return expect(
      run(
        project(
          [
            inputBlock('in1'),
            inputBlock('in2', { pin: 'D2' }),
            code,
            outputBlock('out1'),
          ],
          [
            wire('in1', 'out', 'code1', 'a'),
            wire('in2', 'out', 'code1', 'b'),
            wire('code1', 'y', 'out1', 'in'),
          ]
        )
      )
    ).resolves.toBeUndefined();
  });

  test('code block with undriven input port reports error', async function () {
    var code = codeBlock('code1', { portsIn: [{ name: 'a' }] });
    await expect(run(project([code]))).rejects.toThrow('Undriven inputs');
    expect(ALERTIFY.error).toHaveBeenCalledWith(
      expect.stringContaining('input port "a" is not driven'),
      30
    );
  });

  test('error names both the code block label and the port', async function () {
    var code = codeBlock('code1', {
      label: 'MyMux',
      portsIn: [{ name: 'sel' }],
    });
    await expect(run(project([code]))).rejects.toThrow();
    var [msg] = ALERTIFY.error.mock.calls[0];
    expect(msg).toContain('MyMux');
    expect(msg).toContain('sel');
  });

  test('port with a default value is not flagged', function () {
    var code = codeBlock('code1', {
      portsIn: [{ name: 'a', default: '0' }],
    });
    return expect(run(project([code]))).resolves.toBeUndefined();
  });

  test('mix of defaulted and undriven ports: only undriven is flagged', async function () {
    var code = codeBlock('code1', {
      portsIn: [{ name: 'a', default: '0' }, { name: 'b' }],
    });
    await expect(run(project([code]))).rejects.toThrow('Undriven inputs');
    var [msg] = ALERTIFY.error.mock.calls[0];
    expect(msg).toContain('"b"');
    expect(msg).not.toContain('"a"');
  });
});

describe('generic (submodule) blocks', function () {
  test('generic block with all inputs driven resolves', function () {
    var dep = {
      design: {
        graph: { blocks: [inputBlock('pin1', { name: 'clk' })], wires: [] },
      },
    };
    var modBlock = {
      id: 'mod1',
      type: 'my.counter',
      data: { name: 'counter0' },
    };
    var proj = project(
      [inputBlock('in1'), modBlock],
      [wire('in1', 'out', 'mod1', 'pin1')],
      { 'my.counter': dep }
    );
    return expect(run(proj)).resolves.toBeUndefined();
  });

  test('generic block with undriven input reports error', async function () {
    var dep = {
      design: {
        graph: { blocks: [inputBlock('pin1', { name: 'clk' })], wires: [] },
      },
    };
    var modBlock = {
      id: 'mod1',
      type: 'my.counter',
      data: { name: 'counter0' },
    };
    var proj = project([modBlock], [], { 'my.counter': dep });
    await expect(run(proj)).rejects.toThrow('Undriven inputs');
    expect(ALERTIFY.error).toHaveBeenCalledWith(
      expect.stringContaining('is not driven'),
      30
    );
  });
});

describe('malformed project data', function () {
  test('null graph returns no errors', function () {
    return expect(
      run({ design: null, dependencies: {} })
    ).resolves.toBeUndefined();
  });

  test('missing wires array returns no errors', function () {
    return expect(
      run({ design: { graph: { blocks: [] } }, dependencies: {} })
    ).resolves.toBeUndefined();
  });
});
