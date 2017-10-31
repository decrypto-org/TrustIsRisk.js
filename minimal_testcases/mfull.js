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
var testHelpers = require("../test/helpers");
var consensus = require("bcoin/lib/protocol/consensus");
var sinon = require("sinon");
var should = require("should");
var assert = require("assert");
var fixtures = require("../test/fixtures");

const COIN = consensus.COIN;

(async () =>  {
  var node = null;
  var walletDB = null;
  var NodeWatcher = null;
  var watcher = null;

  node = new Trust.FullNode({
    network: "regtest", passphrase: "secret"
  });

  await node.open();

  walletDB = await testHelpers.getWalletDB(node);

  await node.connect();
  node.startSync();

  watcher = new testHelpers.NodeWatcher(node);

  var addresses = {}, rings = fixtures.keyRings;

  for (var [name, keyRing] of Object.entries(rings)) {
    addresses[name] = helpers.pubKeyToEntity(
        keyRing.getPublicKey()
    );
  }

  // Alice mines three blocks, each
  // rewards her with 50 spendable BTC
  consensus.COINBASE_MATURITY = 0;
  var blockCount = 3;
  var coinbaseHashes = [];
  for(let i = 0; i < blockCount; i++) {
    var block = await testHelpers.mineBlock(
        node, addresses.alice
    );
    coinbaseHashes.push(block.txs[0].hash());
    await testHelpers.delay(500);
  }

  // Alice sends 20 BTC to everyone (including herself) via P2PKH
  var sendAmount = 20;
  var outputs = fixtures.names.map((name) => {
    return testHelpers.getP2PKHOutput(
        Address.fromHash(bcoin.crypto.hash160(
            rings[name].getPublicKey())
        ).toBase58(),
        sendAmount * consensus.COIN);
  });

  // We have to use a change output, because transactions
  // with too large a fee are considered invalid.
  var fee = 0.01;
  var changeAmount = 50 * blockCount - sendAmount *
      fixtures.names.length - fee;
  if (changeAmount >= 0.01) {
    outputs.push(new Output({
      script: Script.fromPubkeyhash(bcoin.crypto.hash160(
          rings.alice.getPublicKey())),
      value: changeAmount * consensus.COIN
    }));
  }

  // Use the coinbase coins as inputs
  var coinbaseCoins = await Promise.all(
      coinbaseHashes.map((hash) => {
    return node.getCoin(hash.toString("hex"), 0);
  }));
  var mtx = new MTX({outputs});
  coinbaseCoins.forEach((coin) => mtx.addCoin(coin));

  var signedCount = mtx.sign(rings.alice);
  assert(signedCount === blockCount);
  assert(await mtx.verify());
  console("success!");
  process.exit();
})();
