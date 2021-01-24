const WalletDB = require("bcoin/lib/wallet/walletdb");
const bcoin = require("bcoin");
const consensus = require("bcoin/lib/protocol/consensus");

const helpers = {
  delay: async (milliseconds) => {
    return new Promise((resolve, reject) => {
      setTimeout(resolve, milliseconds);
    });
  },

  getNodeAndWalletDB: async (type) => {
    if (type !== "spv" && type !== "full")
      throw Error("Wrong node type");

    const node = (type === "spv") ?
      new bcoin.SPVNode({
        network: bcoin.Network.get().toString(),
        port: 48445,
        passphrase: "secret",
        nodes: ["127.0.0.1:48448"]
      })
    : // type === "full"
      new bcoin.FullNode({
        network: bcoin.Network.get().toString(),
        port: 48448,
        bip37: true,
        listen: true,
        passphrase: "secret",
      });

    await node.open();

    const walletDB = new WalletDB({
      network: node.network,
      db: "memory",
      client: new bcoin.wallet.NodeClient(node),
      spv: node.spv
    });

    await walletDB.open();
    await node.connect();
    node.startSync();

    return [node, walletDB];
  },

  getWallet: async (walletDB, id) => {
    var options = {
      id,
      passphrase: "secret",
      witness: false,
      type: "pubkeyhash"
    };

    return walletDB.create(options);
  },

  mineAndPaySPV: async (fullNode, fullWallet, spvWallet) => {
    const block = await fullNode.miner.mineBlock(
      fullNode.chain.tip, await fullWallet.receiveAddress()
    );
    await fullNode.chain.add(block);

    // Make the coin spendable.
    consensus.COINBASE_MATURITY = 0;
    await helpers.delay(100);

    const ret = await fullWallet.send({
      outputs: [{ // give 25 coins to SPV
        value: 25 * consensus.COIN,
        address: await spvWallet.receiveAddress()
      }]
    });
    return ret;
  },

  waitForTX: async (node, tx) => {
    await new Promise((resolve, reject) => {
      var check = (() => {
        if (node.spv) {
          if (node.pool.txFilter.test(tx.hash().toString("hex"), "hex"))
            resolve();
          else setTimeout(check, 100);
        }
        else { // this is not an SPV node
          if (node.pool.hasTX(tx.hash()))
            resolve();
          else setTimeout(check, 100);
        }
      }).bind(this);

      check();
    });
  }
};

module.exports = helpers;
