//---------------------------------------------------------------------------
//-- Label block form functions: new, load, and edit for Input/Output labels
//---------------------------------------------------------------------------
'use strict';

window._iceblockforms = window._iceblockforms || {};

window._iceblockforms.labelForms = function (ctx) {
  //-------------------------------------------------------------------------
  //-- Create one or more New Basic Labels. A form is displayed first
  //-- for the user to enter the block data: (name, pin type and clock pin..)
  //--
  //-- Inputs:
  //--   * form: Form for that block...
  //--   * callback(cells):  Call the function when the block is read. The
  //--      cells are passed as a parameter
  //-------------------------------------------------------------------------
  function newBasicLabel(form, callback) {
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
        positionY += 10 * ctx.gridsize;
      });

      //-- We are done! Execute the callback function
      callback(cells);
    });
  }

  //-------------------------------------------------------------------------
  //-- Create two paired labels: An input and output labels with the
  //-- same name
  //--
  //-- Inputs:
  //--   * callback(cells):  Call the function when the block is read. The
  //--      cells are passed as a parameter
  //-------------------------------------------------------------------------
  function newBasicPairedLabels(form, callback) {
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
      //-- Get all the paired Labels
      blocks.forEach((pair) => {
        //-- update the pair position
        pair[0].position.y = positionY;
        pair[1].position.y = positionY;
        pair[1].position.x += 72;

        //-- Build the two cells of the paired labels
        let cell0 = ctx.loadBasic(pair[0]);
        let cell1 = ctx.loadBasic(pair[1]);

        //-- Insert the blocks into the array
        cells.push(cell0);
        cells.push(cell1);

        //-- Calculate the Next paired block position
        positionY += 5 * ctx.gridsize;
      });

      //-- We are done! Execute the callback function
      callback(cells);
    });
  }

  function loadBasicOutputLabel(instance, disabled) {
    var data = instance.data;
    var rightPorts = [
      {
        id: 'outlabel',
        name: '',
        label: '',
        size: data.pins ? data.pins.length : data.size || 1,
      },
    ];

    var cell = new ctx.joint.shapes.ice.OutputLabel({
      id: instance.id,
      blockColor: instance.blockColor,
      blockType: instance.type,
      data: instance.data,
      position: instance.position,
      disabled: disabled,
      rightPorts: rightPorts,
      choices: ctx.common.pinoutInputHTML,
    });
    return cell;
  }

  function loadBasicInputLabel(instance, disabled) {
    var data = instance.data;
    var leftPorts = [
      {
        id: 'inlabel',
        name: '',
        label: '',
        size: data.pins ? data.pins.length : data.size || 1,
      },
    ];

    var cell = new ctx.joint.shapes.ice.InputLabel({
      id: instance.id,
      blockColor: instance.blockColor,
      blockType: instance.type,
      data: instance.data,
      position: instance.position,
      disabled: disabled,
      leftPorts: leftPorts,
      choices: ctx.common.pinoutOutputHTML,
    });
    return cell;
  }

  //-----------------------------------------------------------------------
  //-- Change a Label block and launch a success notification to the user
  //--
  //-- INPUTS:
  //--   * data:  New particular data of the block (it depens on the type
  //--            of block)
  //--   * cellView: Graphical information for block to change
  //--
  //------------------------------------------------------------------------
  function changeLabelBlock(cellView, data) {
    //-- Get the graphical information of the block
    let graph = cellView.paper.model;

    //-- Change the block!
    graph.startBatch('change');
    cellView.model.set('data', data);
    graph.stopBatch('change');

    //-- Apply the changes
    cellView.apply();

    //-- Notify it to the user!
    ctx.resultAlert = alertify.success(
      ctx.gettextCatalog.getString('Label updated')
    );
  }

  //-----------------------------------------------------------------------
  //-- Edit a basic label block (input/output)
  //-- This function is called from the Find panel
  //--
  //-- TODO: It still needs to be refactored and joined with the current
  //-- block classes
  //--
  //-- INPUTS:
  //--
  //--   * cellView: Graphical information of the block
  //--   * newName: New label name to assign to the block
  //--   * newColor: New color for the Label
  //-------------------------------------------------------------------------
  function editBasicLabel(cellView, newName, newColor) {
    let block = cellView.model.attributes;

    //-- Create the new block
    let data = ctx.utils.clone(block.data);

    //-- Set the new data
    data.name = newName;
    data.blockColor = newColor;

    // Edit block and Notify to the user
    changeLabelBlock(cellView, data);
  }

  //-----------------------------------------------------------------------
  //-- Edit Label. It is called when the user doble clicks on a Label
  //--
  //--  INPUTS:
  //--    * form: New form created
  //--    * cellView: Graphical inforation of the block
  //-----------------------------------------------------------------------
  function editBasicLabel2(form, cellView, callback) {
    //-- Get the information of the current block
    //-- from the graphics library
    let graph = cellView.paper.model;
    let block = cellView.model.attributes;

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
      if (!form.changed) {
        return;
      }

      //-- Get some data from the new block
      let portInfo = form.portInfos[0];

      // Create new block
      let newblock = form.newBlock(0);

      //-- Set the same position than the original block
      newblock.position.x = block.position.x;
      newblock.position.y = block.position.y;

      //-- There was a change in size
      if (block.data.range !== portInfo.rangestr) {
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

      //-- No change in size
      else {
        // Edit block
        changeLabelBlock(cellView, newblock.data);
      }
    });
  }

  return {
    newBasicLabel: newBasicLabel,
    newBasicPairedLabels: newBasicPairedLabels,
    loadBasicOutputLabel: loadBasicOutputLabel,
    loadBasicInputLabel: loadBasicInputLabel,
    changeLabelBlock: changeLabelBlock,
    editBasicLabel: editBasicLabel,
    editBasicLabel2: editBasicLabel2,
  };
};
