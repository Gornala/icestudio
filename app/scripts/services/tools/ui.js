/**
 * ui.js - UI helpers for tools service
 * Alerts, progress bars, notifications, spinner state
 */
'use strict';

window._icetools = window._icetools || {};

window._icetools.ui = function (ctx) {
  function updateProgress(message, value) {
    $('#progress-message').text(message);
    var bar = $('#progress-bar');
    if (value === 100) {
      bar.removeClass('progress-bar-striped active');
    }
    bar.text(value + '%');
    bar.attr('aria-valuenow', value);
    bar.css('width', value + '%');
  }

  function initProgress() {
    $('#progress-bar')
      .addClass('notransition progress-bar-info progress-bar-striped active')
      .removeClass('progress-bar-danger')
      .text('0%')
      .attr('aria-valuenow', 0)
      .css('width', '0%')
      .removeClass('notransition');
  }

  function closeToolchainAlert() {
    ctx.toolchainAlert.callback();
    ctx.toolchainAlert.close();
  }

  function setupDriversAlert() {
    if (ctx.common.showDrivers()) {
      var message = ctx.gettextCatalog.getString(
        'Click here to <b>setup the drivers</b>'
      );
      if (!ctx.infoAlert) {
        setTimeout(function () {
          ctx.infoAlert = alertify.message(message, 30);
          ctx.infoAlert.callback = function (isClicked) {
            ctx.infoAlert = null;
            if (isClicked) {
              if (ctx.resultAlert) {
                ctx.resultAlert.dismiss(false);
              }
              ctx.$rootScope.$broadcast('enableDrivers');
            }
          };
        }, 1000);
      }
    }
  }

  function toolchainNotInstalledAlert(message) {
    if (ctx.resultAlert) {
      ctx.resultAlert.dismiss(false);
    }
    ctx.resultAlert = alertify.warning(
      message +
        '.<br>' +
        ctx.gettextCatalog.getString('Click here to install it'),
      99999
    );
    ctx.resultAlert.callback = function (isClicked) {
      if (isClicked) {
        ctx.$rootScope.$broadcast('installToolchain');
      }
    };
  }

  function installationStatus() {
    ctx.utils.disableKeyEvents();
    ctx.utils.disableClickEvents();
    $('body').addClass('waiting');
  }

  function restoreStatus() {
    ctx.utils.enableKeyEvents();
    ctx.utils.enableClickEvents();
    $('body').removeClass('waiting');
  }

  return {
    updateProgress: updateProgress,
    initProgress: initProgress,
    closeToolchainAlert: closeToolchainAlert,
    setupDriversAlert: setupDriversAlert,
    toolchainNotInstalledAlert: toolchainNotInstalledAlert,
    installationStatus: installationStatus,
    restoreStatus: restoreStatus,
  };
};
