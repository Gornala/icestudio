//---------------------------------------------------------------------------
//-- Class: InfoBlock. Represents an info/documentation block
//---------------------------------------------------------------------------
'use strict';

(function () {
  var Block = window._iceblocks.Block;
  var BASIC_INFO = window._iceblocks.BASIC_INFO;

  //-------------------------------------------------------------------------
  //-- Class for representing an Info block
  //-------------------------------------------------------------------------
  class InfoBlock extends Block {
    constructor() {
      //-- Build the block common fields
      super(BASIC_INFO);

      this.data.info = '';
      this.data.readonly = false;

      //-- Block size
      this.size = {
        width: 192,
        height: 128,
      };
    }
  }

  window._iceblocks.InfoBlock = InfoBlock;
})();
