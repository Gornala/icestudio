//---------------------------------------------------------------------------
//-- Info block form functions: new, load, and edit for Info blocks
//---------------------------------------------------------------------------
'use strict';

window._iceblockforms = window._iceblockforms || {};

window._iceblockforms.infoForms = function (ctx) {
  function newBasicInfo(callback) {
    //-- Create the info Block
    let block = new ctx.blocks.InfoBlock();

    if (callback) {
      //-- Build the cell
      let cell = loadBasicInfo(block);

      //-- Execute the callback function passing the
      //-- new cell as an argument (An array of one cell)
      callback([cell]);
    }
  }

  function loadBasicInfo(instance, disabled) {
    // Translate info content
    if (instance.data.info && instance.data.readonly) {
      instance.data.text = ctx.gettextCatalog.getString(instance.data.info);
    }
    var cell = new ctx.joint.shapes.ice.Info({
      id: instance.id,
      blockType: instance.type,
      data: instance.data,
      position: instance.position,
      size: instance.size,
      disabled: disabled,
    });
    return cell;
  }

  function editBasicInfo(cellView) {
    //-- Access the current block
    let block = cellView.model.attributes;

    //-- Copy the block data
    let data = ctx.utils.clone(block.data);

    //-- Toggle readonly
    data.readonly = !data.readonly;

    // Translate info content
    if (data.info && data.readonly) {
      data.text = ctx.gettextCatalog.getString(data.info);
    }

    //-- Set the new data
    cellView.model.set('data', data);

    //-- Apply the changes!
    cellView.apply();
  }

  return {
    newBasicInfo: newBasicInfo,
    loadBasicInfo: loadBasicInfo,
    editBasicInfo: editBasicInfo,
  };
};
