'use strict';

window._iceutils = window._iceutils || {};

window._iceutils.graph = function (ctx) {
  var mod = {};

  mod.selectionToCells = function (selection, graph) {
    var cells = [];
    var blocksMap = {};
    selection.each(function (block) {
      cells.push(block.attributes);
      blocksMap[block.id] = block;
      var processedWires = {};
      var connectedWires = graph.getConnectedLinks(block);
      _.each(connectedWires, function (wire) {
        if (processedWires[wire.id]) {
          return;
        }
        var source = blocksMap[wire.get('source').id];
        var target = blocksMap[wire.get('target').id];
        if (source && target) {
          cells.push(wire.attributes);
          processedWires[wire.id] = true;
        }
      });
    });
    return cells;
  };

  mod.duplicateSelected = function (selection, graph, callback) {
    var cells = mod.selectionToCells(selection, graph);
    var content = ctx.self.cellsToProject(cells, graph);
    if (callback && content) {
      callback(content);
    }
  };

  return mod;
};
