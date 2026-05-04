//---------------------------------------------------------------------------
//-- Class: InfoFrameBlock. A documentation-only coloured frame for grouping
//--        blocks on the canvas. No ports, not compiled.
//---------------------------------------------------------------------------
'use strict';

(function () {
  var Block = window._iceblocks.Block;
  var BASIC_INFO_FRAME = window._iceblocks.BASIC_INFO_FRAME;

  class InfoFrameBlock extends Block {
    constructor(label, color) {
      super(BASIC_INFO_FRAME);

      this.size = {
        width: 400,
        height: 300,
      };

      this.data.label = label || '';
      this.data.blockColor = color || 'fuchsia';
    }
  }

  window._iceblocks.InfoFrameBlock = InfoFrameBlock;
})();
