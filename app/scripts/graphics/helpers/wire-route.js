//== JSHINT RULES / START
/* jshint unused:false */
//== JSHINT RULES / END

/*----------------------------------------------------------------------------
 * Pure geometry helpers for wire routing / route editing.
 *
 * Nothing in here touches JointJS models: every function takes plain
 * {x, y} points so it can be reasoned about (and tested) on its own.
 * Loaded before joint.routers.js -- see index.html.
 * ---------------------------------------------------------------------------*/

'use strict';

/*--
 * Snap a point to the design grid. Blocks and the router both work on an
 * 8px grid, hand-placed vertices did not -- which is why manual corners
 * never lined up with the blocks they were routed between.
 --*/
function wireSnapPoint(point, grid) {
  var g = grid || 8;
  //-- `+ 0` normalises the -0 that Math.round returns for small negatives
  return {
    x: Math.round(point.x / g) * g + 0,
    y: Math.round(point.y / g) * g + 0,
  };
}

/*--
 * The polyline that is actually on screen for a given link view:
 * source point + the points the router produced + target point.
 * Returns null when the view has not been rendered yet.
 --*/
function wireRoutePolyline(linkView) {
  if (!linkView || !linkView.sourcePoint || !linkView.targetPoint) {
    return null;
  }
  var route = linkView.route || [];
  var points = [{ x: linkView.sourcePoint.x, y: linkView.sourcePoint.y }];
  for (var i = 0; i < route.length; i++) {
    points.push({ x: route[i].x, y: route[i].y });
  }
  points.push({ x: linkView.targetPoint.x, y: linkView.targetPoint.y });
  return points;
}

/*--
 * Closest projection of `point` onto a polyline.
 * `position` is the distance travelled along the polyline to reach that
 * projection, which gives a single monotonic coordinate we can order
 * clicks and vertices by -- far more robust than comparing raw segments.
 --*/
function wireClosestOnPolyline(points, point) {
  var best = { distance: Infinity, position: 0, segment: 0 };

  if (!points || points.length < 2) {
    return best;
  }

  var travelled = 0;

  for (var i = 0; i < points.length - 1; i++) {
    var a = points[i];
    var b = points[i + 1];
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var lengthSq = dx * dx + dy * dy;
    var segmentLength = Math.sqrt(lengthSq);

    var t =
      lengthSq > 0
        ? ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq
        : 0;
    t = Math.max(0, Math.min(1, t));

    var px = a.x + t * dx;
    var py = a.y + t * dy;
    var distance = Math.sqrt(
      (point.x - px) * (point.x - px) + (point.y - py) * (point.y - py)
    );

    if (distance < best.distance) {
      best = {
        distance: distance,
        position: travelled + t * segmentLength,
        segment: i,
      };
    }

    travelled += segmentLength;
  }

  return best;
}

/*--
 * Drop vertices that have no effect on the drawn shape: exact duplicates
 * and points sitting on the straight line between their two neighbours.
 * Without this, every block move and every corrected drag leaves dead
 * vertices behind that the router still has to detour through.
 --*/
function wireDropRedundantVertices(vertices, sourcePoint, targetPoint) {
  if (!vertices || vertices.length === 0) {
    return [];
  }

  var kept = [];
  var i;

  //-- Pass 1: drop consecutive duplicates
  for (i = 0; i < vertices.length; i++) {
    var v = vertices[i];
    var last = kept.length > 0 ? kept[kept.length - 1] : null;
    if (!last || last.x !== v.x || last.y !== v.y) {
      kept.push({ x: v.x, y: v.y });
    }
  }

  //-- Pass 2: drop collinear points, using the endpoints as outer neighbours
  var result = [];
  for (i = 0; i < kept.length; i++) {
    var previous = result.length > 0 ? result[result.length - 1] : sourcePoint;
    var next = i + 1 < kept.length ? kept[i + 1] : targetPoint;

    if (!previous || !next) {
      result.push(kept[i]);
      continue;
    }

    if (!wireIsCollinear(previous, kept[i], next)) {
      result.push(kept[i]);
    }
  }

  return result;
}

/*--
 * Does `b` sit on a straight run from a to c, so removing it changes nothing?
 *
 * Deliberately axis-aligned only: wires here are always orthogonal, so
 * "redundant" means all three points share a column or share a row. A
 * general distance-to-line test would need a tolerance of about half a
 * grid step, and that is wide enough to swallow a jog the user placed
 * one grid step off the run -- exactly the corners worth keeping.
 --*/
function wireIsCollinear(a, b, c, tolerance) {
  var eps = tolerance === undefined ? 0.5 : tolerance;
  var sameColumn = Math.abs(a.x - b.x) <= eps && Math.abs(b.x - c.x) <= eps;
  var sameRow = Math.abs(a.y - b.y) <= eps && Math.abs(b.y - c.y) <= eps;
  return sameColumn || sameRow;
}
