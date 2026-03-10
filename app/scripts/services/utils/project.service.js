'use strict';

window._iceutils = window._iceutils || {};

window._iceutils.project = function (ctx) {
  function checkIsAnyInout(project) {
    if (_checkIsAnyInout(project)) {
      return true;
    }
    for (var d in project.dependencies) {
      if (_checkIsAnyInout(project.dependencies[d])) {
        return true;
      }
    }
    return false;

    function _checkIsAnyInout(_project) {
      for (var i in _project.design.graph.blocks) {
        var block = _project.design.graph.blocks[i];
        switch (block.type) {
          case ctx.blocks.BASIC_INPUT:
          case ctx.blocks.BASIC_OUTPUT:
            if (block.data.inout) {
              return true;
            }
            break;
          case ctx.blocks.BASIC_CODE:
            if (
              block.data.ports.inoutLeft &&
              block.data.ports.inoutLeft.length
            ) {
              return true;
            }
            if (
              block.data.ports.inoutRight &&
              block.data.ports.inoutRight.length
            ) {
              return true;
            }
            break;
          default:
            break;
        }
      }
      return false;
    }
  }

  var mod = {};

  mod.dependencyID = function (dependency) {
    if (dependency.package && dependency.design) {
      return ctx.nodeSha1(
        JSON.stringify(dependency.package) + JSON.stringify(dependency.design)
      );
    }
  };

  mod.mergeDependencies = function (type, block) {
    if (type in ctx.common.allDependencies) {
      return;
    }
    var deps = block.dependencies;
    for (var depType in deps) {
      if (!(depType in ctx.common.allDependencies)) {
        ctx.common.allDependencies[depType] = deps[depType];
      }
    }
    delete block.dependencies;
    ctx.common.allDependencies[type] = block;
  };

  mod.cellsToProject = function (cells, opt) {
    var _blocks = [];
    var wires = [];
    var p = {
      version: ctx.common.VERSION,
      design: {},
      dependencies: {},
    };

    opt = opt || {};

    for (var c = 0; c < cells.length; c++) {
      var cell = cells[c];

      if (
        cell.type === 'ice.Generic' ||
        cell.type === 'ice.Input' ||
        cell.type === 'ice.Output' ||
        cell.type === 'ice.Code' ||
        cell.type === 'ice.Info' ||
        cell.type === 'ice.Constant' ||
        cell.type === 'ice.Memory' ||
        cell.type === 'ice.JsonInput' ||
        cell.type === 'ice.JsonOutput'
      ) {
        var block = {};
        block.id = cell.id;
        block.type = cell.blockType;
        block.data = cell.data;
        block.position = cell.position;
        if (
          cell.type === 'ice.Generic' ||
          cell.type === 'ice.Code' ||
          cell.type === 'ice.Info' ||
          cell.type === 'ice.Memory' ||
          cell.type === 'ice.JsonInput' ||
          cell.type === 'ice.JsonOutput'
        ) {
          block.size = cell.size;
        }
        _blocks.push(block);
      } else if (cell.type === 'ice.Wire') {
        var wire = {};
        wire.source = {
          block: cell.source.id,
          port: cell.source.port,
        };
        wire.target = {
          block: cell.target.id,
          port: cell.target.port,
        };
        wire.vertices = cell.vertices;
        wire.size = cell.size > 1 ? cell.size : undefined;
        wires.push(wire);
      }
    }

    p.design.board = ctx.common.selectedBoard.name;
    p.design.graph = {
      blocks: _blocks,
      wires: wires,
    };

    if (opt.deps !== false) {
      var types = mod.findSubDependencies(p, ctx.common.allDependencies);
      for (var t in types) {
        p.dependencies[types[t]] = ctx.common.allDependencies[types[t]];
      }
    }

    return p;
  };

  mod.findSubDependencies = function (dependency) {
    var subDependencies = [];
    if (dependency) {
      for (var i in dependency.design.graph.blocks) {
        var type = dependency.design.graph.blocks[i].type;
        if (type.indexOf('basic.') === -1) {
          subDependencies.push(type);
          var newSubDependencies = mod.findSubDependencies(
            ctx.common.allDependencies[type]
          );
          subDependencies = subDependencies.concat(newSubDependencies);
        }
      }
      return _.unique(subDependencies);
    }
    return subDependencies;
  };

  mod.approveProjectBlock = function (profile, block, isLoad) {
    if (profile.get('allowInoutPorts') || ctx.common.allowProjectInoutPorts) {
      return Promise.resolve('ok');
    }

    var hasInoutPorts = checkIsAnyInout(block);
    if (!hasInoutPorts) {
      return Promise.resolve('ok');
    }

    var prompt =
      (isLoad
        ? ctx.gettextCatalog.getString(
            'You are loading a design that uses "tri-state".'
          )
        : ctx.gettextCatalog.getString(
            'You are importing a block that uses "tri-state".'
          )) +
      ' ' +
      ctx.gettextCatalog.getString(
        'Tri-state (aka high-Z, bidirectional, or inout) ports are not recommended in standard designs.<br /><br />You will be asked to update your Preferences (Advanced user setting) or you can just open this design on a preview basis.<br /><br />Continue?'
      );

    return new Promise(function (resolve) {
      alertify.confirm(
        prompt,
        function () {
          resolve('ok');
        },
        function () {
          resolve('cancel');
        }
      );
    }).then(function (result) {
      if (result === 'cancel') {
        return result;
      }

      return new Promise(function (resolve) {
        alertify.set('confirm', 'defaultFocus', 'cancel');
        alertify
          .confirm(
            ctx.gettextCatalog.getString(
              'Click "Yes" to allow tri-state and update Preferences:<br />&nbsp;&nbsp;&nbsp;<b>Advanced features → Allow tri-state connections</b><br /><br />Click "This time" to view tri-state for this design only.'
            ),
            function () {
              profile.set('allowInoutPorts', true);
              alertify.warning(
                ctx.gettextCatalog.getString(
                  'Changed Preferences: Allow tri-state connections'
                )
              );
              resolve('ok_advanced');
            },
            function () {
              ctx.common.allowProjectInoutPorts = true;
              alertify.warning(
                ctx.gettextCatalog.getString('Viewing tri-state')
              );
              resolve('ok_this_time');
            }
          )
          .set('labels', {
            ok: ctx.gettextCatalog.getString('Yes'),
            cancel: ctx.gettextCatalog.getString('This time'),
          });
      }).then(function (result) {
        alertify.set('confirm', 'defaultFocus', 'ok');
        alertify.set('confirm', 'labels', {
          ok: ctx.gettextCatalog.getString('OK'),
          cancel: ctx.gettextCatalog.getString('Cancel'),
        });
        return result;
      });
    });
  };

  mod.hasInputRule = function (port, apply) {
    apply = apply === undefined ? true : apply;
    var _default;
    var rules = ctx.common.selectedBoard.rules;
    if (rules) {
      var allInitPorts = rules.input;
      if (allInitPorts) {
        for (var i in allInitPorts) {
          if (port === allInitPorts[i].port) {
            _default = allInitPorts[i];
            _default.apply = apply;
            break;
          }
        }
      }
    }
    return _.clone(_default);
  };

  return mod;
};
