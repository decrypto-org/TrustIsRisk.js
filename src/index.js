// @flow
var bcoin = require('bcoin');

class fullnode extends bcoin.fullnode {
  constructor(options : Object) {
    super(options);
  }
}

module.exports = {
  fullnode
}
