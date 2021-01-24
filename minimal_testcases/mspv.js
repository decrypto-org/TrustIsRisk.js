var Trust = require("../");
var helpers = require("../lib/helpers.js");
var bcoin = require("bcoin");
var Script = bcoin.script;
var Address = bcoin.primitives.Address;
var KeyRing = bcoin.primitives.KeyRing;
var MTX = bcoin.primitives.MTX;
var Input = bcoin.primitives.Input;
var Output = bcoin.primitives.Output;
var Outpoint = bcoin.primitives.Outpoint;
var WalletDB = bcoin.wallet.WalletDB;
var testHelpers = require("../test/helpers");
var consensus = require("bcoin/lib/protocol/consensus");
var sinon = require("sinon");
var should = require("should");
var assert = require("assert");

const COIN = consensus.COIN;

(async () => {
  var spvNode = null;
  var miner = null;
  var spvWalletDB = null;
  var minerWalletDB = null;
  var spvWatcher = null;
  var minerWatcher = null;

  miner = new Trust.FullNode({
    network: "regtest",
    port: 48448,
    bip37: true,
    listen: true,
    passphrase: "secret"
  });

  spvNode = new Trust.SPVNode({
    network: "regtest",
    port: 48445,
    passphrase: "secret",
    // logConsole: true,
    // logLevel: "debug",
    nodes: ["127.0.0.1:48448"]
  });

  await miner.open();
  await spvNode.open();

  minerWalletDB = await testHelpers.getWalletDB(miner);
  spvWalletDB = await testHelpers.getWalletDB(spvNode);

  // The spv node must connect BEFORE the full node
  // in order for the spv node to correctly receive txs
  await spvNode.connect();
  await miner.connect();

  miner.startSync();
  spvNode.startSync();

  minerWatcher = new testHelpers.NodeWatcher(miner);
  spvWatcher = new testHelpers.NodeWatcher(spvNode);

  var minerNames = {
    "alice": "alice",
    "bob": "bob",
    "eve": "eve",
    "frank": "frank",
    "george": "george"
  };

  var spvNames = {
    "charlie": "charlie",
    "dave": "dave"
  };

  var minerWallets = {};
  var spvWallets = {};
  var name = null;

  var addresses = {}, rings = {};

  for (name in minerNames) {
    minerWallets[name] = await testHelpers.createWallet(
        minerWalletDB, name);
    rings[name] = await minerWallets[name].getPrivateKey(minerWallets[name].getAddress("base58"), "secret");
    addresses[name] = helpers.pubKeyToEntity(
        rings[name].getPublicKey()
    );
  }

  for (name in spvNames) {
    spvWallets[name] = await testHelpers.createWallet(spvWalletDB, name);
    rings[name] = await spvWallets[name].getPrivateKey(spvWallets[name].getAddress("base58"), "secret");
    addresses[name] = helpers.pubKeyToEntity(
        rings[name].getPublicKey()
    );
    spvNode.pool.watchAddress(addresses[name]);
  }

  // Alice mines three blocks, each rewards her with 50 spendable BTC
  consensus.COINBASE_MATURITY = 0;
  var blockCount = 3;
  var coinbaseHashes = [];
  for(let i = 0; i < blockCount; i++) {
    var block = await testHelpers.mineBlock(
        miner, addresses["alice"]
    );
    coinbaseHashes.push(block.txs[0].hash());
    await testHelpers.delay(500);
  }

  // Alice sends 20 BTC to everyone (including herself) via P2PKH
  var sendAmount = 20;
  outputs = [];
  for (name in minerNames) {
    outputs.push(testHelpers.getP2PKHOutput(
        addresses[name], sendAmount * consensus.COIN
    ));
  }

  for (name in spvNames) {
    outputs.push(testHelpers.getP2PKHOutput(
        addresses[name], sendAmount * consensus.COIN
    ));
  }

  // We have to use a change output, because transactions
  // with too large a fee are considered invalid.
  var fee = 0.01;
  var changeAmount = 50 * blockCount - sendAmount *
     (Object.keys(minerNames).length + Object.keys(spvNames).length) - fee;
  if (changeAmount >= 0.01) {
    outputs.push(new Output({
      script: Script.fromPubkeyhash(bcoin.crypto.hash160(
          rings["alice"].getPublicKey())),
      value: changeAmount * consensus.COIN
    }));
  }

  // Use the coinbase coins as inputs
  var coinbaseCoins = await Promise.all(coinbaseHashes.map((hash) => {
    return miner.getCoin(hash.toString("hex"), 0);
  }));
  var mtx = new MTX({outputs});
  coinbaseCoins.forEach((coin) => mtx.addCoin(coin));

  var signedCount = mtx.sign(rings["alice"]);
  assert(signedCount === blockCount);
  assert(await mtx.verify());
  console.log("success!");
  process.exit();
})();
