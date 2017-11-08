var helpers = require("../lib/helpers.js");
var bcoin = require("bcoin").set("regtest");
var Script = bcoin.script;
var Address = bcoin.primitives.Address;
var KeyRing = bcoin.primitives.KeyRing;
var MTX = bcoin.primitives.MTX;
var Input = bcoin.primitives.Input;
var Output = bcoin.primitives.Output;
var Outpoint = bcoin.primitives.Outpoint;
var WalletDB = bcoin.wallet.WalletDB;
var consensus = require("bcoin/lib/protocol/consensus");
var assert = require("assert");

const COIN = consensus.COIN;

var spvNode = null;
var miner = null;
var spvWalletDB = null;
var minerWalletDB = null;
var spvWatcher = null;
var minerWatcher = null;

(async () => {
  spvNode = new bcoin.node.SPVNode({
    network: bcoin.network.get().toString(),
    port: 48445,
    passphrase: "secret",
    // logConsole: true,
    // logLevel: "debug",
    nodes: ["127.0.0.1:48448"]
  });
  await spvNode.open();
  spvWalletDB = await getWalletDB(spvNode);
  await spvNode.connect();

  miner = new bcoin.node.FullNode({
    network: bcoin.network.get().toString(),
    port: 48448,
    bip37: true,
    listen: true,
    passphrase: "secret"
  });
  await miner.open();
  minerWalletDB = await getWalletDB(miner);
  await miner.connect();

  miner.startSync();
  spvNode.startSync();

  // minerWatcher = new testHelpers.NodeWatcher(miner);
  // spvWatcher = new testHelpers.NodeWatcher(spvNode);

  var spvWallet1 = await createWallet(spvWalletDB, "spvWallet1");
  var spvWallet2 = await createWallet(spvWalletDB, "spvWallet2");

  var minerWallet1 = await createWallet(minerWalletDB, "minerWallet1");
  var minerWallet2 = await createWallet(minerWalletDB, "minerWallet2");

  spvNode.pool.watchAddress(minerWallet1.getAddress());
  spvNode.pool.watchAddress(minerWallet2.getAddress());

  spvNode.pool.watchAddress(spvWallet1.getAddress());
  spvNode.pool.watchAddress(spvWallet2.getAddress());

  await delay(1000);
  // Produce a block and reward the minerWallet1, so that we have a coin to spend.
  await mineBlock(miner, minerWallet1.getAddress("base58"));

  // Make the coin spendable.
  consensus.COINBASE_MATURITY = 0;
  await delay(100);

  var miner2TX = await minerWallet1.send({
    outputs: [{
      value: 10 * COIN,
      address: minerWallet2.getAddress("base58")
    }]
  });
  await waitForTX(miner, miner2TX);
  await delay(300);

  var minerSpvTX = await minerWallet2.send({
    outputs: [{
      value: 9 * COIN,
      address: spvWallet1.getAddress("base58")
    }]
  });
  await waitForTX(miner, minerSpvTX);
  await delay(600);
  spvNode.pool.getTX(spvNode.pool.peers.head(), [minerSpvTX.hash()]);
  console.log(minerSpvTX.hash());
  console.log(minerSpvTX.outputs[0]);
  await delay(6000);

  var spv2TX = await spvWallet1.send({
    outputs: [{
      value: 8 * COIN,
      address: spvWallet2.getAddress("base58")
    }]
  });
  console.log("tria");
  await waitForTX(spvNode, spv2TX);
  await waitForTX(miner, spv2TX);
  console.log(spvNode.pool.txFilter.test(spv2TX.hash().toString("hex"), "hex"));

  var spvMinerTX = await spvWallet2.send({
    outputs: [{
      value: 7 * COIN,
      address: minerWallet1.getAddress("base58")
    }]
  });
  await waitForTX(miner, spvMinerTX);
  await waitForTX(spvNode, spvMinerTX);
  await minerWalletDB.addTX(spvMinerTX);
  process.exit();
})();

var getWalletDB = async (node) => {
  var walletDB = new WalletDB({
    network: node.network,
    db: "memory",
    client: new bcoin.node.NodeClient(node)
  });

  await walletDB.open();
  await walletDB.connect();

  return walletDB;
};

var createWallet = async (walletDB, id) => {
  var options = {
    id,
    passphrase: "secret",
    witness: false,
    type: "pubkeyhash"
  };

  return walletDB.create(options); 
};

var delay = async (milliseconds) => {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, milliseconds);
  });
};

var mineBlock = async (node, rewardAddress) => {
  var block = await node.miner.mineBlock(node.chain.tip, rewardAddress);
  await node.chain.add(block);
  // node.chain.tip does not contain all the properties we want,
  // so we need to fetch it:
  return node.getBlock(node.chain.tip.hash);
};

var waitForTX = async (node, input) => {
  var tx = input;
  await new Promise((resolve, reject) => {
    var check = () => {
      // This breaks node.pool.on("tx", ...)
      if (node.spv) {
        if (node.pool.txFilter.test(tx.hash().toString("hex"), "hex"))
          resolve();
        else setTimeout(check, 100);
      }
      else { // this is not an SPV node
        if (node.pool.hasTX(tx.hash().toString("hex")))
          resolve();
        else setTimeout(check, 100);
      }
    };

    check();
  });
}
