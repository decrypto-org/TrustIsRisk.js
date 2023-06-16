// @flow
var bcoin = require("bcoin");
var walletPlugin = bcoin.wallet.plugin;
var TrustIsRisk = require("./trust_is_risk");

// Usage:
// const node = new Trust.SPVNode;
// const wdb = new bcoin.wallet.WalletDB({
//   client: new bcoin.wallet.NodeClient(node),
//   spv: true
// });
// await node.initialize();
// node.pool.spvFilter.add(Trust.tag);

class SPVNode extends bcoin.SPVNode {
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

module.exports = SPVNode;
