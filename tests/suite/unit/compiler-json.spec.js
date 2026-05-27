'use strict';
/**
 * Unit tests for compiler/json.js — jsonOutputCompiler(project).
 *
 * jsonOutputCompiler scans for BASIC_JSON_OUTPUT blocks with a data.path,
 * collects wired constant values (resolving through output labels), and
 * returns an array of { id, name, content } file descriptors.
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

var jsonOutputCompiler;

beforeAll(function () {
  loadScript('app/scripts/services/blocks/constants.js');
  loadScript('app/scripts/services/compiler/helpers.js');
  loadScript('app/scripts/services/compiler/json.js');

  var B = W._iceblocks;
  var helpersCtx = {
    blocks: B,
    utils: { digestId: digestId },
    common: { selectedBoard: { info: {}, rules: { output: [] } } },
    _package: { version: 'test' },
  };
  var helpers = W._icecompiler.helpers(helpersCtx);

  var jsonCtx = {
    blocks: B,
    findBlock: helpers.findBlock,
  };
  jsonOutputCompiler = W._icecompiler.json(jsonCtx).jsonOutputCompiler;
});

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeProject(blocks, wires) {
  return {
    design: { graph: { blocks: blocks || [], wires: wires || [] } },
    dependencies: {},
  };
}

function constantBlock(id, value) {
  return {
    id: id,
    type: 'basic.constant',
    data: { name: id, value: value },
  };
}

function jsonOutputBlock(id, filePath) {
  return {
    id: id,
    type: 'basic.jsonOutput',
    data: { path: filePath || '' },
  };
}

function inputLabelBlock(id, name) {
  return { id: id, type: 'basic.inputLabel', data: { name: name } };
}

function outputLabelBlock(id, name) {
  return { id: id, type: 'basic.outputLabel', data: { name: name } };
}

function wire(fromBlock, fromPort, toBlock, toPort) {
  return {
    source: { block: fromBlock, port: fromPort },
    target: { block: toBlock, port: toPort },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('no JSON output blocks', function () {
  test('empty canvas returns empty array', function () {
    expect(jsonOutputCompiler(makeProject())).toEqual([]);
  });

  test('canvas with only constant blocks produces no files', function () {
    var proj = makeProject([constantBlock('const1', '5')]);
    expect(jsonOutputCompiler(proj)).toEqual([]);
  });
});

describe('JSON output block without path', function () {
  test('block with empty path is skipped', function () {
    var proj = makeProject([jsonOutputBlock('jout1', '')]);
    expect(jsonOutputCompiler(proj)).toEqual([]);
  });

  test('block with no path property is skipped', function () {
    var block = { id: 'jout1', type: 'basic.jsonOutput', data: {} };
    expect(jsonOutputCompiler(makeProject([block]))).toEqual([]);
  });
});

describe('JSON output block with no wires', function () {
  test('produces one file descriptor', function () {
    var files = jsonOutputCompiler(
      makeProject([jsonOutputBlock('jout1', 'params.json')])
    );
    expect(files).toHaveLength(1);
  });

  test('file name matches the block path', function () {
    var files = jsonOutputCompiler(
      makeProject([jsonOutputBlock('jout1', 'params.json')])
    );
    expect(files[0].name).toBe('params.json');
  });

  test('content is empty JSON object with trailing newline', function () {
    var files = jsonOutputCompiler(
      makeProject([jsonOutputBlock('jout1', 'params.json')])
    );
    expect(files[0].content).toBe('{}\n');
  });

  test('result includes the block id', function () {
    var files = jsonOutputCompiler(
      makeProject([jsonOutputBlock('jout1', 'params.json')])
    );
    expect(files[0].id).toBe('jout1');
  });
});

describe('constant wired to JSON output', function () {
  test('wired constant value appears under the wire target port key', function () {
    var blocks = [
      constantBlock('const1', '42'),
      jsonOutputBlock('jout1', 'out.json'),
    ];
    var wires = [wire('const1', 'val', 'jout1', 'frequency')];
    var files = jsonOutputCompiler(makeProject(blocks, wires));
    var parsed = JSON.parse(files[0].content);
    expect(parsed.frequency).toBe('42');
  });

  test('content is 2-space-indented JSON with trailing newline', function () {
    var blocks = [
      constantBlock('const1', '7'),
      jsonOutputBlock('jout1', 'out.json'),
    ];
    var wires = [wire('const1', 'val', 'jout1', 'freq')];
    var files = jsonOutputCompiler(makeProject(blocks, wires));
    expect(files[0].content).toBe(
      JSON.stringify({ freq: '7' }, null, 2) + '\n'
    );
  });

  test('multiple wired constants produce multiple keys', function () {
    var blocks = [
      constantBlock('const1', '12'),
      constantBlock('const2', '34'),
      jsonOutputBlock('jout1', 'out.json'),
    ];
    var wires = [
      wire('const1', 'val', 'jout1', 'a'),
      wire('const2', 'val', 'jout1', 'b'),
    ];
    var files = jsonOutputCompiler(makeProject(blocks, wires));
    var parsed = JSON.parse(files[0].content);
    expect(parsed.a).toBe('12');
    expect(parsed.b).toBe('34');
  });
});

describe('output label resolution', function () {
  test('value from constant via inputLabel→outputLabel reaches JSON output', function () {
    var blocks = [
      constantBlock('const1', '7'),
      inputLabelBlock('lbl1', 'sig'),
      outputLabelBlock('lbl2', 'sig'),
      jsonOutputBlock('jout1', 'out.json'),
    ];
    var wires = [
      wire('const1', 'val', 'lbl1', 'inlabel'),
      wire('lbl2', 'outlabel', 'jout1', 'frequency'),
    ];
    var files = jsonOutputCompiler(makeProject(blocks, wires));
    var parsed = JSON.parse(files[0].content);
    expect(parsed.frequency).toBe('7');
  });
});

describe('multiple JSON output blocks', function () {
  test('each block produces its own file', function () {
    var blocks = [
      jsonOutputBlock('jout1', 'a.json'),
      jsonOutputBlock('jout2', 'b.json'),
    ];
    var files = jsonOutputCompiler(makeProject(blocks));
    expect(files).toHaveLength(2);
  });

  test('each file has its own path', function () {
    var blocks = [
      jsonOutputBlock('jout1', 'a.json'),
      jsonOutputBlock('jout2', 'b.json'),
    ];
    var files = jsonOutputCompiler(makeProject(blocks));
    var names = files.map(function (f) {
      return f.name;
    });
    expect(names).toContain('a.json');
    expect(names).toContain('b.json');
  });
});

describe('dangling wire (missing source block)', function () {
  test('wire referencing unknown block produces no key in the JSON', function () {
    var blocks = [jsonOutputBlock('jout1', 'out.json')];
    var wires = [wire('nonexistent', 'val', 'jout1', 'freq')];
    var files = jsonOutputCompiler(makeProject(blocks, wires));
    var parsed = JSON.parse(files[0].content);
    expect(Object.keys(parsed)).toHaveLength(0);
  });
});
