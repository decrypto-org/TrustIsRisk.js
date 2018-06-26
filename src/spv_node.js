// @flow
var bcoin = require("bcoin");
var walletPlugin = bcoin.wallet.plugin;
var TrustIsRisk = require("./trust_is_risk");
var tag = require("./tag");

class SPVNode extends bcoin.spvnode {
  trust : TrustIsRisk

  constructor(options : Object) {
    super(options);
    this.use(walletPlugin);
    this.trust = new TrustIsRisk(this);
  }

  async initialize() {
    await this.trust.initialize();
    await this.open();
    await this.connect();
    this.pool.spvFilter.add(tag);
  }

  async tearDown() {
    await this.disconnect();
    await this.close();
  }
}

module.exports = SPVNode;
