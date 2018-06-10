const Trust = require("../");
const bcoin = require("bcoin").set("regtest");
const consensus = require("bcoin/lib/protocol/consensus");
const testHelpers = require("../test/helpers");
const sinon = require("sinon");
const should = require("should");
require("should-sinon");

const COIN = consensus.COIN;

(async () => {
  sinon.spy(Trust.TrustIsRisk.prototype, "addTX");

  const spvnode = new Trust.SPVNode({
    network: bcoin.network.get().toString(),
    httpPort: 48445,
    passphrase: "secret",
    // logConsole: true,
    // logLevel: "debug",
    nodes: ["127.0.0.1:48448"]
  });

  await spvnode.initialize();
  const spvWalletDB = spvnode.require("walletdb");

  const fullnode = new Trust.FullNode({
    network: bcoin.network.get().toString(),
    httpPort: 48448,
    bip37: true,
    listen: true,
    passphrase: "secret"
  });

  await fullnode.initialize();
  const fullWalletDB = fullnode.require("walletdb");

  fullnode.startSync();
  spvnode.startSync();

  const fullWatcher = new testHelpers.NodeWatcher(fullnode);
  const spvWatcher = new testHelpers.NodeWatcher(spvnode);

  const spvWallet1 = await testHelpers.createWallet(spvWalletDB, "spvWallet1");
  const spvWallet2 = await testHelpers.createWallet(spvWalletDB, "spvWallet2");

  const fullWallet1 = await testHelpers.createWallet(fullWalletDB, "fullWallet1");
  const fullWallet2 = await testHelpers.createWallet(fullWalletDB, "fullWallet2");

  await testHelpers.delay(1000);
  // Produce a block and reward the fullWallet1, so that we have a coin to spend.
  await testHelpers.mineBlock(fullnode, fullWallet1.getAddress("base58"));

  // Make the coin spendable.
  consensus.COINBASE_MATURITY = 0;
  await testHelpers.delay(100);

  var full2TX = await fullWallet1.send({
    outputs: [{
      value: 10 * COIN,
      address: fullWallet2.getAddress("base58")
    }]
  });
  await fullWatcher.waitForTX(full2TX, fullWallet1);
  await fullWatcher.waitForTX(full2TX, fullWallet2);
  await spvWatcher.waitForTX(full2TX);
  await testHelpers.flushEvents();

  Trust.TrustIsRisk.prototype.addTX.should.have.been.calledTwice();

  var fullSpvTX = await fullWallet2.send({
    outputs: [{
      value: 9 * COIN,
      address: spvWallet1.getAddress("base58")
    }]
  });

  await fullWatcher.waitForTX(fullSpvTX, fullWallet2);
  console.log("aaa");
  await spvWatcher.waitForTX(fullSpvTX);
  await testHelpers.flushEvents();

  Trust.TrustIsRisk.prototype.addTX.callCount.should.equal(4);

  spvnode.stopSync();
  fullnode.stopSync();

  await spvnode.tearDown();
  await fullnode.tearDown();

  Trust.TrustIsRisk.prototype.addTX.restore();

  console.log("success!");
})();
