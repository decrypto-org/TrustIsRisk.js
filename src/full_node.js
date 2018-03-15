// @flow
var bcoin = require("bcoin");
var walletPlugin = bcoin.wallet.plugin;
var TrustIsRisk = require("./trust_is_risk");

class FullNode extends bcoin.fullnode {
  trust : TrustIsRisk
  walletDB : bcoin$WalletDB

  constructor(options : Object) {
    super(options);
    this.use(walletPlugin);
    this.trust = new TrustIsRisk(this);
  }

  async initialize() {
    this.walletDB = this.require("walletdb"); // TODO move walletDB to the hands of the user
    await this.open();
    await this.connect();
  }
}

module.exports = FullNode;
