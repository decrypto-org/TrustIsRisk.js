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
var testHelpers = require("./helpers");
var consensus = require("bcoin/lib/protocol/consensus");
var sinon = require("sinon");
var should = require("should");
var assert = require("assert");
var fixtures = require("./fixtures");
require("should-sinon");

const COIN = consensus.COIN;

describe("SPVNode", () => {
  var spvNode = null;
  var miner = null;
  var spvWalletDB = null;
  var minerWalletDB = null;
  var spvWatcher = null;
  var minerWatcher = null;

  before("set up addTX() spy", function() {
    sinon.spy(Trust.TrustIsRisk.prototype, "addTX");
  });

  after("reset addTX() spy", function() {
    Trust.TrustIsRisk.prototype.addTX.restore();
  });

  beforeEach("get nodes", () => {
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
  });

  beforeEach("open nodes", async () => {
    await miner.open();
    await spvNode.open();
  });

  beforeEach("get walletDBs", async () => {
    minerWalletDB = await testHelpers.getWalletDB(miner);
    spvWalletDB = await testHelpers.getWalletDB(spvNode);
  });

  beforeEach("connect nodes", async () => {
    // The spv node must connect BEFORE the full node
    // in order for the spv node to correctly receive txs
    await spvNode.connect();
    await miner.connect();
  });

  beforeEach("start syncing nodes", () => {
    miner.startSync();
    spvNode.startSync();
  });

  beforeEach("get watchers", () => {
    minerWatcher = new testHelpers.NodeWatcher(miner);
    spvWatcher = new testHelpers.NodeWatcher(spvNode);
  });

  afterEach("disconnect nodes", async () => {
    spvNode.stopSync();
    miner.stopSync();

    await spvNode.disconnect();
    await miner.disconnect();
  });

  afterEach("disconnect and close walletDBs", async () => {
    await spvWalletDB.disconnect();
    await minerWalletDB.disconnect();

    await spvWalletDB.close();
    await minerWalletDB.close();
  });

  afterEach("close nodes", async () => {
    await spvNode.close();
    await miner.close();
  });

  it("should call trust.addTX() on every transaction", async function() {
    var spvWallet1 = await testHelpers.createWallet(spvWalletDB, "spvWallet1");
    var spvWallet2 = await testHelpers.createWallet(spvWalletDB, "spvWallet2");

    var minerWallet1 = await testHelpers.createWallet(minerWalletDB, "minerWallet1");
    var minerWallet2 = await testHelpers.createWallet(minerWalletDB, "minerWallet2");

    spvNode.pool.watchAddress(minerWallet1.getAddress());
    spvNode.pool.watchAddress(minerWallet2.getAddress());

    spvNode.pool.watchAddress(spvWallet1.getAddress());
    spvNode.pool.watchAddress(spvWallet2.getAddress());

    await testHelpers.delay(1000);
    // Produce a block and reward the minerWallet1, so that we have a coin to spend.
    await testHelpers.mineBlock(miner, minerWallet1.getAddress("base58"));

    // Make the coin spendable.
    consensus.COINBASE_MATURITY = 0;
    await testHelpers.delay(100);

    var miner2TX = await minerWallet1.send({
      outputs: [{
        value: 10 * COIN,
        address: minerWallet2.getAddress("base58")
      }]
    });
    await minerWatcher.waitForTX(miner2TX);
    await spvWatcher.waitForTX(miner2TX);
    await spvWalletDB.addTX(miner2TX);
    await testHelpers.delay(300);

    miner.trust.addTX.should.have.been.calledOnce();
    spvNode.trust.addTX.should.have.been.calledOnce();

    var minerSpvTX = await minerWallet2.send({
      outputs: [{
        value: 9 * COIN,
        address: spvWallet1.getAddress("base58")
      }]
    });
    await minerWatcher.waitForTX(minerSpvTX);
    await spvWatcher.waitForTX(minerSpvTX);
    await spvWalletDB.addTX(minerSpvTX);

    miner.trust.addTX.should.have.been.calledTwice();
    spvNode.trust.addTX.should.have.been.calledTwice();

    var spv2TX = await spvWallet1.send({
      outputs: [{
        value: 8 * COIN,
        address: spvWallet2.getAddress("base58")
      }]
    });
    await minerWatcher.waitForTX(spv2TX);
    await spvWatcher.waitForTX(spv2TX);
    await minerWalletDB.addTX(spv2TX);

    miner.trust.addTX.should.have.been.calledThrice();
    spvNode.trust.addTX.should.have.been.calledThrice();

    var spvMinerTX = await spvWallet2.send({
      outputs: [{
        value: 7 * COIN,
        address: minerWallet1.getAddress("base58")
      }]
    });
    await minerWatcher.waitForTX(spvMinerTX);
    await spvWatcher.waitForTX(spvMinerTX);
    await minerWalletDB.addTX(spvMinerTX);
  });

  describe.only("with the nobodyLikesFrank.json example", () => {
    var addresses, rings = {};

    beforeEach("apply graph transactions", async () => {
      addresses = {};

      for (var [name, keyRing] of Object.entries(fixtures.keyRings)) {
        addresses[name] = helpers.pubKeyToEntity(keyRing.getPublicKey());
      }

      spvNode.pool.watchAddress(addresses["charlie"]);
      spvNode.pool.watchAddress(addresses["dave"]);

      // Alice mines three blocks, each rewards her with 50 spendable BTC
      consensus.COINBASE_MATURITY = 0;
      var blockCount = 3;
      var coinbaseHashes = [];
      for(let i = 0; i < blockCount; i++) {
        var block = await testHelpers.mineBlock(miner, addresses.alice);
        coinbaseHashes.push(block.txs[0].hash());
        await testHelpers.delay(500);
      }

      // Alice sends 20 BTC to everyone (including herself) via P2PKH
      var sendAmount = 20;
      var outputs = fixtures.names.map((name) => {
        return testHelpers.getP2PKHOutput(
            Address.fromHash(bcoin.crypto.hash160(fixtures.keyRings[name].getPublicKey()))
                .toBase58(),
            sendAmount * consensus.COIN);
      });

      // We have to use a change output, because transactions with too large a fee are
      // considered invalid.
      var fee = 0.01;
      var changeAmount = 50 * blockCount - sendAmount * fixtures.names.length - fee;
      if (changeAmount >= 0.01) {
        outputs.push(new Output({
          script: Script.fromPubkeyhash(bcoin.crypto.hash160(
              fixtures.keyRings.alice.getPublicKey())),
          value: changeAmount * consensus.COIN
        }));
      }

      // Use the coinbase coins as inputs
      var coinbaseCoins = await Promise.all(coinbaseHashes.map((hash) => {
        return miner.getCoin(hash.toString("hex"), 0);
      }));
      var mtx = new MTX({outputs});
      coinbaseCoins.forEach((coin) => mtx.addCoin(coin));

      var signedCount = mtx.sign(fixtures.keyRings.alice);
      assert(signedCount === blockCount);
      assert(await mtx.verify());
      
      var tx = mtx.toTX();

      miner.sendTX(tx);
      await minerWatcher.waitForTX();

      prevout = {};
      fixtures.names.forEach((name) => {
        prevout[name] = {
          hash: tx.hash().toString("hex"),
          index: fixtures.names.indexOf(name)
        };
      });
      
      // Alice mines another block
      await testHelpers.mineBlock(miner, helpers.pubKeyToEntity(
          fixtures.keyRings.alice.getPublicKey()));
      await testHelpers.delay(500);

      var graph = require("./graphs/nobodyLikesFrank.json");
      for (var origin in graph) {
        var neighbours = graph[origin];
        for (var dest in neighbours) {
          var value = neighbours[dest];
          if (!value || value < 1) continue;

          let node = null;
          let watcher = null;
          if (origin === "charlie" || origin == "dave") {
            node = spvNode;
            watcher = spvWatcher;
          }
          else {
            node = miner;
            watcher = minerWatcher;
          }

          let outpoint = new Outpoint(prevout[origin].hash, prevout[origin].index);

          let mtx = null;
          if (node.spv) {
            mtx = await node.trust.ccreateTrustIncreasingMTX(
                fixtures.keyRings[origin].getPrivateKey(),
                fixtures.keyRings[dest].getPublicKey(),
                outpoint,
                value * consensus.COIN,
                wallet); // Must pass some wallet to getTX from that
          }
          else { // if full node
            mtx = await node.trust.createTrustIncreasingMTX(
                fixtures.keyRings[origin].getPrivateKey(),
                fixtures.keyRings[dest].getPublicKey(),
                outpoint,
                value * consensus.COIN);
          }
					
          assert(await mtx.verify());

          let tx = mtx.toTX();
          node.sendTX(tx);
          await watcher.waitForTX();
					
          prevout[origin] = {hash: tx.hash().toString("hex"), index: 1};
        }
      }
      
      // Alice mines yet another block
      await testHelpers.mineBlock(miner, helpers.pubKeyToEntity(
          fixtures.keyRings.alice.getPublicKey()));
      await testHelpers.delay(500);
    });

    it("lets the miner compute trusts correctly", () => {
      for (name in addresses) { // Add addresses to scope
        eval(`var ${name} = "${addresses[name]}";`);
      }

      should(miner.trust.getIndirectTrust(alice, alice)).equal(Infinity);
      should(miner.trust.getIndirectTrust(alice, bob)).equal(10 * COIN);
      should(miner.trust.getIndirectTrust(alice, charlie)).equal(1 * COIN);
      should(miner.trust.getIndirectTrust(alice, frank)).equal(0);
      should(miner.trust.getIndirectTrust(alice, eve)).equal(6 * COIN);

      should(miner.trust.getIndirectTrust(bob, alice)).equal(1 * COIN);
      should(miner.trust.getIndirectTrust(bob, eve)).equal(3 * COIN);
      should(miner.trust.getIndirectTrust(dave, eve)).equal(12 * COIN);
      should(miner.trust.getIndirectTrust(george, eve)).equal(0);
    });

    it("lets the SPV node compute trusts correctly", () => {
      for (name in addresses) { // Add addresses to scope
        eval(`var ${name} = "${addresses[name]}";`);
      }	

      should(spvNode.trust.getIndirectTrust(alice, alice)).equal(Infinity);
      should(spvNode.trust.getIndirectTrust(alice, bob)).equal(10 * COIN);
      should(spvNode.trust.getIndirectTrust(alice, charlie)).equal(1 * COIN);
      should(spvNode.trust.getIndirectTrust(alice, frank)).equal(0);
      should(spvNode.trust.getIndirectTrust(alice, eve)).equal(6 * COIN);

      should(spvNode.trust.getIndirectTrust(bob, alice)).equal(1 * COIN);
      should(spvNode.trust.getIndirectTrust(bob, eve)).equal(3 * COIN);
      should(spvNode.trust.getIndirectTrust(dave, eve)).equal(12 * COIN);
      should(spvNode.trust.getIndirectTrust(george, eve)).equal(0);
    });

    it("after decreasing some trusts lets both nodes compute trusts correctly", async () => {
      var mtxs = miner.trust.createTrustDecreasingMTXs(fixtures.keyRings.alice.getPrivateKey(),
          fixtures.keyRings.bob.getPublicKey(), 3 * COIN);
      mtxs.length.should.equal(1);
      var mtx = mtxs[0];

      should(await mtx.verify());
      miner.sendTX(mtx.toTX());

      await testHelpers.delay(750);
      should(miner.trust.getIndirectTrust(addresses.alice, addresses.bob)).equal(7 * COIN);
      should(spvNode.trust.getIndirectTrust(addresses.alice, addresses.bob)).equal(7 * COIN);

      mtxs = spvNode.trust.createTrustDecreasingMTXs(fixtures.keyRings.dave.getPrivateKey(),
      fixtures.keyRings.eve.getPublicKey(), 2 * COIN);
      mtxs.length.should.equal(1);
      mtx = mtxs[0];

      should(await mtx.verify());
      spvNode.sendTX(mtx.toTX());

      await testHelpers.delay(750);
      should(miner.trust.getIndirectTrust(addresses.dave, addresses.eve)).equal(10 * COIN);
      should(spvNode.trust.getIndirectTrust(addresses.dave, addresses.eve)).equal(10 * COIN);
    });
  });

  describe("with the topcoder.json example", () => {
    //TODO: Write tests here.
  });
});
