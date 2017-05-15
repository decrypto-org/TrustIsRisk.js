// @flow
var bcoin = require('bcoin');

class TrustIsRisk {
  node : bcoin.fullnode

  constructor(node : bcoin.fullnode) {
    this.node = node;

    this.node.on('tx', this.addTX.bind(this));
  }

  addTX(tx : bcoin.TX) : boolean {
    if (!this.isTrustTX(tx)) return false;
    // TODO
    return true;
  }

  isTrustTX(tx : bcoin.TX) : boolean {
    return true; // TODO
  }

}


module.exports = TrustIsRisk;
