//-- jshint rules
/* jshint ignore: start */

'use strict';

// JSON Output block

joint.shapes.ice.JsonOutput = joint.shapes.ice.Model.extend({
  defaults: joint.util.deepSupplement(
    {
      type: 'ice.JsonOutput',
      z: 10,
      size: {
        width: 192,
        height: 160,
      },
    },
    joint.shapes.ice.Model.prototype.defaults
  ),
});

joint.shapes.ice.JsonOutputView = joint.shapes.ice.JsonView.extend({
  initialize: function () {
    joint.shapes.ice.JsonView.prototype.initialize.apply(this, arguments);
    this.$box.removeClass('json-block').addClass('json-output-block');

    // Replace the json_input reload button with a save button
    this.$box
      .find('.json-btn-reload')
      .removeClass('json-btn-reload')
      .addClass('json-btn-save')
      .attr('title', 'Save to file')
      .html('&#128190;');

    var self = this;
    var fs = require('fs');

    // Editor is always read-only for output blocks
    this.editor.setReadOnly(true);

    // Resolve the value for a source cell, following label connections
    // if the source is an outputLabel.
    var resolveValue = function (sourceCell, graph) {
      if (!sourceCell || !sourceCell.get('data')) {
        return undefined;
      }
      var data = sourceCell.get('data');
      // Direct value source (constant, memory, etc.)
      if (data.value !== undefined) {
        return data.value;
      }
      // Source is an output label — find the matching input label(s) by name
      var bt = sourceCell.get('blockType') || '';
      if (bt === 'basic.outputLabel') {
        var labelName = data.name;
        if (!labelName) {
          return undefined;
        }
        // Find input labels with the same name
        var allCells = graph.getCells();
        for (var i = 0; i < allCells.length; i++) {
          var c = allCells[i];
          if (c.isLink()) {
            continue;
          }
          var cbt = c.get('blockType') || '';
          if (cbt !== 'basic.inputLabel') {
            continue;
          }
          var cData = c.get('data') || {};
          if (cData.name !== labelName) {
            continue;
          }
          // Found matching input label — find what feeds into it
          var inLinks = graph.getConnectedLinks(c, { inbound: true });
          for (var j = 0; j < inLinks.length; j++) {
            var feeder = graph.getCell(inLinks[j].get('source').id);
            if (
              feeder &&
              feeder.get('data') &&
              feeder.get('data').value !== undefined
            ) {
              return feeder.get('data').value;
            }
          }
        }
      }
      return undefined;
    };

    // Collect wired values and write to data.path
    var doWrite = function (showAlert) {
      var graph = self.paper.model;
      var links = graph.getConnectedLinks(self.model, { inbound: true });
      var jsonObj = {};
      links.forEach(function (link) {
        var targetPort = link.get('target').port;
        var sourceCell = graph.getCell(link.get('source').id);
        var val = resolveValue(sourceCell, graph);
        if (val !== undefined) {
          jsonObj[targetPort] = val;
        }
      });
      var filepath = self.model.get('data').path;
      if (!filepath) {
        if (showAlert) {
          alertify.warning(
            'No file path configured. Double-click to configure.'
          );
        }
        return;
      }
      try {
        var content = JSON.stringify(jsonObj, null, 2) + '\n';
        fs.writeFileSync(filepath, content, 'utf8');
        self.model.attributes.data.content = content;
        self.updating = true;
        self.editor.session.setValue(content);
        setTimeout(function () {
          self.updating = false;
        }, 10);
        if (showAlert) {
          alertify.success('JSON saved: ' + filepath);
        }
      } catch (e) {
        console.warn('JSON output block: could not write ' + filepath, e);
        if (showAlert) {
          alertify.error('Could not save JSON: ' + e.message);
        }
      }
    };

    // 💾 button: write with user feedback
    this.$box
      .find('.json-btn-save')
      .off('click')
      .on('click', function () {
        doWrite(true);
      });

    // Also write when project is saved or verify/build/upload is triggered
    iceStudio.bus.events.subscribe('graph:writeJsonOutputs', function () {
      doWrite(false);
    });
  },

  update: function () {
    this.renderPorts();
    if (this.editor) {
      this.editor.setReadOnly(true);
    }
    joint.dia.ElementView.prototype.update.apply(this, arguments);
  },
});

/* jshint ignore: end */
