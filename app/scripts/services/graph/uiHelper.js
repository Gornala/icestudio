//---------------------------------------------------------------------------
//-- uiHelper.js: Tooltips, alerts, ace-editor hide/show, cell box updates
//-- Loaded as a <script> tag before graph.js; exposes window._icegraph.uiHelper
//---------------------------------------------------------------------------
'use strict';

window._icegraph = window._icegraph || {};

window._icegraph.uiHelper = function (ctx) {
  //-- Throttled warning alert (4 s cooldown)
  function warning(message) {
    if (!ctx.paper.options.warningTimer) {
      ctx.paper.options.warningTimer = true;
      alertify.warning(message, 5);
      setTimeout(function () {
        ctx.paper.options.warningTimer = false;
      }, 4000);
    }
  }

  //-- Hide ace editors during zoom for performance
  var cacheEditors = [];
  function disableAceEditors() {
    cacheEditors = [];
    cacheEditors.push.apply(
      cacheEditors,
      document.querySelectorAll('.ace_editor')
    );
    requestAnimationFrame(function () {
      cacheEditors.forEach(function (editor) {
        editor.style.display = 'none';
      });
    });
  }

  //-- Show ace editors after zoom and update CSS custom properties
  function restoreAceEditors() {
    requestAnimationFrame(function () {
      cacheEditors.forEach(function (editor) {
        editor.style.display = 'block';
      });

      var baseGutterWidth = 50;
      var baseGutterPLeft = 19;
      var baseGutterPRight = 13;
      var newWidth = baseGutterWidth * ctx.state.zoom;
      var newPLeft = baseGutterPLeft * ctx.state.zoom;
      var newPRight = baseGutterPRight * ctx.state.zoom;

      document.documentElement.style.setProperty(
        '--gutter-width',
        newWidth + 'px'
      );
      document.documentElement.style.setProperty(
        '--gutter-padding-left',
        newPLeft + 'px'
      );
      document.documentElement.style.setProperty(
        '--gutter-padding-right',
        newPRight + 'px'
      );
      document.documentElement.style.setProperty(
        '--editor-content-scroller-left',
        newWidth + 'px'
      );
    });
  }

  //-- Batch-update cell bounding boxes using RAF to stay within frame budget
  var isUpdatingCells = false;
  function updateCellBoxes() {
    if (!isUpdatingCells) {
      isUpdatingCells = true;
      /* jshint ignore:start */
      var cells = ctx.graph.getCells().filter(function (cell) {
        return !cell.isLink();
      });
      if (ctx.selectionView.options.state !== ctx.state) {
        ctx.selectionView.options.state = ctx.state;
      }

      var viewCache = new Map();
      cells.forEach(function (cell) {
        viewCache.set(cell.id, ctx.paper.findViewByModel(cell));
      });

      ctx.graph.startBatch('batch-update');

      var index = 0;
      var batchSize = 50;

      function processBatch() {
        var startTime = performance.now();
        var maxTimePerFrame = 8;
        var endIdx = Math.min(index + batchSize, cells.length);
        var updates = [];

        for (
          ;
          index < endIdx && performance.now() - startTime < maxTimePerFrame;
          index++
        ) {
          var cell = cells[index];
          cell.set('state', ctx.state, { silent: true });
          updates.push(viewCache.get(cell.id));
        }

        updates.forEach(function (elementView) {
          elementView.updateBox();
          ctx.selectionView.updateBox(elementView.model);
        });

        if (index < cells.length) {
          requestAnimationFrame(processBatch);
        } else {
          ctx.graph.stopBatch('batch-update');
          ctx.graph.trigger('change');
          isUpdatingCells = false;
        }
      }
      requestAnimationFrame(processBatch);
      /* jshint ignore:end */
    }
  }

  //-- RAF loop: consume the pan/zoom queue and trigger cell box updates
  function loopUpdateBoxes() {
    if (!isUpdatingCells && ctx.queuePanZoom.length > 0) {
      ctx.queuePanZoom.length = 0;
      updateCellBoxes();
    }
    requestAnimationFrame(loopUpdateBoxes);
  }

  //-- Tooltip position for ace gutter error/warning marks
  function setupTooltipHandler() {
    document.body.addEventListener(
      'mouseenter',
      function (event) {
        if (
          event.target.classList.contains('ace_gutter-cell') &&
          (event.target.classList.contains('ace_error') ||
            event.target.classList.contains('ace_info') ||
            event.target.classList.contains('warning'))
        ) {
          var tgutter = parseFloat(
            document.defaultView
              .getComputedStyle(event.target)
              .getPropertyValue('top')
          );
          var hgutter = parseFloat(
            document.defaultView
              .getComputedStyle(event.target)
              .getPropertyValue('height')
          );
          var offset = parseFloat(hgutter / 2);
          var tooltipTopValue = tgutter + hgutter + offset;
          document.documentElement.style.setProperty(
            '--ace_tooltip-top',
            tooltipTopValue + 'px'
          );
        }
      },
      true
    );
  }

  //-- Remove error stickers from all code/generic/constant cells
  function resetCodeErrors() {
    var cells = ctx.graph.getCells();
    return new Promise(function (resolve) {
      _.each(cells, function (cell) {
        var cellView;
        if (cell.get('type') === 'ice.Code') {
          cellView = ctx.paper.findViewByModel(cell);
          cellView.$box.find('.code-content').removeClass('highlight-error');
          $('.sticker-error', cellView.$box).remove();
          cellView.clearAnnotations();
        } else if (cell.get('type') === 'ice.Generic') {
          cellView = ctx.paper.findViewByModel(cell);
          $('.sticker-error', cellView.$box).remove();
          cellView.$box.remove('.sticker-error').removeClass('highlight-error');
        } else if (cell.get('type') === 'ice.Constant') {
          cellView = ctx.paper.findViewByModel(cell);
          $('.sticker-error', cellView.$box).remove();
          cellView.$box.remove('.sticker-error').removeClass('highlight-error');
        }
      });
      resolve();
    });
  }

  //-- codeError event handler - highlight the offending cell
  function setupCodeErrorHandler() {
    $(document).on('codeError', function (evt, codeError) {
      var cells = ctx.graph.getCells();
      _.each(cells, function (cell) {
        var blockId, cellView;
        if (
          (codeError.blockType === 'code' && cell.get('type') === 'ice.Code') ||
          (codeError.blockType === 'constant' &&
            cell.get('type') === 'ice.Constant')
        ) {
          blockId = ctx.utils.digestId(cell.id);
        } else if (
          codeError.blockType === 'generic' &&
          cell.get('type') === 'ice.Generic'
        ) {
          blockId = ctx.utils.digestId(cell.attributes.blockType);
        }
        if (codeError.blockId === blockId) {
          cellView = ctx.paper.findViewByModel(cell);
          if (codeError.type === 'error') {
            if (cell.get('type') === 'ice.Code') {
              $('.sticker-error', cellView.$box).remove();
              cellView.$box
                .find('.code-content')
                .addClass('highlight-error')
                .append('<div class="sticker-error error-code-editor"></div>');
            } else {
              $('.sticker-error', cellView.$box).remove();
              cellView.$box
                .addClass('highlight-error')
                .append('<div class="sticker-error"></div>');
            }
          }
          if (cell.get('type') === 'ice.Code') {
            cellView.setAnnotation(codeError);
          }
        }
      });
    });
  }

  //-- Called once paper/graph/selectionView are ready
  function init() {
    setupTooltipHandler();
    setupCodeErrorHandler();
  }

  return {
    warning: warning,
    disableAceEditors: disableAceEditors,
    restoreAceEditors: restoreAceEditors,
    updateCellBoxes: updateCellBoxes,
    loopUpdateBoxes: loopUpdateBoxes,
    resetCodeErrors: resetCodeErrors,
    init: init,
  };
};
