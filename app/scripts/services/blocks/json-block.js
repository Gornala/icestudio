//---------------------------------------------------------------------------
//-- Class: JsonBlock. Represents a JSON parameter block
//---------------------------------------------------------------------------
'use strict';

(function () {
  var Block = window._iceblocks.Block;
  var BASIC_JSON = window._iceblocks.BASIC_JSON;

  //-------------------------------------------------------------------------
  //-- Class: JSON block. For reading/writing JSON parameter files
  //-- type 'output': reads JSON → exposes values as right-side ports
  //-- type 'input':  takes constant wires → writes them to a JSON file
  //-------------------------------------------------------------------------
  class JsonBlock extends Block {
    constructor(name, path, type, ports) {
      super(BASIC_JSON);
      this.size = { width: 192, height: 160 };
      this.data.name = name || '';
      this.data.path = path || '';
      this.data.type = type || 'output';
      this.data.ports = ports || [];
      this.data.content = '{}';
    }
  }

  window._iceblocks.JsonBlock = JsonBlock;
})();
