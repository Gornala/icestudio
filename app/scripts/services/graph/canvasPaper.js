//---------------------------------------------------------------------------
//-- canvasPaper.js: JointJS paper/graph/commandManager/selectionView setup
//-- Loaded as a <script> tag before graph.js; exposes window._icegraph.canvasPaper
//---------------------------------------------------------------------------
/* global _icegraph */
'use strict';

window._icegraph = window._icegraph || {};

window._icegraph.canvasPaper = function (ctx) {
  function createPaper(element, serviceInstance) {
    //-- Create JointJS graph and paper
    ctx.graph = new ctx.joint.dia.Graph();

    ctx.paper = new ctx.joint.dia.Paper({
      el: element,
      width: 6000,
      height: 3000,
      model: ctx.graph,
      gridSize: ctx.gridsize,
      interactive: true,
      clickThreshold: 6,
      snapLinks: { radius: 16 },
      linkPinning: false,
      embeddingMode: false,
      getState: function () {
        return ctx.utils.clone(ctx.state);
      },
      defaultLink: new ctx.joint.shapes.ice.Wire(),
      validateMagnet: function (cellView, magnet) {
        // Prevent wires starting from an input port
        return magnet.getAttribute('type') === 'output';
      },
      validateConnection: ctx.validateConnection,
    });

    //-- Command Manager (undo/redo)
    ctx.commandManager = new ctx.joint.dia.CommandManager({
      paper: ctx.paper,
      graph: ctx.graph,
    });

    //-- Selection
    ctx.selection = new Backbone.Collection();
    ctx.selectionView = new ctx.joint.ui.SelectionView({
      paper: ctx.paper,
      graph: ctx.graph,
      model: ctx.selection,
      state: ctx.state,
    });

    ctx.paper.options.enabled = true;
    ctx.paper.options.warningTimer = false;

    //-- svgPanZoom
    var targetElement = element[0];
    var zoomTimeout;
    var isOnZoom = false;
    var oncePerZoomHook = false;

    ctx.panAndZoom = svgPanZoom(targetElement.childNodes[2], {
      fit: false,
      center: false,
      zoomEnabled: true,
      panEnabled: false,
      zoomScaleSensitivity: ctx.ZOOM_SENS,
      dblClickZoomEnabled: false,
      minZoom: ctx.ZOOM_MIN,
      maxZoom: ctx.ZOOM_MAX,
      eventsListenerElement: targetElement,
      onZoom: function (scale) {
        isOnZoom = true;
        ctx.state.zoom = scale;
        if (ctx.state.mutateZoom === false) {
          ctx.state.mutateZoom = true;
          if (!oncePerZoomHook) {
            oncePerZoomHook = true;
            ctx.disableAceEditors();
            if (document.activeElement.className === 'select2-search__field') {
              $('select').select2('close');
            }
          }
        }
        clearTimeout(zoomTimeout);
        zoomTimeout = setTimeout(function () {
          if (isOnZoom) {
            ctx.restoreAceEditors();
            isOnZoom = false;
            oncePerZoomHook = false;
            ctx.state.mutateZoom = false;
            ctx.queuePanZoom.push(1);
          }
        }, 400);
      },
      onPan: function (newPan) {
        ctx.state.pan = newPan;
        ctx.graph.trigger('state', ctx.state);
        ctx.queuePanZoom.push(1);
      },
    });

    //-- Expose panAndZoom on the service instance
    serviceInstance.panAndZoom = ctx.panAndZoom;

    //-- Initialize uiHelper (tooltip + codeError handlers, RAF loop)
    ctx.uiHelperInit();
    requestAnimationFrame(ctx.loopUpdateBoxes);

    //-- Initialize interactions (paper + graph event listeners)
    var _interactions = _icegraph.interactions(ctx);
    ctx.processReplaceBlock = _interactions.processReplaceBlock;
    ctx.findLowerBlock = _interactions.findLowerBlock;
    ctx.disableReplacedBlock = _interactions.disableReplacedBlock;
    ctx.debounceDisableReplacedBlock =
      _interactions.debounceDisableReplacedBlock;
    _interactions.setup();
  }

  return {
    createPaper: createPaper,
  };
};
