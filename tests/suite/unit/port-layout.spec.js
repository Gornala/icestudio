'use strict';
/**
 * Unit tests for graph/portLayout.js.
 *
 * Regression target: adding a port to a submodule from the parent sheet
 * (cellManager.editGenericBlock) rebuilds every boundary block, and used to
 * re-place them at fixed coordinates — inputs at x=50, outputs at x=750.
 * Submodules built by transformCodeToSubmodule put their code block at x=398
 * with width 800 (so it spans 398..1198) and their output column at x=1438.
 * Re-placing the outputs at x=750 therefore dropped the whole output column on
 * top of the code block, while the input column happened to land back on x=50
 * and looked correct.  portLayout keeps surviving ports where they were and
 * appends new ones to the end of their own column.
 *
 * Loading strategy matches connectivity.spec.js: the browser script references
 * `window` as a global, so it is evaluated with new Function('window', code).
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

let P;

beforeAll(function () {
  loadScript('app/scripts/services/graph/portLayout.js');
  P = W._icegraph.portLayout;
});

// ── Fixture helpers ───────────────────────────────────────────────────────────

// Geometry produced by cellManager.buildSubmoduleDesign / transformCodeToSubmodule
const CODE_X = 398;
const CODE_Y = 134;
const CODE_WIDTH = 800;
const CODE_RIGHT = CODE_X + CODE_WIDTH; // 1198
const IO_RIGHT_X = CODE_RIGHT + 240; // 1438

function inputBlock(name, x, y) {
  return {
    id: 'in-' + name,
    type: 'basic.input',
    data: { name: name, virtual: true, clock: false },
    position: { x: x, y: y },
  };
}

function outputBlock(name, x, y) {
  return {
    id: 'out-' + name,
    type: 'basic.output',
    data: { name: name, virtual: true },
    position: { x: x, y: y },
  };
}

function constantBlock(name, x, y, local) {
  return {
    id: 'const-' + name,
    type: 'basic.constant',
    data: { name: name, value: '', local: !!local },
    position: { x: x, y: y },
  };
}

function codeBlock(x, y, width, height) {
  return {
    id: 'code-1',
    type: 'basic.code',
    data: { label: 'dut', code: '', ports: { in: [], out: [] } },
    position: {
      x: x === undefined ? CODE_X : x,
      y: y === undefined ? CODE_Y : y,
    },
    size: {
      width: width === undefined ? CODE_WIDTH : width,
      height: height === undefined ? 300 : height,
    },
  };
}

// A submodule as transformCodeToSubmodule leaves it: two inputs on the left,
// one output parked clear of the code block on the right.
function submoduleDesign() {
  return [
    inputBlock('clk', 50, 150),
    inputBlock('rst', 50, 230),
    outputBlock('q', IO_RIGHT_X, 190),
    codeBlock(),
  ];
}

function overlapsCodeBlock(position) {
  return position.x >= CODE_X && position.x <= CODE_RIGHT;
}

// ── Preserving what was already there ────────────────────────────────────────

describe('layout preserves surviving ports', function () {
  it('keeps every input at its previous position', function () {
    expect(P.layoutInputs(submoduleDesign(), ['clk', 'rst'])).toEqual([
      { x: 50, y: 150 },
      { x: 50, y: 230 },
    ]);
  });

  it('keeps every output at its previous position', function () {
    expect(P.layoutOutputs(submoduleDesign(), ['q'])).toEqual([
      { x: IO_RIGHT_X, y: 190 },
    ]);
  });

  it('keeps hand-dragged positions, not just generated ones', function () {
    const blocks = [
      inputBlock('a', 17, 33),
      outputBlock('y', 2000, 640),
      codeBlock(),
    ];
    expect(P.layoutInputs(blocks, ['a'])).toEqual([{ x: 17, y: 33 }]);
    expect(P.layoutOutputs(blocks, ['y'])).toEqual([{ x: 2000, y: 640 }]);
  });

  it('does not shift survivors when another port is removed', function () {
    const blocks = [
      outputBlock('q0', IO_RIGHT_X, 80),
      outputBlock('q1', IO_RIGHT_X, 160),
      outputBlock('q2', IO_RIGHT_X, 240),
      codeBlock(),
    ];
    // q1 deleted
    expect(P.layoutOutputs(blocks, ['q0', 'q2'])).toEqual([
      { x: IO_RIGHT_X, y: 80 },
      { x: IO_RIGHT_X, y: 240 },
    ]);
  });

  it('matches ports by name, not by index', function () {
    const blocks = [
      outputBlock('a', IO_RIGHT_X, 80),
      outputBlock('b', IO_RIGHT_X, 160),
      codeBlock(),
    ];
    // Reordered in the form: each name still gets its own old position.
    expect(P.layoutOutputs(blocks, ['b', 'a'])).toEqual([
      { x: IO_RIGHT_X, y: 160 },
      { x: IO_RIGHT_X, y: 80 },
    ]);
  });
});

// ── The reported bug ─────────────────────────────────────────────────────────

describe('a newly added port joins its own column', function () {
  it('places a new input under the last input', function () {
    const positions = P.layoutInputs(submoduleDesign(), ['clk', 'rst', 'en']);
    expect(positions[2]).toEqual({ x: 50, y: 230 + P.IO_STEP });
  });

  it('places a new output under the last output, not over the code block', function () {
    const positions = P.layoutOutputs(submoduleDesign(), ['q', 'ready']);

    expect(positions[1]).toEqual({ x: IO_RIGHT_X, y: 190 + P.IO_STEP });
    expect(overlapsCodeBlock(positions[1])).toBe(false);
  });

  it('does not regress to the old fixed x=750 / y=80+idx*80 grid', function () {
    const positions = P.layoutOutputs(submoduleDesign(), ['q', 'ready']);

    // Old behaviour re-placed the whole column at x=750, inside the code block.
    expect(positions[0]).not.toEqual({ x: 750, y: 80 });
    expect(positions[1]).not.toEqual({ x: 750, y: 160 });
    positions.forEach(function (position) {
      expect(overlapsCodeBlock(position)).toBe(false);
    });
  });

  it('stacks several new ports one step apart', function () {
    const positions = P.layoutOutputs(submoduleDesign(), ['q', 'r', 's', 't']);
    expect(positions).toEqual([
      { x: IO_RIGHT_X, y: 190 },
      { x: IO_RIGHT_X, y: 270 },
      { x: IO_RIGHT_X, y: 350 },
      { x: IO_RIGHT_X, y: 430 },
    ]);
  });

  it('appends below the lowest port even when the form lists it first', function () {
    const blocks = [
      outputBlock('q0', IO_RIGHT_X, 80),
      outputBlock('q1', IO_RIGHT_X, 400),
      codeBlock(),
    ];
    const positions = P.layoutOutputs(blocks, ['fresh', 'q0', 'q1']);
    expect(positions[0]).toEqual({ x: IO_RIGHT_X, y: 480 });
  });

  it('treats a renamed port as new rather than moving the column', function () {
    // 'q' renamed to 'qq'
    const positions = P.layoutOutputs(submoduleDesign(), ['qq']);
    expect(positions[0].x).toBe(IO_RIGHT_X);
    expect(overlapsCodeBlock(positions[0])).toBe(false);
  });
});

// ── Column alignment when old positions disagree ─────────────────────────────

describe('column alignment', function () {
  it('aligns a new output on the rightmost existing output', function () {
    const blocks = [
      outputBlock('a', 1300, 80),
      outputBlock('b', IO_RIGHT_X, 160),
      codeBlock(),
    ];
    const positions = P.layoutOutputs(blocks, ['a', 'b', 'c']);
    expect(positions[2]).toEqual({ x: IO_RIGHT_X, y: 240 });
  });

  it('aligns a new input on the leftmost existing input', function () {
    const blocks = [
      inputBlock('a', 50, 80),
      inputBlock('b', 300, 160),
      codeBlock(),
    ];
    const positions = P.layoutInputs(blocks, ['a', 'b', 'c']);
    expect(positions[2]).toEqual({ x: 50, y: 240 });
  });
});

// ── Falling back when a column is empty ──────────────────────────────────────

describe('empty columns', function () {
  it('parks the first output clear of the interior', function () {
    const blocks = [inputBlock('clk', 50, 150), codeBlock()];
    const positions = P.layoutOutputs(blocks, ['q']);

    expect(positions[0]).toEqual({
      x: CODE_RIGHT + P.IO_MARGIN,
      y: P.IO_START_Y,
    });
    expect(overlapsCodeBlock(positions[0])).toBe(false);
  });

  it('clears the widest interior block, not just the first', function () {
    const blocks = [
      codeBlock(0, 0, 100, 100),
      codeBlock(900, 0, 600, 100), // spans 900..1500
    ];
    const positions = P.layoutOutputs(blocks, ['q']);
    expect(positions[0].x).toBe(1500 + P.IO_MARGIN);
  });

  it('starts the first input at the default left column', function () {
    const positions = P.layoutInputs([codeBlock()], ['clk', 'rst']);
    expect(positions).toEqual([
      { x: P.IO_LEFT_X, y: P.IO_START_Y },
      { x: P.IO_LEFT_X, y: P.IO_START_Y + P.IO_STEP },
    ]);
  });

  it('handles a submodule with no blocks at all', function () {
    expect(P.layoutInputs([], ['a'])).toEqual([
      { x: P.IO_LEFT_X, y: P.IO_START_Y },
    ]);
    expect(P.layoutOutputs([], ['y'])).toEqual([
      { x: P.IO_LEFT_X, y: P.IO_START_Y },
    ]);
    expect(P.layoutInputs(undefined, undefined)).toEqual([]);
  });
});

// ── Parameters ───────────────────────────────────────────────────────────────

describe('parameter row', function () {
  it('keeps existing parameters and grows the row to the right', function () {
    const blocks = [
      constantBlock('WIDTH', 398, 20),
      constantBlock('DEPTH', 548, 20),
      codeBlock(),
    ];
    expect(P.layoutParams(blocks, ['WIDTH', 'DEPTH', 'MODE'])).toEqual([
      { x: 398, y: 20 },
      { x: 548, y: 20 },
      { x: 548 + P.PARAM_STEP, y: 20 },
    ]);
  });

  it('ignores local constants when matching by name', function () {
    const blocks = [constantBlock('WIDTH', 700, 500, true), codeBlock()];
    expect(P.layoutParams(blocks, ['WIDTH'])).toEqual([
      { x: P.PARAM_START_X, y: P.PARAM_Y },
    ]);
  });

  it('starts an empty parameter row at the default spot', function () {
    expect(P.layoutParams([codeBlock()], ['N'])).toEqual([
      { x: P.PARAM_START_X, y: P.PARAM_Y },
    ]);
  });
});

// ── Boundary classification ──────────────────────────────────────────────────

describe('isBoundaryBlock / interiorRightEdge', function () {
  it('classifies io blocks and non-local constants as boundary', function () {
    expect(P.isBoundaryBlock(inputBlock('a', 0, 0))).toBe(true);
    expect(P.isBoundaryBlock(outputBlock('y', 0, 0))).toBe(true);
    expect(P.isBoundaryBlock(constantBlock('N', 0, 0, false))).toBe(true);
    expect(P.isBoundaryBlock(constantBlock('N', 0, 0, true))).toBe(false);
    expect(P.isBoundaryBlock(codeBlock())).toBe(false);
    expect(P.isBoundaryBlock(null)).toBe(false);
  });

  it('excludes boundary blocks from the interior edge', function () {
    // The old output column sits far right; it must not push the fallback out.
    const blocks = [outputBlock('y', 5000, 80), codeBlock()];
    expect(P.interiorRightEdge(blocks)).toBe(CODE_RIGHT);
  });

  it('assumes a default width for blocks with no size', function () {
    const blocks = [
      { id: 'x', type: 'basic.and', data: {}, position: { x: 10, y: 0 } },
    ];
    expect(P.interiorRightEdge(blocks)).toBe(10 + P.DEFAULT_BLOCK_WIDTH);
  });

  it('returns null for an interior with nothing in it', function () {
    expect(P.interiorRightEdge([outputBlock('y', 900, 80)])).toBeNull();
  });
});

// ── End-to-end shape of the reported scenario ────────────────────────────────

describe('the reported scenario, end to end', function () {
  it('adds one input and one output without disturbing the layout', function () {
    const blocks = submoduleDesign();

    const inputs = P.layoutInputs(blocks, ['clk', 'rst', 'en']);
    const outputs = P.layoutOutputs(blocks, ['q', 'ready']);

    // Old ports untouched
    expect(inputs.slice(0, 2)).toEqual([
      { x: 50, y: 150 },
      { x: 50, y: 230 },
    ]);
    expect(outputs[0]).toEqual({ x: IO_RIGHT_X, y: 190 });

    // New input under the old inputs, new output under the old output
    expect(inputs[2].x).toBe(inputs[1].x);
    expect(inputs[2].y).toBeGreaterThan(inputs[1].y);
    expect(outputs[1].x).toBe(outputs[0].x);
    expect(outputs[1].y).toBeGreaterThan(outputs[0].y);

    // And nothing ended up on the code block
    inputs.concat(outputs).forEach(function (position) {
      expect(overlapsCodeBlock(position)).toBe(false);
    });
  });
});
