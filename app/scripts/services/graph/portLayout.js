//---------------------------------------------------------------------------
//-- portLayout.js: Position boundary blocks (basic.input / basic.output /
//-- non-local basic.constant) inside a submodule when its port set is edited.
//--
//-- Editing a Generic block's ports from the parent sheet rebuilds the
//-- submodule's boundary blocks from scratch.  Recreating them at fixed
//-- coordinates throws away the layout the submodule already had, which drops
//-- the output column on top of the code block whenever that column had been
//-- placed to the right of it.  These helpers keep every port that survives
//-- the edit exactly where it was and stack the newly added ones after them.
//--
//-- Loaded as a <script> tag before graph.js; exposes window._icegraph.portLayout
//---------------------------------------------------------------------------
'use strict';

window._icegraph = window._icegraph || {};

window._icegraph.portLayout = (function () {
  //-- Layout constants, matching those used by transformCodeToSubmodule
  var IO_LEFT_X = 50; //-- default x of the input column
  var IO_START_Y = 80; //-- y of the first block in a column
  var IO_STEP = 80; //-- vertical spacing inside a column
  var IO_MARGIN = 240; //-- gap kept between the interior and the output column
  var PARAM_START_X = 398; //-- x of the first parameter block
  var PARAM_Y = 20; //-- y of the parameter row
  var PARAM_STEP = 150; //-- horizontal spacing inside the parameter row
  var DEFAULT_BLOCK_WIDTH = 96; //-- assumed width when a block has no size

  //-- Blocks that make up the submodule boundary: they are regenerated on
  //-- every port edit, so they must not be taken into account when looking
  //-- for free space to the right of the interior.
  function isBoundaryBlock(block) {
    if (!block || !block.type) {
      return false;
    }
    if (block.type === 'basic.input' || block.type === 'basic.output') {
      return true;
    }
    return (
      (block.type === 'basic.constant' || block.type === 'basic.memory') &&
      block.data &&
      !block.data.local
    );
  }

  //-- Index the previous boundary blocks of one type by port name, so that a
  //-- port kept across the edit can be matched back to its old position.
  //-- `filter` narrows the match further (used to tell params from locals).
  function positionsByName(oldBlocks, types, filter) {
    var byName = {};
    (oldBlocks || []).forEach(function (block) {
      if (
        !block ||
        types.indexOf(block.type) === -1 ||
        !block.data ||
        !block.data.name ||
        !block.position
      ) {
        return;
      }
      if (filter && !filter(block)) {
        return;
      }
      byName[block.data.name] = { x: block.position.x, y: block.position.y };
    });
    return byName;
  }

  //-- Right edge of the submodule interior (everything that is not a boundary
  //-- block), used to park an output column that has nothing to inherit from.
  function interiorRightEdge(oldBlocks) {
    var edge = null;
    (oldBlocks || []).forEach(function (block) {
      if (!block || !block.position || isBoundaryBlock(block)) {
        return;
      }
      var width =
        block.size && block.size.width ? block.size.width : DEFAULT_BLOCK_WIDTH;
      var right = block.position.x + width;
      if (edge === null || right > edge) {
        edge = right;
      }
    });
    return edge;
  }

  //-- Lay out one line of boundary blocks.
  //--
  //--   oldBlocks : the submodule's blocks before the edit
  //--   portNames : the port names after the edit, in form order
  //--   options   : { types, filter, axis, step, alignEnd, start, defaultFixed }
  //--
  //-- `axis` is the direction blocks are stacked along ('y' for the input and
  //-- output columns, 'x' for the parameter row); the other coordinate is the
  //-- shared one and is inherited from the surviving blocks.  Returns an array
  //-- of {x, y} parallel to portNames: ports that already existed keep their
  //-- old coordinates, new ports are appended after the last one.
  function layoutLine(oldBlocks, portNames, options) {
    options = options || {};
    var axis = options.axis === 'x' ? 'x' : 'y';
    var across = axis === 'y' ? 'x' : 'y';
    var step = options.step || IO_STEP;
    var alignEnd = !!options.alignEnd;

    var oldPositions = positionsByName(
      oldBlocks,
      options.types || [],
      options.filter
    );
    var kept = [];
    (portNames || []).forEach(function (name) {
      if (oldPositions[name]) {
        kept.push(oldPositions[name]);
      }
    });

    //-- Shared coordinate of the line.  Outputs align on the rightmost of the
    //-- old positions and inputs on the leftmost, so a column that was dragged
    //-- clear of the interior stays clear of it.
    var fixed = null;
    kept.forEach(function (pos) {
      if (fixed === null) {
        fixed = pos[across];
      } else {
        fixed = alignEnd
          ? Math.max(fixed, pos[across])
          : Math.min(fixed, pos[across]);
      }
    });
    if (fixed === null) {
      fixed = options.defaultFixed !== undefined ? options.defaultFixed : 0;
    }

    //-- Where the next new block goes: one step past the last existing one.
    var next = null;
    kept.forEach(function (pos) {
      if (next === null || pos[axis] + step > next) {
        next = pos[axis] + step;
      }
    });
    if (next === null) {
      next = options.start !== undefined ? options.start : IO_START_Y;
    }

    return (portNames || []).map(function (name) {
      var old = oldPositions[name];
      if (old) {
        return { x: old.x, y: old.y };
      }
      var position = {};
      position[axis] = next;
      position[across] = fixed;
      next += step;
      return position;
    });
  }

  //-- Input column: left edge of the submodule.
  function layoutInputs(oldBlocks, portNames) {
    return layoutLine(oldBlocks, portNames, {
      types: ['basic.input'],
      axis: 'y',
      step: IO_STEP,
      start: IO_START_Y,
      defaultFixed: IO_LEFT_X,
    });
  }

  //-- Output column: right of the interior, so it never lands on the code block.
  function layoutOutputs(oldBlocks, portNames) {
    var edge = interiorRightEdge(oldBlocks);
    return layoutLine(oldBlocks, portNames, {
      types: ['basic.output'],
      axis: 'y',
      step: IO_STEP,
      start: IO_START_Y,
      alignEnd: true,
      defaultFixed: edge === null ? IO_LEFT_X : edge + IO_MARGIN,
    });
  }

  //-- Parameter row: above the interior, growing to the right.
  function layoutParams(oldBlocks, paramNames) {
    return layoutLine(oldBlocks, paramNames, {
      types: ['basic.constant', 'basic.memory'],
      filter: function (block) {
        return !block.data.local;
      },
      axis: 'x',
      step: PARAM_STEP,
      start: PARAM_START_X,
      defaultFixed: PARAM_Y,
    });
  }

  return {
    IO_LEFT_X: IO_LEFT_X,
    IO_START_Y: IO_START_Y,
    IO_STEP: IO_STEP,
    IO_MARGIN: IO_MARGIN,
    PARAM_START_X: PARAM_START_X,
    PARAM_Y: PARAM_Y,
    PARAM_STEP: PARAM_STEP,
    DEFAULT_BLOCK_WIDTH: DEFAULT_BLOCK_WIDTH,
    isBoundaryBlock: isBoundaryBlock,
    interiorRightEdge: interiorRightEdge,
    layoutLine: layoutLine,
    layoutInputs: layoutInputs,
    layoutOutputs: layoutOutputs,
    layoutParams: layoutParams,
  };
})();
