//---------------------------------------------------------------------------
//-- Memory and Constant block form functions: new, load, and edit
//---------------------------------------------------------------------------
'use strict';

window._iceblockforms = window._iceblockforms || {};

window._iceblockforms.memoryConstantForms = function (ctx) {
  function newBasicConstant2(callback) {
    //-- Create the form
    let form = new ctx.forms.FormBasicConstant();

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

      //-- OK. All the values are ok. Proceed!!

      //-- Array for storing the blocks
      let cells = [];

      //-- Store the acumulate x position
      let positionX = 0;

      //-- Get all the blocks created from the form
      //-- Only the block data, not the final block
      let blocks = form.newBlocks();

      //-- Create an array with the final blocks!
      blocks.forEach((block) => {
        //-- update the block position
        block.position.x = positionX;

        //-- Build the cell
        let cell = loadBasicConstant(block);

        //-- Insert the block into the array
        cells.push(cell);

        //-- update the block position
        positionX += 15 * ctx.gridsize;
      });

      if (callback) {
        callback(cells);
      }
    });
  }

  function newBasicMemory2(callback) {
    let form = new ctx.forms.FormBasicMemory();

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

      //-- OK. All the values are ok. Proceed!!

      //-- Array for storing the blocks
      let cells = [];

      //-- Store the acumulate x position
      let positionX = 0;

      //-- Get all the blocks created from the form
      //-- Only the block data, not the final block
      let blocks = form.newBlocks();

      //-- Create an array with the final blocks!
      blocks.forEach((block) => {
        //-- update the block position
        block.position.x = positionX;

        //-- Build the cell
        let cell = loadBasicMemory(block);

        //-- Insert the block into the array
        cells.push(cell);

        //-- update the block position
        positionX += 22 * ctx.gridsize;
      });

      if (callback) {
        callback(cells);
      }
    });
  }

  function loadBasicConstant(instance, disabled) {
    var bottomPorts = [
      {
        id: 'constant-out',
        name: '',
        label: '',
      },
    ];
    var cell = new ctx.joint.shapes.ice.Constant({
      id: instance.id,
      blockType: instance.type,
      data: instance.data,
      position: instance.position,
      disabled: disabled,
      bottomPorts: bottomPorts,
    });
    return cell;
  }

  function loadBasicMemory(instance, disabled) {
    var bottomPorts = [
      {
        id: 'memory-out',
        name: '',
        label: '',
      },
    ];
    var cell = new ctx.joint.shapes.ice.Memory({
      id: instance.id,
      blockType: instance.type,
      data: instance.data,
      position: instance.position,
      size: instance.size,
      disabled: disabled,
      bottomPorts: bottomPorts,
    });
    return cell;
  }

  function editBasicConstant(cellView, nameLocked) {
    //-- Get the current memory block
    let block = cellView.model.attributes;

    //-- Get the data of the current block
    let name = block.data.name;
    let local = block.data.local;

    //-- Create the form
    let form = new ctx.forms.FormBasicConstant(name, local, nameLocked);

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

      //-- If there were no changes, return: Nothing to do
      if (!form.changed()) {
        return;
      }

      //-- Create the new block data and assign values
      let data = ctx.utils.clone(block.data);
      data.name = form.names[0];
      data.local = form.local;
      cellView.model.set('data', data);

      //-- Apply the changes!
      cellView.apply();

      //-- Notify the changes to the user
      ctx.resultAlert = alertify.success(
        ctx.gettextCatalog.getString('Block updated')
      );
    });
  }

  function editBasicMemory(cellView, nameLocked) {
    //-- Get the current memory block
    let block = cellView.model.attributes;

    //-- Get the data of the current block
    let name = block.data.name;
    let format = block.data.format;
    let local = block.data.local;

    //-- Create the form
    let form = new ctx.forms.FormBasicMemory(name, format, local, nameLocked);

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

      //-- If there were no changes, return: Nothing to do
      if (!form.changed()) {
        return;
      }

      //-- Create the new block data and assign values
      let data = ctx.utils.clone(block.data);
      data.name = form.names[0];
      data.local = form.local;
      data.format = form.value;
      cellView.model.set('data', data);

      //-- Apply the changes!
      cellView.apply();

      //-- Notify the changes to the user
      ctx.resultAlert = alertify.success(
        ctx.gettextCatalog.getString('Block updated')
      );
    });
  }

  return {
    newBasicConstant2: newBasicConstant2,
    newBasicMemory2: newBasicMemory2,
    loadBasicConstant: loadBasicConstant,
    loadBasicMemory: loadBasicMemory,
    editBasicConstant: editBasicConstant,
    editBasicMemory: editBasicMemory,
  };
};
