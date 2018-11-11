var Trust = require("../");
var helpers = require("../lib/helpers.js");
var bcoin = require("bcoin").set("regtest");
var bcrypto = require("bcrypto");
var WalletDB = bcoin.wallet.WalletDB;
var WalletKey = bcoin.wallet.WalletKey;
var NodeClient = bcoin.wallet.NodeClient;
var Script = bcoin.script.Script;
var Address = bcoin.primitives.Address;
var KeyRing = bcoin.primitives.KeyRing;
var MTX = bcoin.primitives.MTX;
var Input = bcoin.primitives.Input;
var Output = bcoin.primitives.Output;
var Outpoint = bcoin.primitives.Outpoint;
var secp256k1 = bcrypto.secp256k1;
var tag = Trust.tag;
var testHelpers = require("./helpers");
var consensus = require("bcoin/lib/protocol/consensus");
var sinon = require("sinon");
var should = require("should");
var assert = require("assert");
var fixtures = require("./fixtures");
require("should-sinon");

const COIN = consensus.COIN;

describe("SPVNode", () => {
  var spvNode1 = null;
  var spvNode2 = null;
  var miner = null;
  var spvWalletDB1 = null;
  var spvWalletDB2 = null;
  var minerWalletDB = null;
  var spvWatcher1 = null;
  var spvWatcher2 = null;
  var minerWatcher = null;

  beforeEach("make mined coins immediately spendable", () => {
    consensus.COINBASE_MATURITY = 0;
  });

  beforeEach("create SPV nodes", async () => {
    spvNode1 = new Trust.SPVNode({
      network: bcoin.Network.get().toString(),
      httpPort: 48445,
      passphrase: "secret",
      nodes: ["127.0.0.1:48448"]
    });

    spvNode2 = new Trust.SPVNode({
      network: bcoin.Network.get().toString(),
      httpPort: 48446,
      passphrase: "secret",
      nodes: ["127.0.0.1:48448"]
    });
  });

  beforeEach("set up SPV addTX() spy", () => {
    sinon.spy(spvNode1.trust, "addTX");
    sinon.spy(spvNode2.trust, "addTX");
  });

  beforeEach("connect SPV node, create walletDBs", async () => {
    spvWalletDB1 = new WalletDB({
      network: bcoin.Network.get().toString(),
      client: new NodeClient(spvNode1),
      spv: true
    });
    spvWalletDB2 = new WalletDB({
      network: bcoin.Network.get().toString(),
      client: new NodeClient(spvNode2),
      spv: true
    });
    await spvNode1.initialize();
    await spvWalletDB1.open();
    spvNode1.pool.spvFilter.add(tag);

    await spvNode2.initialize();
    await spvWalletDB2.open();
    spvNode2.pool.spvFilter.add(tag);
  });

  beforeEach("create full node", async () => {
    miner = new Trust.FullNode({
      network: bcoin.Network.get().toString(),
      port: 48448,
      bip37: true,
     //logConsole: true,
     //logLevel: "debug",
      listen: true,
      passphrase: "secret"
    });
  });

  beforeEach("set up full node addTX() spy", () => {
    sinon.spy(miner.trust, "addTX");
  });

  beforeEach("connect full node, create walletDB", async () => {
    minerWalletDB = new WalletDB({
      network: bcoin.Network.get().toString(),
      client: new NodeClient(miner)
    });
    await miner.initialize();
    await minerWalletDB.open();
  });

  beforeEach("start syncing", () => {
    miner.startSync();
    spvNode1.startSync();
    spvNode2.startSync();
  });

  beforeEach("create watchers", async () => {
    minerWatcher = new testHelpers.NodeWatcher(miner);
    spvWatcher1 = new testHelpers.NodeWatcher(spvNode1);
    spvWatcher2 = new testHelpers.NodeWatcher(spvNode2);
  });

  afterEach("tear nodes and walletDBs down", async () => {
    spvNode1.stopSync();
    spvNode2.stopSync();
    miner.stopSync();

    await minerWalletDB.close();
    await spvWalletDB1.close();
    await spvWalletDB2.close();

    await spvNode1.tearDown();
    await spvNode2.tearDown();
    await miner.tearDown();
  });

  afterEach("remove addTX() spies", () => {
    spvNode1.trust.addTX.restore();
    spvNode2.trust.addTX.restore();
    miner.trust.addTX.restore();
  });

  afterEach("make mined coins spendable after 100 blocks (default)", () => {
    consensus.COINBASE_MATURITY = 100;
  });

  it("should match a TIR transaction with the spv bloom filter", async function() {
    var wallet1 = await testHelpers.createWallet(minerWalletDB, "wallet1");
    var account1 = await wallet1.getAccount("default");
    var type1 = account1.network.keyPrefix.coinType;
    var hd1 = wallet1.master.key.deriveAccount(44, type1, account1.accountIndex);
    var origin = WalletKey.fromHD(account1, hd1, 0, 0);

    var wallet2 = await testHelpers.createWallet(minerWalletDB, "wallet2");
    var account2 = await wallet2.getAccount("default");
    var type2 = account2.network.keyPrefix.coinType;
    var hd2 = wallet2.master.key.deriveAccount(44, type2, account2.accountIndex);
    var dest = WalletKey.fromHD(account2, hd2, 0, 0);

    var block = await testHelpers.mineBlock(miner, origin.getKeyAddress("base58"));

    // Make the coin spendable.
    consensus.COINBASE_MATURITY = 0;
    await testHelpers.delay(500);

    var outputs = [
      new Output({ // 1-of-3 multisig trust
        script: Script.fromMultisig(1, 3, [origin.getPublicKey(), dest.getPublicKey(), tag]),
        value: 49 * consensus.COIN
      }),
      new Output({ // paytopubkeyhash change
        script: Script.fromPubkeyhash(
          bcrypto.hash160.digest(origin.getPublicKey())),
        value: consensus.COIN - 100000 // leave a fee of 0.001 BTC
      })
    ];
    var mtx = new MTX({outputs});
    var coinbaseCoin = await miner.getCoin(block.txs[0].hash().toString("hex"), 0);
    mtx.addCoin(coinbaseCoin);

    mtx.sign(origin);
    mtx.verify().should.be.true();
    var tx = mtx.toTX();

    spvNode1.pool.spvFilter.test(tag).should.be.true();
    spvNode2.pool.spvFilter.test(tag).should.be.true();
    tx.isWatched(spvNode1.pool.spvFilter).should.be.true();
    tx.isWatched(spvNode2.pool.spvFilter).should.be.true();
  });

  it("should call trust.addTX() on transaction within a full node", async function() {
    var minerWallet1 = await testHelpers.createWallet(minerWalletDB, "minerWallet1");
    var minerWallet2 = await testHelpers.createWallet(minerWalletDB, "minerWallet2");
    var account1 = await minerWallet1.getAccount("default");

    await testHelpers.delay(1000);
    // Produce a block and reward the minerWallet1, so that we have a coin to spend.
    await testHelpers.mineBlock(miner, account1.receiveAddress());
    await testHelpers.delay(100);

    var miner2TX = await testHelpers.circulateCoins(minerWallet1,
        minerWatcher, minerWallet2, minerWatcher, 10);

    miner.trust.addTX.should.have.been.calledOnce();
  });

  it("should call trust.addTX() on transaction between full and spv node", async function() {
    var spvWallet1 = await testHelpers.createWallet(spvWalletDB1, "spvWallet1");
    var spvWallet2 = await testHelpers.createWallet(spvWalletDB2, "spvWallet2");

    var minerWallet = await testHelpers.createWallet(minerWalletDB, "minerWallet");
    var minerAccount = await minerWallet.getAccount("default");

    var spvAccount1 = await spvWallet1.getAccount("default");
    var spvAccount2 = await spvWallet2.getAccount("default");

    spvNode1.pool.spvFilter.add(spvAccount1.receiveAddress().getHash());
    spvNode2.pool.spvFilter.add(spvAccount2.receiveAddress().getHash());
    // Produce a block and reward the minerWallet, so that we have a coin to spend.
    await testHelpers.mineBlock(miner, minerAccount.receiveAddress());
    await testHelpers.delay(100);

    var minerSpvTX = await testHelpers.circulateCoins(minerWallet,
      minerWatcher, spvWallet1, spvWatcher1, 10);

    spvNode1.trust.addTX.should.have.been.calledOnce();

    var spv2TX = await testHelpers.circulateCoins(spvWallet1,
      spvWatcher1, spvWallet2, spvWatcher2, 9);

    spvNode2.trust.addTX.should.have.been.calledTwice();

    var spvMinerTX = await testHelpers.circulateCoins(spvWallet2,
      spvWatcher2, minerWallet, minerWatcher, 8);

    var view = await miner.chain.db.getSpentView(minerSpvTX);
    var actualBalance = (await minerWallet.getBalance()).unconfirmed;
    var expectedBalance =
        consensus.BASE_REWARD - 10 * COIN + 8 * COIN - minerSpvTX.getFee(view);
    actualBalance.should.equal(expectedBalance);

    spvNode2.trust.addTX.should.have.been.calledTwice();
    miner.trust.addTX.should.have.been.calledThrice();
  });

  describe("with the nobodyLikesFrank.json example", () => {
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

    var addresses = {}, rings = {}, name = null;

    beforeEach("apply graph transactions", async () => {
      for (name in minerNames) {
        minerWallets[name] = await testHelpers.createWallet(
            minerWalletDB, name
        );
        rings[name] = await minerWallets[name].getPrivateKey(
            minerWallets[name].getAddress("base58"), "secret"
        );
        addresses[name] = helpers.pubKeyToEntity(
            rings[name].getPublicKey(), miner.network
        );
        spvNode.pool.watchAddress(addresses[name]);
      }

      for (name in spvNames) {
        spvWallets[name] = await testHelpers.createWallet(
            spvWalletDB, name
        );
        rings[name] = await spvWallets[name].getPrivateKey(
            spvWallets[name].getAddress("base58"), "secret"
        );
        addresses[name] = helpers.pubKeyToEntity(
            rings[name].getPublicKey(), spvNode.network
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

      // We have to use a change output, because transactions with too large a fee are
      // considered invalid.
      var fee = 0.01;
      var changeAmount = 50 * blockCount - sendAmount *
         (Object.keys(minerNames).length + Object.keys(spvNames).length) - fee;
      if (changeAmount >= 0.01) {
        outputs.push(new Output({
          script: Script.fromPubkeyhash(bcoin.crypto.hash160(
              rings["alice"].publicKey)),
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
      assert(mtx.verify());

      var tx = mtx.toTX();

      miner.sendTX(tx);
      await minerWatcher.waitForTX(tx);
      await spvWatcher.waitForTX(tx);

      for (name in minerNames) {
        minerWallets[name].db.addTX(tx);
      }

      for (name in spvNames) {
        spvWallets[name].db.addTX(tx);
      }

      var prevout = {};
      var counter = 0;

      for (name in minerNames) {
        prevout[name] = {
          hash: tx.hash().toString("hex"),
          index: counter++
        };
      }

      for (name in spvNames) {
        prevout[name] = {
          hash: tx.hash().toString("hex"),
          index: counter++
        };
      }

      // Alice mines another block
      await testHelpers.mineBlock(miner, addresses["alice"]);
      await testHelpers.delay(500);

      var graph = require("./graphs/nobodyLikesFrank.json");

      function buildVars(player) {
        return (spvNames[player]) ?
          [spvNode, spvWatcher, spvWallets[player]] :
          [miner, minerWatcher, minerWallets[player]];
      }

      let node = {
        origin: null,
        dest: null
      };
      let watcher = {
        origin: null,
        dest: null
      };
      let wallet = {
        origin: null,
        dest: null
      };

      for (var origin in graph) {

        [node.origin, watcher.origin, wallet.origin] = buildVars(origin);

        var neighbours = graph[origin];

        for (var dest in neighbours) {
          var value = neighbours[dest];
          if (!value || value < 1) continue;

          [node.dest, watcher.dest, wallet.dest] = buildVars(dest);


          let outpoint = new Outpoint(prevout[origin].hash,
              prevout[origin].index);

          let mtx = await node.origin.trust.createTrustIncreasingMTX(
              rings[origin].getPrivateKey(),
              rings[dest].getPublicKey(),
              outpoint,
              value * consensus.COIN,
              wallet.origin);

          assert(mtx.verify());

          let tx = mtx.toTX();
          console.log("ignore above");
          console.log("origin", origin, "accepts tx?", (await wallet.origin.add(tx)) ? true : false);
          console.log("out and between");
          console.log("dest", dest, "accepts tx?", (await wallet.dest.add(tx)) ? true : false);

          node.origin.sendTX(tx);
          console.log(origin, dest, "aaa");
          await watcher.origin.waitForTX(tx, wallet.origin);
          console.log("origin has tx");
          await watcher.dest.waitForTX(tx, wallet.dest); // TODO: dest doesn't get tx
          //await spvWatcher.waitForTX(); // it worked one time! race condition
          console.log("both sides have tx");
          // spv node accepts inv, but does not put tx in the spvNode.txFilter; this is
          // reserved for *sent*, not *received* txs

          console.log(origin, dest, "bbb");
          await wallet.origin.db.addTX();
          await wallet.dest.db.addTX();

          prevout[origin] = {hash: tx.hash().toString("hex"), index: 1};
        }
      }

      // Alice mines yet another block
      await testHelpers.mineBlock(miner, helpers.pubKeyToEntity(
          rings["alice"].getPublicKey(), miner.network
      ));
      await testHelpers.delay(500);
    });

    it("lets the miner compute trusts correctly", () => {
      for (name in addresses) { // Add addresses to scope
        eval(`var ${name} = "${addresses[name]}";`);
      }

      miner.trust.getIndirectTrust(alice, alice).should.equal(Infinity);
      miner.trust.getIndirectTrust(alice, bob).should.equal(10 * COIN);
      miner.trust.getIndirectTrust(alice, charlie).should.equal(1 * COIN);
      miner.trust.getIndirectTrust(alice, frank).should.equal(0);
      miner.trust.getIndirectTrust(alice, eve).should.equal(6 * COIN);

      miner.trust.getIndirectTrust(bob, alice).should.equal(1 * COIN);
      miner.trust.getIndirectTrust(bob, eve).should.equal(3 * COIN);
      miner.trust.getIndirectTrust(dave, eve).should.equal(12 * COIN);
      miner.trust.getIndirectTrust(george, eve).should.equal(0);
    });

    it("lets the SPV node compute trusts correctly", () => {
      for (name in addresses) { // Add addresses to scope
        eval(`var ${name} = "${addresses[name]}";`);
      }

      spvNode.trust.getIndirectTrust(alice, alice).should.equal(Infinity);
      spvNode.trust.getIndirectTrust(alice, bob).should.equal(10 * COIN);
      spvNode.trust.getIndirectTrust(alice, charlie).should.equal(1 * COIN);
      spvNode.trust.getIndirectTrust(alice, frank).should.equal(0);
      spvNode.trust.getIndirectTrust(alice, eve).should.equal(6 * COIN);

      spvNode.trust.getIndirectTrust(bob, alice).should.equal(1 * COIN);
      spvNode.trust.getIndirectTrust(bob, eve).should.equal(3 * COIN);
      spvNode.trust.getIndirectTrust(dave, eve).should.equal(12 * COIN);
      spvNode.trust.getIndirectTrust(george, eve).should.equal(0);
    });

    it("after decreasing some trusts lets both nodes compute trusts correctly", async () => {
      var mtxs = await miner.trust.createTrustDecreasingMTXs(
          rings["alice"].getPrivateKey(),
          rings["bob"].getPublicKey(), 3 * COIN,
          minerWallets["alice"]
      );
      mtxs.length.should.equal(1);
      var mtx = await mtxs[0];

      mtx.verify().should.be.true();
      var tx = mtx.toTX();
      miner.sendTX(tx);

      await testHelpers.delay(3000); // combine with next promises with race
      for (name in minerNames) {
        console.log(name,"aaa"); // see why spv node doesn't accept inv
        await minerWatcher.waitForTX(tx);
      }
      for (name in spvNames) {
        await spvWatcher.waitForTX(tx);
      }
      miner.trust.getIndirectTrust(addresses["alice"],
          addresses["bob"]).should.equal(7 * COIN);
      spvNode.trust.getIndirectTrust(addresses["alice"],
          addresses["bob"]).should.equal(7 * COIN);

      mtxs = await spvNode.trust.createTrustDecreasingMTXs(
          rings["dave"].getPrivateKey(),
          rings["eve"].getPublicKey(), 2 * COIN,
          spvWallets["dave"]
      );
      mtxs.length.should.equal(1);
      mtx = await mtxs[0];

      mtx.verify().should.be.true();
      tx = mtx.toTX();
      spvNode.sendTX(tx);

      await minerWatcher.waitForTX(tx);
      await spvWatcher.waitForTX(tx);
      miner.trust.getIndirectTrust(addresses["dave"],
          addresses["eve"]).should.equal(10 * COIN);
      spvNode.trust.getIndirectTrust(addresses["dave"],
          addresses["eve"]).should.equal(10 * COIN);
    });
  });

  describe("with the topcoder.json example", () => {
    //TODO: Write tests here.
  });
});
