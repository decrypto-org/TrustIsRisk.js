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
var fixtures = require("./testnet_fixtures");
require("should-sinon");

const COIN = 1000;

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
      network: "testnet", passphrase: "secret"
    });

    spvNode = new Trust.SPVNode({
      network: "testnet", passphrase: "secret", port: 48333
    });
  });

  beforeEach("open nodes", async () => {
    await miner.open();
    await spvNode.open();
  });

  beforeEach("connect nodes", async () => {
    await miner.connect();
    await spvNode.connect();
  });

  beforeEach("start syncing nodes", () => {
    miner.startSync();
    spvNode.startSync();
  });

  beforeEach("get watchers", () => {
    minerWatcher = new testHelpers.NodeWatcher(miner);
    spvWatcher = new testHelpers.NodeWatcher(spvNode);
  });

  beforeEach("get walletDBs", async () => {
    spvWalletDB = await testHelpers.getWalletDB(spvNode);
    minerWalletDB = await testHelpers.getWalletDB(miner);
  });

//  beforeEach("add miner to spvNode as peer", async () => {
//    const minerAddr = bcoin.netaddress.fromHostname(miner.http.config.host + ":" + miner.http.config.port, "regtest");
//    spvNode.pool.peer.connect(minerAddr);
//    spvNode.pool.peer.tryOpen();

//    const minerAddr = miner.http.config.host + ":" + miner.http.config.port;
//
//    (async () => {
//      const result = await spvNode.rpc.execute("addnode", [minerAddr, "add"]);
//      console.log(result);
//    })().catch((err) => {
//      console.error(err.stack);
//    });
//  });

  afterEach("close walletDBs", async () => {
    await testHelpers.closeWalletDB(spvWalletDB);
    await testHelpers.closeWalletDB(minerWalletDB);
  });

  afterEach("close nodes", async () => {
    await testHelpers.closeNode(spvNode);
    await testHelpers.closeNode(miner);
  });

  it("should call trust.addTX() on every transaction", async function() {
    var spvSender = await testHelpers.testnetCreateWallet(spvWalletDB, "spvSender");
    var spvReceiver = await testHelpers.testnetCreateWallet(spvWalletDB, "spvReceiver");

    var minerSender = await testHelpers.testnetCreateWallet(minerWalletDB, "minerSender");
    var minerReceiver = await testHelpers.testnetCreateWallet(minerWalletDB, "minerReceiver");

    await testHelpers.delay(100);

    var miner2TX = await minerSender.send({
      outputs: [{
        value: 10 * COIN,
        address: minerReceiver.getAddress("base58")
      }]
    });
    await minerWatcher.waitForTX(undefined, miner2TX.rhash());
    
    miner.trust.addTX.should.be.calledOnce();

    var minerSpvTX = await minerSender.send({
      outputs: [{
        value: 10 * COIN,
        address: spvSender.getAddress("base58")
      }]
    });
    await spvWatcher.waitForTX(undefined, minerSpvTX.rhash());

    miner.trust.addTX.should.be.calledTwice();

    var spv2TX = await spvSender.send({
      outputs: [{
        value : 5 * COIN,
        address: spvReceiver.getAddres("base58")
      }]
    });
    await spvWatcher.waitForTX(undefined, spv2TX.rhash());

    spv.trust.addTX.should.be.calledOnce(); // @dionyziz: or maybe Thrice()?

    var spvMinerTX = await spvReceiver.send({
      outputs: [{
        value: 2 * COIN,
        address: minerSender.getAddress("base58")
      }]
    });
    await minerWatcher.waitForTX(undefined, spvMinerTX.rhash());

    spv.trust.addTX.should.be.calledTwice();
  });

  describe("with the nobodyLikesFrank.json example", () => {
    var addresses, rings = {}, wallets;

    before("apply graph transactions", async () => {
      addresses = {};
      wallets = {};

      for (var [name, keyRing] of Object.entries(fixtures.keyRings)) {
        addresses[name] = helpers.pubKeyToEntity(keyRing.getPublicKey());
        // Create wallet for the keyrings
        if (name === "charlie" || name === "dave") {
          wallets[name] = await testHelpers.testnetCreateWallet(spvWallet, name + "Wallet");
        } else {
          wallets[name] = await testHelpers.testnetCreateWallet(minerWallet, name + "Wallet");
        }
        wallets[name].importKey(null, keyRing, "secret");
      }

      // Wait for tx where Alice gets coins
      txidAliceIsPaid = "888d862cccd0152e6c8ea202480d648dc99c07309a6360dd178c09112b1a9585";
      await minerWatcher.waitForTX(undefined, txidAliceIsPaid);

      // Alice sends 20*10e-3 BTC to everyone (including herself) via P2PKH
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
      var aliceBalance = await wallets[alice].getBalance();
      var changeAmount =  aliceBalance - sendAmount * fixtures.names.length - fee;
      if (changeAmount >= 0.01) {
        outputs.push(new Output({
          script: Script.fromPubkeyhash(bcoin.crypto.hash160(
              fixtures.keyRings.alice.getPublicKey())),
          value: changeAmount * COIN
        }));
      }

      // Use Alice's coins as input
      var initialCoin = await wallets[alice].getCoin(txidAliceIsPaid, 0);
      var mtx = new MTX({outputs});
      mtx.addCoin(initialCoin);

      var signedCount = mtx.sign(fixtures.keyRings.alice);
      assert(await mtx.verify());
      
      var tx = mtx.toTX();
      miner.sendTX(tx);
      await minerWatcher.waitForTX(undefined, tx.rhash());

      prevout = {};
      fixtures.names.forEach((name) => {
        prevout[name] = {
          hash: tx.hash().toString("hex"),
          index: fixtures.names.indexOf(name)
        };
      });
      
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
            console.log(node.pool.peers);
            mtx = await node.trust.ccreateTrustIncreasingMTX( // TODO: fix this
                fixtures.keyRings[origin].getPrivateKey(),
                fixtures.keyRings[dest].getPublicKey(),
                outpoint,
                value * consensus.COIN,
                node);
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
          await watcher.waitForTX(undefined, tx.rhash());
					
          prevout[origin] = {hash: tx.hash().toString("hex"), index: 1};
        }
      }
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
