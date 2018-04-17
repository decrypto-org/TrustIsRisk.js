(async () => {
  const Trust = require("../../lib")
  const bcoin = require("bcoin").set("regtest")
  const Script = bcoin.script
  const Address = bcoin.primitives.Address
  const KeyRing = bcoin.primitives.KeyRing
  const MTX = bcoin.primitives.MTX
  const Input = bcoin.primitives.Input
  const Output = bcoin.primitives.Output
  const Outpoint = bcoin.primitives.Outpoint
  const walletPlugin = bcoin.wallet.plugin
  const secp256k1 = bcoin.crypto.secp256k1
  const consensus = require("bcoin/lib/protocol/consensus")
  const should = require("should")
  const assert = require("assert")
  const helpers = require("./helpers")

  const COIN = consensus.COIN

  const spvNode = new Trust.SPVNode({
    network: bcoin.network.get().toString(),
    httpPort: 48445,
    passphrase: "secret",
    nodes: ["127.0.0.1:48448"]
  })
  await spvNode.initialize()
  const spvWalletDB = spvNode.require("walletdb")

  const fullNode = new Trust.FullNode({
    network: bcoin.network.get().toString(),
    httpPort: 48448,
    bip37: true,
    listen: true,
    passphrase: "secret"
  })
  await fullNode.initialize()
  const fullWalletDB = fullNode.require("walletdb")

  fullNode.startSync()
  spvNode.startSync()

  const fullWatcher = new helpers.NodeWatcher(fullNode)
  const spvWatcher = new helpers.NodeWatcher(spvNode)

  const spvWallet1 = await helpers.createWallet(
    spvWalletDB, "spvWallet1")
  const spvWallet2 = await helpers.createWallet(
    spvWalletDB, "spvWallet2")

  const fullWallet1 = await helpers.createWallet(
    fullWalletDB, "fullWallet1")
  const fullWallet2 = await helpers.createWallet(
    fullWalletDB, "fullWallet2")

  await helpers.delay(1000)
  // Produce a block and reward the fullWallet1,
  // so that we have a coin to spend.
  await helpers.mineBlock(fullNode, fullWallet1.getAddress("base58"))

  // Make the coin spendable.
  consensus.COINBASE_MATURITY = 0
  await helpers.delay(100)

  const full2TX = await fullWallet1.send({
    outputs: [{
      value: 10 * COIN,
      address: fullWallet2.getAddress("base58")
    }]
  })
  await fullWatcher.waitForTX(full2TX, fullWallet1)
  await fullWatcher.waitForTX(full2TX, fullWallet2)

  const fullSpvTX = await fullWallet2.send({
    outputs: [{
      value: 9 * COIN,
      address: spvWallet1.getAddress("base58")
    }]
  })
  await spvWatcher.waitForTX(fullSpvTX, spvWallet1)
  await fullWatcher.waitForTX(fullSpvTX, fullWallet2)

  const spv2TX = await spvWallet1.send({
    outputs: [{
      value: 8 * COIN,
      address: spvWallet2.getAddress("base58")
    }]
  })
  await spvWatcher.waitForTX(spv2TX, spvWallet1)
  await spvWatcher.waitForTX(spv2TX, spvWallet2)
  await fullWatcher.waitForTX(spv2TX)

  const spvMinerTX = await spvWallet2.send({
    outputs: [{
      value: 7 * COIN,
      address: fullWallet1.getAddress("base58")
    }]
  })
  await spvWatcher.waitForTX(spvMinerTX, spvWallet2)
  await fullWatcher.waitForTX(spvMinerTX, fullWallet1)

  const view = await fullNode.chain.db.getSpentView(full2TX)
  const actualBalance = (await fullWallet1.getBalance()).unconfirmed
  const expectedBalance = consensus.BASE_REWARD - 10 
    * COIN + 7 * COIN - full2TX.getFee(view)

  assert(actualBalance === expectedBalance)

  spvNode.stopSync()
  fullNode.stopSync()

  await spvNode.tearDown()
  await fullNode.tearDown()
  console.log("success!")
})()
