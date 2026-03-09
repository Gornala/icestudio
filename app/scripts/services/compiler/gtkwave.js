//---------------------------------------------------------------------------
//-- GTKWave compiler: generates .gtkw signal list file
//---------------------------------------------------------------------------
'use strict';

window._icecompiler = window._icecompiler || {};

window._icecompiler.gtkwave = function (ctx) {
  function gtkwaveCompiler(project) {
    var code = '';

    var io = ctx.mainIO(project);
    var input = io.input;
    var output = io.output;
    let pname;
    for (var i in input) {
      pname =
        input[i].name.charAt(0) === '@'
          ? input[i].name.substr(1)
          : input[i].name;
      code +=
        'main_tb.' + pname + (input[i].range ? input[i].range : '') + '\n';
    }
    for (var o in output) {
      pname =
        output[o].name.charAt(0) === '@'
          ? output[o].name.substr(1)
          : output[o].name;
      code +=
        'main_tb.' + pname + (output[o].range ? output[o].range : '') + '\n';
    }

    return code;
  }

  return {
    gtkwaveCompiler: gtkwaveCompiler,
  };
};
