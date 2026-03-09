//---------------------------------------------------------------------------
//-- Label block classes: LabelBlock, InputLabelBlock, OutputLabelBlock
//---------------------------------------------------------------------------
'use strict';

(function () {
  var Block = window._iceblocks.Block;
  var BASIC_INPUT_LABEL = window._iceblocks.BASIC_INPUT_LABEL;
  var BASIC_OUTPUT_LABEL = window._iceblocks.BASIC_OUTPUT_LABEL;

  //-------------------------------------------------------------------------
  //-- Class: Label Block. Virtual class for representing both input and
  //--        output labels
  //-------------------------------------------------------------------------
  class LabelBlock extends Block {
    //-----------------------------------------------------------------
    //-- Parameters:
    //--  * type: Select the type of LabelBlock:
    //--      -BASIC_INPUT_LABEL
    //--      -BASIC_OUTPUT_LABEL
    //--  * name (String): Port name
    //--  * range: A String indicating the bus range (if is is a bus)
    //--              Ex: "[1:0]"
    //--  * color (String): Color name (in English). Ex: "fuchsia"
    //-----------------------------------------------------------------
    constructor(type, name, range, color, pins) {
      //-- Build the block common fields
      super(type);

      //-- Particular information
      this.data.name = name; //-- Label name
      this.data.range = range; //-- If the lable is single or bus.
      //--  Ej. "[1:0]"
      this.data.blockColor = color; //-- Label color
      this.data.virtual = true; //-- Labels are a kind of virtual pin
      this.data.pins = pins;
    }
  }

  //-------------------------------------------------------------------------
  //-- Class: Input Label Block. Class for representing input labels
  //-------------------------------------------------------------------------
  class InputLabelBlock extends LabelBlock {
    //-----------------------------------------------------------------
    //-- Parameters:
    //--  * name (String): label name
    //--  * range: A String indicating the bus range (if is is a bus)
    //--              Ex: "[1:0]"
    //--  * color (String): Color name (in English). Ex: "fuchsia"
    //-----------------------------------------------------------------
    constructor(name, range, color, pins) {
      //-- Build the port common fields
      super(BASIC_INPUT_LABEL, name, range, color, pins);

      //-- No particular information
    }
  }

  //-------------------------------------------------------------------------
  //-- Class: Output Label Block. Class for representing output labels
  //-------------------------------------------------------------------------
  class OutputLabelBlock extends LabelBlock {
    //-----------------------------------------------------------------
    //-- Parameters:
    //--  * name (String): label name
    //--  * range: A String indicating the bus range (if is is a bus)
    //--              Ex: "[1:0]"
    //--  * color (String): Color name (in English). Ex: "fuchsia"
    //-----------------------------------------------------------------
    constructor(name, range, color, pins) {
      //-- Build the port common fields
      super(BASIC_OUTPUT_LABEL, name, range, color, pins);

      //-- No particular information
    }
  }

  window._iceblocks.LabelBlock = LabelBlock;
  window._iceblocks.InputLabelBlock = InputLabelBlock;
  window._iceblocks.OutputLabelBlock = OutputLabelBlock;
})();
