//      
var bcoin = require('bcoin');

class fullnode extends bcoin.fullnode {
  constructor(options         ) {
    super(options);
  }
}

module.exports = {
  fullnode
}
