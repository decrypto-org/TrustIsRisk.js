const bcoin = require("bcoin").set("regtest");
const helpers = require("./helpers");
const consensus = require("bcoin/lib/protocol/consensus");
const assert = require("assert");

let spvNode;
let spvWalletDB;
let fullNode;
let fullWalletDB;

(async () => {
  [spvNode, spvWalletDB] = await helpers.getNodeAndWalletDB("spv");
  [fullNode, fullWalletDB] = await helpers.getNodeAndWalletDB("full");

  const spvWallet1 = await helpers.getWallet(spvWalletDB, "spvWallet1");
  const spvWallet2 = await helpers.getWallet(spvWalletDB, "spvWallet2");
  const fullWallet1 = await helpers.getWallet(fullWalletDB, "fullWallet1");
  const fullWallet2 = await helpers.getWallet(fullWalletDB, "fullWallet2");

  await helpers.delay(1000);
  const distributionTX = await helpers.mineAndPaySPV(
    fullNode, fullWallet1, spvWallet1
  );

  await helpers.waitForTX(fullNode, distributionTX);
  await helpers.waitForTX(spvNode, distributionTX);

  const TXtoFull = await fullWallet1.send({
    outputs: [{
      value: 10 * consensus.COIN,
      address: fullWallet2.getAddress("base58")
    }]
  });
  await helpers.waitForTX(fullNode, TXtoFull);
  console.log("one");

  const TXtoSPV = await spvWallet1.send({
    outputs: [{
      value: 10 * consensus.COIN,
      address: spvWallet2.getAddress("base58")
    }]
  });
  await helpers.waitForTX(spvNode, TXtoSPV);
  console.log("success!");
  process.exit();
})();
