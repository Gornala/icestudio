//-- jshint rules
/* global WIRE_WIDTH, isClickOnVertex,computeRoute, findBifurcations */
/* global wireSnapPoint, wireRoutePolyline, wireDropRedundantVertices */

'use strict';

/*--
 * Drop vertices that no longer bend the wire.
 * Called once a vertex drag has finished, so a corner that the user pulled
 * back onto the straight line disappears instead of lingering as an
 * invisible point the router still has to detour through.
 --*/
function cleanWireVertices(linkView) {
  var vertices = linkView.model.get('vertices') || [];
  if (vertices.length === 0) {
    return;
  }

  var polyline = wireRoutePolyline(linkView);
  if (!polyline) {
    return;
  }

  var cleaned = wireDropRedundantVertices(
    vertices,
    polyline[0],
    polyline[polyline.length - 1]
  );

  if (cleaned.length !== vertices.length) {
    linkView.model.set('vertices', cleaned, { ui: true });
  }
}

/*--
 * Segment dragging
 *
 * Grabbing the middle of a straight run and pulling sideways slides the
 * whole run: a vertical run moves left/right, a horizontal one up/down.
 * Only the middle is grabbable -- the ends are left free so the corners and
 * their vertex handles stay reachable.
 --*/
const WIRE_SEGMENT_ACTION = 'wire-segment-move';
const WIRE_SEGMENT_GRIP = 10; //-- how far from the line still counts as a grab
const WIRE_SEGMENT_MARGIN = 12; //-- dead zone at each end of a run

/*--
 * The straight run of the drawn polyline under (x, y), or null.
 * Runs touching the source or target point are skipped: sliding those would
 * pull the wire off its port, and the router forces the exit direction there
 * anyway.
 --*/
function findWireRun(linkView, x, y) {
  var polyline = wireRoutePolyline(linkView);
  if (!polyline || polyline.length < 4) {
    return null;
  }

  var last = polyline.length - 1;
  var best = null;
  var bestDistance = WIRE_SEGMENT_GRIP;

  for (var i = 1; i < last - 1; i++) {
    var a = polyline[i];
    var b = polyline[i + 1];
    var horizontal = Math.abs(a.y - b.y) <= 0.5;
    var vertical = Math.abs(a.x - b.x) <= 0.5;

    //-- Diagonal stubs (the little kink into a port) are not runs
    if (horizontal === vertical) {
      continue;
    }

    var along = horizontal ? x : y;
    var from = horizontal ? a.x : a.y;
    var to = horizontal ? b.x : b.y;
    var low = Math.min(from, to) + WIRE_SEGMENT_MARGIN;
    var high = Math.max(from, to) - WIRE_SEGMENT_MARGIN;

    if (low >= high || along < low || along > high) {
      continue;
    }

    var distance = horizontal ? Math.abs(y - a.y) : Math.abs(x - a.x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = {
        index: i,
        axis: horizontal ? 'h' : 'v',
        polyline: polyline,
      };
    }
  }

  return best;
}

/*--
 * Slide the grabbed run to the pointer.
 *
 * The polyline captured when the drag started is the reference, so the wire
 * cannot drift as its own re-routing feeds back into the next move. Every
 * corner of that polyline becomes an explicit vertex, which is what keeps the
 * rest of the wire exactly where it was while one run moves.
 --*/
function moveWireSegment(linkView, x, y) {
  var segment = linkView._wireSegment;
  var polyline = segment.polyline;
  var last = polyline.length - 1;
  var snapped = wireSnapPoint({ x: x, y: y });

  var slide = function (point) {
    return segment.axis === 'v'
      ? { x: snapped.x, y: point.y }
      : { x: point.x, y: snapped.y };
  };

  var vertices = [];
  for (var i = 1; i < last; i++) {
    var point = polyline[i];
    vertices.push(
      i === segment.index || i === segment.index + 1
        ? slide(point)
        : { x: point.x, y: point.y }
    );
  }

  segment.moved = true;
  linkView.model.set('vertices', vertices, { ui: true });
}

/*--
 * Click filter to choose between click on path , vertex or remove marker isClickOnVertex
 --*/
const originalPointerDown = joint.dia.LinkView.prototype.pointerdown;
joint.dia.LinkView.prototype.pointerdown = function (evt, x, y) {
  // Delete marker icon -> default jointjs action
  if (evt.target.closest('.marker-vertex-remove')) {
    originalPointerDown.apply(this, arguments);
    return;

    // Vertex group area but no control point neither delete icon -> default jointjs action
  }

  if (evt.target.closest('.marker-vertex-group')) {
    originalPointerDown.apply(this, arguments);
    return;

    // Vertex control point -> jointjs management
  }

  if (isClickOnVertex(this, x, y, 10)) {
    originalPointerDown.apply(this, arguments);
    return;
    // Click on path -> stop default jointjs actions and derive to our route algorithm
  }

  // Middle of a straight run -> arm a segment drag. A plain click still falls
  // through to cell:pointerclick and inserts a vertex, because the paper only
  // reports a click when the pointer stayed under its clickThreshold.
  var run = findWireRun(this, x, y);
  if (run) {
    this._action = WIRE_SEGMENT_ACTION;
    this._wireSegment = {
      index: run.index,
      axis: run.axis,
      polyline: run.polyline,
      moved: false,
    };
    this.model.startBatch('wire-segment');
  }

  evt.stopPropagation();
  evt.preventDefault();
};

/*--
 * Snap dragged vertices to the design grid.
 * Blocks and the router both work on the same 8px grid; without this a
 * hand-dragged corner lands on whatever sub-pixel the mouse was on and
 * never lines up with the block it was routed around.
 --*/
const originalPointerMove = joint.dia.LinkView.prototype.pointermove;
joint.dia.LinkView.prototype.pointermove = function (evt, x, y) {
  if (this._action === WIRE_SEGMENT_ACTION) {
    moveWireSegment(this, x, y);
    return;
  }

  if (this._action === 'vertex-move') {
    var snapped = wireSnapPoint({ x: x, y: y });
    originalPointerMove.call(this, evt, snapped.x, snapped.y);
    return;
  }

  originalPointerMove.apply(this, arguments);
};

/*--
 * Once a vertex drag ends, drop the vertices it made redundant.
 * Runs before the original handler so it still falls inside the JointJS
 * 'pointer' batch -- the whole drag stays a single undo step.
 --*/
const originalPointerUp = joint.dia.LinkView.prototype.pointerup;
joint.dia.LinkView.prototype.pointerup = function () {
  if (this._action === 'vertex-move') {
    cleanWireVertices(this);
  }

  if (this._action === WIRE_SEGMENT_ACTION) {
    if (this._wireSegment.moved) {
      cleanWireVertices(this);
    }
    this._wireSegment = null;
    //-- One batch per gesture, so the whole slide is a single undo step
    this.model.stopBatch('wire-segment');
  }

  originalPointerUp.apply(this, arguments);
};

/*--
 * Custom wire
--*/
joint.shapes.ice.Wire = joint.dia.Link.extend({
  markup: [
    '<path class="connection" d="M 0 0 0 0"/>',
    '<path class="connection-wrap" d="M 0 0 0 0"/>',
    '<path class="marker-source" d="M 0 0 0 0"/>',
    '<path class="marker-target" d="M 0 0 0 0"/>',
    '<g class="marker-vertices"/>',
    '<g class="marker-bifurcations"/>',
    '<g class="marker-arrowheads"/>',
    '<g class="link-tools"/>',
  ].join(''),

  bifurcationMarkup: [
    '<g class="marker-bifurcation-group" transform="translate(<%= x %>, <%= y %>)">',
    '<circle class="marker-bifurcation" idx="<%= idx %>" r="<%= r %>" fill="#777"/>',
    '</g>',
  ].join(''),

  arrowheadMarkup: [
    '<g class="marker-arrowhead-group marker-arrowhead-group-<%= end %>">',
    '<circle class="marker-arrowhead" end="<%= end %>" r="8"/>',
    '</g>',
  ].join(''),

  toolMarkup: [
    '<g class="link-tool">',
    '<g class="tool-remove" event="remove">',
    '<circle r="8" />',
    '<path transform="scale(.6) translate(-16, -16)" d="M24.778,21.419 19.276,15.917 24.777,10.415 21.949,7.585 16.447,13.087 10.945,7.585 8.117,10.415 13.618,15.917 8.116,21.419 10.946,24.248 16.447,18.746 21.948,24.248z" />',
    '<title>Remove link</title>',
    '</g>',
    '</g>',
  ].join(''),

  vertexMarkup: [
    '<g class="marker-vertex-group" transform="translate(<%= x %>, <%= y %>)">',
    '<circle class="marker-vertex" idx="<%= idx %>" r="8" />',
    '<path class="marker-vertex-remove-area" idx="<%= idx %>" transform="scale(.8) translate(5, -33)" d="M16,5.333c-7.732,0-14,4.701-14,10.5c0,1.982,0.741,3.833,2.016,5.414L2,25.667l5.613-1.441c2.339,1.317,5.237,2.107,8.387,2.107c7.732,0,14-4.701,14-10.5C30,10.034,23.732,5.333,16,5.333z"/>',
    '<path class="marker-vertex-remove" idx="<%= idx %>" transform="scale(.6) translate(11.5, -39)" d="M24.778,21.419 19.276,15.917 24.777,10.415 21.949,7.585 16.447,13.087 10.945,7.585 8.117,10.415 13.618,15.917 8.116,21.419 10.946,24.248 16.447,18.746 21.948,24.248z">',
    '<title>Remove vertex</title>',
    '</path>',
    '</g>',
  ].join(''),

  defaults: joint.util.deepSupplement(
    {
      type: 'ice.Wire',
      z: 1,
      attrs: {
        '.connection': {
          'stroke-width': WIRE_WIDTH,
          'stroke': '#777',
        },
      },

      router: { name: 'ice' },
      connector: { name: 'ice' },
    },
    joint.dia.Link.prototype.defaults
  ),
});

joint.shapes.ice.WireView = joint.dia.LinkView.extend({
  options: {
    shortLinkLength: 64,
    longLinkLength: 160,
    linkToolsOffset: 40,
  },

  initialize: function () {
    joint.dia.LinkView.prototype.initialize.apply(this, arguments);
    setTimeout(() => {
      var size = this.model.get('size');

      if (!size) {
        // New wire — find source port size from rightPorts or leftPorts
        // (Generate frame inner-left ports are magnets in leftPorts)
        var i,
          port,
          portName = this.model.get('source').port;
        var rightPorts = this.sourceView.model.get('rightPorts');
        for (i in rightPorts) {
          port = rightPorts[i];
          if (portName === port.id) {
            size = port.size;
            this.model.attributes.size = size;
            break;
          }
        }
        if (!size) {
          var leftPorts = this.sourceView.model.get('leftPorts');
          for (i in leftPorts) {
            port = leftPorts[i];
            if (portName === port.id) {
              size = port.size;
              this.model.attributes.size = size;
              break;
            }
          }
        }
      }
      this.setWireClass(size);

      // Hide clk yellow block if is connected on load
      let target = this.model.get('target');
      let isClk = document.getElementById(
        `port-default-${target.id}-${target.port}`
      );
      if (isClk) {
        isClk.classList.add('wire-connected');
      }
    }, 0);
    setTimeout(() => {
      this.updateBifurcations();
    }, 0);

    //-- Show which way a run would slide before the user commits to a drag
    this.$el.on('mousemove', this.updateWireCursor.bind(this));
  },

  //-- Resize cursor over the grabbable middle of a straight run
  updateWireCursor: function (evt) {
    if (this._action) {
      return;
    }

    var local = this.paper.pageToLocalPoint({
      x: evt.clientX,
      y: evt.clientY,
    });

    var run = findWireRun(this, local.x, local.y);
    var cursor = 'pointer';
    if (run) {
      cursor = run.axis === 'v' ? 'ew-resize' : 'ns-resize';
    }

    this.$('.connection, .connection-wrap').css('cursor', cursor);
  },

  apply: function () {
    // No operation required
  },

  render: function () {
    joint.dia.LinkView.prototype.render.apply(this, arguments);
    return this;
  },

  remove: function () {
    // Hide clk yellow block if is connected on load
    let target = this.model.get('target');
    let isClk = document.getElementById(
      `port-default-${target.id}-${target.port}`
    );
    if (isClk) {
      isClk.classList.remove('wire-connected');
    }

    joint.dia.LinkView.prototype.remove.apply(this, arguments);
    this.updateBifurcations();
    return this;
  },

  update: function () {
    joint.dia.LinkView.prototype.update.apply(this, arguments);
    this.updateBifurcations();
    return this;
  },

  updateToolsPosition: function () {
    if (!this._V.linkTools) {
      return this;
    }

    var scale = '';
    var offset = this.options.linkToolsOffset;
    var connectionLength = this.getConnectionLength();

    if (!_.isNaN(connectionLength)) {
      // If the link is too short, make the tools half the size and the offset twice as low.
      if (connectionLength < this.options.shortLinkLength) {
        scale = 'scale(.5)';
        offset /= 2;
      }

      var toolPosition = this.getPointAtLength(connectionLength - offset);
      this._toolCache.attr(
        'transform',
        'translate(' + toolPosition.x + ', ' + toolPosition.y + ') ' + scale
      );
    }

    return this;
  },

  /* Changed the way of updating wire, very most optimized by css calc
   * instead constant dom update, but for the moment , recomend not delete
   * the old function to have near if something go bad
   */

  setWireClass: function (size) {
    var connection = this.$('.connection');
    connection.removeClass('wire-bus wire-single');

    if (size > 1) {
      connection.addClass('wire-bus');
    } else {
      connection.addClass('wire-single');
    }
  },

  updateWireProperties: function () {
    return;
  },

  updateConnection: function (opt) {
    opt = opt || {};
    var route = (this.route = this.findRoute(
      this.model.get('vertices') || [],
      opt
    ));

    this._findConnectionPoints(route);
    var pathData = this.getPathData(route);
    this._V.connection.attr('d', pathData.full);
    if (this._V.connectionWrap) {
      this._V.connectionWrap.attr('d', pathData.wrap);
    }

    this._translateAndAutoOrientArrows(
      this._V.markerSource,
      this._V.markerTarget
    );
  },

  updateBifurcations: function () {
    if (this._V.markerBifurcations) {
      const self = this;
      const currentWire = this.model;
      const allWires = this.paper.model.getLinks();
      const markupTemplate = joint.util.template(
        this.model.get('bifurcationMarkup') || this.model.bifurcationMarkup
      );

      //const wireViewCache = new Map();
      const bifurcationPoints = new Set();

      const portWires = allWires
        .filter((wire) => {
          const wireSource = wire.get('source');
          const cwireSource = currentWire.get('source');
          return (
            wireSource.id === cwireSource.id &&
            wireSource.port === cwireSource.port
          );
        })
        .map((wire) => {
          const wireView = self.paper.findViewByModel(wire);
          const markersNode = wireView._V.markerBifurcations.node;
          $(markersNode).empty();
          return {
            id: wire.get('id'),
            view: wireView,
            markersNode,
          };
        });

      const wireRoutes = new Map();
      portWires.forEach(({ view, id }) => {
        wireRoutes.set(id, computeRoute(view));
      });

      portWires.forEach((wireA, indexA) => {
        const vA = wireRoutes.get(wireA.id);
        if (vA.length <= 2) {
          return; // If no corners, go out
        }
        for (let i = 1; i < vA.length - 1; i++) {
          if (vA[i - 1].x !== vA[i + 1].x && vA[i - 1].y !== vA[i + 1].y) {
            // Es esquina
            const point = vA[i];
            portWires.forEach((wireB, indexB) => {
              if (indexA === indexB) {
                return;
              }
              const vB = wireRoutes.get(wireB.id);
              findBifurcations(
                point,
                vB,
                wireA.markersNode,
                bifurcationPoints,
                markupTemplate
              );
            });
          }
        }
      });
    }

    return this;
  },
});
