//---------------------------------------------------------------------------
//-- Class: JsonInputBlock. Reads an external JSON file → exposes values as
//-- bottom output ports on the canvas.
//---------------------------------------------------------------------------
'use strict';

(function () {
  var Block = window._iceblocks.Block;
  var BASIC_JSON_INPUT = window._iceblocks.BASIC_JSON_INPUT;

  class JsonInputBlock extends Block {
    constructor(name, path, ports) {
      super(BASIC_JSON_INPUT);
      this.size = { width: 192, height: 160 };
      this.data.name = name || '';
      this.data.path = path || '';
      this.data.ports = ports || [];
      this.data.content = '{}';
    }
  }

  window._iceblocks.JsonInputBlock = JsonInputBlock;
})();
