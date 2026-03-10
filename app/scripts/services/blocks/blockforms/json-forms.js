//---------------------------------------------------------------------------
//-- JSON block form functions: new, load, and edit
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

  function newBasicJson(callback) {
    var form = new ctx.forms.FormBasicJson();
    form.display(function (evt) {
      form.process(evt);
      if (evt.cancel) {
        return;
      }
      var block = form.newBlock();
      var cell = loadBasicJson(block);
      if (callback) {
        callback([cell]);
      }
    });
  }

  function loadBasicJson(instance, disabled) {
    var data = instance.data;
    var leftPorts = [];
    var rightPorts = [];

    if (data.type === 'input') {
      // Input type: wires connect into the block (left side)
      (data.ports || []).forEach(function (pname) {
        leftPorts.push({ id: pname, name: pname, label: pname, size: 1 });
      });
    } else {
      // Output type: values flow out of the block (right side)
      (data.ports || []).forEach(function (pname) {
        rightPorts.push({ id: pname, name: pname, label: pname, size: 1 });
      });
    }

    var cell = new joint.shapes.ice.Json({
      id: instance.id,
      blockType: instance.type,
      data: instance.data,
      position: instance.position,
      size: instance.size,
      disabled: disabled,
      leftPorts: leftPorts,
      rightPorts: rightPorts,
    });
    return cell;
  }

  function editBasicJson(cellView, callback) {
    var block = cellView.model.attributes;
    var data = block.data;
    var form = new ctx.forms.FormBasicJson(
      data.name,
      data.path,
      data.type,
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

      var blockInstance = new ctx.blocks.JsonBlock(
        form.jsonName,
        form.jsonPath,
        form.jsonType,
        form.jsonPorts
      );
      blockInstance.position = block.position;
      blockInstance.size = block.size;
      blockInstance.id = block.id;
      blockInstance.data.content = data.content || '{}';

      var cell = loadBasicJson(blockInstance);

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
          var target = wire.get('target');
          var cellLeftPorts = cell.get('leftPorts') || [];
          var cellRightPorts = cell.get('rightPorts') || [];
          if (
            (target.id === cell.id &&
              containsPort(target.port, size, cellLeftPorts)) ||
            (source.id === cell.id &&
              containsPort(source.port, size, cellRightPorts))
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
    newBasicJson: newBasicJson,
    loadBasicJson: loadBasicJson,
    editBasicJson: editBasicJson,
  };
};
