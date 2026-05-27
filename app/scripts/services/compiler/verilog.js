//---------------------------------------------------------------------------
//-- Verilog compiler: generates .v output from the circuit graph
//---------------------------------------------------------------------------
'use strict';

window._icecompiler = window._icecompiler || {};

window._icecompiler.verilog = function (ctx) {
  function getParams(project) {
    var params = [];
    var graph = project.design.graph;

    for (var i in graph.blocks) {
      var block = graph.blocks[i];

      // if no sysClkMhz is defined , no replacement is done, in this way the user is alerted because this empty parameter blocks
      // needs a value and the user should filled depending the board clock.

      let boardClkfreq =
        typeof ctx.common.selectedBoard.info.SysClkMhz !== 'undefined' &&
        ctx.common.selectedBoard.info.SysClkMhz.length !== false &&
        ctx.common.selectedBoard.info.SysClkMhz.length > 0
          ? ctx.common.selectedBoard.info.SysClkMhz.length
          : false;

      if (block.type === ctx.blocks.BASIC_CONSTANT) {
        if (boardClkfreq && block.data.value === 'SysClkMhz') {
          params.push({
            name: ctx.utils.digestId(block.id),
            value: boardClkfreq,
          });
        } else {
          params.push({
            name: ctx.utils.digestId(block.id),
            value: block.data.value,
          });
        }
      } else if (block.type === ctx.blocks.BASIC_MEMORY) {
        let name = ctx.utils.digestId(block.id);

        params.push({
          name: name,
          value: '"' + name + '.list"',
        });
      } else if (block.type === ctx.blocks.BASIC_JSON_INPUT) {
        var jsonObj = {};
        try {
          jsonObj = JSON.parse(block.data.content || '{}');
        } catch (e) {
          jsonObj = {};
        }
        (block.data.ports || []).forEach(function (pname) {
          params.push({
            name: ctx.utils.digestId(block.id) + '_' + pname,
            value: jsonObj[pname] !== undefined ? String(jsonObj[pname]) : '0',
          });
        });
      }
    }

    return params;
  }

  function getPorts(project) {
    var ports = {
      in: [],
      out: [],
      inout: [],
    };
    var graph = project.design.graph;

    for (var i in graph.blocks) {
      var block = graph.blocks[i];
      if (block.type === ctx.blocks.BASIC_INPUT) {
        if (
          typeof block.data.inout !== 'undefined' &&
          block.data.inout === true
        ) {
          ports.inout.push({
            name: ctx.utils.digestId(block.id),
            range: block.data.range ? block.data.range : '',
          });
        } else {
          ports.in.push({
            name: ctx.utils.digestId(block.id),
            range: block.data.range ? block.data.range : '',
          });
        }
      } else if (block.type === ctx.blocks.BASIC_OUTPUT) {
        if (
          typeof block.data.inout !== 'undefined' &&
          block.data.inout === true
        ) {
          ports.inout.push({
            name: ctx.utils.digestId(block.id),
            range: block.data.range ? block.data.range : '',
          });
        } else {
          ports.out.push({
            name: ctx.utils.digestId(block.id),
            range: block.data.range ? block.data.range : '',
          });
        }
      }
    }

    return ports;
  }

  function getContent(name, project) {
    var i, j, w;
    var content = [];
    var graph = ctx.utils.clone(project.design.graph);
    var connections = {
      localparam: [],
      wire: [],
      assign: [],
    };
    // We need to rearrange internal design specification to compile it
    // Convert virtual labels to wire and some stuff .

    var vwiresLut = {};
    var lidx, widx, lin, vw;
    var twire;

    //Create virtual wires

    //First identify sources and targets and create a look up table to work easy with it
    if (
      typeof graph !== 'undefined' &&
      graph.blocks.length > 0 &&
      graph.wires.length > 0
    ) {
      for (lidx in graph.blocks) {
        lin = graph.blocks[lidx];
        if (lin.type === ctx.blocks.BASIC_INPUT_LABEL) {
          for (widx in graph.wires) {
            vw = graph.wires[widx];
            if (vw.target.block === lin.id) {
              if (typeof vwiresLut[lin.data.name] === 'undefined') {
                vwiresLut[lin.data.name] = {
                  source: [],
                  target: [],
                };
              }
              twire = vw.source;
              twire.size = vw.size;
              vwiresLut[lin.data.name].source.push(twire);
            }
          }
        }
        if (lin.type === ctx.blocks.BASIC_OUTPUT_LABEL) {
          for (widx in graph.wires) {
            vw = graph.wires[widx];
            if (vw.source.block === lin.id) {
              if (typeof vwiresLut[lin.data.name] === 'undefined') {
                vwiresLut[lin.data.name] = {
                  source: [],
                  target: [],
                };
              }

              twire = vw.target;
              twire.size = vw.size;
              vwiresLut[lin.data.name].target.push(twire);
            }
          }
        }
      } //for lin
    } // if typeof....

    //Create virtual wires
    for (widx in vwiresLut) {
      vw = vwiresLut[widx];
      if (vw.source.length > 0 && vw.target.length > 0) {
        for (var vi = 0; vi < vw.source.length; vi++) {
          for (var vj = 0; vj < vw.target.length; vj++) {
            graph.wires.push({
              tcTodelete: true,
              size: vw.size,
              source: vw.source[vi],
              target: vw.target[vj],
              vertices: undefined,
            });
          }
        }
      }
    }

    // Remove virtual blocks
    // Save temporal wires and delete it

    graph.wiresVirtual = [];
    var wtemp = [];
    var iwtemp;
    var wi;
    for (wi = 0; wi < graph.wires.length; wi++) {
      if (
        graph.wires[wi].source.port === 'outlabel' ||
        graph.wires[wi].target.port === 'outlabel' ||
        graph.wires[wi].source.port === 'inlabel' ||
        graph.wires[wi].target.port === 'inlabel'
      ) {
        graph.wiresVirtual.push(graph.wires[wi]);
      } else {
        iwtemp = graph.wires[wi];
        if (typeof iwtemp.source.size !== 'undefined') {
          iwtemp.size = iwtemp.source.size;
        }
        wtemp.push(iwtemp);
      }
    }
    graph.wires = ctx.utils.clone(wtemp);
    // End of rearrange design connections for compilation

    // Pre-mark contained blocks and internal wires on the cloned graph so
    // that getInstances() and the wire loops below correctly skip them.
    // (compileGenerateFrame sets these flags on project.design.graph — the
    //  original — but the loops below operate on the local clone.)
    preMarkGenerateContainment(graph);

    for (w in graph.wires) {
      var wire = graph.wires[w];
      if (wire._genInternal) {
        continue; // Skip wires inside generate frames
      }
      if (
        wire.source.port === 'constant-out' ||
        wire.source.port === 'memory-out'
      ) {
        // Local Parameters
        var constantBlock = ctx.findBlock(wire.source.block, graph);
        var paramValue = ctx.utils.digestId(constantBlock.id);
        if (paramValue) {
          connections.localparam.push(
            'localparam p' + w + ' = ' + paramValue + ';'
          );
        }
      } else {
        var jsonSrcBlock = ctx.findBlock(wire.source.block, graph);
        if (jsonSrcBlock && jsonSrcBlock.type === ctx.blocks.BASIC_JSON_INPUT) {
          // JSON input port — treated as a named localparam
          var jsonParamName =
            ctx.utils.digestId(jsonSrcBlock.id) + '_' + wire.source.port;
          connections.localparam.push(
            'localparam p' + w + ' = ' + jsonParamName + ';'
          );
        } else {
          // Regular wires
          var wireSize = wire.size;
          if (!wireSize) {
            var srcBlk = ctx.findBlock(wire.source.block, graph);
            if (
              srcBlk &&
              srcBlk.type === ctx.blocks.BASIC_INPUT &&
              srcBlk.data &&
              srcBlk.data.range
            ) {
              var rm = srcBlk.data.range.match(/\[(\d+):(\d+)\]/);
              if (rm) {
                wireSize = parseInt(rm[1]) - parseInt(rm[2]) + 1;
              }
            }
            if (!wireSize) {
              var tgtBlk = ctx.findBlock(wire.target.block, graph);
              if (
                tgtBlk &&
                tgtBlk.type === ctx.blocks.BASIC_OUTPUT &&
                tgtBlk.data &&
                tgtBlk.data.range
              ) {
                var rm2 = tgtBlk.data.range.match(/\[(\d+):(\d+)\]/);
                if (rm2) {
                  wireSize = parseInt(rm2[1]) - parseInt(rm2[2]) + 1;
                }
              }
            }
          }
          var range = wireSize ? ' [' + (wireSize - 1) + ':0] ' : ' ';
          connections.wire.push('wire' + range + 'w' + w + ';');
        }
      }
      // Assign Statements
      for (i in graph.blocks) {
        var block = graph.blocks[i];
        if (block.type === ctx.blocks.BASIC_INPUT) {
          if (wire.source.block === block.id) {
            connections.assign.push(
              'assign w' + w + ' = ' + ctx.utils.digestId(block.id) + ';'
            );
          }
        } else if (block.type === ctx.blocks.BASIC_OUTPUT) {
          if (wire.target.block === block.id) {
            var outSrcBlock = ctx.findBlock(wire.source.block, graph);
            if (
              wire.source.port === 'constant-out' ||
              wire.source.port === 'memory-out' ||
              (outSrcBlock && outSrcBlock.type === ctx.blocks.BASIC_JSON_INPUT)
            ) {
              // localparam source — no assign needed
            } else {
              connections.assign.push(
                'assign ' + ctx.utils.digestId(block.id) + ' = w' + w + ';'
              );
            }
          }
        }
      }
    }

    content = content.concat(connections.localparam);
    content = content.concat(connections.wire);
    content = content.concat(connections.assign);

    // Wires Connections

    var numWires = graph.wires.length;
    var gwi, gwj;
    for (i = 1; i < numWires; i++) {
      gwi = graph.wires[i];
      if (gwi._genInternal) {
        continue; // Skip wires inside generate frames
      }
      for (j = 0; j < i; j++) {
        gwj = graph.wires[j];
        if (gwj._genInternal) {
          continue;
        }
        var dedupSrc = ctx.findBlock(gwi.source.block, graph);
        var isParamSrc =
          gwi.source.port === 'constant-out' ||
          gwi.source.port === 'memory-out' ||
          (dedupSrc && dedupSrc.type === ctx.blocks.BASIC_JSON_INPUT);
        if (
          gwi.source.block === gwj.source.block &&
          gwi.source.port === gwj.source.port &&
          !isParamSrc
        ) {
          content.push('assign w' + i + ' = w' + j + ';');
        }
      }
    }

    // Block instances

    content = content.concat(getInstances(name, graph));

    // Generate-for instantiations
    content = content.concat(getGenerateInstances(name, graph, graph.wires));

    // Restore original graph
    // delete temporal wires
    //

    wtemp = [];
    var wn = 0;
    for (wi = 0, wn = graph.wiresVirtual.length; wi < wn; wi++) {
      if (
        typeof graph.wiresVirtual[wi].tcTodelete !== 'undefined' &&
        graph.wiresVirtual[wi].tcTodelete === true
      ) {
        //Nothing for now, only remove
      } else {
        wtemp.push(graph.wiresVirtual[wi]);
      }
    }

    for (wi = 0, wn = graph.wires.length; wi < wn; wi++) {
      if (
        typeof graph.wires[wi].tcTodelete !== 'undefined' &&
        graph.wires[wi].tcTodelete === true
      ) {
        //Nothing for now, only remove
      } else {
        wtemp.push(graph.wires[wi]);
      }
    }

    graph.wires = wtemp;

    delete graph.wiresVirtual;
    //END ONWORK

    return content.join('\n');
  }

  function getInstances(name, graph) {
    var w, wire;
    var instances = [];
    var blockArray = graph.blocks;

    for (var b in blockArray) {
      var block = blockArray[b];

      if (
        block.type !== ctx.blocks.BASIC_INPUT &&
        block.type !== ctx.blocks.BASIC_OUTPUT &&
        block.type !== ctx.blocks.BASIC_CONSTANT &&
        block.type !== ctx.blocks.BASIC_MEMORY &&
        block.type !== ctx.blocks.BASIC_INFO &&
        block.type !== ctx.blocks.BASIC_INPUT_LABEL &&
        block.type !== ctx.blocks.BASIC_OUTPUT_LABEL &&
        block.type !== ctx.blocks.BASIC_JSON_INPUT &&
        block.type !== ctx.blocks.BASIC_JSON_OUTPUT &&
        block.type !== ctx.blocks.BASIC_GENERATE &&
        block.type !== ctx.blocks.BASIC_INFO_FRAME &&
        !block._genContained
      ) {
        // Header
        var instance;
        if (block.type === ctx.blocks.BASIC_CODE) {
          instance = name + '_' + ctx.utils.digestId(block.id);
        } else {
          let prefix = ctx.currentLibrary[block.type].package.name ?? '';
          prefix = ctx.utils.normalizeVerilogName(prefix);
          if (prefix.length > 0) {
            prefix += '__';
          }
          instance = `${prefix}${ctx.utils.digestId(block.type)}`;
        }

        //-- Parameters

        var params = [];
        for (w in graph.wires) {
          wire = graph.wires[w];
          var instSrcBlock = ctx.findBlock(wire.source.block, graph);
          var isInstParamSrc =
            wire.source.port === 'constant-out' ||
            wire.source.port === 'memory-out' ||
            (instSrcBlock && instSrcBlock.type === ctx.blocks.BASIC_JSON_INPUT);
          if (block.id === wire.target.block && isInstParamSrc) {
            var paramName = wire.target.port;
            if (block.type !== ctx.blocks.BASIC_CODE) {
              paramName = ctx.utils.digestId(paramName);
            }
            paramName =
              paramName.charAt(0) === '@' ? paramName.substr(1) : paramName;
            var param = '';
            param += ' .' + paramName;
            param += '(p' + w + ')';
            params.push(param);
          }
        }

        if (params.length > 0) {
          instance += ' #(\n' + params.join(',\n') + '\n)';
        }

        //-- Instance name

        instance += ' ' + ctx.utils.digestId(block.id);

        //-- Ports

        var ports = [];
        var portsNames = [];
        for (w in graph.wires) {
          wire = graph.wires[w];
          if (block.id === wire.source.block) {
            connectPort(wire.source.port, portsNames, ports, block);
          }
          if (block.id === wire.target.block) {
            var portSrcBlock = ctx.findBlock(wire.source.block, graph);
            var isPortParamSrc =
              wire.source.port === 'constant-out' ||
              wire.source.port === 'memory-out' ||
              (portSrcBlock &&
                portSrcBlock.type === ctx.blocks.BASIC_JSON_INPUT);
            if (!isPortParamSrc) {
              connectPort(wire.target.port, portsNames, ports, block);
            }
          }
        }

        instance += ' (\n' + ports.join(',\n') + '\n);';

        if (instance) {
          instances.push(instance);
        }
      }
    }

    function connectPort(portName, portsNames, ports, block) {
      if (portName) {
        if (block.type !== ctx.blocks.BASIC_CODE) {
          portName = ctx.utils.digestId(portName);
        }
        if (portsNames.indexOf(portName) === -1) {
          portsNames.push(portName);
          portName = portName.charAt(0) === '@' ? portName.substr(1) : portName;
          var port = '';
          port += ' .' + portName;
          port += '(w' + w + ')';
          ports.push(port);
        }
      }
    }

    return instances;
  }

  //-------------------------------------------------------------------
  //-- Instantiate generate frame modules (single instance each —
  //-- the generate-for loop lives inside the frame sub-module)
  //-------------------------------------------------------------------
  function getGenerateInstances(name, graph, wires) {
    var instances = [];
    var blockArray = graph.blocks;

    for (var b in blockArray) {
      var genBlock = blockArray[b];
      if (genBlock.type !== ctx.blocks.BASIC_GENERATE) {
        continue;
      }

      var genId = ctx.utils.digestId(genBlock.id);
      var frameName = name + '_gen_' + genId;
      var portData = genBlock.data.ports || { in: [], out: [] };

      // Single instantiation of the frame module
      var genLabel = genBlock.data.label || 'gen_' + genId;
      var instance =
        '//-- Generated frame: ' +
        genLabel +
        '\n ' +
        frameName +
        ' ' +
        ctx.utils.digestId(genBlock.id);
      var ports = [];

      for (var pi in portData.in) {
        var inPort = portData.in[pi];
        var extWireIdx = findExternalWire(
          genBlock.id,
          inPort.name + '-ext',
          wires,
          'target'
        );
        var wireRef = extWireIdx !== null ? 'w' + extWireIdx : "'0";
        ports.push(' .' + inPort.name + '(' + wireRef + ')');
      }

      for (var po in portData.out) {
        var outPort = portData.out[po];
        var outExtWireIdx = findExternalWire(
          genBlock.id,
          outPort.name + '-ext',
          wires,
          'source'
        );
        if (outExtWireIdx !== null) {
          ports.push(' .' + outPort.name + '(w' + outExtWireIdx + ')');
        }
        // Wire up mux select input for muxed outputs
        if ((outPort.genMode || 'iterative') === 'muxed') {
          var selPortName = outPort.name + '_sel';
          var selExtWireIdx = findExternalWire(
            genBlock.id,
            selPortName + '-ext',
            wires,
            'target'
          );
          var selWireRef = selExtWireIdx !== null ? 'w' + selExtWireIdx : "'0";
          ports.push(' .' + selPortName + '(' + selWireRef + ')');
        }
      }

      if (ports.length > 0) {
        instance += ' (\n' + ports.join(',\n') + '\n);';
      } else {
        instance += ' ();';
      }
      instances.push(instance);
    }

    return instances;
  }

  //-- Find the wire index connected to a generate frame port
  function findExternalWire(genBlockId, portName, wires, direction) {
    for (var w in wires) {
      var wire = wires[w];
      if (wire._genInternal) {
        continue;
      }
      if (direction === 'target') {
        // Looking for wire where target is the generate frame
        if (wire.target.block === genBlockId && wire.target.port === portName) {
          return w;
        }
      } else {
        // Looking for wire where source is the generate frame
        if (wire.source.block === genBlockId && wire.source.port === portName) {
          return w;
        }
      }
    }
    return null;
  }

  //-------------------------------------------------------------------
  //-- Generate the verilog code for the given circuit
  //-- name: String. Name of the current module (top module: 'main')
  //-- project: Project module
  //-- opt: Options
  //--------------------------------------------------------------------
  function verilogCompiler(name, project, opt) {
    var i,
      data,
      block,
      code = '';
    opt = opt || {};
    if (project && project.design && project.design.graph) {
      var blockArray = project.design.graph.blocks;
      var dependencies = project.dependencies;

      // Main module

      if (name) {
        // Initialize input ports

        if (name === 'main' && opt.boardRules) {
          var initPorts = opt.initPorts || ctx.getInitPorts(project);
          for (i in initPorts) {
            var initPort = initPorts[i];

            // Find existing input block with the initPort value
            var found = false;
            var source = {
              block: initPort.name,
              port: 'out',
            };
            for (i in blockArray) {
              block = blockArray[i];
              if (
                block.type === ctx.blocks.BASIC_INPUT &&
                !block.data.range &&
                !block.data.virtual &&
                initPort.pin === block.data.pins[0].value
              ) {
                found = true;
                source.block = block.id;
                break;
              }
            }

            if (!found) {
              // Add imaginary input block with the initPort value
              project.design.graph.blocks.push({
                id: initPort.name,
                type: ctx.blocks.BASIC_INPUT,
                data: {
                  name: initPort.name,
                  pins: [
                    {
                      index: '0',
                      value: initPort.pin,
                    },
                  ],
                  virtual: false,
                },
              });
            }

            // Add imaginary wire between the input block and the initPort
            project.design.graph.wires.push({
              source: {
                block: source.block,
                port: source.port,
              },
              target: {
                block: initPort.block,
                port: initPort.port,
              },
            });
          }
        }

        var params = getParams(project);

        //-- Future improvement: After reading the ports, get the names defined in the .pcf or .lpf file
        //-- these are better names to use in the top module, instead of the current not-for-humans pin names
        var ports = getPorts(project);

        var content = getContent(name, project);

        // Initialize output pins

        if (name === 'main' && opt.boardRules) {
          var initPins = opt.initPins || ctx.getInitPins(project);
          var n = initPins.length;

          if (n > 0) {
            // Declare m port
            ports.out.push({
              name: 'vinit',
              range: `[${n - 1}:0 ]`,
            });
            // Generate port value
            var value = n.toString() + "'b";
            for (i in initPins) {
              value += initPins[i].bit;
            }
            // Assign m port
            content += '\nassign vinit = ' + value + ';';
          }
        }

        data = {
          name: name,
          params: params,
          ports: ports,
          content: content,
        };

        code += '//---- Top entity';
        code += ctx.module(data);
      }

      // Dependencies modules
      //-- Generate the comments header for the module
      if (typeof project.package !== 'undefined') {
        //-- Separation from the previous verilog block
        code += '\n';

        //-- It is only generate if the project/block has a name
        //-- Usually the top entity do not have a main
        if (project.package.name) {
          code += '//---------------------------------------------------\n';
          code += '//-- ' + project.package.name + '\n';
          code += '//-- - - - - - - - - - - - - - - - - - - - - - - - --\n';
          code += '//-- ' + project.package.description + '\n';
          code += '//---------------------------------------------------\n';
        }
      }

      let prefix = '';
      for (var d in dependencies) {
        prefix = dependencies[d].package.name ?? 'pkg';
        prefix = ctx.utils.normalizeVerilogName(prefix);
        code += verilogCompiler(
          `${prefix}__${ctx.utils.digestId(d)}`,
          dependencies[d]
        );
      }

      // Pre-mark contained blocks so the code-module loop below correctly
      // skips blocks that belong to a generate frame sub-module.
      preMarkGenerateContainment(project.design.graph);

      // Code modules

      for (i in blockArray) {
        block = blockArray[i];
        if (block) {
          if (block.type === ctx.blocks.BASIC_CODE && !block._genContained) {
            data = {
              name: name + '_' + ctx.utils.digestId(block.id),
              params: block.data.params,
              ports: block.data.ports,
              content: block.data.code,
            };
            code += ctx.module(data);
          }
        }
      }

      // Generate frame sub-modules
      for (i in blockArray) {
        block = blockArray[i];
        if (block && block.type === ctx.blocks.BASIC_GENERATE) {
          code += compileGenerateFrame(name, block, project);
        }
      }

      // Clean up temporary generate-frame flags
      for (i in blockArray) {
        if (blockArray[i]) {
          delete blockArray[i]._genContained;
        }
      }
      var graphWires = project.design.graph.wires;
      for (i in graphWires) {
        if (graphWires[i]) {
          delete graphWires[i]._genInternal;
        }
      }
    }

    return code;
  }

  //-------------------------------------------------------------------
  //-- Compile a generate frame block into:
  //-- 1. A wrapper module with generate-for loop
  //-- 2. An inner iteration module (from contained blocks)
  //-- The parent instantiates the wrapper once; the loop is inside.
  //-------------------------------------------------------------------
  function compileGenerateFrame(parentName, genBlock, project) {
    var graph = project.design.graph;
    var genId = ctx.utils.digestId(genBlock.id);
    var frameName = parentName + '_gen_' + genId;
    var iterName = frameName + '_iter';
    var m = genBlock.data.instanceCount || 4;
    var genLabel = genBlock.data.label || 'gen_' + genId;
    var genVarName = 'gen_i_' + genId;
    var portData = genBlock.data.ports || { in: [], out: [] };

    // Find contained blocks by bounding rect
    var genRect = {
      x: genBlock.position.x,
      y: genBlock.position.y,
      width: genBlock.size.width,
      height: genBlock.size.height,
    };

    var containedIds = {};
    var containedBlocks = [];
    for (var b in graph.blocks) {
      var blk = graph.blocks[b];
      if (blk.id === genBlock.id) {
        continue;
      }
      if (blk.type === ctx.blocks.BASIC_GENERATE) {
        continue;
      }
      if (isBlockInsideRect(blk, genRect)) {
        containedIds[blk.id] = true;
        blk._genContained = true;
        containedBlocks.push(blk);
      }
    }

    // Classify wires
    var internalWires = [];
    var boundaryInWires = []; // frame port → contained block
    var boundaryOutWires = []; // contained block → frame port
    var frameToFrameWires = []; // direct inner port → inner port
    for (var w in graph.wires) {
      var wire = graph.wires[w];
      var srcIsFrame = wire.source.block === genBlock.id;
      var tgtIsFrame = wire.target.block === genBlock.id;

      if (srcIsFrame && tgtIsFrame) {
        // Direct frame-to-frame connection (inner port passthrough)
        frameToFrameWires.push(wire);
        wire._genInternal = true;
      } else if (srcIsFrame && containedIds[wire.target.block]) {
        boundaryInWires.push(wire);
        wire._genInternal = true;
      } else if (containedIds[wire.source.block] && tgtIsFrame) {
        boundaryOutWires.push(wire);
        wire._genInternal = true;
      } else if (
        containedIds[wire.source.block] &&
        containedIds[wire.target.block]
      ) {
        internalWires.push(wire);
        wire._genInternal = true;
      }
    }

    // Build virtual sub-project for the inner iteration module.
    // Strip _genContained/_genInternal from the copies — these blocks/wires
    // are the *content* of the iter module, not nested inside another frame.
    var subBlocks = JSON.parse(JSON.stringify(containedBlocks));
    for (var si in subBlocks) {
      delete subBlocks[si]._genContained;
    }
    var subWires = JSON.parse(JSON.stringify(internalWires));
    for (var sw in subWires) {
      delete subWires[sw]._genInternal;
    }

    var portIdx = 0;
    // Maps: frame port name → { digest, iterSize } for inner module connections
    var iterInMap = {};
    var iterOutMap = {};

    for (var bi in boundaryInWires) {
      var bwIn = boundaryInWires[bi];
      var inPName = (bwIn.source.port || '')
        .replace(/-ext$/, '')
        .replace(/-int$/, '');
      var inputBlockId = 'gen-input-' + portIdx;
      subBlocks.push({
        id: inputBlockId,
        type: ctx.blocks.BASIC_INPUT,
        data: {
          name: inPName,
          virtual: true,
          pins: [{ index: '0', value: '0' }],
        },
        position: { x: genRect.x, y: genRect.y + portIdx * 50 },
      });
      subWires.push({
        source: { block: inputBlockId, port: 'out' },
        target: { block: bwIn.target.block, port: bwIn.target.port },
        size: bwIn.size,
      });
      if (!iterInMap[inPName]) {
        iterInMap[inPName] = {
          digest: ctx.utils.digestId(inputBlockId),
          iterSize: bwIn.size || 1,
        };
      }
      portIdx++;
    }

    for (var bo in boundaryOutWires) {
      var bwOut = boundaryOutWires[bo];
      var outPName = (bwOut.target.port || '')
        .replace(/-ext$/, '')
        .replace(/-int$/, '');
      var outputBlockId = 'gen-output-' + portIdx;
      subBlocks.push({
        id: outputBlockId,
        type: ctx.blocks.BASIC_OUTPUT,
        data: {
          name: outPName,
          virtual: true,
          pins: [{ index: '0', value: '0' }],
        },
        position: {
          x: genRect.x + genRect.width,
          y: genRect.y + portIdx * 50,
        },
      });
      subWires.push({
        source: { block: bwOut.source.block, port: bwOut.source.port },
        target: { block: outputBlockId, port: 'in' },
        size: bwOut.size,
      });
      if (!iterOutMap[outPName]) {
        iterOutMap[outPName] = {
          digest: ctx.utils.digestId(outputBlockId),
          iterSize: bwOut.size || 1,
        };
      }
      portIdx++;
    }

    // Handle frame-to-frame wires (direct inner port passthrough)
    for (var ff in frameToFrameWires) {
      var ffWire = frameToFrameWires[ff];
      var ffInName = (ffWire.source.port || '')
        .replace(/-ext$/, '')
        .replace(/-int$/, '');
      var ffOutName = (ffWire.target.port || '')
        .replace(/-ext$/, '')
        .replace(/-int$/, '');

      var ffInputBlockId = 'gen-input-' + portIdx;
      subBlocks.push({
        id: ffInputBlockId,
        type: ctx.blocks.BASIC_INPUT,
        data: {
          name: ffInName,
          virtual: true,
          pins: [{ index: '0', value: '0' }],
        },
        position: { x: genRect.x, y: genRect.y + portIdx * 50 },
      });
      if (!iterInMap[ffInName]) {
        iterInMap[ffInName] = {
          digest: ctx.utils.digestId(ffInputBlockId),
          iterSize: ffWire.size || 1,
        };
      }
      portIdx++;

      var ffOutputBlockId = 'gen-output-' + portIdx;
      subBlocks.push({
        id: ffOutputBlockId,
        type: ctx.blocks.BASIC_OUTPUT,
        data: {
          name: ffOutName,
          virtual: true,
          pins: [{ index: '0', value: '0' }],
        },
        position: {
          x: genRect.x + genRect.width,
          y: genRect.y + portIdx * 50,
        },
      });
      subWires.push({
        source: { block: ffInputBlockId, port: 'out' },
        target: { block: ffOutputBlockId, port: 'in' },
        size: ffWire.size,
      });
      if (!iterOutMap[ffOutName]) {
        iterOutMap[ffOutName] = {
          digest: ctx.utils.digestId(ffOutputBlockId),
          iterSize: ffWire.size || 1,
        };
      }
      portIdx++;
    }

    // Compile inner iteration module
    var subProject = {
      design: {
        graph: {
          blocks: subBlocks,
          wires: subWires,
        },
      },
      dependencies: {}, // Empty — parent already emits dependency modules
    };
    var innerCode = verilogCompiler(iterName, subProject);

    // --- Build wrapper frame module ---
    // Frame ports: use actual wire sizes from boundary, not portData sizes
    var framePorts = { in: [], out: [] };

    for (var fpi in portData.in) {
      var fip = portData.in[fpi];
      var fipGenMode = fip.genMode || 'direct';
      var fipTotal;
      if (iterInMap[fip.name]) {
        var fipIterSize = iterInMap[fip.name].iterSize;
        fipTotal = fipGenMode === 'iterable' ? fipIterSize * m : fipIterSize;
      } else {
        // No boundary wire — use portData size as total
        fipTotal = fip.size || 1;
      }
      framePorts.in.push({
        name: fip.name,
        range: fipTotal > 1 ? '[' + (fipTotal - 1) + ':0]' : '',
      });
    }

    for (var fpo in portData.out) {
      var fop = portData.out[fpo];
      var fopGenMode = fop.genMode || 'iterative';
      var fopTotal;
      if (iterOutMap[fop.name]) {
        var fopIterSize = iterOutMap[fop.name].iterSize;
        if (fopGenMode === 'iterative') {
          fopTotal = fopIterSize * m;
        } else {
          // muxed/or: output is reduced to per-iteration size
          fopTotal = fopIterSize;
        }
      } else {
        // No boundary wire — use portData size as total
        fopTotal = fop.size || 1;
      }
      framePorts.out.push({
        name: fop.name,
        range: fopTotal > 1 ? '[' + (fopTotal - 1) + ':0]' : '',
      });
    }

    // Add mux select input ports for muxed outputs
    var muxSelWidth = Math.ceil(Math.log2(m));
    if (muxSelWidth < 1) {
      muxSelWidth = 1;
    }
    for (var fpm in portData.out) {
      var fmp = portData.out[fpm];
      if ((fmp.genMode || 'iterative') === 'muxed') {
        var selRange = muxSelWidth > 1 ? '[' + (muxSelWidth - 1) + ':0]' : '';
        framePorts.in.push({
          name: fmp.name + '_sel',
          range: selRange,
        });
      }
    }

    // Generate wrapper module content
    var lines = [];

    // Internal wires for muxed/or reduction
    for (var pmx in portData.out) {
      var mxP = portData.out[pmx];
      var mxMode = mxP.genMode || 'iterative';
      if (mxMode === 'muxed' || mxMode === 'or') {
        var mxIterSize = iterOutMap[mxP.name]
          ? iterOutMap[mxP.name].iterSize
          : mxP.size || 1;
        var mxTotal = mxIterSize * m;
        var mxRange = mxTotal > 1 ? ' [' + (mxTotal - 1) + ':0]' : '';
        lines.push('wire' + mxRange + ' ' + mxP.name + '_all;');
      }
    }

    // Genvar + generate-for
    lines.push('genvar ' + genVarName + ';');
    lines.push('generate');
    lines.push(
      '  for (' +
        genVarName +
        ' = 0; ' +
        genVarName +
        ' < ' +
        m +
        '; ' +
        genVarName +
        ' = ' +
        genVarName +
        ' + 1) begin : ' +
        genLabel
    );

    // Inner iteration module instantiation
    var instPorts = [];

    for (var ipi in portData.in) {
      var iip = portData.in[ipi];
      var iipMap = iterInMap[iip.name];
      if (!iipMap) {
        continue;
      }
      var iipGenMode = iip.genMode || 'direct';
      var iipIterSize = iipMap.iterSize;

      if (iipGenMode === 'direct') {
        instPorts.push('    .' + iipMap.digest + '(' + iip.name + ')');
      } else {
        if (iipIterSize > 1) {
          instPorts.push(
            '    .' +
              iipMap.digest +
              '(' +
              iip.name +
              '[' +
              genVarName +
              '*' +
              iipIterSize +
              ' +: ' +
              iipIterSize +
              '])'
          );
        } else {
          instPorts.push(
            '    .' + iipMap.digest + '(' + iip.name + '[' + genVarName + '])'
          );
        }
      }
    }

    for (var ipo in portData.out) {
      var iop = portData.out[ipo];
      var iopMap = iterOutMap[iop.name];
      if (!iopMap) {
        continue;
      }
      var iopGenMode = iop.genMode || 'iterative';
      var iopIterSize = iopMap.iterSize;
      var targetWire =
        iopGenMode === 'iterative' ? iop.name : iop.name + '_all';

      if (iopIterSize > 1) {
        instPorts.push(
          '    .' +
            iopMap.digest +
            '(' +
            targetWire +
            '[' +
            genVarName +
            '*' +
            iopIterSize +
            ' +: ' +
            iopIterSize +
            '])'
        );
      } else {
        instPorts.push(
          '    .' + iopMap.digest + '(' + targetWire + '[' + genVarName + '])'
        );
      }
    }

    // Add iterator (genvar) port if connected inside the frame
    if (iterInMap['gen_i']) {
      instPorts.push(
        '    .' + iterInMap['gen_i'].digest + '(' + genVarName + ')'
      );
    }

    lines.push('    ' + iterName + ' u_' + genLabel + ' (');
    lines.push(instPorts.join(',\n'));
    lines.push('    );');
    lines.push('  end');
    lines.push('endgenerate');

    // Post-generate reduction logic
    for (var pf in portData.out) {
      var fp = portData.out[pf];
      var fpMode = fp.genMode || 'iterative';
      if (fpMode === 'muxed') {
        lines.push('//-- Mux for ' + fp.name);
        var fpIterSize = iterOutMap[fp.name]
          ? iterOutMap[fp.name].iterSize
          : fp.size || 1;
        if (fpIterSize > 1) {
          lines.push(
            'assign ' +
              fp.name +
              ' = ' +
              fp.name +
              '_all[' +
              fp.name +
              '_sel * ' +
              fpIterSize +
              ' +: ' +
              fpIterSize +
              '];'
          );
        } else {
          lines.push(
            'assign ' + fp.name + ' = ' + fp.name + '_all[' + fp.name + '_sel];'
          );
        }
      } else if (fpMode === 'or') {
        lines.push('//-- OR-reduce for ' + fp.name);
        lines.push('assign ' + fp.name + ' = |' + fp.name + '_all;');
      }
    }

    // Build frame module
    var frameData = {
      name: frameName,
      params: [],
      ports: framePorts,
      content: lines.join('\n'),
    };

    var code = '\n//-- Generated frame: ' + genLabel + '\n';
    code += ctx.module(frameData);
    code += innerCode;
    return code;
  }

  //-------------------------------------------------------------------
  //-- Pre-mark _genContained on blocks and _genInternal on wires for
  //-- all generate frames in the given (cloned) graph, so that wire
  //-- declaration loops and getInstances() skip them correctly.
  //-------------------------------------------------------------------
  function preMarkGenerateContainment(graph) {
    for (var gb in graph.blocks) {
      var genBlock = graph.blocks[gb];
      if (genBlock.type !== ctx.blocks.BASIC_GENERATE) {
        continue;
      }
      if (!genBlock.position || !genBlock.size) {
        continue;
      }
      var genRect = {
        x: genBlock.position.x,
        y: genBlock.position.y,
        width: genBlock.size.width,
        height: genBlock.size.height,
      };
      var containedIds = {};
      for (var cb in graph.blocks) {
        var blk = graph.blocks[cb];
        if (blk.id === genBlock.id) {
          continue;
        }
        if (blk.type === ctx.blocks.BASIC_GENERATE) {
          continue;
        }
        if (isBlockInsideRect(blk, genRect)) {
          containedIds[blk.id] = true;
          blk._genContained = true;
        }
      }
      for (var gw in graph.wires) {
        var wire = graph.wires[gw];
        var srcIsFrame = wire.source.block === genBlock.id;
        var tgtIsFrame = wire.target.block === genBlock.id;
        var srcContained = !!containedIds[wire.source.block];
        var tgtContained = !!containedIds[wire.target.block];
        if (
          (srcIsFrame && tgtIsFrame) ||
          (srcIsFrame && tgtContained) ||
          (srcContained && tgtIsFrame) ||
          (srcContained && tgtContained)
        ) {
          wire._genInternal = true;
        }
      }
    }
  }

  //-------------------------------------------------------------------
  //-- Check if a block's bounding rect is inside a given rectangle
  //-------------------------------------------------------------------
  function isBlockInsideRect(block, rect) {
    if (!block.position || !block.size) {
      return false;
    }
    return (
      block.position.x >= rect.x &&
      block.position.y >= rect.y &&
      block.position.x + block.size.width <= rect.x + rect.width &&
      block.position.y + block.size.height <= rect.y + rect.height
    );
  }

  return {
    verilogCompiler: verilogCompiler,
  };
};
