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

  //-- Domain helpers for label connection validation -------------------------
  //-- 'constant' = bottom/top ports, 'signal' = right/left ports
  function posToDomain(pos) {
    if (pos === 'bottom' || pos === 'top') {
      return 'constant';
    }
    return 'signal';
  }

  // Given a port id, find which domain it belongs to on a cell
  function portDomain(cell, portId) {
    var top = cell.get('topPorts') || [];
    var bottom = cell.get('bottomPorts') || [];
    var i;
    for (i = 0; i < top.length; i++) {
      if (top[i].id === portId) {
        return 'constant';
      }
    }
    for (i = 0; i < bottom.length; i++) {
      if (bottom[i].id === portId) {
        return 'constant';
      }
    }
    return 'signal';
  }

  // Find domain carried by a label group (by name) from existing connections
  // Returns 'constant', 'signal', or null if no non-label connections exist
  function getLabelDomain(labelName) {
    if (!labelName) {
      return null;
    }
    var allCells = ctx.graph.getCells();
    var i, j;
    for (i = 0; i < allCells.length; i++) {
      var c = allCells[i];
      if (c.isLink()) {
        continue;
      }
      var bt = c.get('blockType') || '';
      if (bt.indexOf('Label') === -1) {
        continue;
      }
      var cName = (c.get('data') || {}).name;
      if (cName !== labelName) {
        continue;
      }
      // Found a label with the same name — check its connections
      var links = ctx.graph.getConnectedLinks(c);
      for (j = 0; j < links.length; j++) {
        var link = links[j];
        var src = link.get('source');
        var tgt = link.get('target');
        var otherId = src.id === c.id ? tgt.id : src.id;
        var otherPort = src.id === c.id ? tgt.port : src.port;
        var otherCell = ctx.graph.getCell(otherId);
        if (!otherCell) {
          continue;
        }
        // Skip if the other end is also a label
        var otherBT = otherCell.get('blockType') || '';
        if (otherBT.indexOf('Label') !== -1) {
          continue;
        }
        return portDomain(otherCell, otherPort);
      }
    }
    return null;
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
    // Enforce signal/constant domain separation
    if (magnetS && magnetT) {
      var sPos = magnetS.getAttribute('pos');
      var tPos = magnetT.getAttribute('pos');
      var sBT = cellViewS.model.get('blockType') || '';
      var tBT = cellViewT.model.get('blockType') || '';
      var sIsLabel = sBT.indexOf('Label') !== -1;
      var tIsLabel = tBT.indexOf('Label') !== -1;

      if (!sIsLabel && !tIsLabel) {
        // Neither side is a label — strict directional rules
        if (sPos === 'right' && tPos !== 'left') {
          ctx.warning(ctx.gettextCatalog.getString('Invalid connection'));
          return false;
        }
        if (sPos === 'bottom' && tPos !== 'top') {
          ctx.warning(ctx.gettextCatalog.getString('Invalid connection'));
          return false;
        }
      } else {
        // At least one side is a label — enforce domain consistency
        var labelCell = sIsLabel ? cellViewS.model : cellViewT.model;
        var otherPos = sIsLabel ? tPos : sPos;
        var labelName = (labelCell.get('data') || {}).name;
        var domain = getLabelDomain(labelName);
        if (domain) {
          // Label already has a domain from existing connections
          var otherDomain = posToDomain(otherPos);
          if (domain !== otherDomain) {
            ctx.warning(ctx.gettextCatalog.getString('Invalid connection'));
            return false;
          }
        }
        // No existing connections — allow anything (first wire sets domain)
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
    var tRightPorts = cellViewT.model.get('rightPorts');
    var sRightPorts = cellViewS.model.get('rightPorts');
    var sLeftPorts = cellViewS.model.get('leftPorts');
    var isParametric = false;
    var tport = false;
    for (i in tLeftPorts) {
      tport = tLeftPorts[i];
      if (portId === tport.id) {
        tsize = tport.size;
        break;
      }
    }
    // Also check rightPorts for target (Generate frame inner-right ports are inputs)
    if (!tsize && tRightPorts) {
      for (i in tRightPorts) {
        tport = tRightPorts[i];
        if (portId === tport.id) {
          tsize = tport.size;
          break;
        }
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
      // Also check leftPorts for source (Generate frame inner-left ports are outputs)
      if (!sport && sLeftPorts) {
        for (i in sLeftPorts) {
          sport = sLeftPorts[i];
          if (sourcePortId === sport.id) {
            lsize = sport.size;
            break;
          }
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
