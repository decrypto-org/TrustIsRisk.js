// @flow
var bcoin = require("bcoin");
var walletPlugin = bcoin.wallet.plugin;
var TrustIsRisk = require("./trust_is_risk");

class FullNode extends bcoin.FullNode {
  trust : TrustIsRisk

  constructor(options : Object) {
    super(options);
//    this.use(walletPlugin);
    this.trust = new TrustIsRisk(this);
  }

  async initialize() {
    await this.trust.initialize();
    await this.open();
    await this.connect();
  }

  async tearDown() {
    await this.disconnect();
    await this.close();
  }
}

module.exports = FullNode;
