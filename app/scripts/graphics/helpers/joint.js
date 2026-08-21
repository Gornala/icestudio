//== JSHINT RULES / START
/* jshint unused:false */
//== JSHINT RULES / END

/*----------------------------------------------------------------------------
 * This file contains helper graphics functions for joint.js library
 * ---------------------------------------------------------------------------*/

'use strict';
/*-- 
 * Existent vertex click detection with selectable margin 
 * Future refactor: helper jointjs 
 --*/
function isClickOnVertex(linkView, x, y, margin = 5) {
  const linkModel = linkView.model;
  const vertices = linkModel.get('vertices') || [];
  return vertices.some(
    (v) => Math.abs(v.x - x) < margin && Math.abs(v.y - y) < margin
  );
}

function computeRoute(wire) {
  const route = [
    wire.sourcePoint,
    ...wire.route,
    {
      x: wire.targetPoint.x + 9,
      y: wire.targetPoint.y,
    },
  ];
  return route;
}

function findBifurcations(
  point,
  vB,
  markersNode,
  bifurcationPoints,
  markupTemplate
) {
  for (let j = 0; j < vB.length - 1; j++) {
    if (evalIntersection(point, [vB[j], vB[j + 1]])) {
      const pointKey = `${point.x},${point.y}`;
      if (!bifurcationPoints.has(pointKey)) {
        bifurcationPoints.add(pointKey);
        const mt = markupTemplate(point).replace('r=""', 'r="8"');
        V(markersNode).append(V(mt));
      }
      break; // Intersection founded, go out
    }
  }
}

function evalIntersection(point, segment) {
  const [p0, p1] = segment;
  if (p0.x === p1.x) {
    // Vertical
    return (
      point.x === p0.x &&
      point.y > Math.min(p0.y, p1.y) &&
      point.y < Math.max(p0.y, p1.y)
    );
  }
  // Horizontal
  return (
    point.y === p0.y &&
    point.x > Math.min(p0.x, p1.x) &&
    point.x < Math.max(p0.x, p1.x)
  );
}

/*----------------------------------------------------------------------------
 * Keeping hand-routed wires sane when blocks move
 *
 * Blocks can be moved by at least three different paths -- JointJS' own
 * element drag, the selection box, and the arrow keys -- so this works off
 * 'change:position' instead of patching each one. It runs after the move and
 * reconstructs the old port position from the delta.
 * ---------------------------------------------------------------------------*/

//-- Half a grid step. Wide enough to treat a corner as "lined up with" a port
//-- despite ports sitting half a step off the grid the router snaps to, and
//-- narrow enough that a jog placed one full step off is left alone.
var WIRE_ALIGN_TOLERANCE = 4;

/*--
 * Which side of its block a port sits on.
 --*/
function wirePortPos(cell, portId) {
  var groups = {
    rightPorts: 'right',
    leftPorts: 'left',
    topPorts: 'top',
    bottomPorts: 'bottom',
  };
  for (var group in groups) {
    var ports = cell.get(group) || [];
    for (var i = 0; i < ports.length; i++) {
      if (ports[i].id === portId) {
        return groups[group];
      }
    }
  }
  return null;
}

/*--
 * Is the corner on the far side of the port from the way the wire has to
 * leave (or enter) it? A right-hand output has to set off rightwards, so a
 * corner to its left can only be reached by doubling back.
 --*/
function wireCornerBehindPort(corner, port, pos) {
  if (!corner || !port) {
    return false;
  }
  switch (pos) {
    case 'right':
      return corner.x < port.x;
    case 'left':
      return corner.x > port.x;
    case 'bottom':
      return corner.y < port.y;
    case 'top':
      return corner.y > port.y;
    default:
      return false;
  }
}

/*--
 * Re-point one end of a wire after its block moved by (dx, dy).
 *
 * `port` is where the port is now; subtracting the delta gives where it was
 * when the user placed the corner. A corner that shared the port's row keeps
 * sharing it, so the wire still runs straight in instead of growing a step.
 * Returns true if the move stranded the corner behind its port -- routing for
 * a layout that no longer exists.
 --*/
function wireFollowPort(corner, port, pos, dx, dy) {
  var wasAt = { x: port.x - dx, y: port.y - dy };
  var wasReachable = !wireCornerBehindPort(corner, wasAt, pos);

  if (Math.abs(corner.y - wasAt.y) <= WIRE_ALIGN_TOLERANCE) {
    corner.y += dy;
  }
  if (Math.abs(corner.x - wasAt.x) <= WIRE_ALIGN_TOLERANCE) {
    corner.x += dx;
  }

  return wasReachable && wireCornerBehindPort(corner, port, pos);
}

/*--
 * Adjust every wire touching the blocks in `moves`, a map of cell id ->
 * {cell, dx, dy} collected since the last flush.
 --*/
function adjustWiresForCellMoves(graph, paper, moves) {
  var handled = {};

  var zero = { dx: 0, dy: 0 };

  //-- A design can be swapped in between collecting a move and flushing it.
  //-- Ids are reused across loads, so match on identity, not just id, or a
  //-- stale delta could be applied to a freshly loaded wire.
  Object.keys(moves).forEach(function (id) {
    if (graph.getCell(id) !== moves[id].cell) {
      delete moves[id];
    }
  });

  Object.keys(moves).forEach(function (id) {
    var cell = moves[id].cell;

    _.each(graph.getConnectedLinks(cell), function (link) {
      if (handled[link.id]) {
        return;
      }
      handled[link.id] = true;

      var vertices = link.get('vertices');
      if (!vertices || !vertices.length) {
        return;
      }

      var source = link.get('source');
      var target = link.get('target');
      var sourceMove = moves[source.id] || zero;
      var targetMove = moves[target.id] || zero;

      //-- Whole wire travelling with its blocks: carry the corners along
      if (
        sourceMove !== zero &&
        targetMove !== zero &&
        sourceMove.dx === targetMove.dx &&
        sourceMove.dy === targetMove.dy
      ) {
        link.set(
          'vertices',
          _.map(vertices, function (v) {
            return { x: v.x + sourceMove.dx, y: v.y + sourceMove.dy };
          })
        );
        return;
      }

      var view = paper.findViewByModel(link);
      if (!view || !view.sourcePoint || !view.targetPoint) {
        return;
      }

      var next = _.map(vertices, function (v) {
        return { x: v.x, y: v.y };
      });
      var stranded = false;

      if (sourceMove.dx || sourceMove.dy) {
        stranded =
          wireFollowPort(
            next[0],
            { x: view.sourcePoint.x, y: view.sourcePoint.y },
            wirePortPos(graph.getCell(source.id), source.port),
            sourceMove.dx,
            sourceMove.dy
          ) || stranded;
      }

      if (targetMove.dx || targetMove.dy) {
        stranded =
          wireFollowPort(
            next[next.length - 1],
            { x: view.targetPoint.x, y: view.targetPoint.y },
            wirePortPos(graph.getCell(target.id), target.port),
            targetMove.dx,
            targetMove.dy
          ) || stranded;
      }

      link.set('vertices', stranded ? [] : next);
    });
  });
}

/*--
 * Watch a graph for block movement and keep the wires tidy.
 *
 * Changes are collected and flushed on a microtask so that a selection moving
 * several blocks at once is seen as one move -- that is what tells a whole
 * wire travelling with its blocks apart from a wire with one end pulled away.
 --*/
function watchWiresOnCellMove(graph, getPaper) {
  var pending = null;

  var flush = function () {
    var moves = pending;
    pending = null;
    var paper = getPaper();
    if (paper) {
      adjustWiresForCellMoves(graph, paper, moves);
    }
  };

  graph.on('change:position', function (cell, position) {
    if (cell.isLink()) {
      return;
    }
    var previous = cell.previous('position');
    if (!previous) {
      return;
    }
    var dx = position.x - previous.x;
    var dy = position.y - previous.y;
    if (!dx && !dy) {
      return;
    }

    if (!pending) {
      pending = {};
      Promise.resolve().then(flush);
    }
    var entry = pending[cell.id];
    if (entry) {
      entry.dx += dx;
      entry.dy += dy;
    } else {
      pending[cell.id] = { cell: cell, dx: dx, dy: dy };
    }
  });
}
