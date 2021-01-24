var WalletDB = require("bcoin/lib/wallet/walletdb");
var bcoin = require("bcoin");
var assert = require("assert");

var testHelpers = {
  createWallet: async (walletDB, id) => {
    var options = {
      id,
      passphrase: "secret",
      witness: false,
      type: "pubkeyhash"
    };

    return walletDB.create(options);
  },

  mineBlock: async (node, rewardAddress) => {
    var block = await node.miner.mineBlock(node.chain.tip, rewardAddress);
    await node.chain.add(block);
    // node.chain.tip does not contain all the properties we want,
    // so we need to fetch it:
    return node.getBlock(node.chain.tip.hash);
  },

  delay: async (milliseconds) => {
    return new Promise((resolve, reject) => {
      setTimeout(resolve, milliseconds);
    });
  }
};

class NodeWatcher {
  constructor(node) {
    this.txCount = 0;
    this.blockCount = 0;
    this.node = node;
    this.node.on("tx", this.onTX.bind(this));
    this.node.on("block", this.onBlock.bind(this));
  }

  onTX() {
    this.txCount++;
  }

  onBlock() {
    this.blockCount++;
  }

  async waitForBlock(initialCount) {
    if (initialCount === undefined) initialCount = this.blockCount;
    await new Promise((resolve, reject) => {
      var check = (() => {
        if (this.blockCount > initialCount) resolve();
        else setTimeout(check, 100);
      }).bind(this);

      check();
    });
  }

  async waitForTX(input, wallet) {
    if (wallet) {
      while (true) {
        if (await wallet.getTX(input.hash("hex"))) 
          break;
        await testHelpers.delay(100);
      }
    }
    var initialCount = null;
    switch (typeof input) {
    case "number":
      initialCount = input;
      await new Promise((resolve, reject) => {
        var check = (() => {
          if (this.txCount > initialCount)
            resolve();
          else setTimeout(check, 100);
        }).bind(this);

        check();
      });
      break;

    case "undefined": // TODO: reuse code
      initialCount = this.txCount;
      await new Promise((resolve, reject) => {
        var check = (() => {
          if (this.txCount > initialCount)
            resolve();
          else setTimeout(check, 100);
        }).bind(this);

        check();
      });
      break;

    case "object":
      var tx = input;
      await new Promise((resolve, reject) => {
        var check = (() => {
          // This breaks node.pool.on("tx", ...)
          if (this.node.spv) {
            if (this.node.pool.txFilter.test(tx.hash().toString("hex"), "hex"))
              resolve();
            else setTimeout(check, 100);
          }
          else { // this is not an SPV node
            if (this.node.pool.hasTX(tx.hash().toString("hex")))
              resolve();
            else setTimeout(check, 100);
          }
        }).bind(this);

        check();
      });
      break;

    default:
      throw new Error("input cannot be " + typeof input); // TODO: throw correct error
    }
  }
}

testHelpers.NodeWatcher = NodeWatcher;

module.exports = testHelpers;
