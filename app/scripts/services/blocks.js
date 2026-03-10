//---------------------------------------------------------------------------
//-- Module for working with Blocks
//-- Modules loaded from blocks/ directory via window._iceblocks
//---------------------------------------------------------------------------
'use strict';

angular.module('icestudio').service('blocks', function () {
  var _b = window._iceblocks;

  //-- Public classes
  this.Block = _b.Block;
  this.InputPortBlock = _b.InputPortBlock;
  this.OutputPortBlock = _b.OutputPortBlock;
  this.InputLabelBlock = _b.InputLabelBlock;
  this.OutputLabelBlock = _b.OutputLabelBlock;
  this.CodeBlock = _b.CodeBlock;
  this.MemoryBlock = _b.MemoryBlock;
  this.ConstantBlock = _b.ConstantBlock;
  this.InfoBlock = _b.InfoBlock;
  this.JsonBlock = _b.JsonBlock;
  this.JsonOutputBlock = _b.JsonOutputBlock;

  //-- Public functions
  this.getPins = _b.getPins;
  this.copyPins = _b.copyPins;
  this.getSize = _b.getSize;
  this.portsInfo2Str = _b.portsInfo2Str;

  //-- Public constants
  this.BASIC_INPUT = _b.BASIC_INPUT;
  this.BASIC_OUTPUT = _b.BASIC_OUTPUT;
  this.BASIC_INPUT_LABEL = _b.BASIC_INPUT_LABEL;
  this.BASIC_OUTPUT_LABEL = _b.BASIC_OUTPUT_LABEL;
  this.BASIC_PAIRED_LABELS = _b.BASIC_PAIRED_LABELS;
  this.BASIC_CODE = _b.BASIC_CODE;
  this.BASIC_MEMORY = _b.BASIC_MEMORY;
  this.BASIC_CONSTANT = _b.BASIC_CONSTANT;
  this.BASIC_INFO = _b.BASIC_INFO;
  this.BASIC_JSON = _b.BASIC_JSON;
  this.BASIC_JSON_OUTPUT = _b.BASIC_JSON_OUTPUT;
});
