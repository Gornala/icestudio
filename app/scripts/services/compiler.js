'use strict';

angular
  .module('icestudio')
  .service('compiler', function (common, utils, blocks, _package) {
    //-- Shared context passed to all submodules
    var ctx = {
      common: common,
      utils: utils,
      blocks: blocks,
      _package: _package,
      currentLibrary: false,
    };

    //-- Init submodules
    var _helpers = window._icecompiler.helpers(ctx);
    var _verilog = window._icecompiler.verilog(ctx);
    var _constraints = window._icecompiler.constraints(ctx);
    var _testbench = window._icecompiler.testbench(ctx);
    var _list = window._icecompiler.list(ctx);
    var _json = window._icecompiler.json(ctx);

    //-- Wire cross-module references into ctx
    ctx.header = _helpers.header;
    ctx.module = _helpers.module;
    ctx.mainIO = _helpers.mainIO;
    ctx.findBlock = _helpers.findBlock;
    ctx.getInitPorts = _helpers.getInitPorts;
    ctx.getInitPins = _helpers.getInitPins;

    //-- Public API
    this.getInitPorts = _helpers.getInitPorts;
    this.getInitPins = _helpers.getInitPins;

    this.generate = function (target, project, opt) {
      var content = '';
      var files = [];
      this.currentLibrary = false;
      ctx.currentLibrary = false;

      switch (target) {
        case 'verilog':
          ctx.currentLibrary = project.dependencies;
          content += _helpers.header('//', opt, true);
          content += '`default_nettype none\n\n';
          content += _verilog.verilogCompiler('main', project, opt);
          files.push({
            name: 'main.v',
            content: content,
          });
          break;
        case 'pcf':
          content += _helpers.header('#', opt);
          content += _constraints.pcfCompiler(project, opt);
          files.push({
            name: 'main.pcf',
            content: content,
          });
          break;
        case 'lpf':
          content += _helpers.header('#', opt);
          content += _constraints.lpfCompiler(project, opt);
          files.push({
            name: 'main.lpf',
            content: content,
          });
          break;
        case 'list':
          files = _list.listCompiler(project);
          break;

        case 'jsonOutput':
          files = _json.jsonOutputCompiler(project);
          break;
        case 'testbench':
          content += _helpers.header('//', opt, true);
          content += _testbench.testbenchCompiler(project);
          files.push({
            name: 'main_tb.v',
            content: content,
          });
          break;
        default:
          break;
      }
      return files;
    };
  });
