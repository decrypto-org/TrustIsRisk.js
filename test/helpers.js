var TrustIsRisk = require("../");
var tag = TrustIsRisk.tag;
var WalletDB = require("bcoin/lib/wallet/walletdb");
var bcoin = require("bcoin");
var Wallet = bcoin.wallet.Wallet;
var fixtures = require("./fixtures");
var assert = require("assert");
const consensus = require("bcoin/lib/protocol/consensus");

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

  removeWallet: async (walletDB, id) => {
    walletDB.remove(id);
  },

  mineBlock: async (node, rewardAddress) => {
    var block = await node.miner.mineBlock(node.chain.tip, rewardAddress);
    await node.chain.add(block);
    // node.chain.tip does not contain all the properties we want,
    // so we need to fetch it:
    return node.getBlock(node.chain.tip.hash);
  },

  circulateCoins: async (fromWallet, fromWatcher,
      toWallet, toWatcher, coins) => {
    const toAccount = await toWallet.getAccount("default");
    const tx = await fromWallet.send({
      outputs: [{
        value: coins * consensus.COIN,
        address: toAccount.receiveAddress()
      }]
    });
    await fromWatcher.waitForTX(tx, fromWallet);
    await toWatcher.waitForTX(tx, toWallet);
    await testHelpers.flushEvents();
    return tx;
  },

  delay: async (milliseconds) => {
    return new Promise((resolve, reject) => {
      setTimeout(resolve, milliseconds);
    });
  },

  flushEvents: () => {
    return testHelpers.delay(100);
  },

  bufferToScript: (data) => {
    return `0x${Number(data.length).toString(16)} 0x${data.toString("hex")}`;
  },

  getP2PKHOutput: (dest, value) => {
    let address;
    if (typeof dest === "string") {
      address = bcoin.primitives.Address.fromString(dest);
    }
    else {
      address = dest;
    }
    var script = bcoin.Script.fromPubkeyhash(address.hash);

    return new bcoin.primitives.Output({script, value});
  },

  getP2PKHInput: (pubKey, prevout) => {
    if (!prevout) {
      prevout = { // Don't care
        hash: Buffer.from("v0pnhphaf4r5wz63j60vnh27s1bftl26"),
        index: 2
      };
    }

    return new bcoin.primitives.Input({
      prevout,
      script: bcoin.Script.fromString(
          // Don't care about the signature
          "0x47 0x3044022035e32834c6ee4db1696cc06762feca2809d865ca12a3b98c801f3f451341a2570220573bf3ffef55f2651e1563acc0a22f8056222f277f5ddf17dd583d4edd40fa6001 "
          + testHelpers.bufferToScript(pubKey))
    });
  },

  getOneOfThreeMultisigOutput: (originPubKey, destPubKey, value) => {
    return new bcoin.primitives.Output({
      script: bcoin.Script.fromMultisig(1, 3, [originPubKey, destPubKey, tag]),
      value
    });
  },

  getTrustIncreasingMTX: (originPubKey, destPubKey, value) => {
    return new bcoin.primitives.MTX({
      inputs: [
        testHelpers.getP2PKHInput(originPubKey)
      ],
      outputs: [
        testHelpers.getOneOfThreeMultisigOutput(originPubKey, destPubKey, value)
      ]
    });
  },

  applyGraph: (trust, fileName, addressBook) => {
    var graph = require(fileName);

    for (var origin in graph) {
      var neighbours = graph[origin];
      for (var dest in neighbours) {
        var value = neighbours[dest];
        trust.addTX(testHelpers.getTrustIncreasingMTX(addressBook[origin].pubKey, addressBook[dest].pubKey, value).toTX());
      }
    }
  }
};

class NodeWatcher {
  constructor(node) {
    this.blockCount = 0;
    this.node = node;
    this.node.on("tx", this.onTX.bind(this));
    this.node.on("block", this.onBlock.bind(this));
    this.waitForSomeTxPromiseResolve = [];
  }

  onTX() {
    for (const resolve of this.waitForSomeTxPromiseResolve) {
      resolve();
    }
    this.waitForSomeTxPromiseResolve = [];
  }

  onBlock() {
    this.blockCount++;
  }

  waitForSomeTX() {
    return new Promise((resolve, reject) => {
      this.waitForSomeTxPromiseResolve.push(resolve);
    });
  }

  async waitForBlock(initialCount) {
    if (initialCount === undefined) initialCount = this.blockCount;
    while (!(this.blockCount > initialCount)) {
      await testHelpers.delay(100);
    }
  }

  async waitForTX(input, wallet) {
    if (wallet instanceof Wallet) {
      while (!(await wallet.getTX(input.hash()))) {
        await this.waitForSomeTX();
      }
      return;
    }
    while (!this.node.trust.db.isTrustTX(input.hash())) {
      await testHelpers.delay(100);
    }
  }

  async waitForTrustDB(tx) {
    while (!(this.node.trust.db.isTrustTX(tx.hash.toString("hex")))) {
      await testHelpers.delay(100);
    }
  }
}

class WalletWatcher {
  constructor(wallet) {
    this.wallet = wallet;
    this.wallet.on("tx", this.onTX.bind(this));
    this.waitForSomeTxPromiseResolve = [];
  }

  onTX() {
    for (const resolve of this.waitForSomeTxPromiseResolve) {
      resolve();
    }
    this.waitForSomeTxPromiseResolve = [];
  }

  waitForSomeTX() {
    return new Promise((resolve, reject) => {
      this.waitForSomeTxPromiseResolve.push(resolve);
    });
  }

  async waitForTX(input) {
    while (!(await this.wallet.getTX(input.hash()))) {
      await this.waitForSomeTX();
    }
  }
}

testHelpers.NodeWatcher = NodeWatcher;
testHelpers.WalletWatcher = WalletWatcher;

module.exports = testHelpers;
