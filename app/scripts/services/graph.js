//== JSHINT rules / START
/* global _icegraph */
//== JSHINT rules / END

//----------------------------------------------------------------------------
//-- GRAPH: Circuit drawing — orchestrator
//-- Sub-modules (loaded as <script> tags before this file) expose factories
//-- via window._icegraph.*; each factory receives the shared ctx object.
//----------------------------------------------------------------------------

'use strict';

//-- JointJS Graph instance (module-level for joint.js custom shapes access)
let graph = null;

//-- JointJS Paper instance
let paper = null;
let state = false;
let queuePanZoom = [];
angular.module('icestudio').service(
  'graph',
  function (
    $rootScope,

    //-- Access to the JointJS API
    //-- More infor: https://www.npmjs.com/package/jointjs
    //-- Tutorial: https://resources.jointjs.com/tutorial/
    joint,
    blocks,
    boards,
    blockforms,
    profile,
    utils,
    common,
    gettextCatalog,
    nodeDebounce,

    //-- NWjs: Main window object
    //-- More info: https://docs.nwjs.io/en/latest/References/Window/
    window
  ) {
    //-- Track mouse position with RAF throttling
    let mousePosition = { x: 0, y: 0 };
    let needsUpdate = true;

    document.addEventListener('mousemove', function (event) {
      if (needsUpdate) {
        needsUpdate = false;
        requestAnimationFrame(function () {
          mousePosition.x = event.pageX;
          mousePosition.y = event.pageY;
          needsUpdate = true;
        });
      }
    });

    //-- ZOOM constants
    const ZOOM_MAX = 4;
    const ZOOM_MIN = 0.1;
    const ZOOM_SENS = 0.3;
    const ZOOM_INI = 1.0;

    //-- Circuit layout constants
    const CIRCUIT_MARGIN = 33;
    const MENU_FOOTER_HEIGHT = 93;

    //-- View State: initial values
    const VIEWSTATE_INIT = {
      pan: { x: 0, y: 0 },
      zoom: ZOOM_INI,
      forceMutate: false,
    };

    state = utils.clone(VIEWSTATE_INIT);
    state.mutateZoom = false;

    let self = this;
    this.breadcrumbs = [{ name: '', type: '' }];
    this.addingDraggableBlock = false;

    //--------------------------------------------------------------------------
    //-- Shared context — passed to every sub-module factory
    //--------------------------------------------------------------------------
    var ctx = {
      // Mutable JointJS instances (populated by canvasPaper.createPaper)
      graph: null,
      paper: null,
      panAndZoom: null,
      selection: null,
      selectionView: null,
      commandManager: null,

      // Shared mutable state
      state: state,
      z: { index: 100 },
      mousePosition: mousePosition,
      queuePanZoom: queuePanZoom,
      gridsize: 8,
      prevLowerBlock: null,

      // Service self-reference (for addingDraggableBlock, breadcrumbs, etc.)
      service: self,

      // Angular-injected services
      $rootScope: $rootScope,
      joint: joint,
      blocks: blocks,
      boards: boards,
      blockforms: blockforms,
      profile: profile,
      utils: utils,
      common: common,
      gettextCatalog: gettextCatalog,
      nodeDebounce: nodeDebounce,
      window: window,

      // Constants
      ZOOM_MAX: ZOOM_MAX,
      ZOOM_MIN: ZOOM_MIN,
      ZOOM_SENS: ZOOM_SENS,
      ZOOM_INI: ZOOM_INI,
      CIRCUIT_MARGIN: CIRCUIT_MARGIN,
      MENU_FOOTER_HEIGHT: MENU_FOOTER_HEIGHT,
      VIEWSTATE_INIT: VIEWSTATE_INIT,
    };

    //--------------------------------------------------------------------------
    //-- Initialize modules
    //--------------------------------------------------------------------------
    var _viewState = _icegraph.viewState(ctx);
    var _wireLogic = _icegraph.wireLogic(ctx);
    var _uiHelper = _icegraph.uiHelper(ctx);
    var _dataManager = _icegraph.dataManager(ctx);
    var _cellManager = _icegraph.cellManager(ctx);
    var _fileIO = _icegraph.fileIO(ctx);
    // interactions + canvasPaper are initialized inside createPaper()

    //-- Wire cross-module references into ctx so modules can call each other
    ctx.warning = _uiHelper.warning;
    ctx.disableAceEditors = _uiHelper.disableAceEditors;
    ctx.restoreAceEditors = _uiHelper.restoreAceEditors;
    ctx.uiHelperInit = _uiHelper.init;
    ctx.loopUpdateBoxes = _uiHelper.loopUpdateBoxes;

    ctx.updateCellAttributes = _cellManager.updateCellAttributes;
    ctx.addCell = _cellManager.addCell;
    ctx.disableSelected = _cellManager.disableSelected;
    ctx.hasSelection = _cellManager.hasSelection;

    ctx.validateConnection = _wireLogic.validateConnection;
    ctx.__updateWiresOnObstacles = _wireLogic.__updateWiresOnObstacles;
    ctx.updatePortDefault = _wireLogic.updatePortDefault;
    ctx.getInsertIndex = _wireLogic.getInsertIndex;
    ctx.wireLogicLpSyncWireGroup = _wireLogic.lpSyncWireGroup;

    ctx.graphToCells = _fileIO.graphToCells;
    ctx.graphOrigin = _fileIO.graphOrigin;
    ctx.pushCodeBlockToCollection = _fileIO.pushCodeBlockToCollection;

    ctx.setState = _viewState.setState;
    ctx.fitContent = _viewState.fitContent;

    //--------------------------------------------------------------------------
    //-- Public API — delegated to sub-modules
    //--------------------------------------------------------------------------

    //-- viewState
    this.getState = _viewState.getState;
    this.setState = _viewState.setState;
    this.resetView = _viewState.resetView;
    this.isEmpty = _viewState.isEmpty;
    this.fitPaper = _viewState.fitPaper;
    this.fitContent = _viewState.fitContent;

    //-- wireLogic
    this.updateWires = async function () {
      await _wireLogic.updateWiresOnObstacles();
    };
    this.setBoardRules = _dataManager.setBoardRules;

    //-- dataManager
    this.resetBreadcrumbs = _dataManager.resetBreadcrumbs;
    this.selectBoard = _dataManager.selectBoard;
    this.setBlockInfo = _dataManager.setBlockInfo;
    this.setInfo = _dataManager.setInfo;
    this.selectLanguage = _dataManager.selectLanguage;

    //-- cellManager
    this.undo = _cellManager.undo;
    this.redo = _cellManager.redo;
    this.clearAll = _cellManager.clearAll;
    this.appEnable = _cellManager.appEnable;
    this.isEnabled = _cellManager.isEnabled;
    this.createBlock = _cellManager.createBlock;
    this.createBasicBlock = _cellManager.createBasicBlock;
    this.addDraggableCell = _cellManager.addDraggableCell;
    this.addDraggableCells = _cellManager.addDraggableCells;
    this.setCells = _cellManager.setCells;
    this.editLabelBlock = _cellManager.editLabelBlock;
    this.triggerDblClick = _cellManager.triggerDblClick;
    this.renameWire = _cellManager.renameWire;
    this.lpHighlightCells = _cellManager.lpHighlightCells;
    this.lpClearHighlight = _cellManager.lpClearHighlight;
    this.updateCellData = _cellManager.updateCellData;
    this.updateCellPin = _cellManager.updateCellPin;
    this.resetCommandStack = _cellManager.resetCommandStack;
    this.cutSelected = _cellManager.cutSelected;
    this.copySelected = _cellManager.copySelected;
    this.pasteSelected = _cellManager.pasteSelected;
    this.pasteAndCloneSelected = _cellManager.pasteAndCloneSelected;
    this.duplicateSelected = _cellManager.duplicateSelected;
    this.removeSelected = _cellManager.removeSelected;
    this.selectAll = _cellManager.selectAll;
    this.stepLeft = _cellManager.stepLeft;
    this.stepUp = _cellManager.stepUp;
    this.stepRight = _cellManager.stepRight;
    this.stepDown = _cellManager.stepDown;

    //-- fileIO
    this.toJSON = _fileIO.toJSON;
    this.getCells = _fileIO.getCells;
    this.loadDesign = _fileIO.loadDesign;
    this.isTopLevel = _fileIO.isTopLevel;
    this.convertIOtoTop = _fileIO.convertIOtoTop;
    this.appendDesign = _fileIO.appendDesign;

    //-- uiHelper
    this.resetCodeErrors = _uiHelper.resetCodeErrors;

    //--------------------------------------------------------------------------
    //-- createPaper — delegates to canvasPaper module
    //-- Called once from the design controller to initialise the JointJS canvas
    //--------------------------------------------------------------------------
    this.createPaper = function (element) {
      var _canvasPaper = _icegraph.canvasPaper(ctx);
      _canvasPaper.createPaper(element, self);

      //-- Keep module-level vars in sync (used by joint.js custom shapes)
      graph = ctx.graph;
      paper = ctx.paper;
    };
  }
);
