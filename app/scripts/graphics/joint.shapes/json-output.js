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

    // Collect wired values and write to data.path
    var doWrite = function (showAlert) {
      var graph = self.paper.model;
      var links = graph.getConnectedLinks(self.model, { inbound: true });
      var jsonObj = {};
      links.forEach(function (link) {
        var targetPort = link.get('target').port;
        var sourceCell = graph.getCell(link.get('source').id);
        if (
          sourceCell &&
          sourceCell.get('data') &&
          sourceCell.get('data').value !== undefined
        ) {
          jsonObj[targetPort] = sourceCell.get('data').value;
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
