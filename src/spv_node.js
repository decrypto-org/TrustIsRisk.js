// @flow
var bcoin = require("bcoin");
var TrustIsRisk = require("./trust_is_risk");

class SpvNode extends bcoin.spvnode {
  trust : TrustIsRisk

  constructor(options : Object) {
    super(options);
    this.trust = new TrustIsRisk(this);
  }
}

module.exports = SpvNode;
