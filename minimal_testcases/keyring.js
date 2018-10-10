const bcoin = require("bcoin");
const WalletDB = bcoin.wallet.WalletDB;
const KeyRing = bcoin.primitives.KeyRing;
const secp256k1 = require("bcrypto").secp256k1;

(async () => {
  const wdb = new WalletDB({
    network: "testnet",
    db: "memory"
  });
  await wdb.open();
  const wallet = await wdb.create();

  console.log(secp256k1.privateKeyVerify(Buffer.from(wallet.master.key.xprivkey())));
  // how to get true private key from wallet? read account.receiveAddress() and stuff...
  console.log(Buffer.from(wallet.master.key.xprivkey()).toString("hex"));

  const privkey = secp256k1.generatePrivateKey(true);
  console.log(privkey.toString("hex"));
  const pubkey = secp256k1.publicKeyCreate(privkey, true);
  console.log(pubkey.toString("hex"));
  const keyring = KeyRing.fromPrivate(privkey, true);
  console.log(keyring.getPrivateKey("hex", "regtest"));
  console.log(keyring.getPublicKey("hex", "regtest"));
  const address = keyring.getAddress("base58", "regtest");
  console.log(address);
})();
