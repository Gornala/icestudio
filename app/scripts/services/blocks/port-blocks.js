//---------------------------------------------------------------------------
//-- Port block classes: PortBlock, InputPortBlock, OutputPortBlock
//---------------------------------------------------------------------------
'use strict';

(function () {
  var Block = window._iceblocks.Block;
  var BASIC_INPUT = window._iceblocks.BASIC_INPUT;
  var BASIC_OUTPUT = window._iceblocks.BASIC_OUTPUT;

  //-------------------------------------------------------------------------
  //-- Class: Port. Virtual class for representing both input and output
  //--              ports.
  //-------------------------------------------------------------------------
  class PortBlock extends Block {
    //-----------------------------------------------------------------------
    //-- Parameters:
    //--  * type: Select the type of PortBlock:
    //--    -BASIC_INPUT
    //--    -BASIC_OUTPUT
    //--  * name (String): Port name
    //--  * virtual (Bool): Type of pin. Real or Virtual
    //--          * true: It is a virtual port, inside the FPGA
    //--          * false: It is a pin, whichs connects the FPGA with the
    //--                   the experior
    //--  * range: A String indicating the bus range (if is is a bus)
    //--              Ex: "[1:0]"
    //--  * pins: Array of objects. Available Only if the port is a pin
    //--       -index: Position of the pin in the array (default 0)
    //--       -name: "" : Pin name (From the resources/boards/{board}
    //--                               /pinout.json) (Which comes from .pcf)
    //--       -value: "": Pin value (physical pin assigned by .pcf)
    //-----------------------------------------------------------------------
    constructor(type, name, virtual, range, pins) {
      //-- Build the block common fields
      super(type);
      //-- Particular information
      this.data.name = name; //-- Port name. A String
      this.data.virtual = virtual; //-- Type of port: Real or virtual
      this.data.range = range; //-- If the port is single or bus.
      //--  Ej. "[1:0]"
      this.data.pins = pins; //-- Only if the port is a pin
    }
  }

  //-------------------------------------------------------------------------
  //-- Class: Input port. The information comes from the outside and
  //--   get inside the FPGA
  //--
  //--   * Particular information:
  //--      -clock: (bool). If the port is a clock or not
  //--         * true: It is a clock signal
  //--         * false: Normal signal
  //--      -inout: (bool). If the port is inout or normal
  //--         * true: It is tri-state
  //--         * false: It is normal two-state
  //-------------------------------------------------------------------------
  class InputPortBlock extends PortBlock {
    constructor(
      name,
      virtual,
      range,
      pins,
      clock,
      inout = false,
      isParametric = false
    ) {
      //-- Build the port common fields
      super(BASIC_INPUT, name, virtual, range, pins);

      //-- Particular information
      this.data.clock = clock; //-- Optional. Is the port a clock input?
      this.data.inout = inout;
      this.data.isParametric = isParametric;
    }
  }

  //-------------------------------------------------------------------------
  //-- Class: Output port. The information goes from the FPGA to the
  //--        outside. Or from one block to another the upper level
  //--
  //--   * Particular information:
  //--      -inout: (bool). If the port is inout or normal
  //--         * true: It is tri-state
  //--         * false: It is normal two-state
  //-------------------------------------------------------------------------
  class OutputPortBlock extends PortBlock {
    constructor(name, virtual, range, pins, inout = false) {
      //-- Build the port common fields
      super(BASIC_OUTPUT, name, virtual, range, pins);

      //-- Particular information
      this.data.inout = inout;
    }
  }

  window._iceblocks.PortBlock = PortBlock;
  window._iceblocks.InputPortBlock = InputPortBlock;
  window._iceblocks.OutputPortBlock = OutputPortBlock;
})();
