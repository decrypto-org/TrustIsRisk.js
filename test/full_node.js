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
var testHelpers = require("./helpers");
var consensus = require("bcoin/lib/protocol/consensus");
var sinon = require("sinon");
var should = require("should");
var assert = require("assert");
require("should-sinon");

const COIN = consensus.COIN;

describe("FullNode", () => {
  var node = null;
  var walletDB = null;
  var NodeWatcher = null;
  var watcher = null;
  sinon.spy(Trust.TrustIsRisk.prototype, "addTX");

  beforeEach("get node", async () => {
    node = await testHelpers.getNode();
    watcher = new testHelpers.NodeWatcher(node);
  });

  beforeEach("get walletDB", async () => {
    walletDB = await testHelpers.getWalletDB(node);
  });

  afterEach("close walletDB", async () => walletDB.close());
  afterEach("close node", async () => node.close());

  it("should call trust.addTX() on every transaction", async function() {
    var sender = await testHelpers.createWallet(walletDB, "sender");
    var receiver = await testHelpers.createWallet(walletDB, "receiver");

    await testHelpers.delay(1000);
    // Produce a block and reward the sender, so that we have a coin to spend.
    await testHelpers.mineBlock(node, sender.getAddress("base58"));

    // Make the coin spendable.
    consensus.COINBASE_MATURITY = 0;
    await testHelpers.delay(100);

    await sender.send({
      outputs: [{
        value: 10 * COIN,
        address: receiver.getAddress("base58")
      }]
    });
    await watcher.waitForTX();
    
    node.trust.addTX.should.be.calledOnce();
  });

  describe("with the nobodyLikesFrank.json example", () => {
    var addresses, rings = {};

    beforeEach("apply graph transactions", async () => {
      addresses = {};
      rings = {};

      for (let i = 0; i < testHelpers.names.length; i++) {
        var name = testHelpers.names[i];
        rings[name] = testHelpers.rings[i];
        addresses[name] = helpers.pubKeyToEntity(rings[name].getPublicKey());
      }

      // Alice mines three blocks, each rewards her with 50 spendable BTC
      consensus.COINBASE_MATURITY = 0;
      var blockCount = 3;
      var coinbaseHashes = [];
      for(let i = 0; i < blockCount; i++) {
        var block = await testHelpers.mineBlock(node, addresses.alice);
        coinbaseHashes.push(block.txs[0].hash());
        await testHelpers.delay(500);
      }

      // Alice sends 20 BTC to everyone (including herself) via P2PKH
      var sendAmount = 20;
      var outputs = testHelpers.names.map((name) => {
        return testHelpers.getP2PKHOutput(
            Address.fromHash(bcoin.crypto.hash160(rings[name].getPublicKey())).toBase58(),
            sendAmount * consensus.COIN);
      });

      // We have to use a change output, because transaction with too large a fee are considered
      // invalid.
      var fee = 0.01;
      var changeAmount = 50 * blockCount - sendAmount * testHelpers.names.length - fee;
      if (changeAmount >= 0.01) {
        outputs.push(new Output({
          script: Script.fromPubkeyhash(bcoin.crypto.hash160(rings.alice.getPublicKey())),
          value: changeAmount * consensus.COIN
        }));
      }

      // Use the coinbase coins as inputs
      var coinbaseCoins = await Promise.all(coinbaseHashes.map((hash) => {
        return node.getCoin(hash.toString("hex"), 0);
      }));
      var mtx = new MTX({outputs});
      coinbaseCoins.forEach((coin) => mtx.addCoin(coin));

      var signedCount = mtx.sign(rings.alice);
      assert(signedCount === blockCount);
      assert(await mtx.verify());
      
      var tx = mtx.toTX();
      node.sendTX(tx);
      await watcher.waitForTX();

      prevout = {};
      testHelpers.names.forEach((name) => {
        prevout[name] = {
          hash: tx.hash().toString("hex"),
          index: testHelpers.names.indexOf(name)
        };
      });
      
      // Alice mines another block
      await testHelpers.mineBlock(node, helpers.pubKeyToEntity(rings.alice.getPublicKey()));
      await testHelpers.delay(500);

      var graph = require("./graphs/nobodyLikesFrank.json");
      for (var origin in graph) {
        var neighbours = graph[origin];
        for (var dest in neighbours) {
          var value = neighbours[dest];
          if (!value || value < 1) continue;

          let outpoint = new Outpoint(prevout[origin].hash, prevout[origin].index);
					
          let mtx = await node.trust.createTrustIncreasingMTX(rings[origin].getPrivateKey(),
              rings[dest].getPublicKey(), outpoint, value * consensus.COIN);
					
          assert(await mtx.verify());

          let tx = mtx.toTX();
          node.sendTX(tx);
          await watcher.waitForTX();
					
          prevout[origin] = {hash: tx.hash().toString("hex"), index: 1};
        }
      }
      
      // Alice mines yet another block
      await testHelpers.mineBlock(node, helpers.pubKeyToEntity(rings.alice.getPublicKey()));
      await testHelpers.delay(500);
    });

    it("computes trusts correctly", () => {
      for (name in addresses) { // Add addresses to scope
        eval(`var ${name} = "${addresses[name]}";`);
      }	

      should(node.trust.getIndirectTrust(alice, alice)).equal(Infinity);
      should(node.trust.getIndirectTrust(alice, bob)).equal(10 * COIN);
      should(node.trust.getIndirectTrust(alice, charlie)).equal(1 * COIN);
      should(node.trust.getIndirectTrust(alice, frank)).equal(0);
      should(node.trust.getIndirectTrust(alice, eve)).equal(6 * COIN);

      should(node.trust.getIndirectTrust(bob, alice)).equal(1 * COIN);
      should(node.trust.getIndirectTrust(bob, eve)).equal(3 * COIN);
      should(node.trust.getIndirectTrust(dave, eve)).equal(12 * COIN);
      should(node.trust.getIndirectTrust(george, eve)).equal(0);
    });

    it("after decreasing some trusts computes trusts correctly", async () => {
      var mtxs = node.trust.createTrustDecreasingMTXs(rings.alice.getPrivateKey(),
          rings.bob.getPublicKey(), 3 * COIN);
      mtxs.length.should.equal(1);
      var mtx = mtxs[0];

      should(await mtx.verify());
      node.sendTX(mtx.toTX());

      await testHelpers.delay(750);
      should(node.trust.getIndirectTrust(addresses.alice, addresses.bob)).equal(7 * COIN);
    });
  });
});
