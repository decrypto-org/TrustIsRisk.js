const bcoin = require("bcoin").set("regtest");
const consensus = require("bcoin/lib/protocol/consensus");
const walletPlugin = bcoin.wallet.plugin;
const testHelpers = require("../test/helpers");

(async () => {
  const spvNode = new bcoin.spvnode({
    network: bcoin.network.get().toString(),
    httpPort: 48445,
    passphrase: "secret",
    // logConsole: true,
    // logLevel: "debug",
    nodes: ["127.0.0.1:48448"]
  });

  spvNode.use(walletPlugin);
  await spvNode.open();
  await spvNode.connect();
  const spvWalletDB = spvNode.require("walletdb");

  const fullNode = new bcoin.fullnode({
    network: bcoin.network.get().toString(),
    httpPort: 48448,
    bip37: true,
    listen: true,
    passphrase: "secret"
  });

  fullNode.use(walletPlugin);
  await fullNode.open();
  await fullNode.connect();
  const fullWalletDB = fullNode.require("walletdb");

  fullNode.startSync();
  spvNode.startSync();

  const fullWatcher = new testHelpers.NodeWatcher(fullNode);
  const spvWatcher = new testHelpers.NodeWatcher(spvNode);

  const spvWallet = await testHelpers.createWallet(spvWalletDB, "spvWallet");
  const fullWallet = await testHelpers.createWallet(fullWalletDB, "fullWallet");
  const fullWalle = await testHelpers.createWallet(fullWalletDB, "fullWalle");

  await testHelpers.delay(1000);
  // Produce a block and reward the fullWallet1, so that we have a coin to spend.
  await testHelpers.mineBlock(fullNode, fullWallet.getAddress("base58"));

  // Make the coin spendable.
  consensus.COINBASE_MATURITY = 0;
  await testHelpers.delay(100);

  var tx = await fullWallet.send({
    outputs: [{
      value: 10 * consensus.COIN,
      address: fullWalle.getAddress("base58")
    }]
  });
  await fullWatcher.waitForTX(tx, fullWallet);
  await fullWatcher.waitForTX(tx, fullWalle);
  //await spvWatcher.waitForTX(tx, spvWallet);
  await testHelpers.flushEvents();

  spvNode.stopSync();
  fullNode.stopSync();

  await spvNode.disconnect();
  await fullNode.disconnect();
  await spvNode.close();
  await fullNode.close();

  console.log("success!");
})();
