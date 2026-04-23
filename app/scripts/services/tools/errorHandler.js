/**
 * errorHandler.js - Process apio command output, map errors to design blocks
 * Functions: processResult, mapCodeModules
 */
'use strict';

window._icetools = window._icetools || {};

window._icetools.errorHandler = function (ctx) {
  function findValueNPNR(pattern, output, previousValue) {
    var match = pattern.exec(output);
    return match && match[1] && match[2] && match[3] && match[4]
      ? {
          name: match[1],
          used: match[2],
          total: match[3],
          percentage: match[4],
        }
      : previousValue;
  }

  function findMaxFreq(pattern, output, previousValue) {
    var match = pattern.exec(output);
    return match && match[1] ? { value: match[1] } : previousValue;
  }

  function findTime(pattern, output, previousValue) {
    var match = pattern.exec(output);
    return match && match[1] && match[2]
      ? { value: match[1], unit: match[2] }
      : previousValue;
  }

  function mapCodeModules(code) {
    var codelines = code.split('\n');
    var match,
      module = { params: [] },
      modules = [];
    for (var i in codelines) {
      var codeline = codelines[i];
      if (!module.name) {
        match = /^module\s(.*?)[\s|;]/.exec(codeline);
        if (match) {
          module.name = match[1];
          continue;
        }
      }
      if (!module.begin) {
        match = /^\sparameter\s(.*?)\s/.exec(codeline);
        if (match) {
          module.params.push({ name: match[1], line: parseInt(i) + 1 });
          continue;
        }
      }
      if (!module.begin) {
        match = /;$/.exec(codeline);
        if (match) {
          module.begin = parseInt(i) + 1;
          continue;
        }
      }
      if (!module.end) {
        match = /^endmodule$/.exec(codeline);
        if (match) {
          module.end = parseInt(i) + 1;
          modules.push(module);
          module = { params: [] };
        }
      }
    }
    return modules;
  }

  function normalizeCodeError(codeError, modules) {
    var newCodeError;
    for (var i in modules) {
      var module = modules[i];
      if (codeError.line <= module.end) {
        newCodeError = { type: codeError.type, msg: codeError.msg };
        var re = /Failed\sto\sdetect\swidth\sfor\sparameter\s\\(.*?)\sat/g;
        var matchConstant = re.exec(newCodeError.msg);
        if (codeError.line > module.begin && !matchConstant) {
          if (module.name.startsWith('main_')) {
            newCodeError.blockId = module.name.split('_')[1];
            newCodeError.blockType = 'code';
            newCodeError.line =
              codeError.line -
              module.begin -
              (codeError.line === module.end ? 1 : 0);
          } else {
            newCodeError.blockId = module.name.split('_')[0];
            newCodeError.blockType = 'generic';
          }
          break;
        } else {
          if (module.name === 'main') {
            for (var j in module.params) {
              var param = module.params[j];
              if (
                codeError.line === param.line ||
                (matchConstant && param.name === matchConstant[1])
              ) {
                newCodeError.blockId = param.name;
                newCodeError.blockType = 'constant';
                break;
              }
            }
          } else {
            newCodeError.blockId = module.name;
            newCodeError.blockType = 'generic';
          }
          break;
        }
      }
    }
    return newCodeError;
  }

  function processResult(result, code) {
    result = result || {};
    var _error = result.error;
    var stdout = result.stdout;
    var stderr = result.stderr;
    console.log('***PROCESS***', _error, stdout, stderr);

    return new Promise(function (resolve, reject) {
      var archName = ctx.common.selectedBoard.info.arch;
      if (_error || stderr) {
        reject();
        if (stdout) {
          var boardName = ctx.common.selectedBoard.name;
          var boardLabel = ctx.common.selectedBoard.info.label;
          if (
            stdout.indexOf('Error: board ' + boardName + ' not connected') !==
              -1 ||
            stdout.indexOf('USBError') !== -1 ||
            stdout.indexOf('Activate bootloader') !== -1
          ) {
            var errorMessage = ctx.gettextCatalog.getString(
              'Board {{name}} not connected',
              { name: ctx.utils.bold(boardLabel) }
            );
            if (stdout.indexOf('Activate bootloader') !== -1) {
              if (ctx.common.selectedBoard.name.startsWith('TinyFPGA-B')) {
                errorMessage +=
                  '<br>(' +
                  ctx.gettextCatalog.getString('Bootloader not active') +
                  ')';
              }
            }
            ctx.resultAlert = alertify.error(errorMessage, 30);
          } else if (
            stdout.indexOf('Error: board ' + boardName + ' not available') !==
            -1
          ) {
            ctx.resultAlert = alertify.error(
              ctx.gettextCatalog.getString('Board {{name}} not available', {
                name: ctx.utils.bold(boardLabel),
              }),
              30
            );
            ctx.setupDriversAlert();
          } else if (stdout.indexOf('Error: unknown board') !== -1) {
            ctx.resultAlert = alertify.error(
              ctx.gettextCatalog.getString('Unknown board'),
              30
            );
          } else if (stdout.indexOf('[upload] Error') !== -1) {
            switch (ctx.common.selectedBoard.name) {
              case 'TinyFPGA-B2':
              case 'TinyFPGA-BX':
                console.log('UPLOAD OUT', stdout);
                var match = stdout.match(/Bootloader\snot\sactive/g);
                if (match && match.length === 3) {
                  ctx.resultAlert = alertify.error(
                    ctx.gettextCatalog.getString('Bootloader not active'),
                    30
                  );
                } else if (stdout.indexOf('Device or resource busy') !== -1) {
                  ctx.resultAlert = alertify.error(
                    ctx.gettextCatalog.getString(
                      'Board {{name}} not available',
                      { name: ctx.utils.bold(boardLabel) }
                    ),
                    30
                  );
                  ctx.setupDriversAlert();
                } else if (
                  stdout.indexOf(
                    'device disconnected or multiple access on port'
                  ) !== -1
                ) {
                  ctx.resultAlert = alertify.error(
                    ctx.gettextCatalog.getString(
                      'Board {{name}} disconnected',
                      { name: ctx.utils.bold(boardLabel) }
                    ),
                    30
                  );
                } else {
                  ctx.resultAlert = alertify.error(stdout, 30);
                }
                break;
              default:
                ctx.resultAlert = alertify.error(stdout, 30);
            }
          } else if (
            stdout.indexOf('Library not loaded:') !== -1 &&
            stdout.indexOf('libffi') !== -1
          ) {
            ctx.resultAlert = alertify.error(
              ctx.gettextCatalog.getString('Configuration not completed'),
              30
            );
            ctx.setupDriversAlert();
          } else if (
            stdout.indexOf('set_io: too few arguments') !== -1 ||
            stdout.indexOf('fatal error: unknown pin') !== -1
          ) {
            ctx.resultAlert = alertify.error(
              ctx.gettextCatalog.getString('FPGA I/O ports not defined'),
              30
            );
          } else if (
            stdout.indexOf('fatal error: duplicate pin constraints') !== -1
          ) {
            ctx.resultAlert = alertify.error(
              ctx.gettextCatalog.getString('Duplicate FPGA I/O ports'),
              30
            );
          } else {
            var re,
              matchError,
              codeErrors = [];

            if (iceStudio.toolchain.apio < '0.9.6') {
              re = /main.v:([0-9]+):\s(error|warning):\s(.*?)[\r|\n]/g;
              while ((matchError = re.exec(stdout))) {
                codeErrors.push({
                  line: parseInt(matchError[1]),
                  msg: matchError[3].replace(/\sin\smain\..*$/, ''),
                  type: matchError[2],
                });
              }
              re = /main.v:([0-9]+):\ssyntax\serror[\r|\n]/g;
              while ((matchError = re.exec(stdout))) {
                codeErrors.push({
                  line: parseInt(matchError[1]),
                  msg: 'Syntax error',
                  type: 'error',
                });
              }
            } else {
              re = /%Error:\s+(\w+\.v):(\d+):(\d+):\s*(syntax error,.*)$/gm;
              while ((matchError = re.exec(stdout))) {
                codeErrors.push({
                  line: parseInt(matchError[2]),
                  msg: matchError[4].trim(),
                  type: 'error',
                });
              }
              re =
                /%(Error|Warning)(-[A-Z0-9]+)?: main\.v:(\d+):(\d+): (.*?)[\r\n]/g;
              while ((matchError = re.exec(stdout))) {
                codeErrors.push({
                  line: parseInt(matchError[3]),
                  msg: matchError[5].trim(),
                  type: matchError[1].toLowerCase(),
                });
              }
              console.log('ERRORS', codeErrors);
            }

            // Yosys errors
            re = /(ERROR|Warning):\s(.*?)\smain\.v:([0-9]+)(.*?)[\r|\n]/g;
            var msg = '';
            var line = -1;
            var type = false;
            var preContent = false;
            var postContent = false;
            while ((matchError = re.exec(stdout))) {
              msg = '';
              line = parseInt(matchError[3]);
              type = matchError[1].toLowerCase();
              preContent = matchError[2];
              postContent = matchError[4];
              if (preContent === 'Parser error in line') {
                postContent = postContent.substring(2);
                if (postContent.startsWith('syntax error')) {
                  postContent = 'Syntax error';
                }
                msg = postContent;
              } else if (preContent.endsWith(' in line ')) {
                msg = preContent.replace(/\sin\sline\s$/, ' ') + postContent;
              } else {
                preContent = preContent.replace(/\sat\s$/, '');
                preContent = preContent.replace(/\sin\s$/, '');
                msg = preContent;
              }
              codeErrors.push({ line: line, msg: msg, type: type });
            }

            // Yosys syntax errors
            re = /\smain\.v:([0-9]+):\s(.*?)(ERROR):\s(.*?)[\r|\n]/g;
            while ((matchError = re.exec(stdout))) {
              msg = '';
              line = parseInt(matchError[1]);
              type = matchError[3].toLowerCase();
              preContent = matchError[4];
              if (preContent.indexOf('unexpected TOK_') >= 0) {
                msg = 'Syntax error arround this line';
              } else {
                msg = preContent;
              }
              codeErrors.push({ line: line, msg: msg, type: type });
            }

            var modules = mapCodeModules(code);
            var hasErrors = false;
            var hasWarnings = false;
            var errorMsgs = [];
            var warningMsgs = [];
            for (var k in codeErrors) {
              var codeError = normalizeCodeError(codeErrors[k], modules);
              if (codeError) {
                $(document).trigger('codeError', [codeError]);
                if (codeError.type === 'error') {
                  hasErrors = true;
                  var linePrefix =
                    codeError.line > 0 ? 'line ' + codeError.line + ': ' : '';
                  errorMsgs.push(linePrefix + codeError.msg);
                } else if (codeError.type === 'warning') {
                  hasWarnings = true;
                  var wlinePrefix =
                    codeError.line > 0 ? 'line ' + codeError.line + ': ' : '';
                  warningMsgs.push(wlinePrefix + codeError.msg);
                }
              }
            }

            if (hasErrors) {
              var errorDetail = errorMsgs.join('<br>');
              ctx.resultAlert = alertify.error(
                ctx.gettextCatalog.getString('Errors detected in the design') +
                  ':<br>' +
                  errorDetail,
                10
              );
            } else {
              if (hasWarnings) {
                var warningDetail = warningMsgs.join('<br>');
                ctx.resultAlert = alertify.warning(
                  ctx.gettextCatalog.getString(
                    'Warnings detected in the design'
                  ) +
                    ':<br>' +
                    warningDetail,
                  10
                );
              }
              var stdoutError = stdout.split('\n').filter(function (lineStr) {
                var l = lineStr.toLowerCase();
                return (
                  l.indexOf('error: ') !== -1 ||
                  l.indexOf('not installed') !== -1 ||
                  l.indexOf('already declared') !== -1
                );
              });
              if (stdoutError.length > 0) {
                var error = 'There are errors in the Design...';
                var re2 = /hardware\.blif:([0-9]+):\sfatal\serror:\s(.*)/g;
                var re3 =
                  /ERROR:\s(.*)\scannot\sbe\sbound\sto\s(.*)since\sit\sis\salready\sbound/g;
                var re4 =
                  /ERROR:\spackage\sdoes\snot\shave\sa\spin\snamed\s'NULL/g;
                if ((matchError = re2.exec(stdoutError[0]))) {
                  error = matchError[2];
                } else if ((matchError = re3.exec(stdoutError[0]))) {
                  error = 'Duplicated pins';
                } else if ((matchError = re4.exec(stdoutError[0]))) {
                  error = 'Pin not assigned (NULL)';
                } else {
                  error += '\n' + stdoutError[0];
                }
                ctx.resultAlert = alertify.error(error, 30);
              } else {
                ctx.resultAlert = alertify.error(stdout, 30);
              }
            }
          }
        } else if (stderr) {
          if (
            stderr.indexOf('Could not resolve hostname') !== -1 ||
            stderr.indexOf('Connection refused') !== -1
          ) {
            ctx.resultAlert = alertify.error(
              ctx.gettextCatalog.getString('Wrong remote hostname {{name}}', {
                name: ctx.profile.get('remoteHostname'),
              }),
              30
            );
          } else if (stderr.indexOf('No route to host') !== -1) {
            ctx.resultAlert = alertify.error(
              ctx.gettextCatalog.getString(
                'Remote host {{name}} not connected',
                { name: ctx.profile.get('remoteHostname') }
              ),
              30
            );
          } else {
            ctx.resultAlert = alertify.error(stderr, 30);
          }
        }
      } else {
        resolve();
        if (stdout) {
          if (typeof ctx.common.FPGAResources.nextpnr === 'undefined') {
            ctx.common.FPGAResources.nextpnr = {
              Field0: { name: '-', used: '-', total: '-', percentage: '-' },
              Field1: { name: '-', used: '-', total: '-', percentage: '-' },
              Field2: { name: '-', used: '-', total: '-', percentage: '-' },
              Field3: { name: '-', used: '-', total: '-', percentage: '-' },
              Field10: { name: '-', used: '-', total: '-', percentage: '-' },
              Field11: { name: '-', used: '-', total: '-', percentage: '-' },
              Field12: { name: '-', used: '-', total: '-', percentage: '-' },
              Field13: { name: '-', used: '-', total: '-', percentage: '-' },
              BUILDT: { value: '-' },
              MF: { value: 0 },
            };
          }
          if ('ecp5' === archName) {
            ctx.common.FPGAResources.nextpnr.Field0 = findValueNPNR(
              /(LUT4)s:\s{1,}(\d+)\/(\d+)\s{1,}(\d+)%/g,
              stdout,
              ctx.common.FPGAResources.nextpnr.Field0
            );
            ctx.common.FPGAResources.nextpnr.Field1 = findValueNPNR(
              /_(SLICE):\s{1,}(\d+)\/(\d+)\s{1,}(\d+)%/g,
              stdout,
              ctx.common.FPGAResources.nextpnr.Field1
            );
            ctx.common.FPGAResources.nextpnr.Field2 = findValueNPNR(
              /Total D(FF)s:\s{1,}(\d+)\/(\d+)\s{1,}(\d+)%/g,
              stdout,
              ctx.common.FPGAResources.nextpnr.Field2
            );
            ctx.common.FPGAResources.nextpnr.Field3 = findValueNPNR(
              /(DP16KD):\s{1,}(\d+)\/\s{1,}(\d+)\s{1,}(\d+)%/g,
              stdout,
              ctx.common.FPGAResources.nextpnr.Field3
            );
            ctx.common.FPGAResources.nextpnr.Field10 = findValueNPNR(
              /TRELLIS_(IO):\s{1,}(\d+)\/\s{1,}(\d+)\s{1,}(\d+)%/g,
              stdout,
              ctx.common.FPGAResources.nextpnr.Field10
            );
            ctx.common.FPGAResources.nextpnr.Field11 = findValueNPNR(
              /(MULT18X18)D:\s{1,}(\d+)\/\s{1,}(\d+)\s{1,}(\d+)%/g,
              stdout,
              ctx.common.FPGAResources.nextpnr.Field11
            );
            ctx.common.FPGAResources.nextpnr.Field12 = findValueNPNR(
              /EHX(PLL)L:\s{1,}(\d+)\/\s{1,}(\d+)\s{1,}(\d+)%/g,
              stdout,
              ctx.common.FPGAResources.nextpnr.Field12
            );
            ctx.common.FPGAResources.nextpnr.Field13 = findValueNPNR(
              /DDR(DLL):\s{1,}(\d+)\/\s{1,}(\d+)\s{1,}(\d+)%/g,
              stdout,
              ctx.common.FPGAResources.nextpnr.Field13
            );
          } else {
            ctx.common.FPGAResources.nextpnr.Field0 = findValueNPNR(
              /_(LC):\s{1,}(\d+)\/\s{1,}(\d+)\s{1,}(\d+)%/g,
              stdout,
              ctx.common.FPGAResources.nextpnr.Field0
            );
            ctx.common.FPGAResources.nextpnr.Field1 = findValueNPNR(
              /_(RAM):\s{1,}(\d+)\/\s{1,}(\d+)\s{1,}(\d+)%/g,
              stdout,
              ctx.common.FPGAResources.nextpnr.Field1
            );
            ctx.common.FPGAResources.nextpnr.Field2 = findValueNPNR(
              /SB_(IO):\s{1,}(\d+)\/\s{1,}(\d+)\s{1,}(\d+)%/g,
              stdout,
              ctx.common.FPGAResources.nextpnr.Field2
            );
            ctx.common.FPGAResources.nextpnr.Field3 = findValueNPNR(
              /SB_(GB):\s{1,}(\d+)\/\s{1,}(\d+)\s{1,}(\d+)%/g,
              stdout,
              ctx.common.FPGAResources.nextpnr.Field3
            );
            ctx.common.FPGAResources.nextpnr.Field10 = findValueNPNR(
              /_(PLL):\s{1,}(\d+)\/\s{1,}(\d+)\s{1,}(\d+)%/g,
              stdout,
              ctx.common.FPGAResources.nextpnr.Field10
            );
            ctx.common.FPGAResources.nextpnr.Field11 = findValueNPNR(
              /_(WARMBOOT):\s{1,}(\d+)\/\s{1,}(\d+)\s{1,}(\d+)%/g,
              stdout,
              ctx.common.FPGAResources.nextpnr.Field11
            );
            ctx.common.FPGAResources.nextpnr.Field12 = findValueNPNR(
              /(-)(-)(-)(-)/g,
              stdout,
              ctx.common.FPGAResources.nextpnr.Field12
            );
            ctx.common.FPGAResources.nextpnr.Field13 = findValueNPNR(
              /(-)(-)(-)(-)/g,
              stdout,
              ctx.common.FPGAResources.nextpnr.Field13
            );
          }
          ctx.common.FPGAResources.nextpnr.MF = findMaxFreq(
            /Max frequency for clock '[\w\W]+': ([\d\.]+) MHz/g,
            stdout,
            ctx.common.FPGAResources.nextpnr.MF
          );
          ctx.common.FPGAResources.nextpnr.BUILDT = findTime(
            /==(?:=)+..SUCCESS. Took ([\d\.]+) ([secmin]{3})/g,
            stdout,
            ctx.common.FPGAResources.nextpnr.MF.BUILDT
          );
          ctx.utils.rootScopeSafeApply();
        }
      }
    });
  }

  return {
    processResult: processResult,
    mapCodeModules: mapCodeModules,
  };
};
