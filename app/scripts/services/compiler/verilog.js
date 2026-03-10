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
    var graph = project.design.graph;
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

    for (w in graph.wires) {
      var wire = graph.wires[w];
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
        // Wires
        var range = wire.size ? ' [' + (wire.size - 1) + ':0] ' : ' ';
        connections.wire.push('wire' + range + 'w' + w + ';');
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
            if (
              wire.source.port === 'constant-out' ||
              wire.source.port === 'memory-out'
            ) {
              // connections.assign.push('assign ' + digestId(block.id) + ' = p' + w + ';');
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
      for (j = 0; j < i; j++) {
        gwi = graph.wires[i];
        gwj = graph.wires[j];
        if (
          gwi.source.block === gwj.source.block &&
          gwi.source.port === gwj.source.port &&
          gwi.source.port !== 'constant-out' &&
          gwi.source.port !== 'memory-out'
        ) {
          content.push('assign w' + i + ' = w' + j + ';');
        }
      }
    }

    // Block instances

    content = content.concat(getInstances(name, project.design.graph));

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
        block.type !== ctx.blocks.BASIC_OUTPUT_LABEL
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
          if (
            block.id === wire.target.block &&
            (wire.source.port === 'constant-out' ||
              wire.source.port === 'memory-out')
          ) {
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
            if (
              wire.source.port !== 'constant-out' &&
              wire.source.port !== 'memory-out'
            ) {
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

      // Code modules

      for (i in blockArray) {
        block = blockArray[i];
        if (block) {
          if (block.type === ctx.blocks.BASIC_CODE) {
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
    }

    return code;
  }

  return {
    verilogCompiler: verilogCompiler,
  };
};
