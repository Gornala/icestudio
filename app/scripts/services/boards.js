'use strict';

//---------------------------------------------------------------------------

//-- Boards
//---------------------------------------------------------------------------
//-- CONFIGURATION FILES
//---------------------------------------------------------------------------
//-- The Boards are described by three .json files, located in the folder
//-- resources/boards/boardname
//--    * pinout.json:  Pin numbers, names and type (input, output, inout)
//--    * info.json: Board information: resources, board name, interface...
//--    * rules.json: Automatic connection of unused pins
//--
//-- In addition there are two more OPTIONAL files:
//--    * pinout.pcf (optional): Board constraints. This is just for
//--      documentation purposes (the actual constraint file is automatically
//--      generated on the fly when the circuit is being sinthesized)
//--    * pinout.svg (optional): Drawing of all the pins
//----------------------------------------------------------------------------
//-- DATA STRUCTURES
//----------------------------------------------------------------------------
//-- ICESTUDIO converts the .json files into objects. You can access to all
//-- the boars from the following GLOBAL OBJECT:
//--
//--  common.boards
//--     * name:  Board name. Ex. alhmabra_ii
//--     * info:  Resources
//--     * pinout: Pin names, number and type
//--     * rules:  If the pin is automatically connected if not used
//--     * type:   FPGA familty and type

//---------------------------------------------------------------
//-- MENU menu.json
//-- This file contains the names of all the available boards
//-- Only the boards located in that file are READ and inserted
//-- into the common.boards GLOBAL object
//---------------------------------------------------------------

angular
  .module('icestudio')
  .service('boards', function (utils, common, nodeFs, nodePath) {
    //-- Default board
    const DEFAULT = 'alhambra-ii';

    //-----------------------------------------------------------------
    //-- Patch apio resource files with custom board entries.
    //-- This ensures custom boards survive apio reinstalls/updates.
    //-- Reads from ~/.icestudio/custom-boards/custom-boards.json
    //-- and merges entries into the live apio resource files.
    //-----------------------------------------------------------------
    this.patchApioResources = function () {
      var customBoardsFile = nodePath.join(
        common.CUSTOM_BOARDS_DIR,
        'custom-boards.json'
      );

      //-- Nothing to do if no custom boards exist
      if (!nodeFs.existsSync(customBoardsFile)) {
        return;
      }

      var apioResDir = common.getApioResourcesDir();
      if (!apioResDir) {
        console.warn('patchApioResources: apio resources dir not found');
        return;
      }

      var customBoards;
      try {
        customBoards = JSON.parse(
          nodeFs.readFileSync(customBoardsFile, 'utf8')
        );
      } catch (e) {
        console.error(
          'patchApioResources: failed to read custom-boards.json',
          e
        );
        return;
      }

      var boardIds = Object.keys(customBoards);
      if (boardIds.length === 0) {
        return;
      }

      //-- Patch boards.json
      try {
        var apioBoardsPath = nodePath.join(apioResDir, 'boards.json');
        var apioBoards = JSON.parse(
          nodeFs.readFileSync(apioBoardsPath, 'utf8')
        );
        boardIds.forEach(function (id) {
          if (customBoards[id].apio && customBoards[id].apio.board) {
            apioBoards[id] = customBoards[id].apio.board;
          }
        });
        nodeFs.writeFileSync(
          apioBoardsPath,
          JSON.stringify(apioBoards, null, 2)
        );
      } catch (e) {
        console.error('patchApioResources: failed to patch boards.json', e);
      }

      //-- Patch fpgas.json (only for boards that define new FPGAs)
      try {
        var apioFpgasPath = nodePath.join(apioResDir, 'fpgas.json');
        var apioFpgas = JSON.parse(nodeFs.readFileSync(apioFpgasPath, 'utf8'));
        boardIds.forEach(function (id) {
          if (customBoards[id].apio && customBoards[id].apio.fpga) {
            var fpgaEntry = customBoards[id].apio.fpga;
            apioFpgas[fpgaEntry.id] = fpgaEntry.data;
          }
        });
        nodeFs.writeFileSync(apioFpgasPath, JSON.stringify(apioFpgas, null, 2));
      } catch (e) {
        console.error('patchApioResources: failed to patch fpgas.json', e);
      }

      //-- Patch programmers.json (only for boards with new programmers)
      try {
        var apioProgrammersPath = nodePath.join(apioResDir, 'programmers.json');
        var apioProgrammers = JSON.parse(
          nodeFs.readFileSync(apioProgrammersPath, 'utf8')
        );
        boardIds.forEach(function (id) {
          if (customBoards[id].apio && customBoards[id].apio.programmer) {
            var progEntry = customBoards[id].apio.programmer;
            apioProgrammers[progEntry.id] = progEntry.data;
          }
        });
        nodeFs.writeFileSync(
          apioProgrammersPath,
          JSON.stringify(apioProgrammers, null, 2)
        );
      } catch (e) {
        console.error(
          'patchApioResources: failed to patch programmers.json',
          e
        );
      }

      //-- Patch apio menu.json
      try {
        var apioMenuPath = nodePath.join(apioResDir, 'menu.json');
        var apioMenu = JSON.parse(nodeFs.readFileSync(apioMenuPath, 'utf8'));
        boardIds.forEach(function (id) {
          var family = customBoards[id].family;
          if (!family) {
            return;
          }
          var familyEntry = apioMenu.find(function (f) {
            return f.type === family;
          });
          if (familyEntry) {
            if (familyEntry.boards.indexOf(id) === -1) {
              familyEntry.boards.push(id);
            }
          } else {
            apioMenu.push({ type: family, boards: [id] });
          }
        });
        nodeFs.writeFileSync(apioMenuPath, JSON.stringify(apioMenu, null, 2));
      } catch (e) {
        console.error('patchApioResources: failed to patch apio menu.json', e);
      }

      console.log(
        'patchApioResources: patched ' + boardIds.length + ' custom board(s)'
      );
    };

    //-----------------------------------------------------------------
    //-- Sync custom board directories into icestudio's resources/boards/
    //-- Copies board files (info.json, pinout.json, pinout.pcf/lpf, rules.json)
    //-- from ~/.icestudio/custom-boards/{boardId}/ to resources/boards/{boardId}/
    //-- Also updates the icestudio menu.json
    //-----------------------------------------------------------------
    this.syncCustomBoardDirs = function () {
      var customBoardsFile = nodePath.join(
        common.CUSTOM_BOARDS_DIR,
        'custom-boards.json'
      );

      if (!nodeFs.existsSync(customBoardsFile)) {
        return;
      }

      var customBoards;
      try {
        customBoards = JSON.parse(
          nodeFs.readFileSync(customBoardsFile, 'utf8')
        );
      } catch (e) {
        console.error(
          'syncCustomBoardDirs: failed to read custom-boards.json',
          e
        );
        return;
      }

      var boardIds = Object.keys(customBoards);
      if (boardIds.length === 0) {
        return;
      }

      var iceBoardsDir = nodePath.join('resources', 'boards');
      var iceMenuPath = nodePath.join(iceBoardsDir, 'menu.json');

      //-- Read icestudio menu.json
      var iceMenu;
      try {
        iceMenu = JSON.parse(nodeFs.readFileSync(iceMenuPath, 'utf8'));
      } catch (e) {
        console.error(
          'syncCustomBoardDirs: failed to read icestudio menu.json',
          e
        );
        return;
      }

      boardIds.forEach(function (boardId) {
        var srcDir = nodePath.join(common.CUSTOM_BOARDS_DIR, boardId);
        var destDir = nodePath.join(iceBoardsDir, boardId);

        if (!nodeFs.existsSync(srcDir)) {
          return;
        }

        //-- Create destination directory if needed
        if (!nodeFs.existsSync(destDir)) {
          nodeFs.mkdirSync(destDir, { recursive: true });
        }

        //-- Copy board files
        var filesToCopy = ['info.json', 'pinout.json', 'rules.json'];
        //-- Also copy constraint files if they exist
        ['pinout.pcf', 'pinout.lpf'].forEach(function (f) {
          if (nodeFs.existsSync(nodePath.join(srcDir, f))) {
            filesToCopy.push(f);
          }
        });

        filesToCopy.forEach(function (filename) {
          var srcFile = nodePath.join(srcDir, filename);
          if (!nodeFs.existsSync(srcFile)) {
            return;
          }
          var destFile = nodePath.join(destDir, filename);
          //-- Only write if content differs (avoids triggering grunt watch)
          var srcContent = nodeFs.readFileSync(srcFile);
          var destContent = nodeFs.existsSync(destFile)
            ? nodeFs.readFileSync(destFile)
            : null;
          if (!destContent || !srcContent.equals(destContent)) {
            nodeFs.writeFileSync(destFile, srcContent);
          }
        });

        //-- Update icestudio menu.json
        var family = customBoards[boardId].family;
        if (family) {
          var familyEntry = iceMenu.find(function (f) {
            return f.type === family;
          });
          if (familyEntry) {
            if (familyEntry.boards.indexOf(boardId) === -1) {
              familyEntry.boards.push(boardId);
            }
          } else {
            iceMenu.push({ type: family, boards: [boardId] });
          }
        }
      });

      //-- Only write menu.json if content actually changed
      //-- Writing unconditionally triggers grunt watch → infinite restart loop
      try {
        var newMenuContent = JSON.stringify(iceMenu, null, 2);
        var existingMenuContent = '';
        try {
          existingMenuContent = nodeFs.readFileSync(iceMenuPath, 'utf8');
        } catch (e2) {}
        if (newMenuContent !== existingMenuContent) {
          nodeFs.writeFileSync(iceMenuPath, newMenuContent);
        }
      } catch (e) {
        console.error(
          'syncCustomBoardDirs: failed to write icestudio menu.json',
          e
        );
      }

      console.log(
        'syncCustomBoardDirs: synced ' + boardIds.length + ' custom board(s)'
      );
    };

    //-----------------------------------------------------------------
    //-- Read all the boards FILES and store all the information
    //-- in the GLOBAL OBJECT: common.boards
    //-----------------------------------------------------------------
    //-- Only the boards located in the menu.json FILE are READ
    //-----------------------------------------------------------------
    this.loadBoards = function () {
      //-- First, sync custom boards into place
      this.syncCustomBoardDirs();
      this.patchApioResources();

      let boards = [];

      //-- Construct the Boards path: "resources/boards"
      let path = nodePath.join('resources', 'boards');

      //-- Read the board menu json file and convert into an object
      let menu = nodeFs.readFileSync(nodePath.join(path, 'menu.json'));
      menu = JSON.parse(menu);

      //-- The menu is divided in big sections: The FPGA family:
      //-- ICE40HX8k, ICE40HX4k, ICE40LPHX, UP5K, ECP5...
      menu.forEach((FPGAfamily) => {
        //-- Access to all the boards from the current family
        FPGAfamily.boards.forEach(function (boardname) {
          //-- The data from every board is located in the
          //-- folder "resources/boards/<boardname>"
          let boardPath = nodePath.join(path, boardname);

          //-- Every board should have at least their three MANDATORY files:
          //-- info.json, pinout.json and rules.
          //------------------------------------------------------------------
          //-- TODO: It can be improved: It is better to distinguis between
          //--  different errors, instead only one. If anyone
          //--  introduces a bad board, it is difficult to find where is
          //--  the error....
          //------------------------------------------------------------------
          try {
            if (
              nodeFs.statSync(boardPath).isDirectory() &&
              nodeFs.statSync(nodePath.join(boardPath, 'info.json')).isFile() &&
              nodeFs
                .statSync(nodePath.join(boardPath, 'pinout.json'))
                .isFile() &&
              nodeFs.statSync(nodePath.join(boardPath, 'rules.json')).isFile()
            ) {
              //-- Board files ok. READ them!!
              let info = readJSONFile(boardPath, 'info.json');
              let pinout = readJSONFile(boardPath, 'pinout.json');
              let rules = readJSONFile(boardPath, 'rules.json');

              //-- Fill the boards structure will all the information
              //-- obtained from the files
              boards.push({
                name: boardname,
                info: info, //-- Board resources
                pinout: pinout, //-- Board pins
                rules: rules, //-- Board rules
                type: FPGAfamily.type, //-- FPGA family type
              });
            }

            //-- There was an error reading the board files
          } catch (error) {
            console.error('Board not well configured', error.message);
          }
        });
      });

      //-- The boards are available through the GLOBAL OBJECT common.boards
      common.boards = boards;
    };

    //-----------------------------------------------------------------
    //-- Reload boards and update Angular UI
    //-- Called after custom board wizard saves changes
    //-----------------------------------------------------------------
    this.reloadBoards = function () {
      this.loadBoards();
      utils.rootScopeSafeApply();
    };

    //---- PENDING: DOCUMENTATION!!!!!!

    function readJSONFile(filepath, filename) {
      var ret = {};
      try {
        var data = nodeFs.readFileSync(nodePath.join(filepath, filename));
        ret = JSON.parse(data);
      } catch (err) {}
      return ret;
    }

    this.selectBoard = function (name) {
      name = name || DEFAULT;
      var i;
      var selectedBoard = null;
      for (i in common.boards) {
        if (common.boards[i].name === name) {
          selectedBoard = common.boards[i];
          break;
        }
      }
      if (selectedBoard === null) {
        // Board not found: select default board
        for (i in common.boards) {
          if (common.boards[i].name === DEFAULT) {
            selectedBoard = common.boards[i];
            break;
          }
        }
      }
      common.selectedBoard = selectedBoard;
      common.pinoutInputHTML = generateHTMLOptions(
        common.selectedBoard.pinout,
        'input'
      );
      common.pinoutOutputHTML = generateHTMLOptions(
        common.selectedBoard.pinout,
        'output'
      );
      utils.rootScopeSafeApply();
      return common.selectedBoard;
    };

    this.boardLabel = function (name) {
      for (var i in common.boards) {
        if (common.boards[i].name === name) {
          return common.boards[i].info.label;
        }
      }
      return name;
    };

    function generateHTMLOptions(pinout, type) {
      var code = '<option></option>';
      for (var i in pinout) {
        if (pinout[i].type === type || pinout[i].type === 'inout') {
          code +=
            '<option value="' +
            pinout[i].value +
            '">' +
            pinout[i].name +
            '</option>';
        }
      }
      return code;
    }
  });
