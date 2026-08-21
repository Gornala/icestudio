'use strict';
/**
 * Unit tests for blocks/linked-code.js — the "linked code module" submodule
 * option.
 *
 * A submodule flagged as linked always holds exactly one basic.code block
 * whose name and ports mirror the submodule interface, with every boundary
 * block (basic.input / basic.output / non-local basic.constant) wired
 * straight to it.  The link lives on the code block itself (data.linked), so
 * the .ice package format is untouched.
 *
 * Loading strategy matches port-layout.spec.js: the browser script references
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

let L;

beforeAll(function () {
  loadScript('app/scripts/services/blocks/linked-code.js');
  L = W._icelinkedcode;
});

//-- A submodule sheet: two inputs, one 8-bit output, one parameter
function makeDesign() {
  return {
    blocks: [
      {
        id: 'in1',
        type: 'basic.input',
        data: { name: 'clk', virtual: true },
        position: { x: 50, y: 80 },
      },
      {
        id: 'in2',
        type: 'basic.input',
        data: { name: 'rst', virtual: true },
        position: { x: 50, y: 160 },
      },
      {
        id: 'out1',
        type: 'basic.output',
        data: { name: 'q', range: '[7:0]', virtual: true },
        position: { x: 1438, y: 80 },
      },
      {
        id: 'par1',
        type: 'basic.constant',
        data: { name: 'WIDTH', value: '8', local: false },
        position: { x: 398, y: 20 },
      },
    ],
    wires: [],
  };
}

function wireNames(wires) {
  return wires.map(function (wire) {
    return (
      wire.source.block +
      ':' +
      wire.source.port +
      '->' +
      wire.target.block +
      ':' +
      wire.target.port
    );
  });
}

describe('linked-code: detection', function () {
  it('recognises only a code block carrying data.linked', function () {
    expect(
      L.isLinkedBlock({ type: 'basic.code', data: { linked: true } })
    ).toBe(true);
    expect(L.isLinkedBlock({ type: 'basic.code', data: {} })).toBe(false);
    expect(
      L.isLinkedBlock({ type: 'basic.input', data: { linked: true } })
    ).toBe(false);
    expect(L.isLinkedBlock(null)).toBe(false);
  });

  it('treats non-local constants as boundary blocks but locals as interior', function () {
    expect(
      L.isWiredBoundary({ type: 'basic.constant', data: { local: false } })
    ).toBe(true);
    expect(
      L.isWiredBoundary({ type: 'basic.constant', data: { local: true } })
    ).toBe(false);
    expect(L.isWiredBoundary({ type: 'basic.code', data: {} })).toBe(false);
  });
});

describe('linked-code: interface derivation', function () {
  it('reads ports off the boundary blocks in sheet order', function () {
    const iface = L.ifaceFromBlocks(makeDesign().blocks, 'counter');

    expect(iface.label).toBe('counter');
    expect(iface.portsIn.map((p) => p.name)).toEqual(['clk', 'rst']);
    expect(iface.portsOut.map((p) => p.name)).toEqual(['q']);
    expect(iface.params.map((p) => p.name)).toEqual(['WIDTH']);
    expect(iface.inoutLeft).toEqual([]);
    expect(iface.inoutRight).toEqual([]);
  });

  it('sends tri-state ports to the side they were placed on', function () {
    const blocks = [
      {
        id: 'a',
        type: 'basic.input',
        data: { name: 'sda', inout: true, virtual: true },
      },
      {
        id: 'b',
        type: 'basic.output',
        data: { name: 'scl', inout: true, virtual: true },
      },
    ];
    const iface = L.ifaceFromBlocks(blocks, 'i2c');

    expect(iface.inoutLeft.map((p) => p.name)).toEqual(['sda']);
    expect(iface.inoutRight.map((p) => p.name)).toEqual(['scl']);
    expect(iface.portsIn).toEqual([]);
    expect(iface.portsOut).toEqual([]);
  });
});

describe('linked-code: resyncDesign', function () {
  it('creates the code block and wires every boundary block to it', function () {
    const design = makeDesign();
    const code = L.resyncDesign(
      design,
      L.ifaceFromBlocks(design.blocks, 'counter'),
      'code1'
    );

    expect(code.id).toBe('code1');
    expect(code.data.linked).toBe(true);
    expect(code.data.label).toBe('counter');
    expect(code.data.ports.in.map((p) => p.name)).toEqual(['clk', 'rst']);
    expect(code.data.ports.out).toEqual([
      { name: 'q', range: '[7:0]', size: 8 },
    ]);
    expect(code.data.params).toEqual([{ name: 'WIDTH' }]);

    expect(wireNames(design.wires).sort()).toEqual(
      [
        'code1:q->out1:in',
        'in1:out->code1:clk',
        'in2:out->code1:rst',
        'par1:constant-out->code1:WIDTH',
      ].sort()
    );
  });

  it('carries the bus width onto the wire', function () {
    const design = makeDesign();
    L.resyncDesign(design, L.ifaceFromBlocks(design.blocks, 'm'), 'code1');

    const busWire = design.wires.find(function (wire) {
      return wire.target.block === 'out1';
    });
    expect(busWire.size).toBe(8);

    const bitWire = design.wires.find(function (wire) {
      return wire.source.block === 'in1';
    });
    expect(bitWire.size).toBeUndefined();
  });

  it('keeps the Verilog source when the interface changes', function () {
    const design = makeDesign();
    L.resyncDesign(design, L.ifaceFromBlocks(design.blocks, 'm'), 'code1');
    const code = L.findLinkedBlock(design.blocks);
    code.data.code = 'assign q = 0;';

    //-- The user drops "rst" from the submodule settings dialog
    design.blocks = design.blocks.filter((b) => b.id !== 'in2');
    L.resyncDesign(design, L.ifaceFromBlocks(design.blocks, 'm'), 'code2');

    expect(L.findLinkedBlock(design.blocks).id).toBe('code1');
    expect(L.findLinkedBlock(design.blocks).data.code).toBe('assign q = 0;');
    expect(code.data.ports.in.map((p) => p.name)).toEqual(['clk']);
    expect(
      design.wires.some(function (wire) {
        return wire.source.block === 'in2' || wire.target.block === 'in2';
      })
    ).toBe(false);
  });

  it('adopts the code block a submodule already had, rather than adding a second', function () {
    const design = makeDesign();
    design.blocks.push({
      id: 'handwritten',
      type: 'basic.code',
      data: { label: 'old', code: 'assign q = 0;', ports: {}, params: [] },
      position: { x: 398, y: 134 },
      size: { width: 800, height: 300 },
    });

    L.resyncDesign(design, L.ifaceFromBlocks(design.blocks, 'm'), 'unused');

    const codeBlocks = design.blocks.filter((b) => b.type === 'basic.code');
    expect(codeBlocks).toHaveLength(1);
    expect(codeBlocks[0].id).toBe('handwritten');
    expect(codeBlocks[0].data.code).toBe('assign q = 0;');
    expect(codeBlocks[0].data.linked).toBe(true);
  });

  it('leaves wires the user drew to other interior blocks alone', function () {
    const design = makeDesign();
    design.blocks.push({
      id: 'sub1',
      type: 'someCollection.helper',
      data: {},
      position: { x: 900, y: 400 },
    });
    L.resyncDesign(design, L.ifaceFromBlocks(design.blocks, 'm'), 'code1');

    design.wires.push({
      source: { block: 'code1', port: 'q' },
      target: { block: 'sub1', port: 'a' },
    });
    L.resyncDesign(design, L.ifaceFromBlocks(design.blocks, 'm'), 'code1');

    expect(
      design.wires.filter(function (wire) {
        return wire.target.block === 'sub1';
      })
    ).toHaveLength(1);
  });

  it('is idempotent: resyncing twice does not duplicate wires', function () {
    const design = makeDesign();
    L.resyncDesign(design, L.ifaceFromBlocks(design.blocks, 'm'), 'code1');
    const first = wireNames(design.wires).sort();
    L.resyncDesign(design, L.ifaceFromBlocks(design.blocks, 'm'), 'code1');

    expect(wireNames(design.wires).sort()).toEqual(first);
  });

  it('grows the code block so every port fits', function () {
    const design = { blocks: [], wires: [] };
    for (let i = 0; i < 6; i++) {
      design.blocks.push({
        id: 'in' + i,
        type: 'basic.input',
        data: { name: 'p' + i, virtual: true },
      });
    }
    const code = L.resyncDesign(
      design,
      L.ifaceFromBlocks(design.blocks, 'wide'),
      'code1'
    );

    expect(code.size.height).toBe(6 * 80 + 160);
  });
});

describe('linked-code: unlinkDesign', function () {
  it('drops the flag but keeps the block and its wiring', function () {
    const design = makeDesign();
    L.resyncDesign(design, L.ifaceFromBlocks(design.blocks, 'm'), 'code1');
    const wiresBefore = wireNames(design.wires).sort();

    L.unlinkDesign(design);

    expect(L.findLinkedBlock(design.blocks)).toBeNull();
    expect(design.blocks.filter((b) => b.type === 'basic.code')).toHaveLength(
      1
    );
    expect(wireNames(design.wires).sort()).toEqual(wiresBefore);
  });
});
