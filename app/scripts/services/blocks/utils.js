//---------------------------------------------------------------------------
//-- Utility functions for working with block pin data
//---------------------------------------------------------------------------
'use strict';

(function () {
  //-----------------------------------------------------------------------
  //-- Return an array with empty pins
  //-- Empty pins have both name and value properties set to "NULL"
  //-- * INPUT:
  //--    -portInfo: Port information structure
  //-- * Returns:
  //--    -An array of pins
  //-----------------------------------------------------------------------
  function getPins(portInfo) {
    //-- The output array of pins. Initially empty
    let pins = [];

    for (let i = 0; i < portInfo.size; i++) {
      pins.push({
        index: (portInfo.size - 1 - i).toString(),
        name: 'NULL',
        value: 'NULL', //-- Pin value
      });
    }

    return pins;
  }

  //-------------------------------------------------------------------------
  //-- Copy the pins from the source object to the target object
  //--
  //-- INPUTS:
  //--   * pinsSrc: Array of source pins
  //--   * pinsDst: Array of destination pins
  //--
  //-- Both arrays can have different sizes
  //-- The numer of pins to copy is, therefore the minimal length
  //-- of the arrays
  //-------------------------------------------------------------------------
  function copyPins(pinsSrc, pinsDest) {
    //-- If pinsSrc is not defined, there is nothing
    //-- to copy
    if (!pinsSrc) {
      return;
    }

    //-- Get the target and destination lengths
    let dlen = pinsDest.length || 0;
    let slen = pinsSrc.length || 0;

    //-- Calculate the minimum size
    let min = Math.min(dlen, slen);

    //-- Copy the pins (only min pins are copied)
    //-- The copy starts from the highest pins to the lowest
    for (let i = 0; i < min; i++) {
      pinsDest[dlen - 1 - i].name = pinsSrc[slen - 1 - i].name;
      pinsDest[dlen - 1 - i].value = pinsSrc[slen - 1 - i].value;
    }
  }

  //-------------------------------------------------------------------------
  //-- Get the number of poin of the given port block (input or output)
  //--
  //-- INPUTS:
  //--   * portBlock: Input or output port block
  //--
  //-- RETURNS:
  //--   -The size in pins
  //-------------------------------------------------------------------------
  function getSize(portBlock) {
    //-- Size by default
    let size = 1;

    //-- If there exist pins, the size is the number of pins
    if (portBlock.data.pins) {
      size = portBlock.data.pins.length;
    }

    //-- Return the portBlock size
    return size;
  }

  //-----------------------------------------------------------------------
  //-- Convert an array of portsInfo to a String
  //-- Ej. portsInfo --> "a,b[1:0],c"
  //--
  //-- INPUTS:
  //--   * An array of portsInfo
  //--
  //-- RETURNS:
  //--   * A string with the names and range string separated by commas
  //-----------------------------------------------------------------------
  function portsInfo2Str(portsInfo) {
    let portNamesArray = [];
    //-- Get the portnames as an Array
    portsInfo.forEach((port) => {
      let range = port.range || port.rangestr || '';
      let name = port.name + range;

      portNamesArray.push(name);
    });

    //-- Convert the portnames as strings
    let portsNameStr = portNamesArray.join(',');

    //-- Return the string
    return portsNameStr;
  }

  window._iceblocks.getPins = getPins;
  window._iceblocks.copyPins = copyPins;
  window._iceblocks.getSize = getSize;
  window._iceblocks.portsInfo2Str = portsInfo2Str;
})();
