//---------------------------------------------------------------------------
//-- Class: Block Object. It represents any graphical object in the circuit
//---------------------------------------------------------------------------
'use strict';

(function () {
  //-------------------------------------------------------------------------
  //-- Class: Block Object. It represent any graphical object in the
  //--        circuit
  //-------------------------------------------------------------------------
  class Block {
    //--------------------------------------------------
    //-- Information common to all blocks:
    //-- * type: Type of block:
    //--         -BASIC_INPUT
    //--         -BASIC_OUTPUT
    //--         -BASIC_INPUT_LABEL
    //--         -BASIC_OUTPUT_LABEL
    //--         -BASIC_PAIRED_LABELS
    //--         -BASIC_CODE
    //--         -BASIC_MEMORY
    //--         -BASIC_CONSTANT
    //--         -BASIC_INFO
    //--------------------------------------------------
    constructor(type) {
      //------- Object structure
      //-- Type of block
      this.type = type;

      //-- Unique Block identifier
      this.id = null;

      //-- Block data. Each block has its own data type
      this.data = {};

      //-- Block position
      this.position = {
        x: 0,
        y: 0,
      };
    }
  }

  window._iceblocks.Block = Block;
})();
