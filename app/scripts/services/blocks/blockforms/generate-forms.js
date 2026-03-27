//---------------------------------------------------------------------------
//-- Generate frame form functions: new, load, and edit
//---------------------------------------------------------------------------
'use strict';

window._iceblockforms = window._iceblockforms || {};

window._iceblockforms.generateForms = function (ctx) {
  function newBasicGenerate(callback) {
    var form;
    try {
      form = new ctx.forms.FormBasicGenerate('', '', 4, '');
    } catch (e) {
      console.error('[generate-forms] FormBasicGenerate constructor error:', e);
      return;
    }
    $('.ajs-input').val('');

    form.display(function (evt) {
      form.process(evt);

      if (evt.cancel) {
        return;
      }

      var blockInstance = new ctx.blocks.GenerateBlock(
        addGenModes(form.inPortsInfo, form.genModes, 'direct'),
        addGenModes(form.outPortsInfo, form.genModes, 'iterative')
      );

      blockInstance.data.instanceCount = form.instanceCount;
      blockInstance.data.label = form.label;

      var cell = loadBasicGenerate(blockInstance);
      callback([cell]);
    });
  }

  function loadBasicGenerate(instance, disabled) {
    var port;
    var leftPorts = [];
    var rightPorts = [];
    var i, o;
    // Guard against missing data (e.g. old .ice files saved before generate support)
    if (!instance.data) {
      instance.data = {
        ports: { in: [], out: [] },
        instanceCount: 4,
        label: '',
      };
    }
    var m = instance.data.instanceCount || 4;

    for (i in instance.data.ports.in) {
      port = instance.data.ports.in[i];
      var genModeIn = port.genMode || 'direct';
      var portSize = port.size || 1;
      // iterable: external = user-defined size, internal = size / m (per-instance slice)
      // direct: both sides same size
      var extSizeIn = portSize;
      var intSizeIn =
        genModeIn === 'iterable'
          ? Math.max(1, Math.floor(portSize / m))
          : portSize;
      var extInRange = extSizeIn > 1 ? '[' + (extSizeIn - 1) + ':0]' : '';
      var intInRange = intSizeIn > 1 ? '[' + (intSizeIn - 1) + ':0]' : '';
      var inLabel =
        port.name + extInRange + ' (' + shortGenMode(genModeIn) + ')';
      // External port (outside left edge)
      leftPorts.push({
        id: port.name + '-ext',
        name: port.name + '-ext',
        label: inLabel,
        size: extSizeIn,
      });
      // Internal port (inside left edge)
      leftPorts.push({
        id: port.name + '-int',
        name: port.name + '-int',
        label: port.name + intInRange,
        size: intSizeIn,
      });
    }

    // Mux select width: ceil(log2(m))
    var muxSelWidth = Math.ceil(Math.log2(m));
    if (muxSelWidth < 1) {
      muxSelWidth = 1;
    }

    for (o in instance.data.ports.out) {
      port = instance.data.ports.out[o];
      var genModeOut = port.genMode || 'iterative';
      var outSize = port.size || 1;
      // iterative: user defines total bus (n*m), external = outSize, internal = outSize / m
      // or: both sides same size
      // muxed: both sides same size + extra mux select input on left border
      var extSizeOut, intSizeOut;
      if (genModeOut === 'iterative') {
        extSizeOut = outSize;
        intSizeOut = Math.max(1, Math.floor(outSize / m));
      } else {
        extSizeOut = outSize;
        intSizeOut = outSize;
      }
      var extOutRange = extSizeOut > 1 ? '[' + (extSizeOut - 1) + ':0]' : '';
      var intOutRange = intSizeOut > 1 ? '[' + (intSizeOut - 1) + ':0]' : '';
      var outLabel =
        port.name + extOutRange + ' (' + shortGenMode(genModeOut) + ')';
      // Internal port (inside right edge)
      rightPorts.push({
        id: port.name + '-int',
        name: port.name + '-int',
        label: port.name + intOutRange,
        size: intSizeOut,
      });
      // External port (outside right edge)
      rightPorts.push({
        id: port.name + '-ext',
        name: port.name + '-ext',
        label: outLabel,
        size: extSizeOut,
      });
      // Mux select input on the left border (ext = outside input, int = inside output)
      if (genModeOut === 'muxed') {
        var muxSelRange =
          muxSelWidth > 1 ? '[' + (muxSelWidth - 1) + ':0]' : '';
        var muxSelName = port.name + '_sel';
        leftPorts.push({
          id: muxSelName + '-ext',
          name: muxSelName + '-ext',
          label: muxSelName + muxSelRange + ' (mux)',
          size: muxSelWidth,
        });
        leftPorts.push({
          id: muxSelName + '-int',
          name: muxSelName + '-int',
          label: muxSelName + muxSelRange,
          size: muxSelWidth,
        });
      }
    }

    var cell = new ctx.joint.shapes.ice.Generate({
      id: instance.id,
      blockType: instance.type,
      data: instance.data,
      position: instance.position,
      size: instance.size,
      disabled: disabled,
      leftPorts: leftPorts,
      rightPorts: rightPorts,
      topPorts: [],
    });

    return cell;
  }

  function editBasicGenerate(cellView, callback) {
    var block = cellView.model.attributes;

    var inPortNames = '';
    var outPortNames = '';

    if (block.data.ports.in) {
      inPortNames = ctx.blocks.portsInfo2Str(block.data.ports.in);
    }
    if (block.data.ports.out) {
      outPortNames = ctx.blocks.portsInfo2Str(block.data.ports.out);
    }

    var form = new ctx.forms.FormBasicGenerate(
      inPortNames,
      outPortNames,
      block.data.instanceCount || 4,
      block.data.label || ''
    );

    // Pre-populate genMode in the grid after init
    var origInit = form.init.bind(form);
    form.init = function () {
      origInit();
      if (form._field7 && form._field7.table) {
        var gridData = form._field7.table.getData();
        var allPorts = (block.data.ports.in || []).concat(
          block.data.ports.out || []
        );
        for (var r = 0; r < gridData.length; r++) {
          var rowName = gridData[r][0];
          if (rowName) {
            for (var p = 0; p < allPorts.length; p++) {
              if (allPorts[p].name === rowName && allPorts[p].genMode) {
                form._field7.table.setValueFromCoords(
                  3,
                  r,
                  allPorts[p].genMode
                );
                break;
              }
            }
          }
        }
      }
      // Save initial genModes for change detection
      form._iniGenModes = {};
      var iniPorts = (block.data.ports.in || []).concat(
        block.data.ports.out || []
      );
      for (var ip = 0; ip < iniPorts.length; ip++) {
        if (iniPorts[ip].name && iniPorts[ip].genMode) {
          form._iniGenModes[iniPorts[ip].name] = iniPorts[ip].genMode;
        }
      }
    };

    form.display(function (evt) {
      form.process(evt);

      if (evt.cancel) {
        return;
      }

      if (!form.changed()) {
        return;
      }

      var blockInstance = new ctx.blocks.GenerateBlock(
        addGenModes(form.inPortsInfo, form.genModes, 'direct'),
        addGenModes(form.outPortsInfo, form.genModes, 'iterative')
      );

      blockInstance.position = block.position;
      blockInstance.size = block.size;
      blockInstance.id = block.id;
      blockInstance.data.instanceCount = form.instanceCount;
      blockInstance.data.label = form.label;

      var cell = loadBasicGenerate(blockInstance);

      if (cell) {
        var graph = cellView.paper.model;
        var connectedWires = graph.getConnectedLinks(cellView.model);

        graph.startBatch('change');
        cellView.model.remove();
        callback(cell);

        for (var w in connectedWires) {
          var wire = connectedWires[w];
          var size = wire.get('size');
          var source = wire.get('source');
          var target = wire.get('target');

          if (
            (source.id === cell.id &&
              containsPort(source.port, size, cell.get('rightPorts'))) ||
            (target.id === cell.id &&
              containsPort(target.port, size, cell.get('leftPorts')))
          ) {
            graph.addCell(wire);
          }
        }

        graph.stopBatch('change');

        ctx.resultAlert = alertify.success(
          ctx.gettextCatalog.getString('Block updated')
        );
      }
    });
  }

  function containsPort(port, size, ports) {
    for (var i in ports) {
      if (port === ports[i].name && size === ports[i].size) {
        return true;
      }
    }
    return false;
  }

  function addGenModes(portInfos, genModes, defaultMode) {
    if (!portInfos) {
      return [];
    }
    return portInfos.map(function (info) {
      var mode =
        genModes && genModes[info.name] ? genModes[info.name] : defaultMode;
      info.genMode = mode;
      return info;
    });
  }

  function shortGenMode(mode) {
    var map = {
      direct: 'dir',
      iterable: 'iter',
      iterative: 'iter',
      muxed: 'mux',
      or: 'or',
    };
    return map[mode] || mode;
  }

  return {
    newBasicGenerate: newBasicGenerate,
    loadBasicGenerate: loadBasicGenerate,
    editBasicGenerate: editBasicGenerate,
  };
};
