//---------------------------------------------------------------------------
//-- Class: MemoryBlock. Represents a memory parameter block
//---------------------------------------------------------------------------
'use strict';

(function () {
  var Block = window._iceblocks.Block;
  var BASIC_MEMORY = window._iceblocks.BASIC_MEMORY;

  //-------------------------------------------------------------------------
  //-- Class: Memory block. Class for representing memory parameters
  //-------------------------------------------------------------------------
  class MemoryBlock extends Block {
    //-----------------------------------------------------------------------
    //-- INPUTS:
    //--   * name (String): Memory block name
    //--   * list (String): Initial memory contents
    //--   * local (Bool): If the parameter is global or local:
    //--       * true: Local parameter
    //--       * false: Global parameter
    //--   * format (integer): Format of the memory contents:
    //--       - 2: Binary
    //--       - 10: Decimal
    //--       - 16: Hexadecimal
    //-----------------------------------------------------------------------
    constructor(name = '', list = '', local = false, format = 10) {
      //-- Build the block common fields
      super(BASIC_MEMORY);

      //-- Block size
      this.size = {
        width: 20 * 8,
        height: 22 * 8,
      };

      //-- Name
      this.data.name = name;

      //-- List
      this.data.list = list;

      //-- Local parameter
      this.data.local = local;

      //-- Format
      this.data.format = format;
    }
  }

  window._iceblocks.MemoryBlock = MemoryBlock;
})();
