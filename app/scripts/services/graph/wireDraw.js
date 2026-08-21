//---------------------------------------------------------------------------
//-- wireDraw.js: interactive "wire mode"
//--
//-- Click an output port to enter wire mode. The wire then follows the
//-- pointer as an orthogonal L:
//--    left click   -> drop a corner and keep going
//--    right click  -> flip the corner (clockwise <-> anticlockwise)
//--    click input  -- connect and leave the mode
//--    Esc / dblclick -> abandon the wire
//--
//-- Dragging from a port straight onto an input still works exactly as it
//-- did before: that is just wire mode entered and left without ever
//-- releasing the button.
//--
//-- Loaded as a <script> tag before graph.js; exposes window._icegraph.wireDraw
//---------------------------------------------------------------------------
/* global wireSnapPoint, wireDropRedundantVertices */
'use strict';

window._icegraph = window._icegraph || {};

window._icegraph.wireDraw = function (ctx) {
  //-- null while inactive; an object describing the wire being drawn otherwise
  var draw = null;

  //-- ElementView.pointerdown is patched once, and reads this at call time
  var patched = false;

  //------------------------------------------------------------------------
  //-- Geometry
  //------------------------------------------------------------------------

  //-- Centre of a magnet in paper coordinates. This is the same point
  //-- JointJS anchors a finished wire to, so preview and result line up.
  function magnetCenter(magnet) {
    var bbox = ctx.joint.V(magnet).bbox(false, ctx.paper.viewport);
    return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
  }

  //-- Ports on the left/right must be met horizontally, top/bottom vertically
  function approachOf(magnet) {
    var pos = magnet ? magnet.getAttribute('pos') : null;
    if (pos === 'top' || pos === 'bottom') {
      return 'v';
    }
    if (pos === 'left' || pos === 'right') {
      return 'h';
    }
    return null;
  }

  //-- The corner joining `from` to `to` with two orthogonal runs.
  //-- Returns null when the two points already share a row or a column.
  //-- `approach` pins the *last* run's direction when we are heading into
  //-- a port; otherwise the flip flag decides.
  function cornerBetween(from, to, flipped, approach) {
    if (from.x === to.x || from.y === to.y) {
      return null;
    }
    var horizontalFirst = !flipped;
    if (approach === 'h') {
      horizontalFirst = false; //-- vertical run first, so we arrive sideways
    } else if (approach === 'v') {
      horizontalFirst = true; //-- horizontal run first, so we arrive vertically
    }
    return horizontalFirst ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
  }

  //-- Last point the wire is anchored at right now
  function anchor() {
    return draw.points.length > 0
      ? draw.points[draw.points.length - 1]
      : draw.sourcePoint;
  }

  //-- Full polyline of the wire as it currently reads on screen
  function previewPoints() {
    var points = [draw.sourcePoint].concat(draw.points);
    var corner = cornerBetween(
      anchor(),
      draw.cursor,
      draw.flip,
      approachOf(draw.hoverMagnet)
    );
    if (corner) {
      points.push(corner);
    }
    points.push(draw.cursor);
    return points;
  }

  //------------------------------------------------------------------------
  //-- Preview layer
  //------------------------------------------------------------------------

  function createLayer() {
    var V = ctx.joint.V;
    var layer = V('g').addClass('wire-draw-layer');
    draw.path = V('path').addClass('wire-draw-preview');
    draw.tip = V('circle').addClass('wire-draw-tip').attr('r', 4);
    layer.append(draw.path);
    layer.append(draw.tip);
    V(ctx.paper.viewport).append(layer);
    draw.layer = layer;
  }

  function destroyLayer() {
    if (draw && draw.layer) {
      draw.layer.remove();
      draw.layer = null;
    }
  }

  function render() {
    var points = previewPoints();
    var d = points
      .map(function (p, i) {
        return (i === 0 ? 'M ' : 'L ') + p.x + ' ' + p.y;
      })
      .join(' ');

    draw.path.attr('d', d);
    draw.path.attr(
      'class',
      'wire-draw-preview' + (draw.busy ? ' wire-bus' : '')
    );
    draw.tip.attr({ cx: draw.cursor.x, cy: draw.cursor.y });
  }

  //-- Highlight the port we would connect to if the user clicked now
  function setHover(magnet) {
    if (draw.hoverMagnet === magnet) {
      return;
    }
    if (draw.hoverMagnet) {
      ctx.joint.V(draw.hoverMagnet).removeClass('wire-draw-target');
    }
    draw.hoverMagnet = magnet;
    if (magnet) {
      ctx.joint.V(magnet).addClass('wire-draw-target');
    }
  }

  //------------------------------------------------------------------------
  //-- Hit testing
  //------------------------------------------------------------------------

  //-- Nearest input magnet to a paper-space point, or null.
  //--
  //-- Done geometrically rather than with elementFromPoint because
  //-- `.port-body` is transparent and `pointer-events: none`, so it is never
  //-- returned by hit testing. This mirrors what JointJS' own snapLinks does
  //-- and reuses the same snap radius the paper is configured with.
  function findInputMagnet(point) {
    var snap = ctx.paper.options.snapLinks;
    var radius = (snap && snap.radius) || 16;
    var margin = radius + 32;

    var views = ctx.paper.findViewsInArea({
      x: point.x - margin,
      y: point.y - margin,
      width: 2 * margin,
      height: 2 * margin,
    });

    var best = null;
    var bestDistance = radius;

    views.forEach(function (view) {
      view.$('.port-body').each(function (index, magnet) {
        if (magnet.getAttribute('type') !== 'input') {
          return;
        }
        var center = magnetCenter(magnet);
        var dx = point.x - center.x;
        var dy = point.y - center.y;
        var distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = magnet;
        }
      });
    });

    return best;
  }

  //-- Bus width carried by a port, so the finished wire gets the right class
  function portSize(cell, portId) {
    var groups = ['rightPorts', 'leftPorts', 'bottomPorts', 'topPorts'];
    for (var i = 0; i < groups.length; i++) {
      var ports = cell.get(groups[i]) || [];
      for (var j = 0; j < ports.length; j++) {
        if (ports[j].id === portId) {
          return ports[j].size;
        }
      }
    }
    return undefined;
  }

  //------------------------------------------------------------------------
  //-- Mode lifecycle
  //------------------------------------------------------------------------

  function isActive() {
    return draw !== null;
  }

  function start(cellView, magnet) {
    if (draw) {
      cancel();
    }

    var sourcePoint = magnetCenter(magnet);
    var size = portSize(cellView.model, magnet.getAttribute('port'));

    draw = {
      sourceView: cellView,
      sourceMagnet: magnet,
      sourcePoint: sourcePoint,
      //-- committed corners, in paper coordinates
      points: [],
      cursor: { x: sourcePoint.x, y: sourcePoint.y },
      flip: false,
      busy: size > 1,
      //-- true until the button that opened the mode comes back up, which is
      //-- what tells a plain click apart from a drag straight onto a port
      pressing: true,
      hoverMagnet: null,
      layer: null,
      path: null,
      tip: null,
    };

    createLayer();
    render();
    bind();
    $('body').addClass('wire-drawing');
  }

  function cancel() {
    if (!draw) {
      return;
    }
    setHover(null);
    destroyLayer();
    unbind();
    draw = null;
    $('body').removeClass('wire-drawing');
  }

  //-- Turn the drawn polyline into a real wire
  function complete(magnet) {
    var targetView = ctx.paper.findView(magnet);
    if (!targetView) {
      return false;
    }

    var targetPoint = magnetCenter(magnet);
    var corner = cornerBetween(
      anchor(),
      targetPoint,
      draw.flip,
      approachOf(magnet)
    );

    var vertices = draw.points.slice();
    if (corner) {
      vertices.push(corner);
    }
    vertices = wireDropRedundantVertices(
      vertices,
      draw.sourcePoint,
      targetPoint
    );

    var wire = new ctx.joint.shapes.ice.Wire({
      source: {
        id: draw.sourceView.model.id,
        selector: draw.sourceView.getSelector(draw.sourceMagnet),
        port: draw.sourceMagnet.getAttribute('port'),
      },
      target: {
        id: targetView.model.id,
        selector: targetView.getSelector(magnet),
        port: magnet.getAttribute('port'),
      },
      vertices: vertices,
    });

    //-- validateConnection reads the wire's own size, which a finished wire
    //-- only picks up once its view exists -- so seed it from the source port
    var size = portSize(
      draw.sourceView.model,
      draw.sourceMagnet.getAttribute('port')
    );
    if (size) {
      wire.set('size', size);
    }

    var allowed = ctx.validateConnection(
      draw.sourceView,
      draw.sourceMagnet,
      targetView,
      magnet,
      'target',
      { model: wire }
    );

    if (!allowed) {
      //-- validateConnection has already explained why; stay in the mode so
      //-- the user can aim somewhere else without redrawing the whole wire
      return false;
    }

    ctx.graph.addCell(wire);
    cancel();
    ctx.__updateWiresOnObstacles();
    return true;
  }

  //-- Drop a corner and carry on from there
  function commitPoint() {
    var corner = cornerBetween(anchor(), draw.cursor, draw.flip, null);
    if (corner) {
      draw.points.push(corner);
    }
    var last = anchor();
    if (last.x !== draw.cursor.x || last.y !== draw.cursor.y) {
      draw.points.push({ x: draw.cursor.x, y: draw.cursor.y });
    }
    render();
  }

  //------------------------------------------------------------------------
  //-- Event handling
  //--
  //-- Everything is captured on `document` so that no click reaches the
  //-- paper underneath while a wire is being drawn.
  //------------------------------------------------------------------------

  function updateCursor(evt) {
    var local = ctx.paper.pageToLocalPoint({
      x: evt.clientX,
      y: evt.clientY,
    });

    var magnet = findInputMagnet(local);
    setHover(magnet);

    //-- Snap onto a port when one is in range, onto the grid otherwise
    draw.cursor = magnet
      ? magnetCenter(magnet)
      : wireSnapPoint(local, ctx.gridsize);
  }

  function onMouseMove(evt) {
    if (!draw) {
      return;
    }
    updateCursor(evt);
    render();
  }

  function onMouseDown(evt) {
    if (!draw) {
      return;
    }
    //-- Swallow it: no selection, no panning, no block dragging
    evt.preventDefault();
    evt.stopPropagation();
  }

  function onMouseUp(evt) {
    if (!draw) {
      return;
    }
    evt.preventDefault();
    evt.stopPropagation();

    updateCursor(evt);

    if (ctx.utils.hasRightButton(evt)) {
      draw.flip = !draw.flip;
      draw.pressing = false;
      render();
      return;
    }

    if (!ctx.utils.hasLeftButton(evt)) {
      return;
    }

    if (draw.hoverMagnet) {
      complete(draw.hoverMagnet);
      return;
    }

    //-- The release that ends the opening click just arms the mode
    if (draw.pressing) {
      draw.pressing = false;
      return;
    }

    commitPoint();
  }

  function onContextMenu(evt) {
    if (!draw) {
      return;
    }
    evt.preventDefault();
    evt.stopPropagation();
  }

  function onDblClick(evt) {
    if (!draw) {
      return;
    }
    evt.preventDefault();
    evt.stopPropagation();
    cancel();
  }

  function onKeyDown(evt) {
    if (!draw) {
      return;
    }
    if (evt.key === 'Escape' || evt.keyCode === 27) {
      evt.preventDefault();
      evt.stopPropagation();
      cancel();
    }
  }

  function bind() {
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('dblclick', onDblClick, true);
    document.addEventListener('keydown', onKeyDown, true);
  }

  function unbind() {
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('mouseup', onMouseUp, true);
    document.removeEventListener('contextmenu', onContextMenu, true);
    document.removeEventListener('dblclick', onDblClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
  }

  //------------------------------------------------------------------------
  //-- Entry point: pressing an output magnet opens wire mode instead of
  //-- JointJS' own "drag a temporary link" behaviour. Releasing over an
  //-- input finishes it, which keeps plain drag-to-connect working.
  //------------------------------------------------------------------------
  function setup() {
    if (patched) {
      return;
    }
    patched = true;

    var originalPointerDown = ctx.joint.dia.ElementView.prototype.pointerdown;

    ctx.joint.dia.ElementView.prototype.pointerdown = function (evt) {
      var paper = this.paper;
      var magnet = evt.target;

      if (
        paper === ctx.paper &&
        paper.options.enabled !== false &&
        magnet.getAttribute('magnet') &&
        this.can('addLinkFromMagnet') &&
        paper.options.validateMagnet.call(paper, this, magnet)
      ) {
        evt.preventDefault();
        evt.stopPropagation();

        //-- Paper.pointerdown already latched this gesture (sourceView set,
        //-- document handlers bound) before handing over to us. Let it go,
        //-- or every mousemove from here on would drag the block instead.
        paper.sourceView = null;
        paper.unbindDocumentEvents();

        start(this, magnet);
        return;
      }

      originalPointerDown.apply(this, arguments);
    };
  }

  return {
    setup: setup,
    isActive: isActive,
    cancel: cancel,
  };
};
