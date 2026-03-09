//---------------------------------------------------------------------------
//-- Class: CodeBlock. Represents a Verilog code block
//---------------------------------------------------------------------------
'use strict';

(function () {
  var Block = window._iceblocks.Block;
  var BASIC_CODE = window._iceblocks.BASIC_CODE;

  //-------------------------------------------------------------------------
  //-- Class: Code block. Class for representing verilog block codes
  //-------------------------------------------------------------------------
  class CodeBlock extends Block {
    //-----------------------------------------------------------------------
    //-- INPUTS:
    //--   * inPortsInfo: Array of PortInfos
    //--   * outPortsInfo: Array of PortInfos
    //--   * inParamsInfo: Array of PortInfos
    //--   * inoutLeftPortsInfo: Optional Array of PortInfos
    //--   * inoutRightPortsInfo: Optional Array of PortInfos
    //--
    //--  PortInfos:
    //--    * name: String
    //--    * rangestr: String
    //--    * size: Integer
    //-----------------------------------------------------------------------
    constructor(
      inPortsInfo,
      outPortsInfo,
      inParamsInfo,
      inoutLeftPortsInfo,
      inoutRightPortsInfo
    ) {
      //-- Build the block common fields
      super(BASIC_CODE);

      //-- Block size
      this.size = {
        width: 384,
        height: 256,
      };

      //-- Block ports
      this.data.ports = {
        in: [],
        out: [],
        inoutLeft: [],
        inoutRight: [],
      };

      //-- Block input params
      this.data.params = [];

      //-- Block code
      this.data.code = '';

      //-- Insert the Input portInfo
      inPortsInfo.forEach((portInfo) => {
        let info = {
          name: portInfo.name,
          range: portInfo.rangestr,
          size: portInfo.size > 1 ? portInfo.size : undefined,
        };

        this.data.ports.in.push(info);
      });

      //-- Insert the Output portInfo
      outPortsInfo.forEach((portInfo) => {
        let info = {
          name: portInfo.name,
          range: portInfo.rangestr,
          size: portInfo.size > 1 ? portInfo.size : undefined,
        };

        this.data.ports.out.push(info);
      });

      //-- Insert the input params
      inParamsInfo.forEach((portInfo) => {
        let info = {
          name: portInfo.name,
          range: portInfo.rangestr,
          size: portInfo.size > 1 ? portInfo.size : undefined,
        };

        this.data.params.push(info);
      });

      //-- Insert the InputOutput portInfo, left and/or right
      if (inoutLeftPortsInfo) {
        inoutLeftPortsInfo.forEach((portInfo) => {
          let info = {
            name: portInfo.name,
            range: portInfo.rangestr,
            size: portInfo.size > 1 ? portInfo.size : undefined,
          };

          this.data.ports.inoutLeft.push(info);
        });
      }

      if (inoutRightPortsInfo) {
        inoutRightPortsInfo.forEach((portInfo) => {
          let info = {
            name: portInfo.name,
            range: portInfo.rangestr,
            size: portInfo.size > 1 ? portInfo.size : undefined,
          };

          this.data.ports.inoutRight.push(info);
        });
      }
    }
  }

  window._iceblocks.CodeBlock = CodeBlock;
})();
