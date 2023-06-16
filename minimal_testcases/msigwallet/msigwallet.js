const bcoin = require("bcoin").set("regtest");
const consensus = require("bcoin/lib/protocol/consensus");
const helpers = require("./helpers");

(async () => {
  const node = new bcoin.fullnode({
    network: bcoin.network.get().toString(),
    passphrase: "secret"
  });
  node.use(bcoin.wallet.plugin);
  await node.open();
  await node.connect();
  node.startSync();

  const walletDB = node.require("walletdb");

  const alice = await walletDB.create(); // make type multisig
  const bob = await walletDB.create();

  await helpers.mineBlock(node, alice.getAddress());
  consensus.COINBASE_MATURITY = 0;
  await helpers.delay(100);

  const p2pkh = await alice.send({
    outputs: [{
      address: bob.getAddress(),
      value: 10 * consensus.COIN
    }]
  });
  console.log("does alice contain p2pkh?",
    (await alice.getTX(p2pkh.hash("hex"))) ? true : false);
  console.log("does bob contain p2pkh?",
    (await bob.getTX(p2pkh.hash("hex"))) ? true : false);

  const multisigScript = bcoin.script.fromMultisig(1, 2,
    [(await alice.getKey(alice.getAddress())).publicKey,
      (await bob.getKey(bob.getAddress())).publicKey]);

  const p2pkhScript = bcoin.script.fromPubkeyhash(
    bcoin.crypto.hash160(
      (await alice.getKey(alice.getAddress())).publicKey));

  const msig = new bcoin.primitives.MTX({
    outputs: [
      new bcoin.primitives.Output({
        script: multisigScript,
        value: 10 * consensus.COIN
      }),
      new bcoin.primitives.Output({
        script: p2pkhScript,
        value: (await alice.getBalance()) - 10 * consensus.COIN
      })
    ],
    inputs: [
      new bcoin.primitives.Input({
        prevout: new bcoin.primitives.Outpoint({
          hash: // find coinbase tx
          index: 0
        })
      })
    ]
  });

  assert(msig.verify());
  const smsig = msig.toTX();
  node.sendTX(smsig);

  console.log("does alice contain multisig?",
    (await alice.getTX(smsig.hash("hex"))) ? true : false);
  console.log("does bob contain multisig?",
    (await bob.getTX(smsig.hash("hex"))) ? true : false);

  node.close();
})();
