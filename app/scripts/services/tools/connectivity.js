/**
 * connectivity.js - Pre-flight connectivity check before verify/build.
 * Detects undriven inputs so the user gets a clear error instead of a
 * confusing "OK" from the linter when nets are floating.
 *
 * Checked cases:
 *   basic.input        — every non-virtual pin must have a physical pin assigned
 *   basic.output       — must be driven by a wire; every non-virtual pin must be assigned
 *   basic.inputLabel   — the label must have a wire driving it
 *   basic.outputLabel  — must have a matching basic.inputLabel with same name
 *   basic.code         — every non-default input port must have a wire
 *   generic modules    — every input port (inner basic.input id) must have a wire
 */
'use strict';

window._icetools = window._icetools || {};

window._icetools.connectivity = function (ctx) {
  var B = window._iceblocks;

  function checkConnections() {
    return new Promise(function (resolve, reject) {
      ctx.project.snapshot();
      ctx.project.update();
      var project = ctx.project.get();
      var result = collectErrors(project);
      ctx.project.restoreSnapshot();

      if (result.errors.length === 0) {
        resolve();
        return;
      }

      ctx.graph.errorHighlightCells(result.blockIds, result.portSpecs);
      var header = ctx.gettextCatalog.getString('Undriven inputs detected:');
      ctx.resultAlert = alertify.error(
        header + '\n' + result.errors.join('\n'),
        30
      );
      reject(new Error('Undriven inputs'));
    });
  }

  function collectErrors(project) {
    var graph = project.design && project.design.graph;
    if (!graph || !Array.isArray(graph.blocks) || !Array.isArray(graph.wires)) {
      return { errors: [], blockIds: [], portSpecs: [] };
    }

    var blocks = graph.blocks;
    var wires = graph.wires;
    var deps = project.dependencies || {};
    var errors = [];
    var blockIds = [];
    var portSpecs = [];

    // drivenBlocks[blockId]        = true if any wire targets this block
    // drivenPorts["blockId:port"]  = true if a specific port is wired
    var drivenBlocks = {};
    var drivenPorts = {};
    wires.forEach(function (w) {
      if (w.target && w.target.block) {
        drivenBlocks[w.target.block] = true;
        if (w.target.port) {
          drivenPorts[w.target.block + ':' + w.target.port] = true;
        }
      }
    });

    // inputLabel names = named nets that are being driven somewhere
    var inputLabelNames = {};
    blocks.forEach(function (block) {
      if (block.type === B.BASIC_INPUT_LABEL && block.data && block.data.name) {
        inputLabelNames[block.data.name] = true;
      }
    });

    blocks.forEach(function (block) {
      var i, port, name, dep, innerBlocks, inner, label, inPorts, modName, pins;

      switch (block.type) {
        case B.BASIC_INPUT:
          // Check physical pin assignment (skip virtual ports)
          if (block.data && !block.data.virtual) {
            pins = block.data.pins || [];
            for (i = 0; i < pins.length; i++) {
              if (!pins[i].value || pins[i].value === 'NULL') {
                name = (block.data && block.data.name) || block.id;
                errors.push(
                  ctx.gettextCatalog.getString(
                    'Input "{{n}}" has no physical pin assigned',
                    { n: name }
                  )
                );
                blockIds.push(block.id);
                break;
              }
            }
          }
          break;

        case B.BASIC_OUTPUT:
          if (!drivenBlocks[block.id]) {
            name = (block.data && block.data.name) || block.id;
            errors.push(
              ctx.gettextCatalog.getString('Output pin "{{n}}" is not driven', {
                n: name,
              })
            );
            blockIds.push(block.id);
          }
          // Check physical pin assignment (skip virtual ports)
          if (block.data && !block.data.virtual) {
            pins = block.data.pins || [];
            for (i = 0; i < pins.length; i++) {
              if (!pins[i].value || pins[i].value === 'NULL') {
                name = (block.data && block.data.name) || block.id;
                errors.push(
                  ctx.gettextCatalog.getString(
                    'Output "{{n}}" has no physical pin assigned',
                    { n: name }
                  )
                );
                blockIds.push(block.id);
                break;
              }
            }
          }
          break;

        case B.BASIC_INPUT_LABEL:
          if (!drivenBlocks[block.id]) {
            name = (block.data && block.data.name) || block.id;
            errors.push(
              ctx.gettextCatalog.getString(
                'Input label "{{n}}" is not connected to any signal',
                { n: name }
              )
            );
            blockIds.push(block.id);
          }
          break;

        case B.BASIC_OUTPUT_LABEL:
          name = block.data && block.data.name;
          if (name && !inputLabelNames[name]) {
            errors.push(
              ctx.gettextCatalog.getString(
                'Output label "{{n}}" has no matching input label',
                { n: name }
              )
            );
            blockIds.push(block.id);
          }
          break;

        case B.BASIC_CODE:
          label = (block.data && block.data.label) || block.id;
          inPorts =
            (block.data && block.data.ports && block.data.ports.in) || [];
          for (i = 0; i < inPorts.length; i++) {
            port = inPorts[i];
            if (!port.default && !drivenPorts[block.id + ':' + port.name]) {
              errors.push(
                ctx.gettextCatalog.getString(
                  'Code block "{{l}}" input port "{{p}}" is not driven',
                  { l: label, p: port.name }
                )
              );
              blockIds.push(block.id);
              portSpecs.push({ blockId: block.id, portId: port.name });
            }
          }
          break;

        default:
          // Generic / custom module: look up input ports from dependency
          dep = deps[block.type];
          if (!dep) {
            break;
          }
          innerBlocks =
            (dep.design && dep.design.graph && dep.design.graph.blocks) || [];
          for (i = 0; i < innerBlocks.length; i++) {
            inner = innerBlocks[i];
            if (inner.type === B.BASIC_INPUT) {
              // Outer wire port name = inner block's id (set by loadGenericBlock)
              if (!drivenPorts[block.id + ':' + inner.id]) {
                modName = (block.data && block.data.name) || block.type;
                errors.push(
                  ctx.gettextCatalog.getString(
                    'Module "{{m}}" input "{{p}}" is not driven',
                    {
                      m: modName,
                      p: (inner.data && inner.data.name) || inner.id,
                    }
                  )
                );
                blockIds.push(block.id);
                portSpecs.push({ blockId: block.id, portId: inner.id });
              }
            }
          }
          break;
      }
    });

    return { errors: errors, blockIds: blockIds, portSpecs: portSpecs };
  }

  return {
    checkConnections: checkConnections,
  };
};
