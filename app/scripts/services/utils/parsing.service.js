'use strict';

window._iceutils = window._iceutils || {};

window._iceutils.parsing = function (ctx) {
  function removeComments(code) {
    return code.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
  }

  function processSignals(regex, block) {
    block = removeComments(block);
    return [...block.matchAll(regex)].flatMap(function (match) {
      var range = match[2] ? match[2].trim() : '';
      var names = match[3]
        .split(/,\s*/)
        .map(function (name) {
          return name.trim();
        })
        .flatMap(function (name) {
          return name.includes('\n')
            ? name.split(/\s+/).filter(function (n) {
                return n;
              })
            : [name];
        });
      return names.map(function (name) {
        return range ? name + range : name;
      });
    });
  }

  function extractIO(regex, header) {
    if (!header) {
      return [];
    }
    header = removeComments(header);
    var matches = [...header.matchAll(regex)];
    return matches
      .map(function (match) {
        var range = match[2] ? match[2].trim() : '';
        var names = match[3].split(/,\s*/).map(function (name) {
          return name.trim();
        });
        return names.map(function (name) {
          if (range) {
            return (name + range).trim();
          } else {
            return name.trim();
          }
        });
      })
      .flat()
      .map(function (name) {
        return name.replace(/\b(input|output|inout)\b/g, '').trim();
      });
  }

  function processModule(moduleCode, headerComments, moduleHeaderComments) {
    var inputRegex =
      /\binput\s+(wire\s+|signed\s+|wire signed\s+)?(\[[^\]]+\]\s+)?([\w\s,]+)(?=\s*[,;])/gm;
    var inputANSIRegex =
      /\binput\s+(wire\s+|signed\s+|wire signed\s+)?(\[[^\]]+\]\s+)?([\w\s,]+?)(?=,?\s*\boutput\b|,?\s*\binput\b|$)/gm;
    var outputRegex =
      /\boutput\s+(reg\s+|wire\s+|signed\s+|wire signed\s+|reg signed\s+)?(\[[^\]]+\]\s+)?([\w\s,]+)(?=\s*[,;])/gm;
    var outputANSIRegex =
      /\boutput\s+(reg\s+|wire\s+|signed\s+|wire signed\s+|reg signed\s+)?(\[[^\]]+\]\s+)?([\w\s,]+?)(?=,?\s*\binput\b|,?\s*\s*$)/gm;
    var inoutRegex =
      /\binout\s+(wire\s+|signed\s+|wire signed\s+)?(\[[^\]]+\]\s+)?([\w\s,]+)(?=\s*[,;])/gm;
    var inoutANSIRegex =
      /\binout\s+(reg\s+|wire\s+|signed\s+|wire signed\s+|reg signed\s+)?(\[[^\]]+\]\s+)?([\w\s,]+?)(?=,?\s*\binput\b|,?\s*\boutput\b|,?\s*\binout\b|,?\s*$)/gm;
    var paramRegex = /parameter\s+(\w+)(?:\s*=\s*([^,;]+))?;?/g;
    var headerParamRegex = /#\(\s*parameter\s+(\w+)\s*=\s*([^,;]+)\s*\)/g;

    var metaBlock = {
      moduleName: '',
      inputs: '',
      outputs: '',
      inouts: '',
      parameters: '',
      moduleBody: '',
      headerComments: headerComments,
    };

    var moduleRegex =
      /module\s+(\w+)\s*(#\([\s\S]*?\))?\s*\(([\s\S]*?)\)\s*;\s*([\s\S]*?)\s*endmodule/;
    var moduleMatch = moduleCode.match(moduleRegex);

    if (moduleMatch) {
      metaBlock.moduleName = moduleMatch[1];
      var moduleBody = moduleMatch[4] ? moduleMatch[4].trim() : '';

      var headerParamBlock = moduleMatch[2] || '';
      var headerParameters = [
        ...headerParamBlock.matchAll(headerParamRegex),
      ].map(function (match) {
        return {
          name: match[1].trim(),
          value: match[2] ? match[2].trim() : null,
        };
      });

      var bodyParameters = [...moduleBody.matchAll(paramRegex)].map(
        function (match) {
          return {
            name: match[1].trim(),
            value: match[2] ? match[2].trim() : null,
          };
        }
      );

      moduleBody = moduleBody.replace(paramRegex, '').trim();

      var allParameters = [...headerParameters, ...bodyParameters];
      if (allParameters.length > 0) {
        metaBlock.parameters = allParameters
          .map(function (param) {
            return param.name;
          })
          .join(', ');
      }

      var ansiInputs = extractIO(inputANSIRegex, moduleMatch[3]);
      var ansiOutputs = extractIO(outputANSIRegex, moduleMatch[3]);
      var ansiInouts = extractIO(inoutANSIRegex, moduleMatch[3]);

      var bodyInputs = processSignals(inputRegex, moduleBody);
      var bodyOutputs = processSignals(outputRegex, moduleBody);
      var bodyInouts = processSignals(inoutRegex, moduleBody);

      var inputs = [...ansiInputs, ...bodyInputs].filter(function (signal) {
        return !ansiOutputs.includes(signal) && !ansiInouts.includes(signal);
      });
      var outputs = [...ansiOutputs, ...bodyOutputs].filter(function (signal) {
        return !ansiInputs.includes(signal) && !ansiInouts.includes(signal);
      });
      var inouts = [...ansiInouts, ...bodyInouts].filter(function (signal) {
        return !ansiInputs.includes(signal) && !ansiOutputs.includes(signal);
      });

      if (inputs.length > 0) {
        metaBlock.inputs = inputs.join(', ');
      }
      if (outputs.length > 0) {
        metaBlock.outputs = outputs.join(', ');
      }
      if (inouts.length > 0) {
        metaBlock.inouts = inouts.join(', ');
      }

      var allIORegex = /^\s*\b(input|output|inout)\b[^\n]*$/gm;
      moduleBody = moduleBody.replace(allIORegex, '').trim();

      var fullModuleBody = headerComments;
      if (moduleHeaderComments) {
        fullModuleBody += '\n\n' + moduleHeaderComments;
      }
      fullModuleBody += '\n\n' + moduleBody;
      metaBlock.moduleBody = fullModuleBody;
    }

    return metaBlock;
  }

  async function showModuleSelectionModal(modules) {
    return new Promise(function (resolve) {
      var modalDiv = document.createElement('div');
      modalDiv.className = 'modal';

      var modalContent = document.createElement('div');
      modalContent.className = 'modal-content';

      var title = document.createElement('h4');
      title.innerText = 'Select a Module to Import';
      modalContent.appendChild(title);

      var moduleList = document.createElement('ul');

      modules.forEach(function (module, index) {
        var listItem = document.createElement('li');
        listItem.innerText = module.name;
        listItem.addEventListener('click', function () {
          resolve(modules[index]);
          document.body.removeChild(modalDiv);
        });
        moduleList.appendChild(listItem);
      });

      modalContent.appendChild(moduleList);
      modalDiv.appendChild(modalContent);
      document.body.appendChild(modalDiv);
    });
  }

  var mod = {};

  mod.parsePortLabel = function (data, pattern) {
    var match,
      ret = {};
    var maxSize = 95;
    pattern = pattern || ctx.common.PATTERN_PORT_LABEL;
    match = pattern.exec(data);
    if (match && match[0] === match.input) {
      ret.name = match[1] ? match[1] : '';
      ret.rangestr = match[2];
      if (match[2]) {
        if (match[3] > maxSize || match[4] > maxSize) {
          alertify.warning(
            ctx.gettextCatalog.getString('Maximum bus size: 96 bits'),
            5
          );
          return null;
        } else {
          if (match[3] > match[4]) {
            ret.range = _.range(match[3], parseInt(match[4]) - 1, -1);
          } else {
            ret.range = _.range(match[3], parseInt(match[4]) + 1, +1);
          }
        }
      }
      return ret;
    }
    return null;
  };

  mod.parseParamLabel = function (data, pattern) {
    var match,
      ret = {};
    pattern = pattern || ctx.common.PATTERN_PARAM_LABEL;
    match = pattern.exec(data);
    if (match && match[0] === match.input) {
      ret.name = match[1] ? match[1] : '';
      return ret;
    }
    return null;
  };

  mod.parseVerilog = async function (code) {
    var headerCommentsRegex =
      /^(\/\/.*$|\/\*[\s\S]*?\*\/)(?:\r?\n(\/\/.*$|\/\*[\s\S]*?\*\/))*/gm;
    var moduleRegex =
      /module\s+(\w+)\s*(#\([\s\S]*?\))?\s*\(([\s\S]*?)\)\s*;\s*([\s\S]*?)\s*endmodule/gm;

    var metaBlock = {
      moduleName: '',
      inputs: '',
      outputs: '',
      inouts: '',
      parameters: '',
      moduleBody: '',
      headerComments: '',
    };

    var allHeaderMatches = code.matchAll(headerCommentsRegex);
    var headerCommentsMatch = allHeaderMatches.next().value;

    if (headerCommentsMatch) {
      metaBlock.headerComments = headerCommentsMatch[0].trim();
      code = code.replace(headerCommentsMatch[0], '').trim();
    }

    var moduleMatches;
    var modules = [];
    while ((moduleMatches = moduleRegex.exec(code)) !== null) {
      var moduleName = moduleMatches[1];
      var startOfModule = moduleMatches.index;
      var endOfModule =
        code.indexOf('endmodule', startOfModule) + 'endmodule'.length;
      var moduleContent = code.substring(startOfModule, endOfModule);

      var preModuleContent = code.substring(0, startOfModule).trim();
      var moduleHeaderCommentsRegex =
        /((?:\/\/.*(?:\r?\n|$))+|\/\*[\s\S]*?\*\/)\s*$/gm;
      var moduleHeaderCommentsMatch = [
        ...preModuleContent.matchAll(moduleHeaderCommentsRegex),
      ];
      var moduleHeaderComments =
        moduleHeaderCommentsMatch.length > 0
          ? moduleHeaderCommentsMatch[
              moduleHeaderCommentsMatch.length - 1
            ][0].trim()
          : '';

      modules.push({
        name: moduleName,
        headerComments: moduleHeaderComments,
        content: moduleContent,
      });
    }

    var selectedModule;
    if (modules.length > 1) {
      selectedModule = await showModuleSelectionModal(modules);
      var headerComments = metaBlock.headerComments;
      return processModule(
        selectedModule.content,
        headerComments,
        selectedModule.headerComments
      );
    } else if (modules.length === 1) {
      selectedModule = modules[0];
      return processModule(
        selectedModule.content,
        metaBlock.headerComments,
        selectedModule.headerComments
      );
    }

    return metaBlock;
  };

  return mod;
};
