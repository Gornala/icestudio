'use strict';

// Standalone Verilog-project importer.
// Parses a hierarchy of .v files starting from top.v, builds icestudio
// blocks for each module (bottom-up), and produces a top-level canvas that
// shows the top module as a single navigable submodule block.
//
// Usage:
//   window._iceVerilogImporter.importProject(topVPath, {
//     nodeFs: require('fs'),
//     nodePath: require('path'),
//     computeId: function(block) { return utils.dependencyID(block); }
//   }).then(function(result) {
//     // result.design      → top-level design {board, graph}
//     // result.dependencies → flat map of typeId → block
//   });

window._iceVerilogImporter = (function () {
  // ── Layout constants ──────────────────────────────────────────────────────
  var GRID_COLS = 3; // max instances per row

  // ── Label color palette (CSS preset values, no green — ports stay green) ──
  var LABEL_COLORS = [
    'indianred',
    'red',
    'deeppink',
    'mediumvioletred',
    'coral',
    'orangered',
    'darkorange',
    'gold',
    'yellow',
    'fuchsia',
    'slateblue',
    'turquoise',
    'steelblue',
    'deepskyblue',
    'royalblue',
    'navy',
  ];

  // Deterministic color for a signal name: matching names always get the
  // same color, so outputLabel("sig") and inputLabel("sig") share a color.
  var sigColor = function (name) {
    var h = 5381;
    for (var i = 0; i < name.length; i++) {
      h = h * 33 + name.charCodeAt(i);
    }
    return LABEL_COLORS[Math.abs(h) % LABEL_COLORS.length];
  };

  // ── Verilog keywords (never valid module / instance names) ────────────────
  var KW = new Set([
    'module',
    'input',
    'output',
    'inout',
    'wire',
    'reg',
    'logic',
    'assign',
    'always',
    'begin',
    'end',
    'if',
    'else',
    'for',
    'while',
    'case',
    'endcase',
    'parameter',
    'localparam',
    'generate',
    'endgenerate',
    'initial',
    'function',
    'task',
    'endfunction',
    'endtask',
    'posedge',
    'negedge',
    'integer',
    'real',
    'time',
    'endmodule',
    'buf',
    'not',
    'and',
    'or',
    'xor',
    'nand',
    'nor',
    'xnor',
    'signed',
    'unsigned',
    'tri',
    'supply0',
    'supply1',
    'defparam',
    'specify',
    'endspecify',
    'fork',
    'join',
    'wait',
    'disable',
    'deassign',
    'force',
    'release',
  ]);

  // ── Minimum block width so the header title + settings button fit ────────
  // 11px bold monospace ≈ 7 px/char; button+padding = 36 px; grid = 8 px.
  var headerMinW = function (name) {
    return Math.max(96, Math.ceil(((name || '').length * 7 + 36) / 8) * 8);
  };

  // ── UID generator — reset to 0 at the start of each import run ───────────
  var _seq = 0;
  var uid = function () {
    _seq = _seq + 1;
    return 'iv' + _seq;
  };

  // ── Strip Verilog comments ────────────────────────────────────────────────
  var stripComments = function (code) {
    return code.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  };

  // ── Parse a [hi:lo] range string → { range, size } ───────────────────────
  var parseRange = function (rangeStr) {
    if (!rangeStr || !rangeStr.trim()) {
      return { range: null, size: 1 };
    }
    var m = rangeStr.trim().match(/\[(\d+)\s*:\s*(\d+)\]/);
    if (m) {
      return {
        range: rangeStr.trim(),
        size: Math.abs(parseInt(m[1], 10) - parseInt(m[2], 10)) + 1,
      };
    }
    return { range: rangeStr.trim(), size: 1 };
  };

  // ── Parse all port declarations (ANSI and non-ANSI) ───────────────────────
  var parsePorts = function (headerStr, bodyStr) {
    var src = stripComments((headerStr || '') + '\n' + (bodyStr || ''));
    var inputs = [],
      outputs = [];
    var seen = new Set();

    var portRe =
      /\b(input|output)\b\s+(?:reg\s+|wire\s+|logic\s+|signed\s+|(?:wire|reg|logic)\s+signed\s+)?(\[[^\]]*\]\s+)?([\w\s,]+?)(?=[;,]|\b(?:input|output|inout|wire|reg|logic|assign|always|parameter|localparam|endmodule)\b|$)/gm;
    var m;
    while ((m = portRe.exec(src)) !== null) {
      var dir = m[1];
      var rInfo = parseRange(m[2] ? m[2].trim() : '');
      var nameChunk = m[3] || '';
      var names = nameChunk
        .split(',')
        .map(function (s) {
          return s.trim().replace(/\s+/g, '');
        })
        .filter(function (n) {
          return n && /^\w+$/.test(n) && !KW.has(n);
        });

      names.forEach(function (name) {
        var key = dir + ':' + name;
        if (!seen.has(key)) {
          seen.add(key);
          var entry = { name: name, range: rInfo.range, size: rInfo.size };
          if (dir === 'input') {
            inputs.push(entry);
          } else {
            outputs.push(entry);
          }
        }
      });
    }

    var outNames = new Set(
      outputs.map(function (p) {
        return p.name;
      })
    );
    inputs = inputs.filter(function (p) {
      return !outNames.has(p.name);
    });

    return { inputs: inputs, outputs: outputs };
  };

  // ── Parse module instantiations (named-port style only) ──────────────────
  var parseInstances = function (bodyStr) {
    var src = stripComments(bodyStr);
    var results = [];

    var instRe =
      /\b([A-Za-z_]\w*)\s+(?:#\s*\([^)]*\)\s+)?([A-Za-z_]\w*)\s*\(([\s\S]*?)\)\s*;/g;
    var m;
    while ((m = instRe.exec(src)) !== null) {
      var modType = m[1];
      var instName = m[2];
      var portStr = m[3];

      if (KW.has(modType) || KW.has(instName)) {
        continue;
      }

      var ports = {};
      var pr;
      var pRe = /\.(\w+)\s*\(\s*([\w\[\]:\s]*?)\s*\)/g;
      while ((pr = pRe.exec(portStr)) !== null) {
        var sig = pr[2].trim();
        if (sig) {
          ports[pr[1]] = sig;
        }
      }

      // Skip positional-only instantiations (not supported)
      if (Object.keys(ports).length === 0 && portStr.trim() !== '') {
        continue;
      }

      results.push({ type: modType, name: instName, ports: ports });
    }

    return results;
  };

  // ── Parse the first module...endmodule block from code ────────────────────
  var parseOneModule = function (code) {
    var clean = stripComments(code);
    var modRe =
      /\bmodule\s+(\w+)\s*(?:#\([^)]*\))?\s*\(([\s\S]*?)\)\s*;([\s\S]*?)\bendmodule\b/;
    var m = clean.match(modRe);
    if (!m) {
      return null;
    }

    var name = m[1];
    var header = m[2] || '';
    var body = m[3] || '';
    var ports = parsePorts(header, body);
    var insts = parseInstances(body);

    var cleanBody = body.replace(/\b(input|output|inout)\b[^;]+;/g, '').trim();

    return {
      name: name,
      inputs: ports.inputs,
      outputs: ports.outputs,
      instances: insts,
      body: cleanBody,
    };
  };

  // ── Parse ALL module blocks in a file ─────────────────────────────────────
  var parseAllModules = function (code) {
    var clean = stripComments(code);
    var result = [];
    var startRe = /\bmodule\s+\w+/g;
    var sm;
    while ((sm = startRe.exec(clean)) !== null) {
      var startIdx = sm.index;
      var endIdx = clean.indexOf('endmodule', startIdx);
      if (endIdx < 0) {
        continue;
      }
      endIdx += 'endmodule'.length;
      // Use clean (not code) — stripComments shifts offsets so code.substring
      // with clean-based indices lands in the wrong place for files with
      // long comment headers.
      var snippet = clean.substring(startIdx, endIdx);
      var info = parseOneModule(snippet);
      if (info) {
        result.push(info);
      }
    }
    return result;
  };

  // ── Infer a stub module from instantiation evidence ───────────────────────
  // When a sub-module's source is missing, search all known modules'
  // instantiations to collect port names used when instantiating modType.
  var makeStubInfo = function (modType, allInfoMap) {
    var inputNames = new Set();
    Object.keys(allInfoMap).forEach(function (parentName) {
      var parentInfo = allInfoMap[parentName];
      if (!parentInfo || !parentInfo.instances) {
        return;
      }
      parentInfo.instances.forEach(function (inst) {
        if (inst.type !== modType) {
          return;
        }
        Object.keys(inst.ports).forEach(function (portName) {
          inputNames.add(portName);
        });
      });
    });

    var inputs = [];
    inputNames.forEach(function (n) {
      inputs.push({ name: n, range: null, size: 1 });
    });

    return {
      name: modType,
      inputs: inputs,
      outputs: [],
      instances: [],
      body: '// stub – source for ' + modType + ' was not found',
    };
  };

  // ── Pin array for virtual ports ───────────────────────────────────────────
  var makePins = function (size) {
    if (size <= 1) {
      return [{ index: '0', name: '', value: '0' }];
    }
    var pins = [];
    for (var i = 0; i < size; i++) {
      pins.push({ index: String(i), name: '', value: '0' });
    }
    return pins;
  };

  // ── LEAF design ───────────────────────────────────────────────────────────
  // Interior: one basic.code block + basic.input / basic.output boundaries.
  // Returns { graph, portMap: { inputs: {portName→blockId}, outputs: {portName→blockId} } }
  // The portMap ids are the UUIDs of the basic.input/basic.output blocks —
  // that is what loadGeneric uses as the port identifier on the parent's generic block.
  var buildLeafDesign = function (info) {
    var blocks = [];
    var wires = [];
    var inputMap = {};
    var outputMap = {};

    var codeId = uid();
    var yMid = Math.max(
      80,
      Math.ceil(Math.max(info.inputs.length, info.outputs.length) / 2) * 80
    );

    blocks.push({
      id: codeId,
      type: 'basic.code',
      data: {
        code: info.body || '',
        params: [],
        ports: {
          in: info.inputs.map(function (p) {
            return {
              name: p.name,
              range: p.range || null,
              size: p.size > 1 ? p.size : undefined,
            };
          }),
          out: info.outputs.map(function (p) {
            return {
              name: p.name,
              range: p.range || null,
              size: p.size > 1 ? p.size : undefined,
            };
          }),
          inoutLeft: [],
          inoutRight: [],
        },
        label: info.name,
      },
      position: { x: 250, y: yMid },
    });

    info.inputs.forEach(function (port, i) {
      var id = uid();
      inputMap[port.name] = id;
      blocks.push({
        id: id,
        type: 'basic.input',
        data: {
          name: port.name,
          pins: makePins(port.size),
          virtual: true,
          clock: false,
        },
        position: { x: 50, y: 80 + i * 80 },
      });
      wires.push({
        source: { block: id, port: 'out' },
        target: { block: codeId, port: port.name },
        vertices: [],
      });
    });

    info.outputs.forEach(function (port, i) {
      var id = uid();
      outputMap[port.name] = id;
      blocks.push({
        id: id,
        type: 'basic.output',
        data: { name: port.name, pins: makePins(port.size), virtual: true },
        position: { x: 750, y: 80 + i * 80 },
      });
      wires.push({
        source: { block: codeId, port: port.name },
        target: { block: id, port: 'in' },
        vertices: [],
      });
    });

    return {
      graph: { blocks: blocks, wires: wires },
      portMap: { inputs: inputMap, outputs: outputMap },
    };
  };

  // ── INTERMEDIATE design ────────────────────────────────────────────────────
  // Applies the same layout rules as buildTopCanvas:
  //   - Boundary I/O blocks: PORT_H = 64 px touching stack, centred vertically
  //   - Sub-instance blocks: height = max(numIn, numOut) * PORT_H, passed as
  //     explicit size so loadGeneric uses it (same mechanism as top canvas)
  //   - Labels aligned with sub-instance ports (iterates subInfo.inputs/outputs
  //     in declaration order so index matches the generic block's port order)
  //   - All gaps computed from port-label text widths, same formula as top canvas
  //
  // Boundary signals still use direct wires (no label), internal signals use
  // the outputLabel / inputLabel auto-connect pair.
  var buildIntermediateDesign = function (info, subIds, portMaps, allInfo) {
    var PORT_H = 64; // rendered height of a virtual I/O block; sub-instance port step
    var LABEL_H = 32; // rendered height of an inputLabel / outputLabel block
    var GRID = 8;
    var CHAR_W = 8.5; // Monaco 14 px monospace: approx px per character
    var EXTRA = 8; // breathing room beyond the computed minimum
    var MARGIN = 40; // outer and inter-column margin
    // SUB_W is computed after the first pass (max across all sub-instances)

    // Estimated rendered width of the widest virtual boundary I/O block.
    var estBlockWidth = function (ports) {
      var maxW = 96;
      ports.forEach(function (p) {
        var w = p.name.length * 9 + 50;
        if (w > maxW) {
          maxW = w;
        }
      });
      return Math.ceil(maxW / GRID) * GRID;
    };

    // Minimum gap so the sub-instance's port labels don't overlap the label
    // blocks placed next to it (same geometry as buildTopCanvas.portGap).
    var portGap = function (portNames) {
      var maxLW = 0;
      portNames.forEach(function (n) {
        var w = n.length * CHAR_W;
        if (w > maxLW) {
          maxLW = w;
        }
      });
      return Math.max(MARGIN, Math.ceil((maxLW + 32 + EXTRA) / GRID) * GRID);
    };

    // Estimated rendered width of an outputLabel / inputLabel block.
    // Label blocks: max(name * 8.5 + 60, 64), snapped up to GRID.
    var estLabelW = function (sigName) {
      return Math.max(
        64,
        Math.ceil((sigName.length * CHAR_W + 60) / GRID) * GRID
      );
    };

    var blocks = [];
    var wires = [];
    var inputMap = {};
    var outputMap = {};

    // ── First pass: compute max dimensions across all sub-instances ─────────
    var maxSubH = PORT_H;
    var maxSubW = 96; // will become SUB_W after the pass
    var maxLblLeftW = 64;
    var maxLblRightW = 64;
    var maxSubInGap = MARGIN;
    var maxSubOutGap = MARGIN;

    info.instances.forEach(function (inst) {
      var subPortMap = portMaps[inst.type];
      if (!subPortMap) {
        return;
      }
      var subInfo = (allInfo && allInfo[inst.type]) || {
        inputs: [],
        outputs: [],
      };

      var nIn = Object.keys(subPortMap.inputs).length;
      var nOut = Object.keys(subPortMap.outputs).length;
      var subH = Math.max(nIn, nOut, 1) * PORT_H;
      if (subH > maxSubH) {
        maxSubH = subH;
      }

      var instMinW = headerMinW(subInfo.name || inst.type);
      if (instMinW > maxSubW) {
        maxSubW = instMinW;
      }

      var ig = portGap(
        subInfo.inputs.map(function (p) {
          return p.name;
        })
      );
      var og = portGap(
        subInfo.outputs.map(function (p) {
          return p.name;
        })
      );
      if (ig > maxSubInGap) {
        maxSubInGap = ig;
      }
      if (og > maxSubOutGap) {
        maxSubOutGap = og;
      }

      // All signals get label blocks now — track widths regardless of boundary
      Object.keys(inst.ports).forEach(function (portName) {
        var sig = inst.ports[portName];
        if (!sig) {
          return;
        }
        var w;
        if (subPortMap.inputs.hasOwnProperty(portName)) {
          w = estLabelW(sig);
          if (w > maxLblLeftW) {
            maxLblLeftW = w;
          }
        } else if (subPortMap.outputs.hasOwnProperty(portName)) {
          w = estLabelW(sig);
          if (w > maxLblRightW) {
            maxLblRightW = w;
          }
        }
      });
    });

    // ── Grid cell and area geometry ──────────────────────────────────────────
    // SUB_W: uniform width for all sub-instance blocks (max across all instances
    // so the narrowest name still gets a wide-enough header).
    var SUB_W = maxSubW;
    // CELL_W: width of one sub-instance column including its surrounding labels.
    // Each column occupies CELL_W + MARGIN horizontally (MARGIN = inter-col gap).
    var nCols = Math.min(GRID_COLS, Math.max(1, info.instances.length));
    var CELL_W =
      maxLblLeftW + maxSubInGap + SUB_W + maxSubOutGap + maxLblRightW;
    var CELL_H = maxSubH + 2 * MARGIN;

    // Boundary port stack geometry (same rules as buildTopCanvas)
    var numIn = info.inputs.length;
    var numOut = info.outputs.length;
    var numMax = Math.max(numIn, numOut, 1);

    var maxBndInW = numIn > 0 ? estBlockWidth(info.inputs) : 96;

    // bndInGap: wide enough for both sub-instance port labels (portGap) and
    // the boundary inputLabel blocks placed in this gap (estLabelW + margin).
    var maxBndInLblW = 64;
    if (numIn > 0) {
      info.inputs.forEach(function (p) {
        var w = estLabelW(p.name);
        if (w > maxBndInLblW) {
          maxBndInLblW = w;
        }
      });
    }
    var bndInGap = Math.max(
      numIn > 0
        ? portGap(
            info.inputs.map(function (p) {
              return p.name;
            })
          )
        : MARGIN,
      maxBndInLblW + 16
    );

    // bndOutGap: wide enough for the boundary outputLabel blocks placed here.
    var maxBndOutLblW = 64;
    if (numOut > 0) {
      info.outputs.forEach(function (p) {
        var w = estLabelW(p.name);
        if (w > maxBndOutLblW) {
          maxBndOutLblW = w;
        }
      });
    }
    var bndOutGap = Math.max(
      numOut > 0
        ? portGap(
            info.outputs.map(function (p) {
              return p.name;
            })
          )
        : MARGIN,
      maxBndOutLblW + 8
    );

    // instAreaX: x where column 0 starts (its left label's left edge)
    var instAreaX = MARGIN + maxBndInW + bndInGap;
    var instAreaY = MARGIN;
    // gridRight: x where boundary outputs are placed
    var gridRight = instAreaX + nCols * (CELL_W + MARGIN) - MARGIN + bndOutGap;

    var inOffY = Math.round((numMax - numIn) / 2) * PORT_H;
    var outOffY = Math.round((numMax - numOut) / 2) * PORT_H;

    // ── Boundary inputs ──────────────────────────────────────────────────────
    // Each boundary input is routed through a label pair so no wire crosses
    // the canvas: basic.input → inputLabel … (auto-connect) … outputLabel → sub-instance
    info.inputs.forEach(function (port, i) {
      var bId = uid();
      inputMap[port.name] = bId;
      var portY = instAreaY + inOffY + i * PORT_H;
      blocks.push({
        id: bId,
        type: 'basic.input',
        data: {
          name: port.name,
          pins: makePins(port.size),
          virtual: true,
          clock: false,
        },
        position: { x: MARGIN, y: portY },
      });
      var lblId = uid();
      blocks.push({
        id: lblId,
        type: 'basic.inputLabel',
        data: { name: port.name, range: '', blockColor: sigColor(port.name) },
        position: {
          x: MARGIN + maxBndInW + 8,
          y: portY + Math.round((PORT_H - LABEL_H) / 2),
        },
      });
      wires.push({
        source: { block: bId, port: 'out' },
        target: { block: lblId, port: 'inlabel' },
        vertices: [],
      });
    });

    // ── Boundary outputs ─────────────────────────────────────────────────────
    // Each boundary output is routed through a label pair:
    // sub-instance → inputLabel … (auto-connect) … outputLabel → basic.output
    info.outputs.forEach(function (port, i) {
      var bId = uid();
      outputMap[port.name] = bId;
      var portY = instAreaY + outOffY + i * PORT_H;
      blocks.push({
        id: bId,
        type: 'basic.output',
        data: { name: port.name, pins: makePins(port.size), virtual: true },
        position: { x: gridRight, y: portY },
      });
      var lblId = uid();
      var lblW = estLabelW(port.name);
      blocks.push({
        id: lblId,
        type: 'basic.outputLabel',
        data: { name: port.name, range: '', blockColor: sigColor(port.name) },
        position: {
          x: gridRight - lblW - 8,
          y: portY + Math.round((PORT_H - LABEL_H) / 2),
        },
      });
      wires.push({
        source: { block: lblId, port: 'outlabel' },
        target: { block: bId, port: 'in' },
        vertices: [],
      });
    });

    // ── Sub-instance blocks + connections ────────────────────────────────────
    info.instances.forEach(function (inst, idx) {
      var typeId = subIds[inst.type];
      if (!typeId) {
        return;
      }
      var subPortMap = portMaps[inst.type];
      if (!subPortMap) {
        return;
      }
      var subInfo = (allInfo && allInfo[inst.type]) || {
        inputs: [],
        outputs: [],
      };

      var nIn = Object.keys(subPortMap.inputs).length;
      var nOut = Object.keys(subPortMap.outputs).length;
      var subH = Math.max(nIn, nOut, 1) * PORT_H;
      var subIG = portGap(
        subInfo.inputs.map(function (p) {
          return p.name;
        })
      );
      var subOG = portGap(
        subInfo.outputs.map(function (p) {
          return p.name;
        })
      );

      var col = idx % nCols;
      var row = Math.floor(idx / nCols);

      // Sub-instance top-left: labels sit to the left, aligned to maxLblLeftW
      var cellX = instAreaX + col * (CELL_W + MARGIN);
      var cellY = instAreaY + row * CELL_H;
      var cx = cellX + maxLblLeftW + maxSubInGap;
      // Centre sub-instance vertically within cell
      var cy = cellY + Math.round((CELL_H - subH) / 2 / GRID) * GRID;

      var instId = uid();
      blocks.push({
        id: instId,
        type: typeId,
        data: {},
        position: { x: cx, y: cy },
        size: { width: SUB_W, height: subH },
      });

      // x where right-side labels start (after sub-instance right edge + gap)
      var lblRightX = cx + SUB_W + subOG;

      // Iterate inputs in sub-module declaration order so portOrderIdx matches
      // the generic block's leftPort index -> labels align with ports.
      // Port i center (relative to block top) = (i + 0.5) / total * subH,
      // so we use that formula for lbl Y rather than i * PORT_H (which only
      // works when nIn == numMax, i.e. the taller side).
      subInfo.inputs.forEach(function (subPort, portOrderIdx) {
        var portName = subPort.name;
        if (!inst.ports.hasOwnProperty(portName)) {
          return;
        }
        var sig = inst.ports[portName];
        if (!sig) {
          return;
        }

        var lblY =
          Math.round(
            (cy + ((portOrderIdx + 0.5) / nIn) * subH - LABEL_H / 2) / GRID
          ) * GRID;

        var lblIn = uid();
        var lblW = estLabelW(sig);
        blocks.push({
          id: lblIn,
          type: 'basic.outputLabel',
          data: { name: sig, range: '', blockColor: sigColor(sig) },
          position: { x: cx - subIG - lblW, y: lblY },
        });
        wires.push({
          source: { block: lblIn, port: 'outlabel' },
          target: { block: instId, port: subPortMap.inputs[portName] },
          vertices: [],
        });
      });

      // Iterate outputs in sub-module declaration order (same reason)
      subInfo.outputs.forEach(function (subPort, portOrderIdx) {
        var portName = subPort.name;
        if (!inst.ports.hasOwnProperty(portName)) {
          return;
        }
        var sig = inst.ports[portName];
        if (!sig) {
          return;
        }

        var lblY =
          Math.round(
            (cy + ((portOrderIdx + 0.5) / nOut) * subH - LABEL_H / 2) / GRID
          ) * GRID;

        var lblOut = uid();
        blocks.push({
          id: lblOut,
          type: 'basic.inputLabel',
          data: { name: sig, range: '', blockColor: sigColor(sig) },
          position: { x: lblRightX, y: lblY },
        });
        wires.push({
          source: { block: instId, port: subPortMap.outputs[portName] },
          target: { block: lblOut, port: 'inlabel' },
          vertices: [],
        });
      });
    });

    return {
      graph: { blocks: blocks, wires: wires },
      portMap: { inputs: inputMap, outputs: outputMap },
    };
  };

  // ── TOP CANVAS ────────────────────────────────────────────────────────────
  // Layout rules:
  //   • I/O blocks form a touching vertical stack (step = PORT_H = 64 px)
  //   • Module height = max(numInputs, numOutputs) x PORT_H so its port step
  //     also equals PORT_H -> wires on the taller side are perfectly horizontal
  //   • The shorter side is centred vertically within the module height
  //   • Gap between I/O stack and module is wide enough that the module's port
  //     labels (Monaco 14 px) are fully readable without overlapping the blocks
  var buildTopCanvas = function (topTypeId, topPortMap, topInfo) {
    var PORT_H = 64; // rendered height of a virtual basic.input/output block
    var GRID = 8; // icestudio grid size
    var MARGIN = 40; // left/top margin
    var MODULE_W = headerMinW(topInfo.name); // wide enough for header title + button
    var CHAR_W = 8.5; // Monaco 14 px monospace: approx px per character
    var EXTRA = 8; // breathing room beyond the computed minimum

    // Estimated rendered width of the widest virtual I/O block in a port list.
    // Virtual blocks: max(name.length * 9 + 50, 96), snapped up to GRID.
    var estBlockWidth = function (ports) {
      var maxW = 96;
      ports.forEach(function (p) {
        var w = p.name.length * 9 + 50;
        if (w > maxW) {
          maxW = w;
        }
      });
      return Math.ceil(maxW / GRID) * GRID;
    };

    // Minimum gap so the module's port labels don't overlap the I/O blocks.
    //
    // Left-port labels are right-aligned at (moduleX - 16 px); the matching
    // I/O block's 'out' port circle sits 16 px right of the block's right edge.
    // Clearance needed: labelTextWidth + 32 (two 16 px port offsets) + EXTRA.
    // The same geometry holds symmetrically for right-port labels vs outputs.
    var portGap = function (ports) {
      var maxLabelW = 0;
      ports.forEach(function (p) {
        var w = p.name.length * CHAR_W;
        if (w > maxLabelW) {
          maxLabelW = w;
        }
      });
      var min = Math.ceil((maxLabelW + 32 + EXTRA) / GRID) * GRID;
      return Math.max(40, min);
    };

    var numIn = topInfo.inputs.length;
    var numOut = topInfo.outputs.length;
    var numMax = Math.max(numIn, numOut, 1);

    var maxInW = numIn > 0 ? estBlockWidth(topInfo.inputs) : 96;

    var inGap = numIn > 0 ? portGap(topInfo.inputs) : 40;
    var outGap = numOut > 0 ? portGap(topInfo.outputs) : 40;

    var moduleH = numMax * PORT_H;
    var moduleX = MARGIN + maxInW + inGap;
    var moduleY = MARGIN;
    var outputX = moduleX + MODULE_W + outGap;

    // Vertical offset to centre the shorter side within the module height.
    // (numMax - numSide) * PORT_H / 2 is always a multiple of GRID because
    // PORT_H = 64 and (numMax - numSide) is a non-negative integer.
    var inOffY = Math.round((numMax - numIn) / 2) * PORT_H;
    var outOffY = Math.round((numMax - numOut) / 2) * PORT_H;

    var blocks = [];
    var wires = [];
    var instId = uid();

    // Module block — explicit size so port step matches PORT_H on both sides
    blocks.push({
      id: instId,
      type: topTypeId,
      data: {},
      position: { x: moduleX, y: moduleY },
      size: { width: MODULE_W, height: moduleH },
    });

    topInfo.inputs.forEach(function (port, i) {
      var bId = uid();
      blocks.push({
        id: bId,
        type: 'basic.input',
        data: {
          name: port.name,
          pins: makePins(port.size),
          virtual: true,
          clock: false,
        },
        position: { x: MARGIN, y: moduleY + inOffY + i * PORT_H },
      });
      if (topPortMap.inputs[port.name]) {
        wires.push({
          source: { block: bId, port: 'out' },
          target: { block: instId, port: topPortMap.inputs[port.name] },
          vertices: [],
        });
      }
    });

    topInfo.outputs.forEach(function (port, i) {
      var bId = uid();
      blocks.push({
        id: bId,
        type: 'basic.output',
        data: { name: port.name, pins: makePins(port.size), virtual: true },
        position: { x: outputX, y: moduleY + outOffY + i * PORT_H },
      });
      if (topPortMap.outputs[port.name]) {
        wires.push({
          source: { block: instId, port: topPortMap.outputs[port.name] },
          target: { block: bId, port: 'in' },
          vertices: [],
        });
      }
    });

    return { blocks: blocks, wires: wires };
  };

  // ── Port connectivity check ────────────────────────────────────────────────
  // For each parsed module: a port is "dangling" if its name never appears
  // in the module body text AND never appears as a signal value in any
  // sub-instance port connection.  Dangling ports are removed in-place.
  // Returns an array of human-readable warning strings (one per module that
  // had issues).
  var checkAndCleanPorts = function (allInfo) {
    var warnings = [];

    Object.keys(allInfo).forEach(function (modName) {
      var info = allInfo[modName];
      if (!info) {
        return;
      }

      // Collect every signal name that appears in sub-instance connections
      var usedSignals = new Set();
      info.instances.forEach(function (inst) {
        Object.keys(inst.ports).forEach(function (pn) {
          var sig = inst.ports[pn];
          if (sig) {
            usedSignals.add(sig);
          }
        });
      });

      var body = info.body || '';
      var isDangling = function (p) {
        if (usedSignals.has(p.name)) {
          return false;
        }
        var re = new RegExp(
          '\\b' + p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b'
        );
        return !re.test(body);
      };

      var badOutputs = info.outputs.filter(isDangling);
      var badInputs = info.inputs.filter(isDangling);

      if (badOutputs.length === 0 && badInputs.length === 0) {
        return;
      }

      var parts = [];
      if (badOutputs.length > 0) {
        parts.push(
          'undriven output' +
            (badOutputs.length > 1 ? 's' : '') +
            ': ' +
            badOutputs
              .map(function (p) {
                return p.name;
              })
              .join(', ')
        );
      }
      if (badInputs.length > 0) {
        parts.push(
          'unconnected input' +
            (badInputs.length > 1 ? 's' : '') +
            ': ' +
            badInputs
              .map(function (p) {
                return p.name;
              })
              .join(', ')
        );
      }
      warnings.push(modName + ' – ' + parts.join('; '));

      var dropOut = new Set(
        badOutputs.map(function (p) {
          return p.name;
        })
      );
      var dropIn = new Set(
        badInputs.map(function (p) {
          return p.name;
        })
      );
      info.outputs = info.outputs.filter(function (p) {
        return !dropOut.has(p.name);
      });
      info.inputs = info.inputs.filter(function (p) {
        return !dropIn.has(p.name);
      });
    });

    return warnings;
  };

  // ── MAIN ENTRY POINT ──────────────────────────────────────────────────────
  var importProject = function (topVPath, deps) {
    var fs = deps.nodeFs;
    var path = deps.nodePath;
    var computeId = deps.computeId;

    return new Promise(function (resolve, reject) {
      try {
        _seq = 0;

        var dir = path.dirname(topVPath);

        // ── 1. Parse every .v file in the same directory ──────────────────
        var allInfo = {};
        var vFiles;
        try {
          vFiles = fs.readdirSync(dir);
        } catch (e) {
          vFiles = [];
        }
        vFiles = vFiles.filter(function (f) {
          return f.toLowerCase().endsWith('.v');
        });
        vFiles.forEach(function (f) {
          var code;
          try {
            code = fs.readFileSync(path.join(dir, f), 'utf8');
          } catch (e) {
            return;
          }
          parseAllModules(code).forEach(function (info) {
            allInfo[info.name] = info;
          });
        });

        // ── 2. Identify the top module ────────────────────────────────────
        // Parse the selected file; the LAST module in the file is the top
        // (handles files where helper modules are defined before the top).
        var topCode = fs.readFileSync(topVPath, 'utf8');
        var allInFile = parseAllModules(topCode);
        if (!allInFile.length) {
          reject('Could not parse any module from ' + path.basename(topVPath));
          return;
        }
        var topInfo = allInFile[allInFile.length - 1]; // last = top
        allInFile.forEach(function (info) {
          allInfo[info.name] = info;
        });

        // ── 2b. Remove dangling ports and collect warnings ────────────────
        var portWarnings = checkAndCleanPorts(allInfo);

        // ── 3. Topological sort (leaves first, INCLUDING top module) ──────
        var order = [];
        var vis = new Set();
        var visit = function (name) {
          if (vis.has(name)) {
            return;
          }
          vis.add(name);

          var info = allInfo[name];
          if (!info) {
            // Sub-module source not found — build a stub so we still get
            // a visible block with the ports inferred from parent callers.
            info = makeStubInfo(name, allInfo);
            allInfo[name] = info;
          }

          info.instances.forEach(function (inst) {
            visit(inst.type);
          });
          order.push(name);
        };

        // Seed with top module's direct children, then top itself
        topInfo.instances.forEach(function (inst) {
          visit(inst.type);
        });
        visit(topInfo.name); // always include top

        // ── 4. Build .ice blocks bottom-up ───────────────────────────────
        var subIds = {}; // moduleName → typeId
        var allDeps = {}; // typeId     → block
        var portMaps = {}; // moduleName → { inputs, outputs }

        order.forEach(function (name) {
          var info = allInfo[name];
          if (!info) {
            return;
          }

          var result =
            info.instances.length === 0
              ? buildLeafDesign(info)
              : buildIntermediateDesign(info, subIds, portMaps, allInfo);

          portMaps[name] = result.portMap;

          var block = {
            package: {
              name: info.name,
              version: '0.0',
              description: '',
              author: '',
              image: '',
            },
            design: { board: '', graph: result.graph },
            dependencies: {},
          };

          // Attach direct dependencies (and propagate transitive ones)
          info.instances.forEach(function (inst) {
            var tid = subIds[inst.type];
            if (!tid) {
              return;
            }
            block.dependencies[tid] = allDeps[tid];
            var nested = allDeps[tid] && allDeps[tid].dependencies;
            if (nested) {
              Object.keys(nested).forEach(function (dd) {
                block.dependencies[dd] = allDeps[dd] || nested[dd];
              });
            }
          });

          var typeId = computeId(block);
          subIds[name] = typeId;
          allDeps[typeId] = block;
        });

        // ── 5. Build the top-level canvas ─────────────────────────────────
        var topTypeId = subIds[topInfo.name];
        var topPortMap = portMaps[topInfo.name];

        if (!topTypeId || !topPortMap) {
          reject('Failed to build top-level block for ' + topInfo.name);
          return;
        }

        var topGraph = buildTopCanvas(topTypeId, topPortMap, topInfo);

        // ── 6. Resolve ────────────────────────────────────────────────────
        var flatDeps = {};
        Object.keys(allDeps).forEach(function (tid) {
          flatDeps[tid] = allDeps[tid];
        });

        resolve({
          design: { board: '', graph: topGraph },
          dependencies: flatDeps,
          warnings: portWarnings,
        });
      } catch (e) {
        reject(e.message || String(e));
      }
    });
  };

  return { importProject: importProject };
})();
