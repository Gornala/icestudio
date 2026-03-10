//---------------------------------------------------------------------------
//-- JSON Input block form functions: new, load, and edit
//---------------------------------------------------------------------------
'use strict';

window._iceblockforms = window._iceblockforms || {};

window._iceblockforms.jsonForms = function (ctx) {
  function containsPort(portId, size, ports) {
    for (var i = 0; i < ports.length; i++) {
      if (ports[i].id === portId && ports[i].size === size) {
        return true;
      }
    }
    return false;
  }

  function newBasicJsonInput(callback) {
    var form = new ctx.forms.FormBasicJsonInput();
    form.display(function (evt) {
      form.process(evt);
      if (evt.cancel) {
        return;
      }
      var block = form.newBlock();
      var cell = loadBasicJsonInput(block);
      if (callback) {
        callback([cell]);
      }
    });
  }

  function loadBasicJsonInput(instance, disabled) {
    var data = instance.data;
    var bottomPorts = [];

    // All ports are outputs on the bottom side
    (data.ports || []).forEach(function (pname) {
      bottomPorts.push({ id: pname, name: pname, label: pname, size: 1 });
    });

    var cell = new joint.shapes.ice.JsonInput({
      id: instance.id,
      blockType: instance.type,
      data: instance.data,
      position: instance.position,
      size: instance.size,
      disabled: disabled,
      leftPorts: [],
      rightPorts: [],
      topPorts: [],
      bottomPorts: bottomPorts,
    });
    return cell;
  }

  function editBasicJsonInput(cellView, callback) {
    var block = cellView.model.attributes;
    var data = block.data;
    var form = new ctx.forms.FormBasicJsonInput(
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

      var blockInstance = new ctx.blocks.JsonInputBlock(
        form.jsonName,
        form.jsonPath,
        form.jsonPorts
      );
      blockInstance.position = block.position;
      blockInstance.size = block.size;
      blockInstance.id = block.id;
      // Prefer freshly loaded content from the form (if file was re-read)
      blockInstance.data.content = form.jsonContent || data.content || '{}';

      var cell = loadBasicJsonInput(blockInstance);

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
          var source = wire.get('source');
          var cellBottomPorts = cell.get('bottomPorts') || [];
          if (
            source.id === cell.id &&
            containsPort(source.port, size, cellBottomPorts)
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
    newBasicJsonInput: newBasicJsonInput,
    loadBasicJsonInput: loadBasicJsonInput,
    editBasicJsonInput: editBasicJsonInput,
  };
};
