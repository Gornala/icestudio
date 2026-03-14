//---------------------------------------------------------------------------
//-- JSON compiler: handles JSON Output blocks (writes wired values to file)
//---------------------------------------------------------------------------
'use strict';

window._icecompiler = window._icecompiler || {};

window._icecompiler.json = function (ctx) {
  //-- Resolve label connections: build a lookup from label name to the actual
  //-- source blocks feeding into inputLabel blocks with that name.
  function resolveLabels(graph) {
    var labelSources = {};
    var b, blk, w, wire;
    for (b in graph.blocks) {
      blk = graph.blocks[b];
      if (blk.type === ctx.blocks.BASIC_INPUT_LABEL) {
        var name = blk.data.name;
        if (!name) {
          continue;
        }
        for (w in graph.wires) {
          wire = graph.wires[w];
          if (wire.target.block === blk.id) {
            if (!labelSources[name]) {
              labelSources[name] = [];
            }
            labelSources[name].push(wire.source);
          }
        }
      }
    }
    return labelSources;
  }

  //-- Find the value-bearing source block for a wire endpoint, resolving
  //-- through output labels if needed.
  function resolveSourceValue(srcRef, graph, labelSources) {
    var srcBlock = ctx.findBlock(srcRef.block, graph);
    if (!srcBlock) {
      return undefined;
    }
    // Direct connection to a block with a value (constant, memory, etc.)
    if (srcBlock.data.value !== undefined) {
      return srcBlock.data.value;
    }
    // Source is an output label — look up by name to find the real source
    if (srcBlock.type === ctx.blocks.BASIC_OUTPUT_LABEL) {
      var labelName = srcBlock.data.name;
      var sources = labelSources[labelName];
      if (sources) {
        for (var s = 0; s < sources.length; s++) {
          var realSrc = ctx.findBlock(sources[s].block, graph);
          if (realSrc && realSrc.data.value !== undefined) {
            return realSrc.data.value;
          }
        }
      }
    }
    return undefined;
  }

  //-- Produces one file per JSON Output block, collecting values from wired
  //-- constant sources and writing them to the block's configured path.
  function jsonOutputCompiler(project) {
    var files = [];
    var graph = project.design.graph;
    var labelSources = resolveLabels(graph);

    for (var i in graph.blocks) {
      var block = graph.blocks[i];
      if (block.type === ctx.blocks.BASIC_JSON_OUTPUT && block.data.path) {
        var jsonObj = {};
        for (var w in graph.wires) {
          var wire = graph.wires[w];
          if (wire.target.block === block.id) {
            var val = resolveSourceValue(wire.source, graph, labelSources);
            if (val !== undefined) {
              jsonObj[wire.target.port] = val;
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
    jsonOutputCompiler: jsonOutputCompiler,
  };
};
