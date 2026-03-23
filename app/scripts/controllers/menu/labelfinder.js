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
      var finderFocused = $('.lFinder-field').is(':focus');
      if (e.which === 13 && finderFocused) {
        $scope.fitContent();
        findItems();
      }
      if (e.which === 37 && finderFocused) {
        prevItem();
      }
      if (e.which === 39 && finderFocused) {
        nextItem();
      }
      if (e.which === 9 && finderFocused) {
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
      for (var i = 1; i <= foundItems; i++) {
        actualItem = i;
        replaceLabelName();
      }
      findItems();
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
      var selected = this;
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
      if ($('.lFinder-field').is(':focus')) {
        $('.lFinder-field').blur();
        $('.lFinder-field').val('');
        $('.highlight').removeClass('highlight');
        $('.greyedout').removeClass('greyedout');
        if (advanced === true) {
          advanced = false;
          $('.lFinder-advanced--toggle').removeClass('on');
          $('.lFinder-advanced').removeClass('show');
        }
        findItems();
      } else {
        $('.lFinder-field').focus();
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

    function escapeRegExp(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function findItems() {
      $('.highlight').removeClass('highlight');
      $('.greyedout').removeClass('greyedout');
      var searchName = $.trim($('.lFinder-field').val());

      var reName = null;
      if (searchName.length > 0) {
        var escaped = escapeRegExp(searchName);
        var flags = optionCase ? '' : 'i';
        var pattern = optionExact ? '\\b' + escaped + '\\b' : escaped;
        reName = new RegExp(pattern, flags);
      }

      foundItems = 0;
      actualItem = 0;
      itemList = [];
      itemHtmlList = [];
      var graphCells = graph.getCells();
      var htmlCells = $('.io-virtual-content');
      var htmlIoBlocks = $('.io-block');

      for (var i = 0; i < graphCells.length; i++) {
        if (
          graphCells[i].attributes.blockType === blocks.BASIC_INPUT_LABEL ||
          graphCells[i].attributes.blockType === blocks.BASIC_OUTPUT_LABEL
        ) {
          if (
            reName !== null &&
            graphCells[i].attributes.data.name.match(reName) !== null
          ) {
            for (var j = 0; j < htmlIoBlocks.length; j++) {
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
        for (var k = 0; k < htmlCells.length; k++) {
          htmlCells[k].classList.add('greyedout');
        }
        for (var n = 0; n < foundItems; n++) {
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
      var newName = $.trim($('.lFinder-name--field').val());
      if (newName.length === 0) {
        alertify.warning(
          gettextCatalog.getString('Enter a new name in the replace field')
        );
        return;
      }
      if (actualItem === 0) {
        alertify.warning(
          gettextCatalog.getString('No label selected — search first')
        );
        return;
      }

      var parsedNewName = utils.parsePortLabel(
        newName,
        common.PATTERN_PORT_LABEL
      );
      if (!parsedNewName || !parsedNewName.name) {
        alertify.warning(gettextCatalog.getString('Invalid new name!'));
        return;
      }

      var searchText = $.trim($('.lFinder-field').val());
      var flags = optionCase ? '' : 'i';
      var escaped = escapeRegExp(searchText);
      var pattern = optionExact ? '\\b' + escaped + '\\b' : escaped;
      var matchRe = new RegExp(pattern, flags);

      try {
        var cell = itemList[actualItem - 1];
        var currentName = cell.attributes.data.name;
        var replacedName = currentName.replace(matchRe, parsedNewName.name);
        graph.editLabelBlock(
          cell.attributes.id,
          replacedName,
          cell.attributes.data.blockColor
        );
      } catch (e) {
        alertify.error('Replace failed: ' + e.message);
      }
    }

    function changeLabelColor() {
      var newColor = $('.lf-selected-color').data('color');
      if (!newColor || foundItems === 0) {
        alertify.warning(
          gettextCatalog.getString('Search for labels first, then change color')
        );
        return;
      }
      try {
        for (var i = 0; i < foundItems; i++) {
          graph.editLabelBlock(
            itemList[i].attributes.id,
            itemList[i].attributes.data.name,
            newColor
          );
        }
      } catch (e) {
        alertify.error('Color change failed: ' + e.message);
      }
    }
  },
};
