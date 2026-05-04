//---------------------------------------------------------------------------
//-- Info frame form functions: new, load, and edit
//---------------------------------------------------------------------------
'use strict';

window._iceblockforms = window._iceblockforms || {};

window._iceblockforms.infoFrameForms = function (ctx) {
  function newBasicInfoFrame(callback) {
    var form = new ctx.forms.FormBasicInfoFrame('', 'fuchsia');

    form.display(function (evt) {
      form.process(evt);

      if (evt.cancel) {
        return;
      }

      var block = new ctx.blocks.InfoFrameBlock(form.label, form.color);
      var cell = loadBasicInfoFrame(block);
      callback([cell]);
    });
  }

  function loadBasicInfoFrame(instance, disabled) {
    var cell = new ctx.joint.shapes.ice.InfoFrame({
      id: instance.id,
      blockType: instance.type,
      data: instance.data,
      position: instance.position,
      size: instance.size,
      disabled: disabled,
    });
    return cell;
  }

  function editBasicInfoFrame(cellView, callback) {
    var block = cellView.model.attributes;
    var data = ctx.utils.clone(block.data);

    var form = new ctx.forms.FormBasicInfoFrame(
      data.label || '',
      data.blockColor || 'fuchsia'
    );

    form.display(function (evt) {
      form.process(evt);

      if (evt.cancel) {
        return;
      }

      var newData = ctx.utils.clone(data);
      newData.label = form.label;
      newData.blockColor = form.color;

      var graph = cellView.paper.model;
      graph.startBatch('change');
      cellView.model.set('data', newData);
      graph.stopBatch('change');
      cellView.apply();

      ctx.resultAlert = alertify.success(
        ctx.gettextCatalog.getString('Frame updated')
      );

      if (callback) {
        callback();
      }
    });
  }

  return {
    newBasicInfoFrame: newBasicInfoFrame,
    loadBasicInfoFrame: loadBasicInfoFrame,
    editBasicInfoFrame: editBasicInfoFrame,
  };
};
