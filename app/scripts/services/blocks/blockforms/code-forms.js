//---------------------------------------------------------------------------
//-- Code block form functions: new, load, and edit for Verilog code blocks
//---------------------------------------------------------------------------
'use strict';

window._iceblockforms = window._iceblockforms || {};

window._iceblockforms.codeForms = function (ctx) {
  function newBasicCode(callback) {
    let form = new ctx.forms.FormBasicCode('', '', '', '', '', '');
    $('.ajs-input').val('');
    //-- Display the form
    form.display((evt) => {
      //-- The callback is executed when the user has pressed the OK button

      //-- Process the inforation in the form
      //-- The results are stored inside the form
      //-- In case of error the corresponding notifications are raised
      form.process(evt);

      //-- If there were errors, the form is not closed
      //-- Return without clossing
      if (evt.cancel) {
        return;
      }

      //-- OK. There are no duplicated names. Proceed!!
      //-- Create a blank block
      let blockInstance = new ctx.blocks.CodeBlock(
        form.inPortsInfo,
        form.outPortsInfo,
        form.inParamsInfo,
        form.inoutLeftPortsInfo,
        form.inoutRightPortsInfo
      );

      if (form.code.trim() !== '') {
        blockInstance.data.code = form.code;
      }
      blockInstance.data.label = form.label;
      blockInstance.data.blackbox = form.blackbox || false;

      //-- Build the cell
      let cell = loadBasicCode(blockInstance);
      //-- Execute the callback function passing the
      //-- new cell as an argument (An array of one cell)
      callback([cell]);
    });
  }

  function loadBasicCode(instance, disabled) {
    var port;
    var leftPorts = [];
    var rightPorts = [];
    var topPorts = [];
    let i, o, p;
    for (i in instance.data.ports.in) {
      port = instance.data.ports.in[i];
      if (!port.range) {
        port.default = ctx.utils.hasInputRule(port.name);
      }
      leftPorts.push({
        id: port.name,
        name: port.name,
        label: port.name + (port.range || ''),
        size: port.size || 1,
      });
    }
    for (i in instance.data.ports.inoutLeft) {
      port = instance.data.ports.inoutLeft[i];
      if (!port.range) {
        port.default = ctx.utils.hasInputRule(port.name);
      }
      leftPorts.push({
        id: port.name,
        name: port.name,
        label: port.name + (port.range || ''),
        size: port.size || 1,
      });
    }

    for (o in instance.data.ports.out) {
      port = instance.data.ports.out[o];
      rightPorts.push({
        id: port.name,
        name: port.name,
        label: port.name + (port.range || ''),
        size: port.size || 1,
      });
    }
    for (o in instance.data.ports.inoutRight) {
      port = instance.data.ports.inoutRight[o];
      // (there's no port default rule for the right side, output)
      rightPorts.push({
        id: port.name,
        name: port.name,
        label: port.name + (port.range || ''),
        size: port.size || 1,
      });
    }

    for (p in instance.data.params) {
      port = instance.data.params[p];
      topPorts.push({
        id: port.name,
        name: port.name,
        label: port.name,
      });
    }

    var cell = new ctx.joint.shapes.ice.Code({
      id: instance.id,
      blockType: instance.type,
      data: instance.data,
      position: instance.position,
      size: instance.size,
      disabled: disabled,
      leftPorts: leftPorts,
      rightPorts: rightPorts,
      topPorts: topPorts,
    });

    return cell;
  }

  function editBasicCode(allowInoutPorts, cellView, callback) {
    let inPortNames = '';
    let outPortNames = '';
    let inoutLeftPortNames;
    let inoutRightPortNames;

    //-- Get information from the joint graphics library
    let block = cellView.model.attributes;

    // Compatibility between tri-state/non-tri-state project formats
    if (typeof block.data.ports.inoutLeft === 'undefined') {
      block.data.ports.inoutLeft = [];
    }
    if (typeof block.data.ports.inoutRight === 'undefined') {
      block.data.ports.inoutRight = [];
    }

    //-- Get the input port names as a string
    if (block.data.ports.in) {
      inPortNames = ctx.blocks.portsInfo2Str(block.data.ports.in);
    }
    //-- Get the output port names as a string
    if (block.data.ports.out) {
      outPortNames = ctx.blocks.portsInfo2Str(block.data.ports.out);
    }

    //-- Get the input param names as a string
    let inParamNames = ctx.blocks.portsInfo2Str(block.data.params);

    //-- Get the optional left/right InputOutput port names as strings
    //-- InputOutput port name fields are present or not, and if present, are initialized to strings
    if (allowInoutPorts) {
      //-- Get the left side InputOutput port names as a string
      inoutLeftPortNames = ctx.blocks.portsInfo2Str(block.data.ports.inoutLeft);

      //-- Get the right side InputOutput port names as a string
      inoutRightPortNames = ctx.blocks.portsInfo2Str(
        block.data.ports.inoutRight
      );
    }

    //-- Create the form
    let form = new ctx.forms.FormBasicCode(
      inPortNames,
      outPortNames,
      inParamNames,
      inoutLeftPortNames,
      inoutRightPortNames,
      block.data.label || '',
      block.data.blackbox || false
    );

    //-- Display the form
    form.display((evt) => {
      //-- The callback is executed when the user has pressed the OK button

      //-- Process the inforation in the form
      //-- The results are stored inside the form
      //-- In case of error the corresponding notifications are raised
      form.process(evt);

      //-- If there were errors, the form is not closed
      //-- Return without clossing
      if (evt.cancel) {
        return;
      }

      //-- The form values are OK. Proceed!!

      //-- Detect if the user has changed the form
      //-- If no change... return. Nothing to to
      if (!form.changed()) {
        return;
      }

      //-- Create a blank block
      let blockInstance = new ctx.blocks.CodeBlock(
        form.inPortsInfo,
        form.outPortsInfo,
        form.inParamsInfo,
        form.inoutLeftPortsInfo,
        form.inoutRightPortsInfo
      );

      //-- Assign the size and possition
      blockInstance.position = block.position;
      blockInstance.size = block.size;
      blockInstance.id = block.id;
      if (form.code.trim() !== '') {
        blockInstance.data.code = form.code;
      } else {
        blockInstance.data.code = block.data.code;
      }
      blockInstance.data.label = form.label;
      blockInstance.data.blackbox = form.blackbox || false;

      //-- Build the cell
      let cell = loadBasicCode(blockInstance);

      if (cell) {
        //-- Get the graphical model
        let graph = cellView.paper.model;

        //-- Get all the wires of the current block
        let connectedWires = graph.getConnectedLinks(cellView.model);

        //---------- Change the block
        graph.startBatch('change');

        //-- Remove the current block
        cellView.model.remove();

        //-- Call the callback to add the new block
        callback(cell);

        //-- Restore previous connections
        for (let w in connectedWires) {
          //-- Get the wire
          let wire = connectedWires[w];

          //-- Get its size
          let size = wire.get('size');

          //-- Get source and target cells
          let source = wire.get('source');
          let target = wire.get('target');
          let sourceCell = graph.getCell(source.id);
          let isJsonInputSrc =
            sourceCell &&
            sourceCell.get('blockType') === ctx.blocks.BASIC_JSON_INPUT;

          //-- TODO: This BIG if needs more comments and more
          //--  refactoring. It is too complex

          //-- Check if the current wire should be kept
          if (
            //-- Condition I: Wires that starts from the output ports
            //-- if the port name and size has not been changed, the
            //-- wire is kept
            (source.id === cell.id &&
              containsPort(source.port, size, cell.get('rightPorts'))) ||
            //-- Condition II: Wires that ends in the input ports
            //-- if the port name and size has not been changed
            //-- and the source block are not a constant, memory,
            //-- or json_input blocks
            (target.id === cell.id &&
              containsPort(target.port, size, cell.get('leftPorts')) &&
              source.port !== 'constant-out' &&
              source.port !== 'memory-out' &&
              !isJsonInputSrc) ||
            //-- Condition III: Wire that ends in the input param ports
            //-- only if the source block is a constant, memory,
            //-- or json_input block
            (target.id === cell.id &&
              containsPort(target.port, size, cell.get('topPorts')) &&
              (source.port === 'constant-out' ||
                source.port === 'memory-out' ||
                isJsonInputSrc))
          ) {
            //-- Add the current wire (the wire is kept)
            graph.addCell(wire);
          }
        }

        //-- We are done. Block changed
        graph.stopBatch('change');

        //-- Notify to the user
        ctx.resultAlert = alertify.success(
          ctx.gettextCatalog.getString('Block updated')
        );
      }
    });
  }

  //-----------------------------------------------------------------
  //-- Check if the given *port* with the given *size* is inside the
  //-- list of given *ports*
  //--
  //-- INPUTS:
  //--   * port: Port to check
  //--   * size: Port's size
  //--   * ports: List of ports to check
  //--
  //--- Returns:
  //--   * true: Port located inside ports
  //--   * false: Port NOT inside ports
  //------------------------------------------------------------------
  function containsPort(port, size, ports) {
    var found = false;
    for (var i in ports) {
      if (port === ports[i].name && size === ports[i].size) {
        found = true;
        break;
      }
    }
    return found;
  }

  function getCodeFormData(callback) {
    var form = new ctx.forms.FormGenericEdit('', '', '', '', '', '');
    form.display(function (evt) {
      form.process(evt);
      if (evt.cancel) {
        return;
      }
      callback({
        inPortsInfo: form.inPortsInfo,
        outPortsInfo: form.outPortsInfo,
        inParamsInfo: form.inParamsInfo,
        inoutLeftPortsInfo: form.inoutLeftPortsInfo || [],
        inoutRightPortsInfo: form.inoutRightPortsInfo || [],
        label: form.label,
        code: form.code,
        pkgVersion: form.pkgVersion,
        pkgDesc: form.pkgDesc,
        pkgAuthor: form.pkgAuthor,
        pkgImage: form.pkgImage,
      });
    });
  }

  function getCodeFormDataWith(
    inPortStr,
    outPortStr,
    paramStr,
    label,
    pkgInfo,
    callback
  ) {
    var form = new ctx.forms.FormGenericEdit(
      inPortStr,
      outPortStr,
      paramStr,
      '',
      '',
      label,
      pkgInfo
    );
    form.display(function (evt) {
      form.process(evt);
      if (evt.cancel) {
        return;
      }
      callback({
        inPortsInfo: form.inPortsInfo,
        outPortsInfo: form.outPortsInfo,
        inParamsInfo: form.inParamsInfo,
        inoutLeftPortsInfo: form.inoutLeftPortsInfo || [],
        inoutRightPortsInfo: form.inoutRightPortsInfo || [],
        label: form.label,
        code: form.code,
        pkgVersion: form.pkgVersion,
        pkgDesc: form.pkgDesc,
        pkgAuthor: form.pkgAuthor,
        pkgImage: form.pkgImage,
      });
    });
  }

  return {
    newBasicCode: newBasicCode,
    loadBasicCode: loadBasicCode,
    editBasicCode: editBasicCode,
    getCodeFormData: getCodeFormData,
    getCodeFormDataWith: getCodeFormDataWith,
  };
};
