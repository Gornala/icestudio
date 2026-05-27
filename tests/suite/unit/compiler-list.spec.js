'use strict';
/**
 * Unit tests for compiler/list.js — listCompiler(project).
 *
 * listCompiler scans blocks for BASIC_MEMORY entries and returns an array of
 * { name, content } file descriptors.  It recurses into project.dependencies.
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

var listCompiler;

beforeAll(function () {
  loadScript('app/scripts/services/blocks/constants.js');
  loadScript('app/scripts/services/compiler/list.js');

  var listCtx = {
    blocks: W._iceblocks,
    utils: { digestId: digestId },
  };
  listCompiler = W._icecompiler.list(listCtx).listCompiler;
});

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeProject(blocks, deps) {
  return {
    design: { graph: { blocks: blocks || [], wires: [] } },
    dependencies: deps || {},
  };
}

function memoryBlock(id, listContent) {
  return {
    id: id,
    type: 'basic.memory',
    data: {
      name: id,
      list: listContent || '',
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('no memory blocks', function () {
  test('returns empty array for empty canvas', function () {
    expect(listCompiler(makeProject())).toEqual([]);
  });

  test('returns empty array when only non-memory blocks present', function () {
    var proj = makeProject([
      {
        id: 'inp001',
        type: 'basic.input',
        data: { name: 'clk', pins: [], virtual: false },
      },
    ]);
    expect(listCompiler(proj)).toEqual([]);
  });
});

describe('single memory block', function () {
  test('returns one file with digested name', function () {
    // digestId('mem001') = 'vmem001'  (6 chars, no dash)
    var files = listCompiler(
      makeProject([memoryBlock('mem001', '0\n1\n2\n3')])
    );
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('vmem001.list');
  });

  test('file content matches block data', function () {
    var files = listCompiler(
      makeProject([memoryBlock('mem001', '10\n20\n30')])
    );
    expect(files[0].content).toBe('10\n20\n30');
  });

  test('empty list content is preserved as-is', function () {
    var files = listCompiler(makeProject([memoryBlock('mem001', '')]));
    expect(files[0].content).toBe('');
  });
});

describe('multiple memory blocks', function () {
  test('returns one file per memory block', function () {
    var files = listCompiler(
      makeProject([memoryBlock('mem001', 'aaa'), memoryBlock('mem002', 'bbb')])
    );
    expect(files).toHaveLength(2);
  });

  test('each file has the correct name and content', function () {
    var files = listCompiler(
      makeProject([
        memoryBlock('mem001', 'data1'),
        memoryBlock('mem002', 'data2'),
      ])
    );
    var names = files.map(function (f) {
      return f.name;
    });
    expect(names).toContain('vmem001.list');
    expect(names).toContain('vmem002.list');

    var byName = {};
    files.forEach(function (f) {
      byName[f.name] = f.content;
    });
    expect(byName['vmem001.list']).toBe('data1');
    expect(byName['vmem002.list']).toBe('data2');
  });
});

describe('memory blocks in dependencies', function () {
  test('recurses into dependencies and finds memory blocks', function () {
    var dep = makeProject([memoryBlock('mem002', 'dep_data')]);
    var proj = makeProject([memoryBlock('mem001', 'top_data')], {
      'my.dep': dep,
    });
    var files = listCompiler(proj);
    expect(files).toHaveLength(2);
    var names = files.map(function (f) {
      return f.name;
    });
    expect(names).toContain('vmem001.list');
    expect(names).toContain('vmem002.list');
  });

  test('returns only dep memory when top has none', function () {
    var dep = makeProject([memoryBlock('mem002', 'dep_data')]);
    var proj = makeProject([], { 'my.dep': dep });
    var files = listCompiler(proj);
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('vmem002.list');
  });
});

describe('null / malformed project', function () {
  test('null project returns empty array', function () {
    expect(listCompiler(null)).toEqual([]);
  });

  test('missing design returns empty array', function () {
    expect(listCompiler({})).toEqual([]);
  });
});
