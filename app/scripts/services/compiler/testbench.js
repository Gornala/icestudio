//---------------------------------------------------------------------------
//-- Testbench compiler: generates _tb.v simulation file
//---------------------------------------------------------------------------
'use strict';

window._icecompiler = window._icecompiler || {};

window._icecompiler.testbench = function (ctx) {
  function mainParams(project) {
    var params = [];
    var paramsUnnamed = 0;
    var graph = project.design.graph;
    let pname = '';
    for (var i in graph.blocks) {
      var block = graph.blocks[i];
      if (block.type === ctx.blocks.BASIC_CONSTANT) {
        if (!block.data.local) {
          if (block.data.name) {
            pname = block.data.name.replace('@', '');
            params.push({
              id: ctx.utils.digestId(block.id),
              name: 'constant_' + pname.replace(/ /g, '_'),
              value: block.data.value,
            });
          } else {
            params.push({
              id: ctx.utils.digestId(block.id),
              name: 'constant_' + paramsUnnamed.toString(),
              value: block.data.value,
            });
            paramsUnnamed += 1;
          }
        }
      }
    }

    return params;
  }

  function testbenchCompiler(project) {
    var i, o, p;
    var code = '';

    code += '// Testbench template\n\n';

    code += '`default_nettype none\n';
    code += '`define DUMPSTR(x) `"x.vcd`"\n';
    code += '`timescale 10 ns / 1 ns\n\n';

    var ports = {
      in: [],
      out: [],
    };
    var content = '\n';

    content += '// Simulation time: 100ns (10 * 10ns)\n';
    content += 'parameter DURATION = 10;\n';

    // Parameters
    var _params = [];
    var params = mainParams(project);
    if (params.length > 0) {
      content += '\n// TODO: edit the module parameters here\n';
      let pname = '';
      content += '// e.g. localparam constant_value = 1;\n';
      for (p in params) {
        pname =
          params[p].name.charAt(0) === '@'
            ? params[p].name.substr(1)
            : params[p].name;
        content += 'localparam ' + pname + ' = ' + params[p].value + ';\n';
        _params.push(' .' + params[p].id + '(' + pname + ')');
      }
    }

    // Input/Output
    var io = ctx.mainIO(project);
    var input = io.input;
    var output = io.output;
    content += '\n// Input/Output\n';
    var _ports = [];
    let signed = '';
    var pname;
    for (i in input) {
      signed = '';
      pname = input[i].name;
      if (input[i].name.charAt(0) === '@') {
        pname = input[i].name.substr(1);
        signed = ' signed ';
      }
      content +=
        'reg ' +
        signed +
        (input[i].range ? input[i].range + ' ' : '') +
        pname +
        ';\n';
      _ports.push(' .' + input[i].id + '(' + pname + ')');
    }
    for (o in output) {
      signed = '';
      pname = output[o].name;
      if (output[o].name.charAt(0) === '@') {
        pname = output[o].name.substr(1);
        signed = ' signed ';
      }
      content +=
        'wire ' +
        signed +
        (output[o].range ? output[o].range + ' ' : '') +
        pname +
        ';\n';
      _ports.push(' .' + output[o].id + '(' + pname + ')');
    }

    // Module instance
    content += '\n// Module instance\n';
    content += 'main';

    //-- Parameters
    if (_params.length > 0) {
      content += ' #(\n';
      content += _params.join(',\n');
      content += '\n)';
    }

    content += ' MAIN';

    //-- Ports
    if (_ports.length > 0) {
      content += ' (\n';
      content += _ports.join(',\n');
      content += '\n)';
    }

    content += ';\n';

    // Clock signal
    var hasClk = false;
    for (i in input) {
      if (input[i].name.toLowerCase() === 'clk') {
        hasClk = true;
        break;
      }
    }
    if (hasClk) {
      content += '\n// Clock signal\n';
      content += 'always #0.5 clk = ~clk;\n';
    }

    content += '\ninitial begin\n';
    content += ' // File were to store the simulation results\n';
    content += ' $dumpfile(`DUMPSTR(`VCD_OUTPUT));\n';
    content += ' $dumpvars(0, main_tb);\n\n';
    content += ' // TODO: initialize the registers here\n';
    content += ' // e.g. value = 1;\n';
    content += ' // e.g. #2 value = 0;\n';
    for (i in input) {
      pname =
        input[i].name.charAt(0) === '@'
          ? input[i].name.substr(1)
          : input[i].name;
      content += ' ' + pname + ' = 0;\n';
    }
    content += '\n';
    content += ' #(DURATION) $display("End of simulation");\n';
    content += ' $finish;\n';
    content += 'end\n';

    var data = {
      name: 'main_tb',
      ports: ports,
      content: content,
    };
    code += ctx.module(data);

    return code;
  }

  return {
    testbenchCompiler: testbenchCompiler,
  };
};
