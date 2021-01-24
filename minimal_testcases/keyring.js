const bcoin = require("bcoin");
const WalletDB = bcoin.wallet.WalletDB;
const KeyRing = bcoin.primitives.KeyRing;
const secp256k1 = require("bcrypto").secp256k1;
const assert = require("assert");
const _ = require("lodash");

(async () => {
  const wdb = new WalletDB({
    network: "testnet",
    db: "memory",
    passphrase: "secret"
  });
  await wdb.open();
  const wallet = await wdb.create();
  const account = await wallet.getAccount("default");
  // const account2 = await wallet.ensureAccount({}, "secret");

  const keyring = account.deriveReceive(
    account.receiveDepth - 1, wallet.master
  );

  // const privkey = secp256k1.generatePrivateKey(true);
  const privkey = keyring.privateKey;
  const pubkey = secp256k1.publicKeyCreate(privkey, true);

  // const keyring = KeyRing.fromPrivate(privkey, true);

  const privKeyFromKeyRing = keyring.getPrivateKey("hex", "regtest");
  assert(_.isEqual(privKeyFromKeyRing, privkey.toString("hex")));

  const pubKeyFromKeyRing = keyring.getPublicKey("hex", "regtest");
  assert(_.isEqual(pubKeyFromKeyRing, pubkey.toString("hex")));

  const address = keyring.getAddress("base58", "regtest");
  console.log("success!");
})();
