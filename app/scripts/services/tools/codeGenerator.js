/**
 * codeGenerator.js - Generate Verilog/PCF/LPF/list files from the current design
 * Functions: generateCode
 */
'use strict';

window._icetools = window._icetools || {};

window._icetools.codeGenerator = function (ctx) {
  function generateCode(cmd) {
    return new Promise(function (resolve) {
      ctx.project.snapshot();
      ctx.project.update();
      var opt = {
        datetime: false,
        boardRules: ctx.profile.get('boardRules'),
      };
      if (opt.boardRules) {
        opt.initPorts = ctx.compiler.getInitPorts(ctx.project.get());
        opt.initPins = ctx.compiler.getInitPins(ctx.project.get());
      }

      // Verilog file
      var verilogFile = ctx.compiler.generate(
        'verilog',
        ctx.project.get(),
        opt
      )[0];
      ctx.nodeFs.writeFileSync(
        ctx.nodePath.join(ctx.common.BUILD_DIR, verilogFile.name),
        verilogFile.content,
        'utf8'
      );

      if (cmd.indexOf('lint') > -1) {
        // only verification
        console.log('ONLY VERIFY');
      } else {
        var archName = ctx.common.selectedBoard.info.arch;
        if (archName === 'ecp5') {
          // LPF file
          var lpfFile = ctx.compiler.generate('lpf', ctx.project.get(), opt)[0];
          ctx.nodeFs.writeFileSync(
            ctx.nodePath.join(ctx.common.BUILD_DIR, lpfFile.name),
            lpfFile.content,
            'utf8'
          );
        } else {
          // PCF file
          var pcfFile = ctx.compiler.generate('pcf', ctx.project.get(), opt)[0];
          ctx.nodeFs.writeFileSync(
            ctx.nodePath.join(ctx.common.BUILD_DIR, pcfFile.name),
            pcfFile.content,
            'utf8'
          );
        }
      }

      // List files
      var listFiles = ctx.compiler.generate('list', ctx.project.get());
      for (var i in listFiles) {
        var listFile = listFiles[i];
        ctx.nodeFs.writeFileSync(
          ctx.nodePath.join(ctx.common.BUILD_DIR, listFile.name),
          listFile.content,
          'utf8'
        );
      }
      // JSON input block files (written to their configured absolute paths)
      var jsonFiles = ctx.compiler.generate('json', ctx.project.get());
      for (var ji in jsonFiles) {
        var jsonFile = jsonFiles[ji];
        try {
          ctx.nodeFs.writeFileSync(jsonFile.name, jsonFile.content, 'utf8');
        } catch (e) {
          console.warn('JSON block: could not write ' + jsonFile.name, e);
        }
      }
      // JSON output block files (written to their configured absolute paths)
      var jsonOutputFiles = ctx.compiler.generate(
        'jsonOutput',
        ctx.project.get()
      );
      for (var joi in jsonOutputFiles) {
        var joFile = jsonOutputFiles[joi];
        try {
          ctx.nodeFs.writeFileSync(joFile.name, joFile.content, 'utf8');
        } catch (e) {
          console.warn('JSON output block: could not write ' + joFile.name, e);
        }
      }

      ctx.project.restoreSnapshot();
      resolve({
        code: verilogFile.content,
        internalResources: listFiles.map(function (res) {
          return res.name;
        }),
      });
    });
  }

  return {
    generateCode: generateCode,
  };
};
