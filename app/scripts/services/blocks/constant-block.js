//---------------------------------------------------------------------------
//-- Class: ConstantBlock. Represents a constant parameter block
//---------------------------------------------------------------------------
'use strict';

(function () {
  var Block = window._iceblocks.Block;
  var BASIC_CONSTANT = window._iceblocks.BASIC_CONSTANT;

  //-------------------------------------------------------------------------
  //-- Class for representing constant parameters
  //-------------------------------------------------------------------------
  class ConstantBlock extends Block {
    //-----------------------------------------------------------------------
    //-- INPUTS:
    //--   * name (String): Constant block name
    //--   * value (String): Default constant value
    //--   * local (Bool): If the parameter is global or local:
    //--       * true: Local parameter
    //--       * false: Global parameter
    //-----------------------------------------------------------------------
    constructor(name = '', value = '', local = false) {
      //-- Build the block common fields
      super(BASIC_CONSTANT);

      //-- Name
      this.data.name = name;

      //-- Constant value
      this.data.value = value;

      //-- Local parameter
      this.data.local = local;
    }
  }

  window._iceblocks.ConstantBlock = ConstantBlock;
})();
