//---------------------------------------------------------------------------
//-- JSON Output block form functions: new, load, and edit
//---------------------------------------------------------------------------
'use strict';

window._iceblockforms = window._iceblockforms || {};

window._iceblockforms.jsonOutputForms = function (ctx) {
  function containsPort(portId, size, ports) {
    for (var i = 0; i < ports.length; i++) {
      if (ports[i].id === portId && ports[i].size === size) {
        return true;
      }
    }
    return false;
  }

  function newBasicJsonOutput(callback) {
    var form = new ctx.forms.FormBasicJsonOutput();
    form.display(function (evt) {
      form.process(evt);
      if (evt.cancel) {
        return;
      }
      var block = form.newBlock();
      var cell = loadBasicJsonOutput(block);
      if (callback) {
        callback([cell]);
      }
    });
  }

  function loadBasicJsonOutput(instance, disabled) {
    var data = instance.data;
    var topPorts = [];

    (data.ports || []).forEach(function (pname) {
      topPorts.push({ id: pname, name: pname, label: pname });
    });

    var cell = new joint.shapes.ice.JsonOutput({
      id: instance.id,
      blockType: instance.type,
      data: instance.data,
      position: instance.position,
      size: instance.size,
      disabled: disabled,
      leftPorts: [],
      rightPorts: [],
      topPorts: topPorts,
    });
    return cell;
  }

  function editBasicJsonOutput(cellView, callback) {
    var block = cellView.model.attributes;
    var data = block.data;
    var form = new ctx.forms.FormBasicJsonOutput(
      data.name,
      data.path,
      data.ports
    );
    form.display(function (evt) {
      form.process(evt);
      if (evt.cancel) {
        return;
      }
      if (!form.changed()) {
        return;
      }

      var blockInstance = new ctx.blocks.JsonOutputBlock(
        form.jsonName,
        form.jsonPath,
        form.jsonPorts
      );
      blockInstance.position = block.position;
      blockInstance.size = block.size;
      blockInstance.id = block.id;
      blockInstance.data.content = data.content || '{}';

      var cell = loadBasicJsonOutput(blockInstance);

      if (cell) {
        var graph = cellView.paper.model;
        var connectedWires = graph.getConnectedLinks(cellView.model);

        graph.startBatch('change');
        cellView.model.remove();
        if (callback) {
          callback(cell);
        }

        for (var w in connectedWires) {
          var wire = connectedWires[w];
          var size = wire.get('size');
          var target = wire.get('target');
          var cellTopPorts = cell.get('topPorts') || [];
          if (
            target.id === cell.id &&
            containsPort(target.port, size, cellTopPorts)
          ) {
            graph.addCell(wire);
          }
        }
        graph.stopBatch('change');

        ctx.resultAlert = alertify.success(
          ctx.gettextCatalog.getString('Block updated')
        );
      }
    });
  }

  return {
    newBasicJsonOutput: newBasicJsonOutput,
    loadBasicJsonOutput: loadBasicJsonOutput,
    editBasicJsonOutput: editBasicJsonOutput,
  };
};
