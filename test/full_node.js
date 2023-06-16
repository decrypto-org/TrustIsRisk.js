var Trust = require("../");
var helpers = require("../lib/helpers.js");
var bcoin = require("bcoin").set("regtest");
var bcrypto = require("bcrypto");
var Script = bcoin.script.Script;
var WalletDB = bcoin.wallet.WalletDB;
var NodeClient = bcoin.wallet.NodeClient;
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
var fixtures = require("./fixtures");
require("should-sinon");

const COIN = consensus.COIN;

describe("FullNode", () => {
  var node = null;
  var watcher = null;
  var walletDB = null;
  var wallet = null;

  before("set up addTX() spy", function() {
    sinon.spy(Trust.TrustIsRisk.prototype, "addTX");
  });

  after("reset addTX() spy", function() {
    Trust.TrustIsRisk.prototype.addTX.restore();
  });

  beforeEach("prepare node", async () => {
    for (let name in fixtures.keyRings) {
      fixtures.keyRings[name].network = bcoin.Network.get();
    }

    node = new Trust.FullNode({
      network: bcoin.Network.get().toString(),
      passphrase: "secret"
    });
    walletDB = new WalletDB({
      network: bcoin.Network.get().toString(),
      client: new NodeClient(node)
    });
    await node.initialize();

    await walletDB.open();

    node.startSync();

    wallet = await testHelpers.createWallet(walletDB, "wallet");
    for (let name in fixtures.keyRings) {
      await wallet.importKey("default", fixtures.keyRings[name], "secret");
    }
  });

  beforeEach("get watcher", async () => {
    watcher = new testHelpers.WalletWatcher(wallet);
  });

  afterEach("tear node down", async () => {
    await testHelpers.removeWallet(walletDB, "wallet");
    node.stopSync();
    await node.tearDown();
  });

  it("should call trust.addTX() on every transaction", async function() {
    var sender = await testHelpers.createWallet(walletDB, "sender");
    var receiver = await testHelpers.createWallet(walletDB, "receiver");
    const recvWatcher = new testHelpers.WalletWatcher(receiver);

    await testHelpers.delay(1000);
    // Produce a block and reward the sender, so that we have a coin to spend.
    const sendAddr = await sender.receiveAddress();
    await testHelpers.mineBlock(node, {hash: sendAddr.hash});

    // Make the coin spendable.
    consensus.COINBASE_MATURITY = 0;
    await testHelpers.delay(100);

    let tx = await sender.send({
      outputs: [{
        value: 10 * COIN,
        address: await receiver.receiveAddress()
      }]
    });
    await recvWatcher.waitForTX(tx);
    await testHelpers.flushEvents();

    node.trust.addTX.should.have.been.calledOnce();
    await testHelpers.removeWallet(walletDB, "sender");
    await testHelpers.removeWallet(walletDB, "receiver");
  });

  describe("with the nobodyLikesFrank.json example", () => {
    var addresses, rings = {};

    beforeEach("apply graph transactions", async () => {
      addresses = {};

      for (let [name, keyRing] of Object.entries(fixtures.keyRings)) {
        addresses[name] = helpers.pubKeyToEntity(
            keyRing.getPublicKey(), node.network);
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
      var outputs = fixtures.names.map((name) => {
        return testHelpers.getP2PKHOutput(helpers.pubKeyToEntity(
            fixtures.keyRings[name].getPublicKey(), node.network
        ), sendAmount * consensus.COIN);
      });

      // We have to use a change output, because transaction with too large a fee are considered
      // invalid.
      var fee = 0.01;
      var changeAmount = 50 * blockCount - sendAmount * fixtures.names.length - fee;
      if (changeAmount >= 0.01) {
        outputs.push(new Output({
          script: Script.fromPubkeyhash(bcrypto.Hash160.digest(
              fixtures.keyRings.alice.getPublicKey())),
          value: changeAmount * consensus.COIN
        }));
      }

      // Use the coinbase coins as inputs
      var coinbaseCoins = await Promise.all(coinbaseHashes.map((hash) => {
        return node.getCoin(hash, 0);
      }));
      var mtx = new MTX({outputs});
      coinbaseCoins.forEach((coin) => mtx.addCoin(coin));

      var signedCount = mtx.sign(fixtures.keyRings.alice);
      assert(signedCount === blockCount);
      assert(await mtx.verify());

      let tx = mtx.toTX();
      node.sendTX(tx);
      await watcher.waitForTX(tx);
      await testHelpers.flushEvents();

      prevout = {};
      fixtures.names.forEach((name) => {
        prevout[name] = {
          hash: tx.hash(),
          index: fixtures.names.indexOf(name)
        };
      });

      // Alice mines another block
      await testHelpers.mineBlock(node, helpers.pubKeyToEntity(
          fixtures.keyRings.alice.getPublicKey(), node.network));
      await testHelpers.delay(500);

      var graph = require("./graphs/nobodyLikesFrank.json");
      for (var origin in graph) {
        var neighbours = graph[origin];
        for (var dest in neighbours) {
          var value = neighbours[dest];
          if (!value || value < 1) continue;

          let outpoint = new Outpoint(prevout[origin].hash, prevout[origin].index);

          let mtx = await node.trust.createTrustIncreasingMTX(
              fixtures.keyRings[origin].getPrivateKey(),
              fixtures.keyRings[dest].getPublicKey(),
              outpoint, value * consensus.COIN, wallet);

          assert(await mtx.verify());

          let tx = mtx.toTX();
          node.sendTX(tx);
          await watcher.waitForTX(tx);
          await testHelpers.flushEvents(); // @dionyziz: needs a long time

          prevout[origin] = {hash: tx.hash(), index: 1};
        }
      }

      // Alice mines yet another block
      await testHelpers.mineBlock(node, helpers.pubKeyToEntity(
          fixtures.keyRings.alice.getPublicKey(), node.network));
      await testHelpers.delay(500);
    });

    it("computes trusts correctly", () => {
      for (name in addresses) { // Add addresses to scope
        eval(`var ${name} = "${addresses[name]}";`);
      }

      node.trust.getIndirectTrust(alice, alice).should.equal(Infinity);
      node.trust.getIndirectTrust(alice, bob).should.equal(10 * COIN);
      node.trust.getIndirectTrust(alice, charlie).should.equal(1 * COIN);
      node.trust.getIndirectTrust(alice, frank).should.equal(0);
      node.trust.getIndirectTrust(alice, eve).should.equal(6 * COIN);

      node.trust.getIndirectTrust(bob, alice).should.equal(1 * COIN);
      node.trust.getIndirectTrust(bob, eve).should.equal(3 * COIN);
      node.trust.getIndirectTrust(dave, eve).should.equal(12 * COIN);
      node.trust.getIndirectTrust(george, eve).should.equal(0);
    });

    it("after decreasing some trusts computes trusts correctly", async () => {
      var mtxs = await node.trust.createTrustDecreasingMTXs(
          fixtures.keyRings.alice.getPrivateKey(),
          fixtures.keyRings.bob.getPublicKey(), 3 * COIN, wallet);
      mtxs.length.should.equal(1);
      var mtx = await mtxs[0];

      mtx.verify().should.be.true();
      let tx = mtx.toTX();
      node.sendTX(tx);

      await watcher.waitForTX(tx);
      await testHelpers.flushEvents(); // @dionyziz: needs an even longer time

      node.trust.getIndirectTrust(addresses.alice, addresses.bob).should.equal(7 * COIN);
    });
  });

  describe("with the topcoder.json example", () => {
    //TODO: Write tests here.
  });
});
