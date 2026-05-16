//---------------------------------------------------------------------------
//-- canvasPaper.js: JointJS paper/graph/commandManager/selectionView setup
//-- Loaded as a <script> tag before graph.js; exposes window._icegraph.canvasPaper
//---------------------------------------------------------------------------
/* global _icegraph */
'use strict';

window._icegraph = window._icegraph || {};

window._icegraph.canvasPaper = function (ctx) {
  // Stack of saved paper levels.  Each entry holds all JointJS instances for
  // one navigation level so that they can be restored without rebuilding.
  var _paperStack = [];

  function createPaper(element, serviceInstance) {
    //-- Create JointJS graph and paper
    ctx.graph = new ctx.joint.dia.Graph();

    ctx.paper = new ctx.joint.dia.Paper({
      el: element,
      width: 6000,
      height: 3000,
      model: ctx.graph,
      gridSize: ctx.gridsize,
      interactive: function () {
        // Block all element interaction (drag, link creation) when the paper
        // is in write-protected mode.  cell:pointerdblclick is still fired by
        // JointJS regardless of this flag, so submodule navigation is unaffected.
        return ctx.paper ? ctx.paper.options.enabled !== false : true;
      },
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
            ctx.startUpdateLoop();
          }
        }, 400);
      },
      onPan: function (newPan) {
        ctx.state.pan = newPan;
        ctx.graph.trigger('state', ctx.state);
        ctx.queuePanZoom.push(1);
        ctx.startUpdateLoop();
      },
    });

    //-- Expose panAndZoom on the service instance
    serviceInstance.panAndZoom = ctx.panAndZoom;

    //-- Initialize uiHelper (tooltip + codeError handlers, RAF loop)
    ctx.uiHelperInit();

    //-- Initialize interactions (paper + graph event listeners)
    var _interactions = _icegraph.interactions(ctx);
    ctx.processReplaceBlock = _interactions.processReplaceBlock;
    ctx.findLowerBlock = _interactions.findLowerBlock;
    ctx.disableReplacedBlock = _interactions.disableReplacedBlock;
    ctx.debounceDisableReplacedBlock =
      _interactions.debounceDisableReplacedBlock;
    _interactions.setup();
  }

  // Save the current paper level and spin up a fresh one for the submodule.
  // The top-level paper is hidden (display:none) so its DOM — including live
  // ACE editors — stays intact.  No cells are removed or recreated.
  function pushPaper(serviceInstance) {
    _paperStack.push({
      graph: ctx.graph,
      paper: ctx.paper,
      commandManager: ctx.commandManager,
      panAndZoom: ctx.panAndZoom,
      selection: ctx.selection,
      selectionView: ctx.selectionView,
      zIndex: ctx.z.index,
    });

    // Disable and hide — pointer-events are gone, no stale interactions
    ctx.paper.options.enabled = false;
    ctx.paper.$el.hide();

    // Create a sibling container (same CSS class so design.css applies)
    var $newEl = $('<div></div>').addClass('paper');
    ctx.paper.$el.after($newEl);

    // Full paper initialisation in the new container
    createPaper($newEl, serviceInstance);

    // svgPanZoom may not fire onZoom/onPan callbacks when set to the same
    // value as its current internal state — force-sync ctx.state so that
    // any updateBox calls before the next resetView use correct values.
    ctx.state.zoom = ctx.panAndZoom.getZoom();
    ctx.state.pan = ctx.panAndZoom.getPan();
  }

  // Destroy the submodule paper and restore the saved top-level paper.
  // Returns true when the stack had an entry, false when there was nothing
  // to restore (caller should fall back to graph.loadDesign()).
  function popPaper(serviceInstance) {
    if (_paperStack.length === 0) {
      return false;
    }
    var saved = _paperStack.pop();

    // Tear down the submodule panAndZoom event listeners
    if (ctx.panAndZoom) {
      try {
        ctx.panAndZoom.destroy();
      } catch (e) {}
    }

    // Remove all submodule cell views (calls removeBox() on each)
    ctx.graph.clear();
    ctx.selectionView.cancelSelection();

    // Drop the submodule container from the DOM
    ctx.paper.$el.remove();

    // Restore saved instances
    ctx.graph = saved.graph;
    ctx.paper = saved.paper;
    ctx.commandManager = saved.commandManager;
    ctx.panAndZoom = saved.panAndZoom;
    ctx.selection = saved.selection;
    ctx.selectionView = saved.selectionView;
    ctx.z.index = saved.zIndex;

    // Sync ctx.state to the restored panAndZoom's actual state so that
    // updateBox calls and fitContent use the correct zoom/pan values.
    ctx.state.zoom = ctx.panAndZoom.getZoom();
    ctx.state.pan = ctx.panAndZoom.getPan();

    // Expose updated panAndZoom on the Angular service
    serviceInstance.panAndZoom = ctx.panAndZoom;

    // Bring the top-level paper back
    ctx.paper.options.enabled = true;
    ctx.paper.$el.show();
    ctx.service.appEnable(true);

    // Re-listen for undo/redo (commandManager was not touched while hidden)
    ctx.commandManager.listen();

    // Re-apply SVG attrs for all element views now that the paper is visible.
    // While the paper was hidden (display:none), getBBox() returned 0 for all
    // SVG elements, so ref-y port positions were resolved to 0.  Calling
    // view.update() re-runs updateDOMSubtreeAttributes() with correct bboxes.
    ctx.graph.getCells().forEach(function (cell) {
      if (!cell.isLink()) {
        var view = ctx.paper.findViewByModel(cell);
        if (view) {
          if (view.editor) {
            view.editor.resize();
          }
          view.update();
        }
      }
    });

    // Trigger a box-position update pass for all cells
    ctx.queuePanZoom.push(1);
    ctx.startUpdateLoop();

    return true;
  }

  // Discard all stacked paper levels without restoring any of them.
  // Call this when a completely new project is opened so that a stale
  // top-level paper from a previous project is never accidentally shown.
  function clearStack() {
    while (_paperStack.length > 0) {
      var saved = _paperStack.pop();
      try {
        saved.panAndZoom.destroy();
      } catch (e) {}
      saved.graph.clear();
      saved.paper.$el.remove();
    }
  }

  return {
    createPaper: createPaper,
    pushPaper: pushPaper,
    popPaper: popPaper,
    clearStack: clearStack,
    getPaperStackDepth: function () {
      return _paperStack.length;
    },
    getParentEntry: function () {
      return _paperStack.length > 0
        ? _paperStack[_paperStack.length - 1]
        : null;
    },
  };
};
