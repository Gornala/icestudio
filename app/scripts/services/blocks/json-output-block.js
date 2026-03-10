//---------------------------------------------------------------------------
//-- Class: JsonOutputBlock. Represents a JSON Output block
//---------------------------------------------------------------------------
'use strict';

(function () {
  var Block = window._iceblocks.Block;
  var BASIC_JSON_OUTPUT = window._iceblocks.BASIC_JSON_OUTPUT;

  //-------------------------------------------------------------------------
  //-- Class: JSON Output block.
  //-- Reads JSON content from embedded editor → exposes values as right-side
  //-- output ports (Verilog parameters). Also writes content to data.path
  //-- on build/verify.
  //-------------------------------------------------------------------------
  class JsonOutputBlock extends Block {
    constructor(name, path, ports) {
      super(BASIC_JSON_OUTPUT);
      this.size = { width: 192, height: 160 };
      this.data.name = name || '';
      this.data.path = path || '';
      this.data.ports = ports || [];
      this.data.content = '{}';
    }
  }

  window._iceblocks.JsonOutputBlock = JsonOutputBlock;
})();
