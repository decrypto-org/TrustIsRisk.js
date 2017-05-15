var TrustIsRisk = require('../');
var WalletDB = require('bcoin/lib/wallet/walletdb');
var bcoin = require('bcoin');

var testHelpers = {
  getNode: async () => {
    var node = new TrustIsRisk.FullNode({network: 'regtest', passphrase: 'secret'});

    await node.open();
    await node.connect();
    node.startSync();

    return node;
  },

  getWalletDB: async (node) => {
    var walletDB = new WalletDB({
      network: 'regtest',
      db: 'memory',
      client: new bcoin.node.NodeClient(node)
    });

    await walletDB.open();
    await walletDB.connect();

    return walletDB;
  },

  getWallet: async (walletDB, id) => {
    var options = {
      id,
      passphrase: 'secret',
      witness: false,
      type: 'pubkeyhash'
    };

    return walletDB.create(options); 
  },

  mineBlock: async (node, rewardAddress) => {
    var block = await node.miner.mineBlock(node.chain.tip, rewardAddress);
    await node.chain.add(block);
  },

  time: async (milliseconds) => {
    return new Promise((resolve, reject) => {
      setTimeout(resolve, milliseconds);
    });
  }
}

module.exports = testHelpers;
