//---------------------------------------------------------------------------
//-- tree-model.js: recursive walk of the design hierarchy for the tree panel.
//--
//-- Reads the design straight out of project + common.allDependencies, so it
//-- can describe blocks that are nested inside submodules and therefore not
//-- present on the current paper.
//--
//-- Loaded as a <script> tag; exposes window.iceTreeModel.
//---------------------------------------------------------------------------
'use strict';

window.iceTreeModel = (function () {
  var CODE_TYPE = 'basic.code';
  var MAX_DEPTH = 24; //-- safety net against a self-referencing dependency

  //-- A dependency block type is any type that is not one of the built-ins.
  var isDependency = function (type) {
    return !!type && type.indexOf('basic.') !== 0;
  };

  //-- Same rule the code editor uses when it derives a Verilog module name
  //-- from a code block (see interactions.js / code-editor.js).
  var moduleNameOf = function (block) {
    var d = block.data || {};
    var raw = String(d.label || d.name || block.id || '').replace(
      /[^a-zA-Z0-9_]/g,
      '_'
    );
    if (!raw) {
      raw = 'ice_code_module';
    }
    return /^[0-9]/.test(raw) ? 'm' + raw : raw;
  };

  var labelOfDependency = function (type, dep) {
    return (dep && dep.package && dep.package.name) || type;
  };

  var labelOfCode = function (block) {
    var d = block.data || {};
    return d.label || d.name || moduleNameOf(block);
  };

  //-- Byte-for-byte reproduction of code-editor.js assembleVerilog(), so the
  //-- module.v sitting in a block's build dir can be compared against the code
  //-- currently in the design. Equal means the artifacts next to it describe
  //-- this exact code; different means they are stale.
  var assembleVerilog = function (block) {
    var d = block.data || {};
    var ports = d.ports || { in: [], out: [] };
    var moduleName = moduleNameOf(block);
    var code = d.code || '';

    var portDefs = [];
    var pushPort = function (dir) {
      return function (p) {
        var pname = p.name.charAt(0) === '@' ? p.name.substr(1) : p.name;
        var r = p.range && p.range !== '' ? p.range + ' ' : '';
        portDefs.push(' ' + dir + ' ' + r + pname);
      };
    };
    (ports.in || []).forEach(pushPort('input'));
    (ports.out || []).forEach(pushPort('output'));

    return [
      'module ' + moduleName + ' (',
      portDefs.join(',\n'),
      ');',
      '',
      code,
      '',
      'endmodule',
    ].join('\n');
  };

  //-- Build the node list for one design graph.
  //-- ancestry: dependency types already open above this level (cycle guard).
  var walk = function (graphBlocks, depth, parentPath, ancestry, deps, out) {
    if (depth > MAX_DEPTH) {
      return;
    }
    (graphBlocks || []).forEach(function (block) {
      if (!block || !block.type) {
        return;
      }
      var path = parentPath + '/' + block.id;

      if (block.type === CODE_TYPE) {
        out.push({
          id: block.id,
          path: path,
          depth: depth,
          kind: 'code',
          label: labelOfCode(block),
          moduleName: moduleNameOf(block),
          moduleKey: 'code:' + block.id,
          block: block,
          verilog: assembleVerilog(block),
          hasChildren: false,
          expanded: false,
          children: [],
          status: null,
        });
        return;
      }

      if (!isDependency(block.type)) {
        return; //-- ports, labels, constants, memory, info: not testable units
      }

      var dep = deps[block.type];
      var childBlocks =
        (dep && dep.design && dep.design.graph && dep.design.graph.blocks) ||
        [];
      var recursive = ancestry.indexOf(block.type) !== -1;

      var node = {
        id: block.id,
        path: path,
        depth: depth,
        kind: 'submodule',
        label: labelOfDependency(block.type, dep),
        moduleName: labelOfDependency(block.type, dep),
        moduleKey: block.type,
        block: block,
        recursive: recursive,
        hasChildren: false,
        expanded: depth < 1,
        children: [],
        status: null,
      };
      out.push(node);

      if (recursive) {
        return; //-- stop before looping forever
      }
      walk(
        childBlocks,
        depth + 1,
        path,
        ancestry.concat([block.type]),
        deps,
        node.children
      );
      node.hasChildren = node.children.length > 0;
    });
  };

  //-- Public: build the whole tree for a project.
  //-- Returns { roots: [node], all: [node] } — all is a flat list in document
  //-- order, handy for status scanning and for "run on everything" actions.
  var build = function (project, allDependencies) {
    var deps = allDependencies || {};
    var design = (project && project.design) || { graph: { blocks: [] } };
    var roots = [];
    walk(design.graph.blocks, 0, '', [], deps, roots);

    var all = [];
    var collect = function (nodes) {
      nodes.forEach(function (n) {
        all.push(n);
        collect(n.children);
      });
    };
    collect(roots);

    return { roots: roots, all: all };
  };

  //-- Flatten the tree honouring each node's expanded flag, for row rendering.
  var flatten = function (roots) {
    var rows = [];
    var visit = function (nodes) {
      nodes.forEach(function (n) {
        rows.push(n);
        if (n.expanded && n.children.length) {
          visit(n.children);
        }
      });
    };
    visit(roots);
    return rows;
  };

  //-- Find a node by its instance path.
  var findByPath = function (tree, path) {
    for (var i = 0; i < tree.all.length; i++) {
      if (tree.all[i].path === path) {
        return tree.all[i];
      }
    }
    return null;
  };

  return {
    build: build,
    flatten: flatten,
    findByPath: findByPath,
    assembleVerilog: assembleVerilog,
    moduleNameOf: moduleNameOf,
    isDependency: isDependency,
    CODE_TYPE: CODE_TYPE,
  };
})();
