//---------------------------------------------------------------------------
//-- Class: GenerateBlock. Represents a generate-for frame container
//---------------------------------------------------------------------------
'use strict';

(function () {
  var Block = window._iceblocks.Block;
  var BASIC_GENERATE = window._iceblocks.BASIC_GENERATE;

  //-------------------------------------------------------------------------
  //-- Class: GenerateBlock. A visual frame that wraps other blocks and
  //--        compiles to a Verilog generate-for construct.
  //--
  //-- Ports have a genMode field:
  //--   Inputs:  'direct' (shared to all instances) or 'iterable' (indexed)
  //--   Outputs: 'iterative' (array), 'muxed' (mux select), 'or' (OR reduce)
  //-------------------------------------------------------------------------
  class GenerateBlock extends Block {
    //-----------------------------------------------------------------------
    //-- INPUTS:
    //--   * inPortsInfo: Array of PortInfos (with genMode)
    //--   * outPortsInfo: Array of PortInfos (with genMode)
    //--
    //--  PortInfos:
    //--    * name: String
    //--    * rangestr: String
    //--    * size: Integer
    //--    * genMode: String ('direct'|'iterable'|'iterative'|'muxed'|'or')
    //-----------------------------------------------------------------------
    constructor(inPortsInfo, outPortsInfo) {
      //-- Build the block common fields
      super(BASIC_GENERATE);

      //-- Block size (large default for framing other blocks)
      this.size = {
        width: 600,
        height: 400,
      };

      //-- Instance count (number of generate iterations)
      this.data.instanceCount = 4;

      //-- Block ports
      this.data.ports = {
        in: [],
        out: [],
      };

      //-- Block label
      this.data.label = '';

      //-- Insert the Input portInfo
      if (inPortsInfo) {
        inPortsInfo.forEach(function (portInfo) {
          var info = {
            name: portInfo.name,
            range: portInfo.rangestr,
            size: portInfo.size > 1 ? portInfo.size : undefined,
            genMode: portInfo.genMode || 'direct',
          };
          this.data.ports.in.push(info);
        }, this);
      }

      //-- Insert the Output portInfo
      if (outPortsInfo) {
        outPortsInfo.forEach(function (portInfo) {
          var info = {
            name: portInfo.name,
            range: portInfo.rangestr,
            size: portInfo.size > 1 ? portInfo.size : undefined,
            genMode: portInfo.genMode || 'iterative',
          };
          this.data.ports.out.push(info);
        }, this);
      }
    }
  }

  window._iceblocks.GenerateBlock = GenerateBlock;
})();
