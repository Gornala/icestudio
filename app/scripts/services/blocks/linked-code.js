//---------------------------------------------------------------------------
//-- linked-code.js: Helpers for the "linked code module" submodule option.
//--
//-- A submodule can be flagged so that it always contains exactly one
//-- basic.code block whose name and ports mirror the submodule's own name and
//-- ports, with every boundary block (basic.input / basic.output /
//-- non-local basic.constant) wired straight to it.
//--
//-- The link is recorded on the code block itself (data.linked === true), so
//-- it survives save/load without touching the .ice package format.  These
//-- helpers are pure: they work on plain design-graph objects (blocks/wires),
//-- never on JointJS cells, so they can be shared by the form layer and the
//-- graph layer.
//--
//-- Loaded as a <script> tag; exposes window._icelinkedcode
//---------------------------------------------------------------------------
'use strict';

window._icelinkedcode = (function () {
  //-- Layout constants, matching those used by buildSubmoduleDesign
  var CODE_X = 398;
  var CODE_Y = 134;
  var CODE_WIDTH = 800;

  //-- Is this plain design block the linked code module of its submodule?
  var isLinkedBlock = function (block) {
    return !!(
      block &&
      block.type === 'basic.code' &&
      block.data &&
      block.data.linked
    );
  };

  //-- Is this JointJS cell the linked code module of its submodule?
  var isLinkedCell = function (cell) {
    if (!cell || typeof cell.get !== 'function' || cell.isLink()) {
      return false;
    }
    if (cell.get('type') !== 'ice.Code') {
      return false;
    }
    var data = cell.get('data');
    return !!(data && data.linked);
  };

  //-- Find the linked code block inside a list of plain design blocks
  var findLinkedBlock = function (blocks) {
    var found = null;
    (blocks || []).forEach(function (block) {
      if (!found && isLinkedBlock(block)) {
        found = block;
      }
    });
    return found;
  };

  //-- Find the linked code cell inside a JointJS graph
  var findLinkedCell = function (graph) {
    if (!graph || typeof graph.getCells !== 'function') {
      return null;
    }
    var cells = graph.getCells();
    for (var i = 0; i < cells.length; i++) {
      if (isLinkedCell(cells[i])) {
        return cells[i];
      }
    }
    return null;
  };

  //-- Height a linked code block needs to host the given port counts
  var codeHeight = function (leftCount, rightCount, paramCount) {
    var left = Math.max(leftCount, paramCount);
    return Math.max(300, Math.max(left, rightCount) * 80 + 160);
  };

  //-- Convert a Verilog range string like "[7:0]" into a bit count
  var rangeToSize = function (range) {
    if (!range) {
      return undefined;
    }
    var m = range.match(/\[(\d+):(\d+)\]/);
    return m
      ? Math.abs(parseInt(m[1], 10) - parseInt(m[2], 10)) + 1
      : undefined;
  };

  //-- Turn a form port info ({name, rangestr, size}) into a code-block port
  var toCodePort = function (port) {
    var out = { name: port.name };
    var range = port.rangestr || port.range || '';
    if (range) {
      out.range = range;
      out.size = port.size || rangeToSize(range);
    }
    return out;
  };

  //-- Overwrite the ports/params/label of a linked code block so they mirror
  //-- the submodule's own interface.  The Verilog source is left untouched.
  var applyInterface = function (codeBlock, iface) {
    codeBlock.data = codeBlock.data || {};
    codeBlock.data.linked = true;
    codeBlock.data.label = iface.label || codeBlock.data.label || '';
    codeBlock.data.code = codeBlock.data.code || '';
    codeBlock.data.ports = {
      in: (iface.portsIn || []).map(toCodePort),
      out: (iface.portsOut || []).map(toCodePort),
      inoutLeft: (iface.inoutLeft || []).map(toCodePort),
      inoutRight: (iface.inoutRight || []).map(toCodePort),
    };
    codeBlock.data.params = (iface.params || []).map(function (param) {
      return { name: param.name };
    });

    codeBlock.size = codeBlock.size || { width: CODE_WIDTH, height: 300 };
    codeBlock.size.height = codeHeight(
      (iface.portsIn || []).length + (iface.inoutLeft || []).length,
      (iface.portsOut || []).length + (iface.inoutRight || []).length,
      (iface.params || []).length
    );
    return codeBlock;
  };

  //-- Build a brand-new linked code block for the given interface
  var createBlock = function (id, iface, code) {
    var block = {
      id: id,
      type: 'basic.code',
      data: { code: code || '' },
      position: { x: CODE_X, y: CODE_Y },
      size: { width: CODE_WIDTH, height: 300 },
    };
    return applyInterface(block, iface);
  };

  //-- Is this block one of the submodule boundary blocks that the linked code
  //-- module owns a wire to?
  var isWiredBoundary = function (block) {
    if (!block || !block.type) {
      return false;
    }
    if (block.type === 'basic.input' || block.type === 'basic.output') {
      return true;
    }
    return (
      (block.type === 'basic.constant' || block.type === 'basic.memory') &&
      block.data &&
      !block.data.local
    );
  };

  //-- Derive the submodule interface from its boundary blocks, in the order
  //-- they appear in the design.  Used instead of the dialog values so the
  //-- linked code module also follows ports added straight on the submodule
  //-- sheet, and so tri-state ports keep the side they were placed on.
  var ifaceFromBlocks = function (blocks, label) {
    var iface = {
      label: label || '',
      portsIn: [],
      portsOut: [],
      inoutLeft: [],
      inoutRight: [],
      params: [],
    };
    (blocks || []).forEach(function (block) {
      if (!isWiredBoundary(block) || !block.data || !block.data.name) {
        return;
      }
      var port = { name: block.data.name, range: block.data.range || '' };
      if (block.type === 'basic.constant' || block.type === 'basic.memory') {
        iface.params.push(port);
      } else if (block.type === 'basic.input') {
        (block.data.inout ? iface.inoutLeft : iface.portsIn).push(port);
      } else {
        (block.data.inout ? iface.inoutRight : iface.portsOut).push(port);
      }
    });
    return iface;
  };

  //-- Rebuild the wires between the boundary blocks and the linked code block.
  //--
  //-- Only wires whose other end is a boundary block are replaced: wires the
  //-- user drew from a code port to some other block inside the submodule are
  //-- left alone.
  //--
  //-- Returns the new wire list (the input list is not modified).
  var rebuildWires = function (blocks, wires, codeBlock) {
    var codeId = codeBlock.id;
    var boundaryIds = {};
    var knownIds = {};
    (blocks || []).forEach(function (block) {
      knownIds[block.id] = true;
      if (isWiredBoundary(block)) {
        boundaryIds[block.id] = true;
      }
    });

    var kept = (wires || []).filter(function (wire) {
      var src = (wire.source && wire.source.block) || null;
      var tgt = (wire.target && wire.target.block) || null;
      //-- Editing the port list drops boundary blocks; the wires that hung
      //-- off them would otherwise survive as dangling references.
      if (!knownIds[src] || !knownIds[tgt]) {
        return false;
      }
      if (src !== codeId && tgt !== codeId) {
        return true;
      }
      var other = src === codeId ? tgt : src;
      return !boundaryIds[other];
    });

    (blocks || []).forEach(function (block) {
      if (!isWiredBoundary(block)) {
        return;
      }
      var name = block.data && block.data.name;
      if (!name) {
        return;
      }
      var wire;
      if (block.type === 'basic.constant' || block.type === 'basic.memory') {
        wire = {
          source: {
            block: block.id,
            port: block.type === 'basic.memory' ? 'memory-out' : 'constant-out',
          },
          target: { block: codeId, port: name },
        };
      } else if (block.type === 'basic.input') {
        wire = {
          source: { block: block.id, port: 'out' },
          target: { block: codeId, port: name },
        };
      } else {
        wire = {
          source: { block: codeId, port: name },
          target: { block: block.id, port: 'in' },
        };
      }
      var size = rangeToSize(block.data.range);
      if (size) {
        wire.size = size;
      }
      kept.push(wire);
    });

    return kept;
  };

  //-- Re-derive the linked code block of a submodule design from its current
  //-- boundary blocks, creating it when the submodule has just been linked.
  //--
  //-- `iface` carries the submodule interface as the settings dialog knows it
  //-- ({label, portsIn, portsOut, inoutLeft, inoutRight, params}).
  //-- Returns the linked code block.
  //-- The code block a freshly ticked "linked code module" should adopt: a
  //-- submodule that already holds exactly one code block is the very case
  //-- this option exists for, so link that one instead of adding a second.
  var soleCodeBlock = function (blocks) {
    var found = null;
    var count = 0;
    (blocks || []).forEach(function (block) {
      if (block && block.type === 'basic.code') {
        count++;
        found = block;
      }
    });
    return count === 1 ? found : null;
  };

  var resyncDesign = function (graph, iface, newId) {
    var codeBlock =
      findLinkedBlock(graph.blocks) || soleCodeBlock(graph.blocks);
    if (codeBlock) {
      applyInterface(codeBlock, iface);
    } else {
      codeBlock = createBlock(newId, iface, '');
      graph.blocks.push(codeBlock);
    }
    graph.wires = rebuildWires(graph.blocks, graph.wires, codeBlock);
    return codeBlock;
  };

  //-- Drop the link without destroying the code block the user wrote
  var unlinkDesign = function (graph) {
    var codeBlock = findLinkedBlock(graph.blocks);
    if (codeBlock) {
      delete codeBlock.data.linked;
    }
    return codeBlock;
  };

  return {
    CODE_X: CODE_X,
    CODE_Y: CODE_Y,
    CODE_WIDTH: CODE_WIDTH,
    isLinkedBlock: isLinkedBlock,
    isLinkedCell: isLinkedCell,
    findLinkedBlock: findLinkedBlock,
    findLinkedCell: findLinkedCell,
    codeHeight: codeHeight,
    rangeToSize: rangeToSize,
    toCodePort: toCodePort,
    applyInterface: applyInterface,
    createBlock: createBlock,
    isWiredBoundary: isWiredBoundary,
    ifaceFromBlocks: ifaceFromBlocks,
    soleCodeBlock: soleCodeBlock,
    rebuildWires: rebuildWires,
    resyncDesign: resyncDesign,
    unlinkDesign: unlinkDesign,
  };
})();
