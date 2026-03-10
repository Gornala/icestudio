//---------------------------------------------------------------------------
//-- Functions for creating and editing icestudio blocks using forms
//-- Modules loaded from blocks/blockforms/ directory via window._iceblockforms
//---------------------------------------------------------------------------
'use strict';

angular.module('icestudio').service(
  'blockforms',
  function (
    //-- Access to the JointJS API
    //-- More infor: https://www.npmjs.com/package/jointjs
    //-- Tutorial: https://resources.jointjs.com/tutorial/
    joint,

    forms, //-- Create and display forms for user inputs

    utils,
    blocks,
    common,
    gettextCatalog,
    sparkMD5
  ) {
    //-- Shared context passed to all submodules
    var ctx = {
      joint: joint,
      forms: forms,
      utils: utils,
      blocks: blocks,
      common: common,
      gettextCatalog: gettextCatalog,
      sparkMD5: sparkMD5,
      gridsize: 8,
      resultAlert: null,
    };

    //-- Init submodules
    var _portForms = window._iceblockforms.portForms(ctx);
    var _labelForms = window._iceblockforms.labelForms(ctx);
    var _codeForms = window._iceblockforms.codeForms(ctx);
    var _memConstForms = window._iceblockforms.memoryConstantForms(ctx);
    var _infoForms = window._iceblockforms.infoForms(ctx);
    var _jsonForms = window._iceblockforms.jsonForms(ctx);
    var _jsonOutputForms = window._iceblockforms.jsonOutputForms(ctx);
    var _genericWireForms = window._iceblockforms.genericWireForms(ctx);

    //-- Wire cross-module references into ctx
    //-- (read at call-time, so set after init is fine)
    ctx.loadBasic = loadBasic;
    ctx.loadBasicCode = _codeForms.loadBasicCode;
    ctx.loadBasicConstant = _memConstForms.loadBasicConstant;
    ctx.loadBasicMemory = _memConstForms.loadBasicMemory;
    ctx.loadBasicInfo = _infoForms.loadBasicInfo;
    ctx.changeLabelBlock = _labelForms.changeLabelBlock;
    ctx.loadGeneric = _genericWireForms.loadGeneric;

    //-- Public API
    this.newBasic = newBasic;
    this.newGeneric = _genericWireForms.newGeneric;

    this.loadBasic = loadBasic;
    this.loadGeneric = _genericWireForms.loadGeneric;
    this.loadWire = _genericWireForms.loadWire;

    this.editBasic = editBasic; // this is double clicking
    this.editBasicLabel = _labelForms.editBasicLabel; // this is from "label-Finder"

    //-------------------------------------------------------------------------
    //-- Create a new Basic Block. A form is displayed for the user to
    //-- enter the data of the block
    //--
    //-- Inputs:
    //--   * type: Type of Basic block:
    //--     -BASIC_INPUT --> Input port
    //--     -BASIC_OUTPUT --> Output port
    //--     -BASIC_OUTPUT_LABEL
    //--     -BASIC_INPUT_LABEL
    //--     -BASIC_CONSTANT
    //--     -BASIC_MEMORY
    //--     -BASIC_CODE
    //--     -BASIC_INFO
    //--
    //--   * callback(cells): The function is called when the user clic on
    //--      the OK button and all the data is ok.
    //--      -cells: Array of blocks passed as arguments
    //-------------------------------------------------------------------------
    function newBasic(type, allowInoutPorts, callback) {
      let name = ''; //-- Port name by default
      let clock = false; //-- Clock checkbox not checked by default
      let inoutDefault;
      let form;

      //-- If inside a module, the FPGA-pin option is disabled
      let disabled = common.isEditingSubmodule;

      //-- The pins are always virtual
      let virtual = disabled;

      //-- Create the block by calling the corresponding function
      //-- according to the given type
      switch (type) {
        //-- Input port
        case blocks.BASIC_INPUT:
          //-- InOut-pin option is present or not, and if present, it defaults to false
          if (allowInoutPorts) {
            inoutDefault = false;
          }

          form = new forms.FormBasicInput(
            name,
            virtual,
            clock,
            disabled,
            inoutDefault
          );
          _portForms.newBasicPort(form, callback);
          break;

        //-- Output port
        case blocks.BASIC_OUTPUT:
          //-- InOut-pin option is present or not, and if present, it defaults to false
          if (allowInoutPorts) {
            inoutDefault = false;
          }

          form = new forms.FormBasicOutput(
            name,
            virtual,
            disabled,
            inoutDefault
          );
          _portForms.newBasicPort(form, callback);
          break;

        //-- Output label
        case blocks.BASIC_OUTPUT_LABEL:
          form = new forms.FormBasicOutputLabel();
          _labelForms.newBasicLabel(form, callback);
          break;

        //-- Input label
        case blocks.BASIC_INPUT_LABEL:
          form = new forms.FormBasicInputLabel();
          _labelForms.newBasicLabel(form, callback);
          break;

        //-- Paired Labels
        case blocks.BASIC_PAIRED_LABELS:
          form = new forms.FormBasicPairedLabels();
          _labelForms.newBasicPairedLabels(form, callback);
          break;

        //-- Constant parameter block
        case blocks.BASIC_CONSTANT:
          _memConstForms.newBasicConstant2(callback);
          break;

        case blocks.BASIC_MEMORY:
          _memConstForms.newBasicMemory2(callback);
          break;

        //-- Code block
        case blocks.BASIC_CODE:
          _codeForms.newBasicCode(callback);
          break;

        case blocks.BASIC_INFO:
          _infoForms.newBasicInfo(callback);
          break;

        case blocks.BASIC_JSON:
          _jsonForms.newBasicJson(callback);
          break;

        case blocks.BASIC_JSON_OUTPUT:
          _jsonOutputForms.newBasicJsonOutput(callback);
          break;

        default:
          break;
      }
    }

    //-------------------------------------------------------------------------
    //-- Load a Basic block instance onto the canvas
    //-------------------------------------------------------------------------
    function loadBasic(instance, disabled) {
      switch (instance.type) {
        case blocks.BASIC_INPUT:
          return _portForms.loadBasicInput(instance, disabled);

        case blocks.BASIC_OUTPUT:
          return _portForms.loadBasicOutput(instance, disabled);

        case blocks.BASIC_OUTPUT_LABEL:
          return _labelForms.loadBasicOutputLabel(instance, disabled);

        case blocks.BASIC_INPUT_LABEL:
          return _labelForms.loadBasicInputLabel(instance, disabled);

        case blocks.BASIC_CONSTANT:
          return _memConstForms.loadBasicConstant(instance, disabled);

        case blocks.BASIC_MEMORY:
          return _memConstForms.loadBasicMemory(instance, disabled);

        case blocks.BASIC_CODE:
          return _codeForms.loadBasicCode(instance, disabled);

        case blocks.BASIC_INFO:
          return _infoForms.loadBasicInfo(instance, disabled);

        case blocks.BASIC_JSON:
          return _jsonForms.loadBasicJson(instance, disabled);

        case blocks.BASIC_JSON_OUTPUT:
          return _jsonOutputForms.loadBasicJsonOutput(instance, disabled);

        default:
          break;
      }
    }

    //-----------------------------------------------------------------------
    //-- Edit a Basic Block
    //--
    //-- INPUTS:
    //--   * type: Type of Basic Block
    //--   * cellView: Access to the graphics library
    //--   * callback: Function to call when the block is Edited
    //-----------------------------------------------------------------------
    function editBasic(type, allowInoutPorts, cellView, callback) {
      //-- Get information from the joint graphics library
      let block = cellView.model.attributes;

      //-- Get the input port data
      let name = block.data.name + (block.data.range || '');
      let virtual = block.data.virtual;
      let clock = block.data.clock;
      let inoutValue;
      let form;
      let color = block.data.blockColor;

      //-- If inside a module, the FPGA-pin option is disabled
      let disabled = common.isEditingSubmodule;

      //-- Inside a module the pins are always virtual
      if (common.isEditingSubmodule) {
        virtual = true;
      }

      //-- InOut-pin option is present or not
      if (allowInoutPorts) {
        inoutValue =
          typeof block.data.inout === 'undefined' ? false : !!block.data.inout;
      }

      //-- Call the corresponding function depending on the type of block
      switch (type) {
        //-- Input port
        case blocks.BASIC_INPUT:
          //-- Build the form, and pass the actual block data
          form = new forms.FormBasicInput(
            name,
            virtual,
            clock,
            disabled,
            inoutValue
          );
          _portForms.editBasicPort(form, cellView, callback);
          break;

        //-- Output port
        case blocks.BASIC_OUTPUT:
          //-- Build the form, and pass the actual block data
          form = new forms.FormBasicOutput(name, virtual, disabled, inoutValue);
          _portForms.editBasicPort(form, cellView, callback);
          break;

        //-- Output Label
        case blocks.BASIC_OUTPUT_LABEL:
          //-- Build the form, and pass the actual block data
          form = new forms.FormBasicOutputLabel(name, color);
          _labelForms.editBasicLabel2(form, cellView, callback);
          break;

        //-- Input Label
        case blocks.BASIC_INPUT_LABEL:
          //-- Build the form, and pass the actual block data
          form = new forms.FormBasicInputLabel(name, color);
          _labelForms.editBasicLabel2(form, cellView, callback);
          break;

        case blocks.BASIC_CONSTANT:
          _memConstForms.editBasicConstant(cellView);
          break;

        case blocks.BASIC_MEMORY:
          _memConstForms.editBasicMemory(cellView);
          break;

        case blocks.BASIC_CODE:
          _codeForms.editBasicCode(allowInoutPorts, cellView, callback);
          break;

        case blocks.BASIC_INFO:
          _infoForms.editBasicInfo(cellView);
          break;

        case blocks.BASIC_JSON:
          _jsonForms.editBasicJson(cellView, callback);
          break;

        case blocks.BASIC_JSON_OUTPUT:
          _jsonOutputForms.editBasicJsonOutput(cellView, callback);
          break;

        default:
          break;
      }
    }
  }
);
