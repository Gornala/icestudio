//---------------------------------------------------------------------------
//-- wireLogic.js: Wire routing, validation, and vertex management
//-- Loaded as a <script> tag before graph.js; exposes window._icegraph.wireLogic
//---------------------------------------------------------------------------
'use strict';

window._icegraph = window._icegraph || {};

window._icegraph.wireLogic = function (ctx) {
  /*--
   * The wire is divided into segments, we need to find the segment nearest at
   * the point that the user has clicked.
   --*/
  function getInsertIndex(vertices, newPoint, linkModel) {
    if (vertices.length === 0) {
      return 0;
    }

    var minDistance = Infinity;
    var index = vertices.length; // default: at the end

    var source = linkModel.get('source');
    var target = linkModel.get('target');

    var sourcePoint = source.id ? getElementCenter(source.id) : source;
    var targetPoint = target.id ? getElementCenter(target.id) : target;

    // Wire full path (route)
    var pathPoints = [sourcePoint].concat(vertices).concat([targetPoint]);

    for (var i = 0; i < pathPoints.length - 1; i++) {
      var v1 = pathPoints[i];
      var v2 = pathPoints[i + 1];

      var distance = pointToSegmentDistance(newPoint, v1, v2);
      if (distance < minDistance) {
        minDistance = distance;
        index = i;
      }
    }

    return index;
  }

  /*-- Point to segment distance --*/
  function pointToSegmentDistance(p, v1, v2) {
    var A = p.x - v1.x;
    var B = p.y - v1.y;
    var C = v2.x - v1.x;
    var D = v2.y - v1.y;

    var dot = A * C + B * D;
    var lenSq = C * C + D * D;
    var param = lenSq !== 0 ? dot / lenSq : -1;

    var xx, yy;
    if (param < 0) {
      xx = v1.x;
      yy = v1.y;
    } else if (param > 1) {
      xx = v2.x;
      yy = v2.y;
    } else {
      xx = v1.x + param * C;
      yy = v1.y + param * D;
    }

    var dx = p.x - xx;
    var dy = p.y - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /*-- Real coords of the element center by id --*/
  function getElementCenter(elementId) {
    var element = ctx.paper.getModelById(elementId);
    if (!element) {
      return { x: 0, y: 0 };
    }
    var bbox = element.getBBox();
    return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
  }

  //-- Update all wire routing (synchronous inner)
  function __updateWiresOnObstacles() {
    var cells = ctx.graph.getCells();
    var linkView = false;
    for (var i = 0, n = cells.length; i < n; i++) {
      if (cells[i].isLink()) {
        linkView = ctx.paper.findViewByModel(cells[i]);
        if (linkView) {
          linkView.update();
        }
      }
    }
  }

  //-- Async wrapper
  function updateWiresOnObstacles() {
    return new Promise(function (resolve) {
      __updateWiresOnObstacles();
      resolve();
    });
  }

  //-- Update default value flag on input port when a wire is connected/disconnected
  function updatePortDefault(target, value) {
    if (target) {
      var i, port;
      var block = ctx.graph.getCell(target.id);
      if (block) {
        var data = block.get('data');
        if (data && data.ports && data.ports.in) {
          for (i in data.ports.in) {
            port = data.ports.in[i];
            if (port.name === target.port && port.default) {
              port.default.apply = value;
              break;
            }
          }
          ctx.paper.findViewByModel(block.id).updateBox(true);
        }
      }
    }
  }

  //-- Wire group sync: when a label cell's data changes, apply same
  //-- name/color to all other label cells that share the original name
  var LP_WIRE_TYPES_SYNC = new Set([
    'basic.inputLabel',
    'basic.outputLabel',
    'basic.pairedLabel',
  ]);
  var _lpSyncingWire = false;

  function lpSyncWireGroup(cell) {
    if (_lpSyncingWire) {
      return;
    }
    var bt = cell.get('blockType') || '';
    if (!LP_WIRE_TYPES_SYNC.has(bt)) {
      return;
    }

    var prevData = cell.previous('data') || {};
    var newData = cell.get('data') || {};
    var prevName = prevData.name || prevData.label || '';
    if (!prevName) {
      return;
    }

    _lpSyncingWire = true;
    ctx.graph.getCells().forEach(function (other) {
      if (other.id === cell.id || other.isLink()) {
        return;
      }
      if (!LP_WIRE_TYPES_SYNC.has(other.get('blockType') || '')) {
        return;
      }
      var od = other.get('data') || {};
      var otherName = od.name || od.label || '';
      if (otherName !== prevName) {
        return;
      }

      var nd = JSON.parse(JSON.stringify(od));
      if ('name' in newData) {
        nd.name = newData.name;
      }
      if ('label' in newData) {
        nd.label = newData.label;
      }
      if ('blockColor' in newData) {
        nd.blockColor = newData.blockColor;
      }
      other.set('data', nd);
    });
    _lpSyncingWire = false;
  }

  //-- validateConnection callback for joint.dia.Paper constructor
  function validateConnection(
    cellViewS,
    magnetS,
    cellViewT,
    magnetT,
    end,
    linkView
  ) {
    // Prevent output-output links
    if (
      magnetS &&
      magnetS.getAttribute('type') === 'output' &&
      magnetT &&
      magnetT.getAttribute('type') === 'output'
    ) {
      if (magnetS !== magnetT) {
        ctx.warning(ctx.gettextCatalog.getString('Invalid connection'));
      }
      return false;
    }
    // Ensure right -> left connections
    if (magnetS && magnetS.getAttribute('pos') === 'right') {
      if (magnetT && magnetT.getAttribute('pos') !== 'left') {
        ctx.warning(ctx.gettextCatalog.getString('Invalid connection'));
        return false;
      }
    }
    // Ensure bottom -> top connections
    if (magnetS && magnetS.getAttribute('pos') === 'bottom') {
      if (magnetT && magnetT.getAttribute('pos') !== 'top') {
        ctx.warning(ctx.gettextCatalog.getString('Invalid connection'));
        return false;
      }
    }
    var i;
    var links = ctx.graph.getLinks();
    for (i in links) {
      var link = links[i];
      var linkIView = link.findView(ctx.paper);
      if (linkView === linkIView) {
        //Skip the wire the user is drawing
        continue;
      }
      // Prevent multiple input links
      if (
        cellViewT.model.id === link.get('target').id &&
        magnetT.getAttribute('port') === link.get('target').port
      ) {
        ctx.warning(
          ctx.gettextCatalog.getString('Invalid multiple input connections')
        );
        return false;
      }
      // Prevent to connect a pull-up if other blocks are connected
      if (
        cellViewT.model.get('pullup') &&
        cellViewS.model.id === link.get('source').id
      ) {
        ctx.warning(
          ctx.gettextCatalog.getString(
            'Invalid <i>Pull-up</i> connection:<br>Block already connected'
          )
        );
        return false;
      }
      // Prevent to connect other blocks if a pull-up is connected
      if (
        linkIView.targetView.model.get('pullup') &&
        cellViewS.model.id === link.get('source').id
      ) {
        ctx.warning(
          ctx.gettextCatalog.getString(
            'Invalid block connection:<br><i>Pull-up</i> already connected'
          )
        );
        return false;
      }
    }
    // Ensure input -> pull-up connections
    if (cellViewT.model.get('pullup')) {
      var ret = cellViewS.model.get('blockType') === ctx.blocks.BASIC_INPUT;
      if (!ret) {
        ctx.warning(
          ctx.gettextCatalog.getString(
            'Invalid <i>Pull-up</i> connection:<br>Only <i>Input</i> blocks allowed'
          )
        );
      }
      return ret;
    }
    // Prevent different size connections
    var tsize = 0;
    var lsize = linkView.model.get('size');
    var portId = magnetT.getAttribute('port');
    var sourcePortId = magnetS.getAttribute('port') ?? false;
    var tLeftPorts = cellViewT.model.get('leftPorts');
    var sRightPorts = cellViewS.model.get('rightPorts');
    var isParametric = false;
    var tport = false;
    for (i in tLeftPorts) {
      tport = tLeftPorts[i];
      if (portId === tport.id) {
        tsize = tport.size;
        break;
      }
    }
    // Could be parametric
    var sport = false;
    if (lsize === 2 || tsize === 2) {
      for (i in sRightPorts) {
        sport = sRightPorts[i];
        if (sourcePortId === sport.id) {
          lsize = sport.size;
          break;
        }
      }

      var noParametricParam = /^\s*\[\s*\d+\s*:\s*\d+\s*\]\s*$/;
      if (
        !noParametricParam.test(sport.srange) ||
        !noParametricParam.test(tport.srange)
      ) {
        isParametric = true;
      }
    }
    tsize = tsize || 1;
    lsize = lsize || 1;

    if (isParametric) {
      lsize = tsize;
    }

    if (tsize !== lsize) {
      ctx.warning(
        ctx.gettextCatalog.getString('Invalid connection: {{a}} \u2192 {{b}}', {
          a: lsize,
          b: tsize,
        })
      );
      return false;
    }
    // Prevent loop links
    return magnetS !== magnetT;
  }

  return {
    getInsertIndex: getInsertIndex,
    pointToSegmentDistance: pointToSegmentDistance,
    getElementCenter: getElementCenter,
    __updateWiresOnObstacles: __updateWiresOnObstacles,
    updateWiresOnObstacles: updateWiresOnObstacles,
    updatePortDefault: updatePortDefault,
    lpSyncWireGroup: lpSyncWireGroup,
    validateConnection: validateConnection,
  };
};
