//---------------------------------------------------------------------------
//-- List compiler: generates .list memory initialization files
//---------------------------------------------------------------------------
'use strict';

window._icecompiler = window._icecompiler || {};

window._icecompiler.list = function (ctx) {
  function listCompiler(project) {
    var i;
    var listFiles = [];

    if (project && project.design && project.design.graph) {
      var blockArray = project.design.graph.blocks;
      var dependencies = project.dependencies;

      // Find in blocks

      for (i in blockArray) {
        var block = blockArray[i];
        if (block.type === ctx.blocks.BASIC_MEMORY) {
          listFiles.push({
            name: ctx.utils.digestId(block.id) + '.list',
            content: block.data.list,
          });
        }
      }

      // Find in dependencies

      for (i in dependencies) {
        var dependency = dependencies[i];
        listFiles = listFiles.concat(listCompiler(dependency));
      }
    }

    return listFiles;
  }

  return {
    listCompiler: listCompiler,
  };
};
