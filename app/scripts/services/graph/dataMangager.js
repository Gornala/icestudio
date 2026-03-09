//---------------------------------------------------------------------------
//-- dataManager.js: Board selection, language, project/block metadata
//-- Loaded as a <script> tag before graph.js; exposes window._icegraph.dataManager
//---------------------------------------------------------------------------
'use strict';

window._icegraph = window._icegraph || {};

window._icegraph.dataManager = function (ctx) {
  //-- Reset breadcrumbs to top level with given name
  function resetBreadcrumbs(name) {
    ctx.service.breadcrumbs = [{ name: name, type: '' }];
    ctx.utils.rootScopeSafeApply();
  }

  //-- Set board rules on all cells
  function setBoardRules(rules) {
    var cells = ctx.graph.getCells();
    ctx.profile.set('boardRules', rules);

    for (var i = 0, n = cells.length; i < n; i++) {
      if (!cells[i].isLink()) {
        cells[i].attributes.rules = rules;
        var cellView = ctx.paper.findViewByModel(cells[i]);
        cellView.updateBox();
      }
    }
  }

  //-- Select a board and optionally reset block pin values
  function selectBoard(board, reset) {
    ctx.graph.startBatch('change');
    var data = {
      previous: ctx.common.selectedBoard,
      next: board,
    };
    ctx.graph.trigger('board', { data: data });
    var newBoard = ctx.boards.selectBoard(board.name);
    if (reset) {
      resetBlocks();
    }
    ctx.graph.stopBatch('change');
    return newBoard;
  }

  //-- Update block metadata (name, version, description, author, image)
  function setBlockInfo(values, newValues, blockId) {
    if (typeof ctx.common.allDependencies === 'undefined') {
      return false;
    }

    ctx.graph.startBatch('change');
    var data = {
      previous: values,
      next: newValues,
    };
    ctx.graph.trigger('info', { data: data });

    ctx.common.allDependencies[blockId].package.name = newValues[0];
    ctx.common.allDependencies[blockId].package.version = newValues[1];
    ctx.common.allDependencies[blockId].package.description = newValues[2];
    ctx.common.allDependencies[blockId].package.author = newValues[3];
    ctx.common.allDependencies[blockId].package.image = newValues[4];

    ctx.graph.stopBatch('change');
  }

  //-- Update project-level metadata
  function setInfo(values, newValues, project) {
    ctx.graph.startBatch('change');
    var data = {
      previous: values,
      next: newValues,
    };
    ctx.graph.trigger('info', { data: data });
    project.set('package', {
      name: newValues[0],
      version: newValues[1],
      description: newValues[2],
      author: newValues[3],
      image: newValues[4],
    });
    ctx.graph.stopBatch('change');
  }

  //-- Change UI language
  function selectLanguage(language) {
    ctx.graph.startBatch('change');
    var data = {
      previous: ctx.profile.get('language'),
      next: language,
    };
    ctx.graph.trigger('lang', { data: data });
    language = ctx.utils.setLocale(language);
    ctx.graph.stopBatch('change');
    return language;
  }

  //-- Reset I/O block pin choices and code block port rules after board change
  function resetBlocks() {
    var data, connectedLinks;
    var cells = ctx.graph.getCells();
    var type = false;
    var block = false;
    var connected = false;

    _.each(cells, function (cell) {
      if (cell.isLink()) {
        return;
      }
      type = cell.get('blockType');
      if (type === ctx.blocks.BASIC_INPUT || type === ctx.blocks.BASIC_OUTPUT) {
        var view = ctx.paper.findViewByModel(cell.id);
        cell.set(
          'choices',
          type === ctx.blocks.BASIC_INPUT
            ? ctx.common.pinoutInputHTML
            : ctx.common.pinoutOutputHTML
        );
        view.clearValues();
        view.applyChoices();
      } else if (type === ctx.blocks.BASIC_CODE) {
        data = ctx.utils.clone(cell.get('data'));
        connectedLinks = ctx.graph.getConnectedLinks(cell);
        if (data && data.ports && data.ports.in) {
          _.each(data.ports.in, function (port) {
            var isConnected = false;
            _.each(connectedLinks, function (connectedLink) {
              if (connectedLink.get('target').port === port.name) {
                isConnected = true;
                return false;
              }
            });
            port.default = ctx.utils.hasInputRule(port.name, !isConnected);
            cell.set('data', data);
            ctx.paper.findViewByModel(cell.id).updateBox();
          });
        }
      } else if (type.indexOf('basic.') === -1) {
        block = ctx.common.allDependencies[type];
        data = { ports: { in: [] } };
        connectedLinks = ctx.graph.getConnectedLinks(cell);
        if (block.design.graph.blocks) {
          _.each(block.design.graph.blocks, function (item) {
            if (item.type === ctx.blocks.BASIC_INPUT && !item.data.range) {
              connected = false;
              _.each(connectedLinks, function (connectedLink) {
                if (connectedLink.get('target').port === item.id) {
                  connected = true;
                  return false;
                }
              });
              data.ports.in.push({
                name: item.id,
                default: ctx.utils.hasInputRule(
                  (item.data.clock ? 'clk' : '') || item.data.name,
                  !connected
                ),
              });
            }
            cell.set('data', data);
            ctx.paper.findViewByModel(cell.id).updateBox();
          });
        }
      }
    });
  }

  return {
    resetBreadcrumbs: resetBreadcrumbs,
    setBoardRules: setBoardRules,
    selectBoard: selectBoard,
    setBlockInfo: setBlockInfo,
    setInfo: setInfo,
    selectLanguage: selectLanguage,
    resetBlocks: resetBlocks,
  };
};
