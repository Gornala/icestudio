//---------------------------------------------------------------------------
//-- Generic block and Wire form functions: new/load for Generic, load for Wire
//---------------------------------------------------------------------------
'use strict';

window._iceblockforms = window._iceblockforms || {};

window._iceblockforms.genericWireForms = function (ctx) {
  function newGeneric(type, block, callback) {
    var blockInstance = {
      id: null,
      type: type,
      position: { x: 0, y: 0 },
    };
    if (ctx.resultAlert) {
      ctx.resultAlert.dismiss(false);
    }
    if (
      block &&
      block.design &&
      block.design.graph &&
      block.design.graph.blocks &&
      block.design.graph.wires
    ) {
      if (callback) {
        callback(loadGeneric(blockInstance, block));
      }
    } else {
      ctx.resultAlert = alertify.error(
        ctx.gettextCatalog.getString('Wrong block format: {{type}}', {
          type: type,
        }),
        30
      );
    }
  }

  function loadGeneric(instance, block, disabled) {
    var i;
    var leftPorts = [];
    var rightPorts = [];
    var topPorts = [];
    var bottomPorts = [];
    let virtualBlock = new IceBlock({
      cacheDirImg: ctx.common.IMAGE_CACHE_DIR,
    });

    instance.data = { ports: { in: [] } };

    for (i in block.design.graph.blocks) {
      var item = block.design.graph.blocks[i];
      if (item.type === ctx.blocks.BASIC_INPUT) {
        if (!item.data.range) {
          instance.data.ports.in.push({
            name: item.id,
            default: ctx.utils.hasInputRule(
              (item.data.clock ? 'clk' : '') || item.data.name
            ),
          });
        }
        leftPorts.push({
          id: item.id,
          name: item.data.name,
          label: item.data.name + (item.data.range || ''),
          size: item.data.pins ? item.data.pins.length : item.data.size || 1,
          clock: item.data.clock,
        });
      } else if (item.type === ctx.blocks.BASIC_OUTPUT) {
        rightPorts.push({
          id: item.id,
          name: item.data.name,
          label: item.data.name + (item.data.range || ''),
          size: item.data.pins ? item.data.pins.length : item.data.size || 1,
        });
      } else if (
        item.type === ctx.blocks.BASIC_CONSTANT ||
        item.type === ctx.blocks.BASIC_MEMORY
      ) {
        if (!item.data.local) {
          topPorts.push({
            id: item.id,
            name: item.data.name,
            label: item.data.name,
          });
        }
      }
    }

    var size = false;
    if (!size) {
      var numPortsHeight = Math.max(leftPorts.length, rightPorts.length);
      var numPortsWidth = Math.max(topPorts.length, bottomPorts.length);

      size = {
        width: Math.max(4 * ctx.gridsize * numPortsWidth, 12 * ctx.gridsize),
        height: Math.max(4 * ctx.gridsize * numPortsHeight, 8 * ctx.gridsize),
      };
    }

    var blockLabel = block.package.name;
    var blockImage = '';
    let blockImageSrc = '';
    let hash = '';
    if (block.package.image) {
      if (block.package.image.startsWith('%3Csvg')) {
        blockImage = decodeURI(block.package.image);
      } else if (block.package.image.startsWith('<svg')) {
        blockImage = block.package.image;
      }
      if (blockImage.length > 0) {
        hash = ctx.sparkMD5.hash(blockImage);
        blockImageSrc = virtualBlock.svgFile(hash, blockImage);
      }
    }

    var cell = new ctx.joint.shapes.ice.Generic({
      id: instance.id,
      blockType: instance.type,
      data: instance.data,
      config: block.design.config,
      pullup: block.design.pullup,
      image: blockImageSrc,
      label: blockLabel,
      tooltip: ctx.gettextCatalog.getString(block.package.description),
      position: instance.position,
      size: size,
      disabled: disabled,
      leftPorts: leftPorts,
      rightPorts: rightPorts,
      topPorts: topPorts,
    });
    return cell;
  }

  function loadWire(instance, source, target) {
    // Find selectors
    var sourceSelector, targetSelector;
    var leftPorts = target.get('leftPorts');
    var rightPorts = source.get('rightPorts');

    for (var _out = 0; _out < rightPorts.length; _out++) {
      if (rightPorts[_out] === instance.source.port) {
        sourceSelector = _out;
        break;
      }
    }
    for (var _in = 0; _in < leftPorts.length; _in++) {
      if (leftPorts[_in] === instance.target.port) {
        targetSelector = _in;
        break;
      }
    }

    var _wire = new ctx.joint.shapes.ice.Wire({
      source: {
        id: source.id,
        selector: sourceSelector,
        port: instance.source.port,
      },
      target: {
        id: target.id,
        selector: targetSelector,
        port: instance.target.port,
      },
      vertices: instance.vertices,
    });
    return _wire;
  }

  return {
    newGeneric: newGeneric,
    loadGeneric: loadGeneric,
    loadWire: loadWire,
  };
};
