const bcoin = require("bcoin").set("regtest");

(async () => {
  const args = process.argv

  const node = new bcoin.node.FullNode({
    network: bcoin.network.get().toString(),
    passphrase: "secret"
  })

  if (args[2] == "new") {
    node.use(bcoin.wallet.plugin)
    node.walletDB = node.require("walletdb")

    await node.open()
    await node.connect()

    const options = {
      id: "wallet",
      passphrase: "secret",
      witness: false,
      type: "pubkeyhash"
    }

    const wallet = await node.walletDB.create(options)

    await node.disconnect()
    await node.close()
    console.log("success!")
  } else if (args[2] == "old") {
    node.use(bcoin.wallet.plugin)
    walletDB = node.require("walletdb")
    await node.open()
    await node.connect()

    const options = {
      id: "wallet",
      passphrase: "secret",
      witness: false,
      type: "pubkeyhash"
    }

    const wallet = await walletDB.create(options)

    await node.disconnect()
    await node.close()
    console.log("success!")
  } else {
   console.log("Usage: node separateWalletDB.js new|old")
  }
})()
