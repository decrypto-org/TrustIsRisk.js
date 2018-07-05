(async () => {
  var Trust = require("../");
  var helpers = require("../lib/helpers.js");
  var bcoin = require("bcoin").set("regtest");
  var Script = bcoin.script;
  var Address = bcoin.primitives.Address;
  var KeyRing = bcoin.primitives.KeyRing;
  var MTX = bcoin.primitives.MTX;
  var Input = bcoin.primitives.Input;
  var Output = bcoin.primitives.Output;
  var Outpoint = bcoin.primitives.Outpoint;
  var secp256k1 = bcoin.crypto.secp256k1;
  var tag = require("../lib/tag");
  var testHelpers = require("../test/helpers");
  var consensus = require("bcoin/lib/protocol/consensus");
  var sinon = require("sinon");
  var should = require("should");
  var assert = require("assert");
  var fixtures = require("../test/fixtures");
  require("should-sinon");

  const COIN = consensus.COIN;

  var spvNode = null;
  var miner = null;
  var spvWalletDB = null;
  var minerWalletDB = null;
  var spvWatcher = null;
  var minerWatcher = null;

  consensus.COINBASE_MATURITY = 0;

  spvNode = new Trust.SPVNode({
    network: bcoin.network.get().toString(),
    httpPort: 48445,
    passphrase: "secret",
    // logConsole: true,
    // logLevel: "debug",
    nodes: ["127.0.0.1:48448"]
  });

  await spvNode.initialize();
  spvWalletDB = spvNode.require("walletdb");

  miner = new Trust.FullNode({
    network: bcoin.network.get().toString(),
    httpPort: 48448,
    bip37: true,
    listen: true,
    passphrase: "secret"
  });

  await miner.initialize();
  minerWalletDB = miner.require("walletdb");

  miner.startSync();
  spvNode.startSync();

  minerWatcher = new testHelpers.NodeWatcher(miner);
  spvWatcher = new testHelpers.NodeWatcher(spvNode);

  // describe
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

  var graph = require("../test/graphs/nobodyLikesFrank.json");

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

  // it 1 begin
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
  // it 1 end

  // it 2 begin
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
  // it 2 end

//  it("after decreasing some trusts lets both nodes compute trusts correctly", async () => {
//    var mtxs = await miner.trust.createTrustDecreasingMTXs(
//        rings["alice"].getPrivateKey(),
//        rings["bob"].getPublicKey(), 3 * COIN,
//        minerWallets["alice"]
//    );
//    mtxs.length.should.equal(1);
//    var mtx = await mtxs[0];
//
//    mtx.verify().should.be.true();
//    var tx = mtx.toTX();
//    miner.sendTX(tx);
//
//    await testHelpers.delay(3000); // combine with next promises with race
//    for (name in minerNames) {
//      console.log(name,"aaa"); // see why spv node doesn't accept inv
//      await minerWatcher.waitForTX(tx);
//    }
//    for (name in spvNames) {
//      await spvWatcher.waitForTX(tx);
//    }
//    miner.trust.getIndirectTrust(addresses["alice"],
//        addresses["bob"]).should.equal(7 * COIN);
//    spvNode.trust.getIndirectTrust(addresses["alice"],
//        addresses["bob"]).should.equal(7 * COIN);
//
//    mtxs = await spvNode.trust.createTrustDecreasingMTXs(
//        rings["dave"].getPrivateKey(),
//        rings["eve"].getPublicKey(), 2 * COIN,
//        spvWallets["dave"]
//    );
//    mtxs.length.should.equal(1);
//    mtx = await mtxs[0];
//
//    mtx.verify().should.be.true();
//    tx = mtx.toTX();
//    spvNode.sendTX(tx);
//
//    await minerWatcher.waitForTX(tx);
//    await spvWatcher.waitForTX(tx);
//    miner.trust.getIndirectTrust(addresses["dave"],
//        addresses["eve"]).should.equal(10 * COIN);
//    spvNode.trust.getIndirectTrust(addresses["dave"],
//        addresses["eve"]).should.equal(10 * COIN);
//  });

  spvNode.stopSync();
  miner.stopSync();

  await spvNode.tearDown();
  await miner.tearDown();

  consensus.COINBASE_MATURITY = 100;

  console.log("success!");
})();
