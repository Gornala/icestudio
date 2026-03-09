//---------------------------------------------------------------------------
//-- Constraint file compilers: PCF (iCE40) and LPF (ECP5)
//---------------------------------------------------------------------------
'use strict';

window._icecompiler = window._icecompiler || {};

window._icecompiler.constraints = function (ctx) {
  function pcfCompiler(project, opt) {
    var i,
      j,
      block,
      pin,
      value,
      code = '';
    var blockArray = project.design.graph.blocks;
    opt = opt || {};

    for (i in blockArray) {
      block = blockArray[i];
      if (
        block.type === ctx.blocks.BASIC_INPUT ||
        block.type === ctx.blocks.BASIC_OUTPUT
      ) {
        if (block.data.pins.length > 1) {
          for (var p in block.data.pins) {
            pin = block.data.pins[p];
            value = block.data.virtual ? '' : pin.value;
            code += 'set_io ';
            code += ctx.utils.digestId(block.id);
            code += '[' + pin.index + '] ';
            code += value;
            code += '\n';
          }
        } else if (block.data.pins.length > 0) {
          pin = block.data.pins[0];
          value = block.data.virtual ? '' : pin.value;
          code += 'set_io ';
          code += ctx.utils.digestId(block.id);
          code += ' ';
          code += value;
          code += '\n';
        }
      }
    }

    if (opt.boardRules) {
      // Declare init input ports

      var used = [];
      var initPorts = opt.initPorts || ctx.getInitPorts(project);
      let pname = '';
      for (i in initPorts) {
        var initPort = initPorts[i];
        if (used.indexOf(initPort.pin) !== -1) {
          break;
        }
        used.push(initPort.pin);

        // Find existing input block with the initPort value
        var found = false;
        for (j in blockArray) {
          block = blockArray[j];
          if (
            block.type === ctx.blocks.BASIC_INPUT &&
            !block.data.range &&
            !block.data.virtual &&
            initPort.pin === block.data.pins[0].value
          ) {
            found = true;
            used.push(initPort.pin);
            break;
          }
        }

        pname =
          initPorts[i].name.charAt(0) === '@'
            ? initPorts[i].name.substr(1)
            : initPorts[i].name;
        if (!found) {
          code += 'set_io v';
          code += pname;
          code += ' ';
          code += initPorts[i].pin;
          code += '\n';
        }
      }

      // Declare init output pins

      var initPins = opt.initPins || ctx.getInitPins(project);
      if (initPins.length > 1) {
        for (i in initPins) {
          code += 'set_io vinit[' + i + '] ';
          code += initPins[i].pin;
          code += '\n';
        }
      } else if (initPins.length > 0) {
        code += 'set_io vinit ';
        code += initPins[0].pin;
        code += '\n';
      }
    }

    return code;
  }

  function lpfCompiler(project, opt) {
    var i,
      block,
      pin,
      value,
      code = '';
    var blockArray = project.design.graph.blocks;
    opt = opt || {};

    code += '# -- Board: ';
    code += ctx.common.selectedBoard.name;
    code += '\n\n';

    for (i in blockArray) {
      block = blockArray[i];
      if (
        block.type === ctx.blocks.BASIC_INPUT ||
        block.type === ctx.blocks.BASIC_OUTPUT
      ) {
        //-- Future improvement: Both cases: 1-pin or multiple pins in an array
        //-- could be refactorized instead of repeating code
        //-- (i usually name this as plural and singular cases)

        if (block.data.pins.length > 1) {
          for (var p in block.data.pins) {
            pin = block.data.pins[p];
            value = block.data.virtual ? '' : pin.value;
            code += 'LOCATE COMP "';
            code += ctx.utils.digestId(block.id); //-- Future improvement: use pin.name. It should also be changed in the main module
            code += '[' + pin.index + ']" SITE "';
            code += value;
            code += '";\n';

            code += 'IOBUF PORT "';
            code += ctx.utils.digestId(block.id);
            code += '[' + pin.index + ']" ';

            //-- Get the pullmode property of the physical pin (its id is pin.value)
            let pullmode = ctx.common.selectedBoard.pinout.find(
              (x) => x.value === value
            ).pullmode;
            if (
              pullmode === 'UP' ||
              pullmode === 'DOWN' ||
              pullmode === 'NONE'
            ) {
              code += 'PULLMODE=' + pullmode;
            }
            code += ' ;\n\n';
          }
        } else if (block.data.pins.length > 0) {
          pin = block.data.pins[0];
          value = block.data.virtual ? '' : pin.value;
          code += 'LOCATE COMP "';
          code += ctx.utils.digestId(block.id); //-- Future improvement: use pin.name. It should also be changed in the main module
          code += '" SITE "';
          code += value;
          code += '";\n';

          code += 'IOBUF PORT "';
          code += ctx.utils.digestId(block.id);
          code += '" ';

          //-- Get the pullmode property of the physical pin (its id is pin.value)
          let pullmode = ctx.common.selectedBoard.pinout.find(
            (x) => x.value === value
          ).pullmode;
          if (pullmode === 'UP' || pullmode === 'DOWN' || pullmode === 'NONE') {
            code += 'PULLMODE=' + pullmode;
          }
          code += ' ;\n\n';
        }
      }
    }

    return code;
  }

  return {
    pcfCompiler: pcfCompiler,
    lpfCompiler: lpfCompiler,
  };
};
