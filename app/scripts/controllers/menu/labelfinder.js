'use strict';

//-- Label Finder popup — search, highlight and replace wire-label blocks
//-- Loaded as a <script> tag before menu.js; exposes window._icemenu.labelfinder

window._icemenu = window._icemenu || {};
window._icemenu.labelfinder = {
  init: function ($scope, deps) {
    var utils = deps.utils;
    var common = deps.common;
    var graph = deps.graph;
    var blocks = deps.blocks;
    var gettextCatalog = deps.gettextCatalog;

    //-- Private state
    var foundItems = 0;
    var actualItem = 0;
    var itemList = [];
    var itemHtmlList = [];
    var optionCase = false;
    var optionExact = false;
    var advanced = false;
    var colorDropdown = false;

    //-- Public scope function (called from shortcuts + menu.html)
    $scope.showLabelFinder = function () {
      showLabelFinder();
    };

    //-- Key bindings for the label finder panel
    $('body').keydown(function (e) {
      if (e.which === 13 && $('.lFinder-popup').hasClass('lifted') === false) {
        $scope.fitContent();
        findItems();
      }
      if (e.which === 37 && $('.lFinder-popup').hasClass('lifted') === false) {
        prevItem();
      }
      if (e.which === 39 && $('.lFinder-popup').hasClass('lifted') === false) {
        nextItem();
      }
      if (e.which === 9 && $('.lFinder-popup').hasClass('lifted') === false) {
        toggleAdvancedTab();
      }
    });

    $(document).on('mousedown', '.lFinder-advanced--toggle', function () {
      toggleAdvancedTab();
    });

    $(document).on('input', '.lFinder-field', function () {
      $scope.fitContent();
      findItems();
    });

    $(document).on('mousedown', '.lFinder-find', function () {
      $scope.fitContent();
      findItems();
    });

    $(document).on('mousedown', '.lFinder-prev', function () {
      prevItem();
    });

    $(document).on('mousedown', '.lFinder-next', function () {
      nextItem();
    });

    $(document).on('mousedown', '.lFinder-case--option', function () {
      optionCase = !optionCase;
      if (optionCase === true) {
        $('.lFinder-case--option').addClass('on');
      } else {
        $('.lFinder-case--option').removeClass('on');
      }
      findItems();
    });

    $(document).on('mousedown', '.lFinder-exact--option', function () {
      optionExact = !optionExact;
      if (optionExact === true) {
        $('.lFinder-exact--option').addClass('on');
      } else {
        $('.lFinder-exact--option').removeClass('on');
      }
      findItems();
    });

    $(document).on('mousedown', '.lFinder-close', function () {
      showLabelFinder();
    });

    $(document).on('mousedown', '.lFinder-replace--name', function () {
      replaceLabelName();
      findItems();
    });

    $(document).on('mousedown', '.lFinder-change--color', function () {
      changeLabelColor();
    });

    $(document).on('mousedown', '.lFinder-replace--all', function () {
      for (let i = 1; i <= foundItems; i++) {
        actualItem = i;
        replaceLabelName();
      }
    });

    $(document).on('mousedown', '.lf-dropdown-title', function () {
      toggleColorDropdown();
    });

    $(document).on('mouseleave', '.lf-dropdown-menu', function () {
      if (colorDropdown === true) {
        toggleColorDropdown();
      }
    });

    $(document).on('mousedown', '.lf-dropdown-option', function () {
      let selected = this;
      $('.lf-dropdown-title').html(
        '<span class="lf-selected-color color-' +
          selected.dataset.color +
          '" data-color="' +
          selected.dataset.color +
          '"></span>' +
          selected.dataset.name +
          '<span class="lf-dropdown-icon"></span>'
      );
      toggleColorDropdown();
    });

    function showLabelFinder() {
      if ($('.lFinder-popup').hasClass('lifted')) {
        $('.lFinder-popup').removeClass('lifted');
        $('.lFinder-field').focus();
      } else {
        $('.lFinder-popup').addClass('lifted');
        $('.lFinder-field').focusout();
        $('.lFinder-field').val('');
        $('.highlight').removeClass('highlight');
        $('.greyedout').removeClass('greyedout');
        if (advanced === true) {
          advanced = false;
          $('.lFinder-advanced--toggle').removeClass('on');
          $('.lFinder-advanced').removeClass('show');
        }
        findItems();
      }
    }

    function toggleAdvancedTab() {
      advanced = !advanced;
      if (advanced === true) {
        $('.lFinder-advanced--toggle').addClass('on');
        $('.lFinder-advanced').addClass('show');
      } else {
        $('.lFinder-advanced--toggle').removeClass('on');
        $('.lFinder-advanced').removeClass('show');
        if (colorDropdown === true) {
          toggleColorDropdown();
        }
      }
    }

    function toggleColorDropdown() {
      if (colorDropdown === true) {
        colorDropdown = false;
        $('.lf-dropdown-menu').removeClass('show');
      } else {
        colorDropdown = true;
        $('.lf-dropdown-menu').addClass('show');
      }
    }

    function findItems() {
      $('.highlight').removeClass('highlight');
      $('.greyedout').removeClass('greyedout');
      let searchName = $('.lFinder-field').val();
      let parsedSearch = utils.parsePortLabel(
        searchName,
        common.PATTERN_PORT_LABEL
      );

      let reName = null;
      if (parsedSearch && parsedSearch.name) {
        reName = new RegExp(parsedSearch.name, 'i');
        if (optionCase === true && optionExact === false) {
          reName = new RegExp(parsedSearch.name);
        } else if (optionCase === false && optionExact === true) {
          reName = new RegExp('\\b' + parsedSearch.name + '\\b', 'i');
        } else if (optionCase === true && optionExact === true) {
          reName = new RegExp('\\b' + parsedSearch.name + '\\b');
        }
      } else {
        if (searchName.length > 0) {
          alertify.warning(gettextCatalog.getString('Invalid search name!'));
        }
      }

      foundItems = 0;
      actualItem = 0;
      itemList = [];
      itemHtmlList = [];
      let graphCells = graph.getCells();
      let htmlCells = $('.io-virtual-content');
      let htmlIoBlocks = $('.io-block');

      for (let i = 0; i < graphCells.length; i++) {
        if (
          graphCells[i].attributes.blockType === blocks.BASIC_INPUT_LABEL ||
          graphCells[i].attributes.blockType === blocks.BASIC_OUTPUT_LABEL
        ) {
          if (
            parsedSearch &&
            parsedSearch.name.length > 0 &&
            graphCells[i].attributes.data.name.match(reName) !== null
          ) {
            for (let j = 0; j < htmlIoBlocks.length; j++) {
              if (
                htmlIoBlocks[j].dataset.blkid === graphCells[i].attributes.id
              ) {
                itemList.push(graphCells[i]);
                itemHtmlList.push(htmlCells[j]);
              }
            }
          }
        }
      }

      foundItems = itemHtmlList.length;
      if (foundItems > 0) {
        for (let k = 0; k < htmlCells.length; k++) {
          htmlCells[k].classList.add('greyedout');
        }
        for (let n = 0; n < foundItems; n++) {
          itemHtmlList[n].classList.remove('greyedout');
        }
      }
      $('.items-found').html(actualItem + '/' + foundItems);
      nextItem();
    }

    function prevItem() {
      $('.highlight').removeClass('highlight');
      actualItem--;
      if (foundItems === 0) {
        actualItem = 0;
      } else {
        if (actualItem < 1) {
          actualItem = foundItems;
        }
        showMatchedItem();
      }
      $('.items-found').html(actualItem + '/' + foundItems);
    }

    function nextItem() {
      $('.highlight').removeClass('highlight');
      actualItem++;
      if (foundItems === 0) {
        actualItem = 0;
      } else {
        if (actualItem > foundItems) {
          actualItem = 1;
        }
        showMatchedItem();
      }
      $('.items-found').html(actualItem + '/' + foundItems);
    }

    function showMatchedItem() {
      itemHtmlList[actualItem - 1]
        .querySelector('.header')
        .classList.add('highlight');
    }

    function replaceLabelName() {
      let newName = $('.lFinder-name--field').val();
      let parsedNewName = utils.parsePortLabel(
        newName,
        common.PATTERN_PORT_LABEL
      );

      if (parsedNewName && parsedNewName.name) {
        if (actualItem > 0 && newName.length > 0) {
          let matchName = $('.lFinder-field').val();
          if (optionCase === false) {
            matchName = new RegExp(matchName, 'i');
          }
          let actualName =
            itemHtmlList[actualItem - 1].querySelector(
              '.header label'
            ).innerHTML;

          let iBus = actualName.indexOf('[');
          if (iBus > 0) {
            actualName = actualName.slice(0, iBus);
          }

          newName = actualName.replace(matchName, newName);
          graph.editLabelBlock(
            itemList[actualItem - 1].attributes.id,
            newName,
            itemList[actualItem - 1].attributes.data.blockColor
          );
        }
      } else {
        if (newName.length > 0) {
          alertify.warning(gettextCatalog.getString('Invalid new name!'));
        }
      }
    }

    function changeLabelColor() {
      let newColor = $('.lf-selected-color').data('color');
      if (actualItem > 0 && newColor.length > 0) {
        graph.editLabelBlock(
          itemList[actualItem - 1].attributes.id,
          itemList[actualItem - 1].attributes.data.name,
          newColor
        );
      }
    }
  },
};
