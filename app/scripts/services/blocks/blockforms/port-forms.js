//---------------------------------------------------------------------------
//-- Port block form functions: new, load, and edit for Input/Output ports
//---------------------------------------------------------------------------
'use strict';

window._iceblockforms = window._iceblockforms || {};

window._iceblockforms.portForms = function (ctx) {
  //-------------------------------------------------------------------------
  //-- Create one or more New Basic Ports. A form is displayed first
  //-- for the user to enter the block data: (name, pin type and clock pin..)
  //--
  //-- Inputs:
  //--   * form: Form for that block...
  //--   * callback(cells):  Call the function when the block is read. The
  //--      cells are passed as a parameter
  //-------------------------------------------------------------------------
  function newBasicPort(form, callback) {
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

      //--------- Everything is ok so far... Let's create the blocks!

      //-- Array for storing the blocks
      let cells = [];

      //-- Store the acumulate y position
      let positionY = 0;

      //-- Get all the blocks created from the form
      //-- Only the block data, not the final block
      let blocks = form.newBlocks();

      //-- Create an array with the final blocks!
      blocks.forEach((block) => {
        //-- update the block position
        block.position.y = positionY;

        //-- Build the cell
        let cell = ctx.loadBasic(block);

        //-- Insert the block into the array
        cells.push(cell);

        //-- Calculate the Next block position
        //-- The position is different for virtual and real pins
        positionY +=
          (form.virtual ? 10 : 6 + 4 * block.data.pins.length) * ctx.gridsize;
      });

      //-- We are done! Execute the callback function
      callback(cells);
    });
  }

  function loadBasicInput(instance, disabled) {
    var data = instance.data;
    var rightPorts = [
      {
        id: 'out',
        name: '',
        label: '',
        size: data.pins ? data.pins.length : data.size || 1,
      },
    ];

    var cell = new ctx.joint.shapes.ice.Input({
      id: instance.id,
      blockType: instance.type,
      data: instance.data,
      position: instance.position,
      disabled: disabled,
      rightPorts: rightPorts,
      choices: ctx.common.pinoutInputHTML,
    });

    return cell;
  }

  function loadBasicOutput(instance, disabled) {
    var data = instance.data;
    var leftPorts = [
      {
        id: 'in',
        name: '',
        label: '',
        size: data.pins ? data.pins.length : data.size || 1,
      },
    ];
    var cell = new ctx.joint.shapes.ice.Output({
      id: instance.id,
      blockType: instance.type,
      data: instance.data,
      position: instance.position,
      disabled: disabled,
      leftPorts: leftPorts,
      choices: ctx.common.pinoutOutputHTML,
    });
    return cell;
  }

  //-------------------------------------------------------------------------
  //-- Edit an Input/Output Port block. The Form is displayed, and the user
  //-- can edit the information
  //--
  //-- Inputs:
  //--   * form
  //--   * cellView:
  //--   * callback(cells):  Call the function when the user has
  //--     edited the data and pressed the OK button
  //-------------------------------------------------------------------------
  function editBasicPort(form, cellView, callback) {
    //-- Get the information from the graphics library
    let graph = cellView.paper.model;
    let block = cellView.model.attributes;

    //-- Display the form. It will show the current block name
    //-- and the state of the virtual and clock checkboxes
    form.display((evt) => {
      //-- The callback is executed when the user has pressed the OK button

      //-- Process the inforation in the form
      //-- The results are stored inside the form
      //-- In case of error the corresponding notifications are raised
      form.process(evt);

      //-- If there wew error, the form is not closed
      //-- Return without clossing
      if (evt.cancel) {
        return;
      }

      //-- If there were no changes, return: Nothing to do
      if (!form.changed) {
        return;
      }

      //-- Now we have two bloks:
      //--   The initial one: block.data
      //--   The new one entered by the user: portInfo

      //-- Get the data for the new block from the Form
      let virtual = form.virtual;
      let portInfo = form.portInfos[0];

      //-- Get an array with the pins used
      let pins = ctx.blocks.getPins(portInfo);

      //-- Copy the pins from the original
      //-- block to the new one
      ctx.blocks.copyPins(block.data.pins, pins);

      // Create new block
      let newblock = form.newBlock(0);

      // Assign the previous pins to the new pin
      newblock.data.pins = pins;

      //-- Set the same position than the original block
      newblock.position.x = block.position.x;
      newblock.position.y = block.position.y;

      //-- There was a change in size
      if (block.data.range !== portInfo.rangestr) {
        //-- Calculate the new position so that the output
        //-- wire remains in the same place (the port expands or
        //-- shrink), but the output port is in the same place

        //-- Size in pins of the initial block
        let oldSize = ctx.blocks.getSize(block);

        //-- Size in pins of the new block
        let newSize = ctx.blocks.getSize(newblock);

        //-- Offset to applied to the vertical position
        let offset = 16 * (oldSize - newSize);

        //-- If both the initial block and the final are both
        //-- virtual: no offset applied (same position)
        if (form.virtualIni && form.virtual) {
          offset = 0;
        }

        //--- Special CASE: we are inside a block, the ports should all
        //--- be virtual: no offset should be applied
        if (ctx.common.isEditingSubmodule) {
          offset = 0;

          //-- In addition, change the port to virtual
          newblock.data.virtual = true;
        }

        //-- Appy the offset
        newblock.position.y += offset;

        if (callback) {
          //-- Update the block!
          graph.startBatch('change');

          let cell = ctx.loadBasic(newblock);
          callback(cell);
          cellView.model.remove();

          graph.stopBatch('change');

          ctx.resultAlert = alertify.success(
            ctx.gettextCatalog.getString('Block updated')
          );
        }

        return;
      }

      //-- Case 2: There was a change, but not in size

      //-- Size in pins of the initial block
      let size = block.data.pins ? block.data.pins.length : 1;

      //-- Previous size
      let oldSize = block.data.virtual ? 1 : size;

      //-- New size
      let newSize = virtual ? 1 : size;

      // Update block position when size changes
      let offset = 16 * (oldSize - newSize);

      //--- Special CASE: we are inside a block, the ports should all
      //--- be virtual: no offset should be applied
      if (ctx.common.isEditingSubmodule) {
        offset = 0;

        //-- In addition, change the port to virtual
        newblock.data.virtual = true;
      }

      //-- Edit block
      graph.startBatch('change');

      cellView.model.set('data', newblock.data, {
        translateBy: cellView.model.id,
        tx: 0,
        ty: -offset,
      });

      cellView.model.translate(0, offset);
      graph.stopBatch('change');
      cellView.apply();

      ctx.resultAlert = alertify.success(
        ctx.gettextCatalog.getString('Block updated')
      );
    });
  }

  return {
    newBasicPort: newBasicPort,
    loadBasicInput: loadBasicInput,
    loadBasicOutput: loadBasicOutput,
    editBasicPort: editBasicPort,
  };
};
