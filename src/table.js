/*
 Copyright 2013,2014 Guy de Pourtalès

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

(function() {

    var module = angular.module('ngcTableDirective', ['ngc-template', 'ngSanitize']);

    // trigger this when the table's content are udpated
    module.constant('contentUpdatedEvent', 'contentUpdatedEvent');

    /**
     * Resize the vertical scrollbar while also taking care to preserve the current scrolling position
     * @param {angular.element} scrollBar Scrollbar element
     * @param {angular.element} scrollBarWrapper Scrollbar wrapper element
     * @param {String, number} innerHeight Height of the contents to be set on the scrollbar in css.
     * It can be a css value like '50%' or just `100` for `100` pixels.
     * @returns {boolean}
     */
    var resizeVerticalScrollBar = function(scrollBar, scrollBarWrapper, innerHeight) {
        // we need to clear the scrollbar wrapper fixed height,
        // otherwise it might cause the table size not to shrink to the minimum height properly

        var scrollRatio = scrollBarWrapper[0].scrollHeight && scrollBarWrapper[0].scrollTop / scrollBarWrapper[0].scrollHeight,
            initialScrollBarHeight = scrollBarWrapper.height();

        scrollBarWrapper.css('height', 'auto');

        var vScrollBarHeight = scrollBarWrapper.parent().height();

        scrollBarWrapper.css('height', vScrollBarHeight + 'px');
        scrollBar.css('height', innerHeight);

        scrollBarWrapper[0].scrollTop = scrollRatio * scrollBarWrapper[0].scrollHeight;

        return initialScrollBarHeight !== vScrollBarHeight;
    };


    /**
     * Returns a function, that, as long as it continues to be invoked, will not
     * be triggered. The function will be called after it stops being called for
     * N milliseconds. If `immediate` is passed, trigger the function on the
     * leading edge, instead of the trailing.
     * @source Underscore.js 1.6.0
     * (c) 2009-2014 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
     * Underscore may be freely distributed under the MIT license.
     */
    var debounce = function (func, wait, immediate) {
        var timeout, args, context, timestamp, result;

        var later = function () {
            var last = new Date() - timestamp;
            if (last < wait) {
                timeout = setTimeout(later, wait - last);
            } else {
                timeout = null;
                if (!immediate) {
                    result = func.apply(context, args);
                    context = args = null;
                }
            }
        };

        return function () {
            context = this;
            args = arguments;
            timestamp = new Date();
            var callNow = immediate && !timeout;
            if (!timeout) {
                timeout = setTimeout(later, wait);
            }
            if (callNow) {
                result = func.apply(context, args);
                context = args = null;
            }

            return result;
        };
    };

    module.directive('ngcTable', ['$templateCache', '$sce', '$timeout', 'contentUpdatedEvent', function($templateCache, $sce, $timeout, contentUpdatedEvent) {

        // Wait delay before refreshing the scrollbar
        var debounceDelay = 10;

        /**
         * ngcTable Controller declaration. The format is given to be able to minify the directive. The scope is
         * injected.
         * @type {*[]}
         */
        var controllerDecl = ['$scope', function($scope) {
            /**
             * Registers a range declaration in the scope
             * @param range The new range declaration
             */
            this.addRange = function(range) {
                $scope.ranges.push(range);

                // Call this in case the range is added after the table directive's data is already initialised
                $scope.$$scheduleDataAndScrollbarsUpdate && $scope.$$scheduleDataAndScrollbarsUpdate();
            };


        }];


        function compile(/*tElement, tAttrs*/) {
            return {

                pre: function preLink(scope /*, iElement, iAttrs, controller */) {
                    var i;

                    /**
                     * Utility function to create a style declaration based on the value declaration
                     * @param attrName The name of the CSS attribute
                     * @param valueDecl The value of the style declaration given in the directive attributes
                     * @param index The index of the element if the value declaration is an array
                     * @returns {string} The CSS attribute declaration
                     */
                    function $$getStyleDecl(attrName, valueDecl, index) {
                        return angular.isArray(valueDecl) ? index < valueDecl.length ? attrName + ':' + valueDecl[index] : attrName + ':' + valueDecl[valueDecl.length - 1]
                            : angular.isDefined(valueDecl) ? attrName + ':' + valueDecl : ''
                    }

                    /**
                     * Utility function to create and register new columns
                     * @param n The number of columns to create
                     * @param array The array in which register the newly creted columns
                     * @param widths The widths array to apply to each columns
                     */
                    function $$createColumns(n, array, widths) {
                        if (angular.isNumber(n)) {
                            for (var i = 0; i < n; i++) {
                                array.push({
                                    style: $$getStyleDecl('width', widths, i) + ';' + $$getStyleDecl('max-width', widths, i)
                                });
                            }
                        }
                    }

                    /**
                     * Left row header columns definitions
                     * @type {Array}
                     */
                    scope.$$leftRowHeadersColumns = [];
                    /**
                     * Left fixed columns definitions
                     * @type {Array}
                     */
                    scope.$$leftFixedColumns = [];
                    /* Create the columns based on directive parameters */
                    $$createColumns(angular.isNumber(scope.leftColumnNumber) ? scope.leftColumnNumber : 1, scope.$$leftFixedColumns, scope.leftColumnWidths);
                    /**
                     * Variable center column definitions
                     * @type {Array}
                     */
                    scope.$$variableCenterColumns = [];
                    /* Create the columns based on directive parameters */
                    $$createColumns(angular.isNumber(scope.centerColumnNumber) ? scope.centerColumnNumber : 10, scope.$$variableCenterColumns, scope.centerColumnWidths);
                    /**
                     * Right fixed columns definitions
                     * @type {Array}
                     */
                    scope.$$rightFixedColumns = [];
                    /* Create the columns based on directive parameters */
                    $$createColumns(angular.isNumber(scope.rightColumnNumber) ? scope.rightColumnNumber : 1, scope.$$rightFixedColumns, scope.rightColumnWidths);

                    /* Headers and tools */
                    /**
                     * Top left row headers data
                     * @type {Array}
                     */
                    scope.$$topLeftRowHeadersData = [];
                    /**
                     * Middle left row headers data
                     * @type {Array}
                     */
                    scope.$$middleLeftRowHeadersData = [];
                    /**
                     * Bottom left row headers data
                     * @type {Array}
                     */
                    scope.$$bottomLeftRowHeadersData = [];

                    /**
                     * Left column names
                     * @type {Array}
                     */
                    scope.$$leftColumnNames = [];
                    /**
                     * Center column names
                     * @type {Array}
                     */
                    scope.$$centerColumnNames = [];
                    /**
                     * Right column names
                     * @type {Array}
                     */
                    scope.$$rightColumnNames = [];


                    /*
                    Register the data function
                     */
                    if (angular.isFunction(scope['customDataValueFn'])) {
                        scope.$$getDataValue = scope['customDataValueFn'];
                    } else {
                        scope.$$getDataValue = function(data, row, col) {
                            return angular.isArray(data[row]) ? data[row][col] : undefined;
                        };
                    }


                    /* Data regions */
                    /**
                     * Top left data array
                     * @type {Array}
                     */
                    scope.$$topLeftData = [];
                    /**
                     * Top center data array
                     * @type {Array}
                     */
                    scope.$$topCenterData = [];
                    /**
                     * Top right data array
                     * @type {Array}
                     */
                    scope.$$topRightData = [];
                    /**
                     * Middle left data array
                     * @type {Array}
                     */
                    scope.$$middleLeftData = [];
                    /**
                     * Middle center data array
                     * @type {Array}
                     */
                    scope.$$middleCenterData = [];
                    /**
                     * Middle right data array
                     * @type {Array}
                     */
                    scope.$$middleRightData = [];
                    /**
                     * Bottom left data array
                     * @type {Array}
                     */
                    scope.$$bottomLeftData = [];
                    /**
                     * Bottom center data array
                     * @type {Array}
                     */
                    scope.$$bottomCenterData = [];
                    /**
                     * Bottom right data array
                     * @type {Array}
                     */
                    scope.$$bottomRightData = [];

                    /**
                     * Scroll position in the data matrix
                     * @type {{top: number, left: number}}
                     */
                    scope.$$scrollPosition = {
                        top: angular.isDefined(scope.scrollTopPosition) ? scope.scrollTopPosition : 0,
                        left: angular.isDefined(scope.scrollLeftPosition) ? scope.scrollLeftPosition : 0};

                    /**
                     * Ranges for events, styles, etc...
                     * @type {Array}
                     */
                    scope.ranges = [];


                    /**
                     * Flag to show the column names. Default value is true
                     * @type {string|.scope.showColumnNames|showColumnNames}
                     */
                    scope.showColumnNames = angular.isDefined(scope.showColumnNames) ? scope.showColumnNames : true;

                    /**
                     * Flag to show the row number. Default value is true
                     * @type {string|.scope.showColumnNames|showColumnNames}
                     */
                    scope.showRowNumbers = angular.isDefined(scope.showRowNumbers) ? scope.showRowNumbers : true;

                    /*
                    If the show row number flag is on, add the required column
                     */
                    if (scope.showRowNumbers) {
                        scope.$$leftRowHeadersColumns.push({
                            clazz: 'row-number',
                            rowNumberColumn: true
                        });
                    }

                    /**
                     * Creates a row definition object
                     * @param {number|Array} rowHeight Row height as a number, or an array
                     * @param {number} index Index of the rowHeight to use, when it's an array
                     * @returns {{index: *, height: string}}
                     */
                    function createRowDefinitionByIndex(rowHeight, index) {
                        return {
                            index: index,
                            height: $$getStyleDecl('height', rowHeight, index) + ';' + $$getStyleDecl('max-height', rowHeight, index)
                        };
                    }

                    /**
                     * Creates row definitions array based on provided row properties
                     * @param params
                     * @returns {Array}
                     */
                    function createRowsDefinitions(params) {
                        var showRows = params.showRows,
                            rowNumber = params.rowNumber,
                            rowHeights = params.rowHeights,
                            defaultRowNumber = params.defaultRowNumber || 1,
                            rows = [];

                        if (!showRows) {
                            return rows;
                        }

                        rowNumber = angular.isNumber(rowNumber) ? rowNumber : defaultRowNumber;
                        for (var i = 0; i < rowNumber; i++) {
                            rows.push(createRowDefinitionByIndex(rowHeights, i));
                        }
                        return rows;
                    }

                    /**
                     * Flag to show the header rows.
                     * @type {string|.scope.showHeader|showHeader}
                     */
                    scope.showHeader = angular.isDefined(scope.showHeader) ? scope.showHeader : true;

                    /**
                     * Header rows definitions
                     * @type {Array}
                     */
                    scope.$$headerRows = createRowsDefinitions({
                        showRows: scope.showHeader,
                        rowNumber: scope.headerRowNumber,
                        rowHeights: scope.headerRowHeights,
                        defaultRowNumber: 1
                    });

                    /**
                     * Flag to show the filter rows.
                     * @type {string|.scope.showFilter|showFilter}
                     */
                    scope.showFilter = angular.isDefined(scope.showFilter) ? scope.showFilter : false;


                    /**
                     * Row definitions
                     * @type {Array}
                     */
                    scope.$$rows = createRowsDefinitions({
                        showRows: true,
                        rowNumber: scope.rowNumber,
                        rowHeights: scope.rowHeights,
                        defaultRowNumber: 10
                    });

                    /**
                     * Flag to show the footer rows.
                     * @type {string|.scope.showFilter|showFilter}
                     */
                    scope.showFooter = angular.isDefined(scope.showFooter) ? scope.showFooter : true;

                    /**
                     * Footer row definitions
                     */
                    scope.$$footerRows = createRowsDefinitions({
                        showRows: scope.showFooter,
                        rowNumber: scope.footerRowNumber,
                        rowHeights: scope.footerRowHeights,
                        defaultRowNumber: 1
                    });

                },


                post: function postLink(scope , iElement /*, iAttrs, controller*/) {
                    /**
                     * Returns a letter combination for an index
                     * @param index
                     * @returns {string}
                     */
                    function getLettersForIndex(index) {
                        var remainder = index % 26;
                        var letter = String.fromCharCode(65 + remainder);

                        if (index > 25) {
                            letter = getLettersForIndex((index - remainder) / 26 - 1) + letter;
                        }

                        return letter;
                    }

                    /**
                     * Default style function for the cells. Returns an empty string
                     * @returns {string}
                     */
                    function defaultStyleFn(/*data, row, col*/) {return '';}

                    /**
                     * Default format function for the cells content. Returns the raw data
                     * @param data
                     * @returns {*}
                     */
                    function defaultFormatFn(data /*, row, col*/) {return angular.isDefined(data) ? data : '&nbsp;';}

                    /**
                     * Default html content function
                     * @param data
                     * @returns {*}
                     */
                    function defaultHtmlFn(data, row, col, formattedValue) {return angular.isDefined(formattedValue) ? String(formattedValue) : '&nbsp;';}


                    /**
                     * Event dispatcher function. Calls the registered event callback
                     * @param eventName the name of the event
                     * @param event the event object as passed by the listener
                     * @param cellData the data registered for the cell
                     */
                    scope.$$dispatchEvent = function(eventName, event, cellData) {
                        /* Only handle callbacks that are actually functions */
                        if (cellData && angular.isFunction(cellData.eventCallbacks[eventName])) {
                            /* Save the scroll positions */
                            var verticalScrollPos = this.$$verticalScrollbarWrapperElement.scrollTop;
                            var horizontalScrollPos = this.$$horizontalScrollbarWrapperElement.scrollLeft;

                            /* apply the callback */
                            cellData.eventCallbacks[eventName](event, cellData);

                            /* Restore the scroll positions */
                            this.$$verticalScrollbarWrapperElement.scrollTop = verticalScrollPos;
                            this.$$horizontalScrollbarWrapperElement.scrollLeft = horizontalScrollPos;
                        }
                    };



                    /**
                     * Return the cell data object given the row the column and the scope
                     * @param scope The scope
                     * @param row The row in data space
                     * @param col The column in data space
                     * @returns {{row: *, col: *, data: *, value: *, clazz: string, style: *, eventCallbacks: {}, enclosingRanges: Array, customCellTemplate: (string|Function), customHTML: string}}
                     */
                    function $$getCellData(scope, row, col) {
                        /* The additional optional class(es) */
                        var clazz = '';
                        /* The optional style function declaration */
                        var style = '';
                        /* The optional style function declaration */
                        var styleFn = defaultStyleFn;
                        /* The data format function */
                        var formatFn = defaultFormatFn;
                        /* The data value */
                        var data = scope.$$getDataValue(scope.data, row, col);
                        /* The custom append function */
                        var customHtmlFn = defaultHtmlFn;
                        /* The custom append function */
                        var customTrustedHtmlFn = undefined;
                        /**
                         * The custom template resolver
                         * @type {string|Function} A template URL string or a function that returns the template url string.
                         * Function signature: function(rawData, row, col, formattedValue, scope)
                         */
                        var customCellTemplate = undefined;

                        /* The cell event callbacks */
                        var eventCallbacks = {};
                        /* The ranges which contains this cell */
                        var enclosingRanges = [];
                        /* Supported events */
                        var events = [
                            'click', 'dblclick',
                            'keydown', 'keypress', 'keyup',
                            'mousedown', 'mouseenter', 'mouseleave', 'mousemove', 'mouseover', 'mouseup'
                        ];

                        /* Check all ranges and apply the range attributes if the cell is enclosed */
                        angular.forEach(scope.ranges, function(range){
                            if (row >= range.top && row < range.bottom
                                && col >= range.left && col < range.right) {
                                /* Register the enclosing range */
                                enclosingRanges.push(range);
                                /* Register the format function */
                                if (angular.isFunction(range.formatFn)) formatFn = range['formatFn'];
                                /* Register the CSS class */
                                if (angular.isString(range.clazz)) clazz = range.clazz;
                                /* Register the CSS style declaration */
                                if (angular.isString(range.style)) style = range.style;
                                if (angular.isFunction(range.styleFn)) styleFn = range['styleFn'];
                                if (angular.isFunction(range.customHtmlFn)) customHtmlFn = range['customHtmlFn'];
                                if (angular.isFunction(range.customTrustedHtmlFn)) customTrustedHtmlFn = range['customTrustedHtmlFn'];
                                if (angular.isDefined(range.customCellTemplate)) {
                                    customCellTemplate = range.customCellTemplate;
                                }

                                /* Register available event callbacks */
                                angular.forEach(events, function(event) {
                                    if (angular.isFunction(range[event])) eventCallbacks[event] = range[event];
                                });
                            }
                        });

                        var value = formatFn(data, row, col),
                            customHTML;

                        if (customCellTemplate && angular.isFunction(customCellTemplate)) {
                            customCellTemplate = customCellTemplate(data, row, col, value, scope);
                        }

                        if (customCellTemplate == null || customCellTemplate == '') { // null, undefined or empty string
                            customHTML = (angular.isDefined(customTrustedHtmlFn)) ? $sce.trustAsHtml(customTrustedHtmlFn(data, row, col, value)) : customHtmlFn(data, row, col, value);
                        }

                        return {
                            row: row,
                            col: col,
                            data: data,
                            value: value,
                            clazz: clazz,
                            style: styleFn(data, row, col) + ';' + style,
                            eventCallbacks: eventCallbacks,
                            enclosingRanges: enclosingRanges,
                            customCellTemplate: customCellTemplate,
                            customHTML: customHTML
                        };
                    }

                    /**
                     * Updates the variable center cells
                     * @param nRows Number of rows
                     * @param centerData The center data part. may be top, middle or bottom
                     * @param dataRowStartIndex The row start index, related to the data part
                     */
                    scope.$$setCenterColumnsData = function(nRows, centerData, dataRowStartIndex) {
                        var col;
                        /* Update the column names */
                        for (col = 0; col < this.$$variableCenterColumns.length; col++) {
                            this.$$centerColumnNames[col] = {
                                value:getLettersForIndex(col + this.$$leftFixedColumns.length + this.$$scrollPosition.left)
                            };
                        }

                        /* Update all rows of the center table part */
                        for (var row = 0; row < nRows; row++) {
                            var r = row + dataRowStartIndex;

                            /* Reset the center data array to empty */
                            centerData[row] = [];

                            for (col = 0; col < this.$$variableCenterColumns.length; col++) {
                                /*
                                the column is the current column index + the number of columns to the left + the left
                                scroll position
                                */
                                var c = col + this.$$leftFixedColumns.length + this.$$scrollPosition.left;
                                centerData[row].push($$getCellData(scope, r, c));
                            }
                        }
                    };

                    /**
                     * Updates the left and right fixed cells
                     * @param nRows Number of rows of the table part
                     * @param rowHeadersData The headers row data
                     * @param leftData The data for the left part (top, middle or bottom)
                     * @param rightData The data for the right part (top, middle or bottom)
                     * @param dataRowStartIndex The row start index, related to the data part
                     */
                    scope.$$setLeftAndRightColumnsData = function(nRows, rowHeadersData, leftData, rightData, dataRowStartIndex) {
                        var col;
                        /* Update the column names on the left */
                        for (col = 0; col < this.$$leftFixedColumns.length; col++) {
                            this.$$leftColumnNames[col] = {
                                value: getLettersForIndex(col)
                            };
                        }

                        /* Update the column names on the right */
                        var rowLength =  angular.isDefined(this.data[0]) ? this.data[0].length : 0;
                        var startColumnIndex = Math.max(rowLength - this.$$rightFixedColumns.length, this.$$leftFixedColumns.length + this.$$variableCenterColumns.length);

                        for (col = 0; col < this.$$rightFixedColumns.length; col++) {
                            this.$$rightColumnNames[col] = {
                                value: getLettersForIndex(startColumnIndex + col)
                            };
                        }

                        /* Update each row */
                        for (var row = 0; row < nRows; row++) {
                            /* Get the row index */
                            var r = dataRowStartIndex + row;

                            /* Reset the row headers data */
                            rowHeadersData[row] = [];
                            /* add the row number */
                            rowHeadersData[row][this.$$leftRowHeadersColumns.length - 1] = {
                                value:r + 1
                            };

                            /* Reset the left data array */
                            leftData[row] = [];

                            /* Update the left data */
                            for (col = 0; col < this.$$leftFixedColumns.length; col++) {
                                leftData[row].push($$getCellData(scope, r, col));
                            }

                            /* Reset the right data array */
                            rightData[row] = [];
                            /* Update the right data */
                            for (col = 0; col < this.$$rightFixedColumns.length; col++) {

                                rightData[row].push($$getCellData(scope, r, startColumnIndex + col));
                            }
                        }
                    };

                    /**
                     * Updates data in all table parts
                     */
                    scope.$$updateData = function() {
                        /* Initialize the header parts */
                        this.$$setCenterColumnsData(this.$$headerRows.length, this.$$topCenterData, 0);
                        this.$$setLeftAndRightColumnsData(this.$$headerRows.length, this.$$topLeftRowHeadersData, this.$$topLeftData, this.$$topRightData, 0);

                        /* Initiaize the variable middle parts */
                        this.$$setCenterColumnsData(this.$$rows.length, this.$$middleCenterData, this.$$headerRows.length + this.$$scrollPosition.top);
                        this.$$setLeftAndRightColumnsData(this.$$rows.length, this.$$middleLeftRowHeadersData, this.$$middleLeftData, this.$$middleRightData, this.$$headerRows.length + this.$$scrollPosition.top);

                        /* Initialize the fixed footer parts */
                        /* The footer start row should be either the total data rows minus the footer height or the number of header rows + the number of rows */
                        var footerStartRow = Math.max(this.data.length - this.$$footerRows.length, this.$$headerRows.length + this.$$rows.length);
                        this.$$setCenterColumnsData(this.$$footerRows.length, this.$$bottomCenterData, footerStartRow);
                        this.$$setLeftAndRightColumnsData(this.$$footerRows.length, this.$$bottomLeftRowHeadersData, this.$$bottomLeftData, this.$$bottomRightData, footerStartRow);

                        this.$broadcast(contentUpdatedEvent);
                    };

                    // Send an initial callback to set the scroll position on correct values if required

                    if (angular.isFunction(scope.scrollFn)) scope.scrollFn(null, {
                        top: scope.$$headerRows.length,
                        left:scope.$$leftFixedColumns.length,
                        direction:'none'
                    });

                    // Update the scroll positions (top and left) for the new data object
                    // It'll translate the old positions to the new ones proportionally
                    scope.$$updateScrollPositions = function (oldData) {
                        var scope = this,
                            data = scope.data,
                            scrollPosition = scope.$$scrollPosition,
                            rowNumber = scope.rowNumber,
                            centerColumnNumber = scope.centerColumnNumber,
                            newRowCount = data && data.length || 0,
                            newColumnCount = data && data[0] && data[0].length || 0,
                            oldRowCount = oldData && oldData.length || 0,
                            oldColumnCount = oldData && oldData[0] && oldData[0].length || 0;

                        if (scrollPosition.top){
                            if (newRowCount) {
                                newRowCount -= (scope.$$headerRows.length + scope.$$footerRows.length);
                                if (newRowCount < 0) {
                                    newRowCount = 0;
                                }
                            }

                            if (rowNumber >= newRowCount) {
                                scrollPosition.top = 0;
                            } else {
                                if (oldRowCount) {
                                    oldRowCount -= (scope.$$headerRows.length + scope.$$footerRows.length);
                                    if (oldRowCount < rowNumber) {
                                        oldRowCount = 0;
                                    }
                                }

                                scrollPosition.top = oldRowCount &&
                                    (Math.round((scrollPosition.top + 1) * (newRowCount - rowNumber) / (oldRowCount - rowNumber)) - 1);
                            }
                        }

                        if (scrollPosition.left) {
                            if (newColumnCount) {
                                newColumnCount -= (scope.$$leftFixedColumns.length + scope.$$rightFixedColumns.length);
                                if (newColumnCount < 0) {
                                    newColumnCount = 0;
                                }
                            }

                            if (centerColumnNumber >= newColumnCount) {
                                scrollPosition.left = 0;
                            } else {
                                if (oldColumnCount) {
                                    oldColumnCount -= (scope.$$leftFixedColumns.length + scope.$$rightFixedColumns.length);
                                    if (oldColumnCount < centerColumnNumber) {
                                        oldColumnCount = 0;
                                    }
                                }

                                scrollPosition.left = oldColumnCount &&
                                    (Math.round((scrollPosition.left + 1) * (newColumnCount - centerColumnNumber) / (oldColumnCount - centerColumnNumber)) - 1);
                            }
                        }
                    };

                    /**
                     * Refresh the scrollbar height based on the table body height
                     * @note Does not handle the horizontal scenario yet
                     * @param {boolean} verticalOnly If true, only update the vertical scrollbars
                     */
                    scope.$$refreshScrollbars = function(verticalOnly) {
                        // Refresh the scrollbars
                        var ratio;
                        // This should be factorized with the scrollbar directive
                        if (angular.isDefined(scope.data)) {
                            var $$verticalScrollbarElement = scope.$$verticalScrollbarElement,
                                $$verticalScrollbarParentElement = $$verticalScrollbarElement.parent();

                            ratio = (scope.data.length - scope.$$headerRows.length - scope.$$footerRows.length) / scope.$$rows.length * 100;

                            if (ratio > 100) {
                                $$verticalScrollbarParentElement.css('display', 'block');
                                resizeVerticalScrollBar($$verticalScrollbarElement, $$verticalScrollbarParentElement, ratio + '%');
                            } else {
                                $$verticalScrollbarParentElement.css('display', 'none');
                            }
                        }

                        if (!verticalOnly && angular.isDefined(scope.data[0])) {
                            ratio = (scope.data[0].length - scope.$$leftFixedColumns.length - scope.$$rightFixedColumns.length) / scope.$$variableCenterColumns.length * 100;
                            scope.$$horizontalScrollbarElement.css('width', Math.ceil(ratio) + '%');
                            scope.$$horizontalScrollbarElement.parent().css('display', (ratio <= 100)? 'none' : 'block');

                            // @note Does not handle the 'horizontal' resize of the scrollbar case yet
                            // because we haven't got a use case for it yet
                        }
                    };

                    scope.$$scheduleScrollbarRefresh = debounce(scope.$$refreshScrollbars, debounceDelay);

                    scope.$$updateDataAndScrollbars = function() {
                        // Update the data
                        scope.$$updateData();

                        // Refresh scrollbars
                        scope.$$scheduleScrollbarRefresh();
                    };
                    scope.$$scheduleDataAndScrollbarsUpdate = debounce(angular.bind(this, scope.$$updateDataAndScrollbars), debounceDelay);

                    // Initialize the data
                    scope.$$updateDataAndScrollbars();

                    scope.$watch(
                        'data',
                        function(newValue, oldValue) {
                            if (newValue !== oldValue ) {
                                scope.$$updateScrollPositions(oldValue);
                                scope.$$updateDataAndScrollbars();
                            }
                        }
                    );

                    scope.$$scrollDirty = false;

                    scope.$watch(
                        'scrollTopPosition',
                        function(newValue, oldValue) {
                            if (angular.isDefined(newValue) && newValue !== oldValue) {
                                scope.$$scrollDirty = true;

                                if (scope.scrollTopPosition > (scope.data.length - scope.$$headerRows.length - scope.$$footerRows.length)) {
                                    scope.scrollTopPosition = (scope.data.length - scope.$$headerRows.length - scope.$$footerRows.length);
                                }

                                scope.$$scrollPosition.top = scope.scrollTopPosition;
                                scope.$$updateData();

                                scope.$$verticalScrollbarWrapperElement.scrollTop =
                                    scope.$$verticalScrollbarElement[0].offsetHeight * scope.scrollTopPosition / (scope.data.length - scope.$$headerRows.length - scope.$$footerRows.length);
                            }
                        }
                    );
                    scope.$watch(
                        'scrollLeftPosition',
                        function(newValue, oldValue) {
                            if (angular.isDefined(newValue) &&  newValue !== oldValue) {
                                scope.$$scrollDirty = true;

                                if (scope.scrollLeftPosition > (scope.data[0].length - scope.$$leftFixedColumns.length - scope.$$rightFixedColumns.length)) {
                                    scope.scrollLeftPosition = (scope.data[0].length - scope.$$leftFixedColumns.length - scope.$$rightFixedColumns.length);
                                }

                                scope.$$scrollPosition.left = scope.scrollLeftPosition;
                                scope.$$updateData();

                                scope.$$horizontalScrollbarWrapperElement.scrollLeft =
                                    scope.$$horizontalScrollbarElement[0].offsetWidth * scope.scrollLeftPosition / (scope.data[0].length - scope.$$leftFixedColumns.length - scope.$$rightFixedColumns.length);
                            }
                        }
                    );


                    /**
                     * Handle touch scrolling
                     * Start event
                     */
                    iElement.find('table').on("touchstart", function(e) {
                        scope.$$touchClientX = e.touches[0].clientX;
                        scope.$$touchClientY = e.touches[0].clientY;
                        e.preventDefault();
                    });

                    /**
                     * Handle movement
                     */
                    iElement.find('table').on("touchmove", function(e) {
                        var deltaX = e.touches[0].clientX - scope.$$touchClientX;
                        var deltaY = e.touches[0].clientY - scope.$$touchClientY;

                        scope.$$verticalScrollbarWrapperElement.scrollTop -= deltaY;
                        scope.$$horizontalScrollbarWrapperElement.scrollLeft -= deltaX;

                        scope.$$updateData();

                        scope.$$touchClientX = e.touches[0].clientX;
                        scope.$$touchClientY = e.touches[0].clientY;
                        e.preventDefault();

                    });
                }
            }
        }

        return {
            scope: {
                /* Custom data function */
                customDataValueFn:'=?',
                /* Data to display */
                data:'=',
                /* Flag to show/hide the column names. By default true */
                showColumnNames:'=?',
                /* Flag to show the row numbers. By default true */
                showRowNumbers:'=?',
                /* Flag to show the header rows. By default true */
                showHeader:'=?',
                /* Unimplemented yet. By default false */
                showFilter:'=?',
                /* Flag to show the footer rows. By default true */
                showFooter:'=?',

                /* Number of left fixed columns. By default 1 */
                leftColumnNumber: '=?',
                /* Widths of the fixed left columns. */
                leftColumnWidths: '=?',
                /* Number of center variable columns. By default 10 */
                centerColumnNumber: '=',
                /* Widths of the center variable columns. */
                centerColumnWidths: '=?',
                /* Number of right fixed columns. By default 1 */
                rightColumnNumber: '=?',
                /* Widths of the fixed right columns. */
                rightColumnWidths: '=?',

                /* Number of rows in the header. By default 1 */
                headerRowNumber: '=?',
                /* Heights of the header rows (array or single value). No default (min-height:10px) */
                headerRowHeights: '=?',
                /* Number of rows in the middle. By default 10 */
                rowNumber: '=?',
                /* Heights of the middle rows (array or single value). No default (min-height:10px) */
                rowHeights: '=?',
                /* Number of rows in the footer. By default 1 */
                footerRowNumber: '=?',
                /* Heights of the footer rows (array or single value). No default (min-height:10px) */
                footerRowHeights: '=?',

                /* Scroll function to be called when a scroll event occurs */
                scrollFn: '=?',

                /* Let read or set the vertical data position in the middle center part */
                scrollTopPosition: '=?',
                /* Let read or set the horizontal data position in the middle center part */
                scrollLeftPosition: '=?',

                /* The scroll delay for controlling the refresh behaviour when scrolling, a value of 0 means immediate scrolling */
                scrollDelay: '=?',

                /* The scroll wheel delay for controlling the refresh behaviour when scrolling with the wheel, a value of 0 means immediate scrolling */
                wheelScrollDelay: '=?',

                /* If false, disables the vertical scrollbar height resizing. This features sometimes triggers unwanted scroll events. Default is true */
                verticalScrollbarAutoResize: '=?'

            },
            restrict:'AE',
            replace:true,
            transclude:true,
            template: $templateCache.get('ngc.table.tpl.html'),
            compile: compile,
            controller:controllerDecl
        };
    }])
    /* Internal directive for range declarations */
    .directive('ngcRange', function() {
        return {
            require:"^ngcTable",
            restrict:'AE',
            scope:{
                /* Top position of the range in data space */
                top: '=',
                /* Bottom position of the range in data space */
                bottom: '=',
                /* Left position of the range in data space */
                left: '=',
                /* Right position of the range in data space */
                right: '=',
                /* Format function for the cells enclosed in the range */
                formatFn: '=?',
                /* Function to insert custom sanitized HTML in the range */
                customHtmlFn: '=?',
                /* Function to insert custom trusted HTML in the range */
                customTrustedHtmlFn: '=?',
                /* URL string of a custom template to render the cell contents.
                 Can also be a Function instead, with the following signature: function(rawData, row, col, formattedValue, scope) */
                customCellTemplate: '=?',
                /* CSS class to be added to the cells */
                clazz: '=?',
                /* Direct CSS styling to be injected in the cells */
                style: '=?',
                /* CSS style additional declaration to be added to the cell */
                styleFn: '=?',
                /* Callback for the 'click' event */
                clickFn: '=?',
                /* Callback for the 'dblclick' event */
                dblclickFn: '=?',
                /* Callback for the 'keydown' event */
                keydownFn: '=?',
                /* Callback for the 'keypress' event */
                keypressFn: '=?',
                /* Callback for the 'keyup' event */
                keyupFn: '=?',
                /* Callback for the 'mousedown' event */
                mousedownFn: '=?',
                /* Callback for the 'mouseenter' event */
                mouseenterFn: '=?',
                /* Callback for the 'mouseleave' event */
                mouseleaveFn: '=?',
                /* Callback for the 'mousemove' event */
                mousemoveFn: '=?',
                /* Callback for the 'mouseover' event */
                mouseoverFn: '=?',
                /* Callback for the 'mouseup' event */
                mouseupFn: '=?'
            },
            link: function (scope, element, attrs, parentCtrl) {
                /*
                On the linking (post-compile) step, call the parent (ngc-table) controller to register the
                current range
                 */
                parentCtrl.addRange({
                    top: scope.top,
                    bottom: scope.bottom,
                    left: scope.left,
                    right: scope.right,
                    formatFn: scope.formatFn,
                    clazz: scope.clazz,
                    styleFn: scope.styleFn,
                    style: scope.style,
                    customHtmlFn: scope.customHtmlFn,
                    customTrustedHtmlFn: scope.customTrustedHtmlFn,
                    customCellTemplate: scope.customCellTemplate,
                    click: scope.clickFn,
                    dblclick: scope.dblclickFn,
                    keydown: scope.keydownFn,
                    keypress: scope.keypressFn,
                    keyup: scope.keyupFn,
                    mousedown: scope.mousedownFn,
                    mouseenter: scope.mouseenterFn,
                    mouseleave: scope.mouseleaveFn,
                    mousemove: scope.mousemoveFn,
                    mouseover: scope.mouseoverFn,
                    mouseup: scope.mouseupFn,
                    touchstart: scope.touchstartFn,
                    touchmove: scope.touchmoveFn,
                    touchend: scope.touchendFn
                });
            }
        };
    })
    .directive('ngcScrollbar', ['$timeout', 'contentUpdatedEvent', function($timeout, contentUpdatedEvent) {
        /**
         * Handle the resizing of the table to refresh the scrollbars.
         * When the height or width of the table body changes, then we'll try to refresh the scrollbars (width/height)
         * The refresh is done asynchronously (after a 10ms delay) because multiple table contents layout changes may
         * occur in a short time and we don't want to refresh the scrollbars each time.
         * e.g. image, styles or inner templates are loaded
         * @param {string} orientation Orientation to check. e.g. 'horizontal' or 'vertical'
         * @param {object} scope Angular scope
         * @param {DOMElement} domEl DOM element where we check its dimensions
         * @returns {Function} Returns a unsubscribe function to cancel the scope.$watch()
         */
        var tableResizeHandler = function (orientation, scope, domEl) {
            var watchGetter;

            // generate the watch function in advance to make the watchGetter function run as fast as possible
            if (orientation === 'vertical') {
                watchGetter = function () { // watch for table height changes
                    return domEl.offsetHeight;
                };
            } else {
                watchGetter = function () { // watch for table width changes
                    return domEl.offsetWidth;
                };
            }

            return scope.$watch(watchGetter, function (newValue, oldValue) {
                if (newValue !== oldValue) { // when it changes
                    scope.$$scheduleScrollbarRefresh();
                }
            });
        };

        /**
         * Get closest parent tag of a given tag name.
         * @param {jqLite} el Element where to start looking for the tag
         * @param {string} tagName Tag name. e.g. TBODY
         * @returns {jqLite} Returns the found parent tag or null if not found in the whole DOM tree.
         */
        var getClosestParentTag = function(el, tagName) {
            if (el.closest) { // if jQuery is available with Angular
                return el.closest(tagName);
            }

            el = el.parent();
            while (el.length) {
                if (el[0].nodeName === tagName) {
                    return el;
                }
                el = el.parent();
            }
            return null;
        };

        /* Internal directive for virtual horizontal and vertical scrollbars management */
        return {
            require:"^ngcTable",
            restrict:'A',
            replace:true,
            template:'<div class="ngc"></div>',

            compile: function(tElement, tAttrs) {


                return {
                   pre: function postLink(scope, iElement /*, iAttrs */) {
                       var ratio = 100;

                       if (angular.isDefined(tAttrs['horizontal'])) {
                           // The horizontal ratio is the total data column length minus the left columns minus the right
                           // columns divided by the number of visible center columns
                           // The presence of the row numbers at the far right must be considered
                           if (angular.isDefined(scope.data[0])) {
                                ratio = (scope.data[0].length - scope.$$leftFixedColumns.length - scope.$$rightFixedColumns.length) / scope.$$variableCenterColumns.length * 100;
                           }
                           iElement.addClass('hscrollbar');
                           iElement.css('width', Math.ceil(ratio) + '%');
                           if (ratio <= 100) iElement.parent().css('display', 'none');
                           // Save the reference to the element in order to manage scroll position
                           // after $apply force the redraw of DIVs
                           scope.$$horizontalScrollbarElement = iElement;
                           scope.$$horizontalScrollbarWrapperElement = iElement.parent()[0];
                       } else
                       if (angular.isDefined(tAttrs['vertical'])) {
                           // The vertical ratio is the number of data rows minus headers and footers divided by the the number
                           // of visible middle rows
                           if (angular.isDefined(scope.data)) {
                                ratio = (scope.data.length - scope.$$headerRows.length - scope.$$footerRows.length) / scope.$$rows.length * 100;
                           }
                           iElement.addClass('vscrollbar');
                           iElement.css('height', ratio + '%');
                           if (ratio <= 100) iElement.parent().css('display', 'none');
                           // Save the reference to the element in order to manage scroll position
                           // after $apply force the redraw of DIVs
                           var rootDirectiveScope = scope.$parent.$parent;
                           rootDirectiveScope.$$verticalScrollbarElement = iElement;
                           rootDirectiveScope.$$verticalScrollbarWrapperElement = iElement.parent()[0];
                       }
                   },
                    post: function postLink(scope, iElement /*, iAttrs*/) {

                        var defaultScrollDelay = angular.isDefined(scope.scrollDelay) ? scope.scrollDelay : 120, // default scroll delay (ms)
                            defaultWheelDelay = angular.isDefined(scope.wheelScrollDelay) ? scope.wheelScrollDelay : 500, // default wheel delay (ms)
                            scrollDelay = defaultScrollDelay, // current scroll delay (ms)
                            parentEl = iElement.parent(),
                            shouldResizeVerticalScrollbar = angular.isDefined(scope.verticalScrollbarAutoResize) ? scope.verticalScrollbarAutoResize : true; // parent DOM element of this directive's DOM root

                        var restoreDefaultScrollDelayLater = debounce(function () { // restore the default scroll delay later
                            scrollDelay = defaultScrollDelay;
                        }, defaultWheelDelay);

                        /**
                         * Handles the scroll event of the vertical scroll bar
                         * @param {jQuery.Event} e
                         */
                        var processScrollEvent = function (e) {

                            var $$scrollPosition = scope.$$scrollPosition,
                                scrollChanged = false,
                                scrollRatio,
                                newVal;


                            if (scope.$$scrollDirty) {
                                scope.$$scrollDirty = false;
                                return;
                            }

                            if (angular.isDefined(scope.$parent.$parent) && scope.$parent.$parent.$$scrollDirty) {
                                scope.$parent.$parent.$$scrollDirty = false;
                                return;
                            }


                            // Detect if horizontal according to the class
                            if (angular.element(e.target).hasClass("horizontal")) {
                                // add `0` value check to ensure that the ratio is not NaN.
                                // If that happens, scope.$$setCenterColumnsData will not behave properly
                                scrollRatio = e.target.scrollWidth && e.target.scrollLeft / e.target.scrollWidth;
                                newVal = Math.round(scrollRatio * (scope.data[0].length - scope.$$leftFixedColumns.length - scope.$$rightFixedColumns.length));
                                if ($$scrollPosition.left !== newVal) {
                                    scrollChanged = true;
                                    $$scrollPosition.left = newVal;
                                }

                            } else
                            // Detect if vertical according to the class
                            if (angular.element(e.target).hasClass("vertical")) {
                                // add `0` value check to ensure that the ratio is not NaN.
                                // If that happens, scope.$$setCenterColumnsData will not behave properly
                                scrollRatio = e.target.scrollHeight && e.target.scrollTop / e.target.scrollHeight;
                                newVal = Math.round(scrollRatio * (scope.data.length - scope.$$headerRows.length - scope.$$footerRows.length));
                                if ($$scrollPosition.top !== newVal) {
                                    scrollChanged = true;
                                    $$scrollPosition.top = newVal;
                                }
                            }

                            // scroll position didn't change, so do nothing
                            if (!scrollChanged) {
                                return;
                            }

                            if (angular.isFunction(scope.scrollFn)) scope.scrollFn(e, {
                                top: scope.$$scrollPosition.top +  scope.$$headerRows.length,
                                left: scope.$$scrollPosition.left + scope.$$leftFixedColumns.length,
                                direction: angular.element(e.target).hasClass('vertical') ? 'vertical' : angular.element(e.target).hasClass('horizontal') ? 'horizontal' : 'none'
                            });

                            scope.$$updateData();

                            // $apply redraws the divs so they reset their position
                            // WARNING: This is quite slow once the number of cells exceeds 300!
                            scope.$apply();

                            // verticalScrollPos = scope.$$verticalScrollbarWrapperElement.scrollTop;
                            // horizontalScrollPos = scope.$$horizontalScrollbarWrapperElement.scrollLeft;

                            // Therefore we must
                            // reposition the elements with the saved position
                            // scope.$$verticalScrollbarWrapperElement.scrollTop = verticalScrollPos;
                            // scope.$$horizontalScrollbarWrapperElement.scrollLeft = horizontalScrollPos;

                            if (shouldResizeVerticalScrollbar ) {
                                updateVScrollBarHeight();
                            }
                            // rootDirectiveScope.$$scrolling = false;
                        };

                        var processScrollEventLater = debounce(angular.bind(this, processScrollEvent), scrollDelay);

                        parentEl.on('wheel', function(){
                            //DEBUG
                            //console.warn('wheel: ', e);
                            scrollDelay = defaultWheelDelay; // if the user wheel action triggers a scroll, it'll use this different delay value
                            restoreDefaultScrollDelayLater();
                        });

                        // Handle the scroll event on parent elements
                        parentEl.on("scroll", function(e) {
                            processScrollEventLater(e);
                        });



                        /*
                         Firefox does not handle correctly divs with 100% height in a div of 100% height
                         The timeout calculates the min-height after the actual rendering
                         In some cases this method triggers additional unwanted scroll events
                         in this case, you should set verticalScrollbarAutoResize to false
                         */
                        var updateVScrollBarHeight = function() {
                            if (iElement.hasClass("vscrollbar")) {
                                scope.$$scheduleScrollbarRefresh(true);
                            }
                        };

                        updateVScrollBarHeight();


                        // vertical scrolling perks
                        if (parentEl.hasClass('vertical')) {
                            var tbodyEl = getClosestParentTag(parentEl, 'TBODY');
                            if (!tbodyEl.length) {
                                throw new Error("Unable to find TBODY tag from the scrollbar wrapper");
                            }

                            // Handle vertical scroll triggered by mouse wheel over the whole table area
                            parentEl.parent().parent().parent().on('wheel', function(evt){
                                var target = evt.target,
                                    parentElDom = parentEl[0];
                                if (target !== parentElDom) {
                                    var scrollHeight = parentElDom.scrollHeight;
                                    if (!scrollHeight) { // if scrolling vertically is not possible
                                        return;
                                    }

                                    var initScrollTop = parentElDom.scrollTop,
                                        originalEvent = evt.originalEvent || evt, // need this to make this code work with/without jQuery
                                        lineScrollOffset = originalEvent.deltaY > 0 ? 3 : -3;

                                    // if we can't scroll further in that direction
                                    if ((initScrollTop === 0 && lineScrollOffset < 0) ||
                                        (lineScrollOffset > 0 && (initScrollTop + parentElDom.offsetHeight) === scrollHeight)) {
                                        return;
                                    }

                                    // if we can scroll more
                                    if (parentElDom.scrollByLines) {
                                        parentElDom.scrollByLines(lineScrollOffset);
                                    } else if (parentElDom.doScroll) { // if scrollByLines is not available, try to use the IE similar function
                                        parentElDom.doScroll(lineScrollOffset > 0 ? 'scrollbarDown' : 'scrollbarUp');
                                    } else if (parentElDom.scrollBy) { // if scrollBy is available (an old DOM-0 method)
                                        parentElDom.scrollBy(0, lineScrollOffset * 10);
                                    } else { // last solution, try to do it manually
                                        parentElDom.scrollTop += lineScrollOffset * 10;
                                    }
                                    evt.preventDefault();
                                }
                            });

                            // target element is the scrollbar wrapper parent element
                            tableResizeHandler('vertical', scope, tbodyEl[0]);

                        // Does not handle the 'horizontal' case yet because we haven't got a use case for it yet
                        // } else {
                        //    // target element is the scrollbar wrapper parent element
                        //    tableResizeHandler('horizontal', scope, tbodyEl[0]);
                        }
                    }
                };
            }

        };
    }])
    /**
     * @name extInclude
     * Extended version of ngInclude where we can also specify an additional scope variable as 'scopeExtension'.
     * Can only be used as an Attribute.
     *
     * @param {string} extInclude Angular expression evaluating to a template URL
     * @param {string} scopeExtension Angular expression evaluating to an object. Its value will be available in the
     *                                inner scope of the directive.
     */
    .directive('extInclude', [
        function() {
            // List of attributes to map to the scope
            var attrToMap = ['extInclude', 'scopeExtension'];

            /**
             * Sets a given attribute onto the scope after evaluating it and watch for future value changes
             * @param {Object} scope
             * @param {Object} attr
             * @param {string} attrName
             * @return {void}
             */
            var setupScopeVar = function(scope, attr, attrName) {
                scope.$watch(attr[attrName], function(newValue, oldValue) {
                    if (newValue === oldValue) {
                        return;
                    }
                    scope[attrName] = newValue;
                }, true);
                scope[attrName] = scope.$eval(attr[attrName]);
            };

            return {
                restrict: 'A',
                template: '<ng-include src="extInclude"></ng-include>',
                scope: true,
                link: function(scope, element, attr) {
                    for(var i= 0, len=attrToMap.length; i < len; i++) {
                        setupScopeVar(scope, attr, attrToMap[i]);
                    }
                }
            };
        }
    ]);
})();
