// @flow
var bcoin = require("bcoin");
var walletPlugin = bcoin.wallet.plugin;
var TrustIsRisk = require("./trust_is_risk");
var tag = require("./tag");

class SPVNode extends bcoin.spvnode {
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
    this.pool.spvFilter.add(tag);
  }

  async tearDown() {
    await this.disconnect();
    await this.walletDB.disconnect();
    await this.walletDB.close();
    await this.close();
  }
}

module.exports = SPVNode;
