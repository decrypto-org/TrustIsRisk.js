//      
var bcoin = require('bcoin');

class TrustIsRisk {
                       

  constructor(node                 ) {
    this.node = node;

    this.node.on('tx', this.addTX.bind(this));
  }

  addTX(tx           )           {
    if (!this.isTrustTX(tx)) return false;
    // TODO
    return true;
  }

  isTrustTX(tx           )           {
    return true; // TODO
  }

}


module.exports = TrustIsRisk;
