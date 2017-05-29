//      
var bcoin = require("bcoin");
var TrustIsRisk = require("./trust_is_risk");

class FullNode extends bcoin.fullnode {
                     

  constructor(options         ) {
    super(options);
    this.trust = new TrustIsRisk(this);
  }
}

module.exports = FullNode;
