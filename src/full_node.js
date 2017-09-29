// @flow
var bcoin = require("bcoin");
var TrustIsRisk = require("./trust_is_risk");

class FullNode extends bcoin.fullnode {
  trust : TrustIsRisk.TIR

  constructor(options : Object) {
    super(options);
    this.trust = new TrustIsRisk.TIR(this);
  }
}

module.exports = FullNode;
