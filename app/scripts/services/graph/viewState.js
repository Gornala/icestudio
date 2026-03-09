//---------------------------------------------------------------------------
//-- viewState.js: Zoom / Pan / Viewport management
//-- Loaded as a <script> tag before graph.js; exposes window._icegraph.viewState
//---------------------------------------------------------------------------
'use strict';

window._icegraph = window._icegraph || {};

window._icegraph.viewState = function (ctx) {
  //-----------------------------------------------------------------------
  //-- Returns a deep copy of the view state
  //-----------------------------------------------------------------------
  function getState() {
    return ctx.utils.clone(ctx.state);
  }

  //-----------------------------------------------------------------------
  //-- Set the current view state (pan + zoom)
  //-----------------------------------------------------------------------
  function setState(_state) {
    if (!_state) {
      _state = ctx.utils.clone(ctx.VIEWSTATE_INIT);
    }
    ctx.panAndZoom.zoom(_state.zoom);
    ctx.panAndZoom.pan(_state.pan);
  }

  //-----------------------------------------------------------------------
  //-- Reset the current view (pan and zoom)
  //-----------------------------------------------------------------------
  function resetView() {
    setState(null);
  }

  //-----------------------------------------------------------------------
  //-- Check if the design contains no elements
  //-----------------------------------------------------------------------
  function isEmpty() {
    return ctx.graph.getCells().length === 0;
  }

  //-----------------------------------------------------------------------
  //-- Fit the paper to the window size
  //-----------------------------------------------------------------------
  function fitPaper() {
    var win = ctx.window.get();
    $('.joint-paper.joint-theme-default>svg').attr('height', win.height);
    $('.joint-paper.joint-theme-default>svg').attr('width', win.width);
  }

  //-----------------------------------------------------------------------
  //-- Fit the entire circuit into the visible window
  //-----------------------------------------------------------------------
  function fitContent() {
    if (!isEmpty()) {
      var win = ctx.window.get();

      var targetBox = {
        x: ctx.CIRCUIT_MARGIN,
        y: ctx.CIRCUIT_MARGIN,
        width: win.width - 2 * ctx.CIRCUIT_MARGIN,
        height: win.height - ctx.MENU_FOOTER_HEIGHT - 2 * ctx.CIRCUIT_MARGIN,
      };

      var sourceBbox = V(ctx.paper.viewport).bbox(true, ctx.paper.svg);
      var zoom = ctx.state.zoom;
      var sourceBox = {
        x: sourceBbox.x * zoom,
        y: sourceBbox.y * zoom,
        width: sourceBbox.width * zoom,
        height: sourceBbox.height * zoom,
      };

      var scale = Math.min(
        targetBox.height / sourceBox.height,
        targetBox.width / sourceBox.width
      );
      var finalScale = zoom * scale > 1 ? 1 / zoom : scale;

      var targetCenterX = targetBox.x + targetBox.width / 2;
      var targetCenterY = targetBox.y + targetBox.height / 2;
      var sourceCenterX = sourceBox.x + sourceBox.width / 2;
      var sourceCenterY = sourceBox.y + sourceBox.height / 2;

      setState({
        pan: {
          x: targetCenterX - sourceCenterX * finalScale,
          y: targetCenterY - sourceCenterY * finalScale,
        },
        zoom: zoom * finalScale,
      });

      fitPaper();
    } else {
      resetView();
    }
  }

  return {
    getState: getState,
    setState: setState,
    resetView: resetView,
    isEmpty: isEmpty,
    fitPaper: fitPaper,
    fitContent: fitContent,
  };
};
