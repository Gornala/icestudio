'use strict';

//-- Edit menu callbacks + view/tool shortcuts
//-- Loaded as a <script> tag before menu.js; exposes window._icemenu.edit

window._icemenu = window._icemenu || {};
window._icemenu.edit = {
  init: function ($scope, deps) {
    var graph = deps.graph;
    var checkGraph = deps.checkGraph;

    $scope.undoGraph = function () {
      graph.undo();
    };

    $scope.redoGraph = function () {
      graph.redo();
    };

    $scope.cutSelected = function () {
      graph.cutSelected();
    };

    $scope.copySelected = function () {
      graph.copySelected();
    };

    var paste = true;

    $scope.pasteSelected = function () {
      if (paste) {
        paste = false;
        graph.pasteSelected();
        setTimeout(function () {
          paste = true;
        }, 250);
      }
    };

    var pasteAndClone = true;

    $scope.pasteAndCloneSelected = function () {
      if (pasteAndClone) {
        pasteAndClone = false;
        graph.pasteAndCloneSelected();
        setTimeout(function () {
          pasteAndClone = true;
        }, 250);
      }
    };

    $scope.duplicateSelected = function () {
      graph.duplicateSelected();
    };

    $scope.removeSelected = function () {
      graph.removeSelected();
    };

    $scope.selectAll = function () {
      checkGraph()
        .then(function () {
          graph.selectAll();
        })
        .catch(function () {});
    };

    $scope.fitContent = function () {
      graph.fitContent();
    };

    $scope.launchIceRok = function () {
      iceStudio.bus.events.publish('pluginManager.launch', 'icerok');
    };

    $scope.launchSerialTerminal = function () {
      iceStudio.bus.events.publish('pluginManager.launch', 'serial-term');
    };

    $scope.launchZConfigurator = function () {
      iceStudio.bus.events.publish('pluginManager.launch', 'zconfigurator');
    };

    $scope.launchPluginExample = function () {
      iceStudio.bus.events.publish('pluginManager.launch', 'example-plugin');
    };
  },
};
