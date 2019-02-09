// this is how to generate a keyring from a path!
const _ = require("lodash")
const assert = require("assert")
const WalletDB = require("bcoin/lib/wallet/walletdb")
const WalletKey = require("bcoin/lib/wallet/walletkey");

(async () => {
  const wdb = new WalletDB()
  await wdb.open()
  const wallet = wdb.create()
  const acct = await wdb.getAccount(0, 0)
  const key1 = acct.receiveKey()
  const path = await wdb.getPath(0, key1.getHash())
  const acctKey = acct.accountKey.derive(path.branch).derive(path.index)
  const key2 = WalletKey.fromHD(acct, acctKey, path.branch, path.index)
  // just to populate key2._keyHash
  key2.getHash()
  assert(_.isEqual(key1, key2))
})()
