// @flow
var bcoin = require("bcoin");
var TrustIsRisk = require("./trust_is_risk");

class FullNode extends bcoin.fullnode {
  trust : TrustIsRisk.Tir

  constructor(options : Object) {
    super(options);
    this.trust = new TrustIsRisk.Tir(this);
  }
}

module.exports = FullNode;
