//---------------------------------------------------------------------------
//-- JSON compiler: generates JSON output files from input-type JSON blocks
//---------------------------------------------------------------------------
'use strict';

window._icecompiler = window._icecompiler || {};

window._icecompiler.json = function (ctx) {
  //-- Produces one file per JSON-input block, collecting values from wired
  //-- constant sources and writing them to the block's configured path.
  function jsonInputCompiler(project) {
    var files = [];
    var graph = project.design.graph;

    for (var i in graph.blocks) {
      var block = graph.blocks[i];
      if (
        block.type === ctx.blocks.BASIC_JSON &&
        block.data.type === 'input' &&
        block.data.path
      ) {
        var jsonObj = {};
        for (var w in graph.wires) {
          var wire = graph.wires[w];
          if (wire.target.block === block.id) {
            var srcBlock = ctx.findBlock(wire.source.block, graph);
            if (srcBlock && srcBlock.data.value !== undefined) {
              jsonObj[wire.target.port] = srcBlock.data.value;
            }
          }
        }
        files.push({
          name: block.data.path,
          content: JSON.stringify(jsonObj, null, 2) + '\n',
        });
      }
    }
    return files;
  }

  //-- Produces one file per JSON-output block, collecting values from wired
  //-- constant sources and writing them to the block's configured path.
  function jsonOutputCompiler(project) {
    var files = [];
    var graph = project.design.graph;

    for (var i in graph.blocks) {
      var block = graph.blocks[i];
      if (block.type === ctx.blocks.BASIC_JSON_OUTPUT && block.data.path) {
        var jsonObj = {};
        for (var w in graph.wires) {
          var wire = graph.wires[w];
          if (wire.target.block === block.id) {
            var srcBlock = ctx.findBlock(wire.source.block, graph);
            if (srcBlock && srcBlock.data.value !== undefined) {
              jsonObj[wire.target.port] = srcBlock.data.value;
            }
          }
        }
        files.push({
          id: block.id,
          name: block.data.path,
          content: JSON.stringify(jsonObj, null, 2) + '\n',
        });
      }
    }
    return files;
  }

  return {
    jsonInputCompiler: jsonInputCompiler,
    jsonOutputCompiler: jsonOutputCompiler,
  };
};
