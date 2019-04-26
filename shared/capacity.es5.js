"use strict";

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var Capacity =
/*#__PURE__*/
function () {
  function Capacity(capacityInGiB) {
    _classCallCheck(this, Capacity);

    this.capacityInGiB = capacityInGiB;
  }

  _createClass(Capacity, [{
    key: "toString",
    value: function toString() {
      var precision = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 2;
      var correctUnit = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;
      var capacity = this.capacityInGiB;
      var unit = 0;
      var units = correctUnit ? ['GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'] : ['GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

      while (capacity >= 1024) {
        capacity /= 1024;
        unit += 1;
      }

      return "".concat(capacity.toFixed(precision), " ").concat(units[unit]);
    }
  }], [{
    key: "fromTiB",
    value: function fromTiB(capacityInTiB) {
      return new Capacity(capacityInTiB * 1024);
    }
  }]);

  return Capacity;
}();

module.exports = Capacity;
