angular.module('ngcTableDirectiveTest', ['ngcTableDirective'])
    .controller('TestCtrl', function($scope) {
        $scope.data = [];

        for (var row = 0; row < 200; row++) {
           var rowContent = [];
           for (var col = 0; col < 200; col++) {
                rowContent.push(row * col + col);
           }
            $scope.data.push(rowContent);
        }

        $scope.cellFormatFn1 = function(value, row, col) {
            return "<<" + value + ">>";
        };

        $scope.cellFormatFn2 = function(value, row, col) {
            return "Data: " + value;
        };

        $scope.cellFormatRH = function(value, row, col) {
            return "R:" + value;
        };

        $scope.styleFn = function(value, row, col) {
            var rgb = 'background-color: rgb(' + row + ", 128, " + col + ")";
            return rgb;
        };

    });

