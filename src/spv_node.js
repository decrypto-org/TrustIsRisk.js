// @flow
var bcoin = require("bcoin");
var TrustIsRisk = require("./trust_is_risk");
var Tag = require("./tag");

class SPVNode extends bcoin.spvnode {
  trust : TrustIsRisk
  walletDB : bcoin$WalletDB

  constructor(options : Object) {
    super(options);
    this.trust = new TrustIsRisk(this);
    this.pool.spvFilter.add(Tag.address);
  }
}

module.exports = SPVNode;
