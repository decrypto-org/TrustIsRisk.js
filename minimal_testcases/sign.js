var bcoin = require("bcoin");
var FullNode = bcoin.node.FullNode;
var SPVNode = bcoin.node.SPVNode;
var Script = bcoin.script;
var Address = bcoin.primitives.Address;
var KeyRing = bcoin.primitives.KeyRing;
var MTX = bcoin.primitives.MTX;
var Input = bcoin.primitives.Input;
var Output = bcoin.primitives.Output;
var Outpoint = bcoin.primitives.Outpoint;
var WalletDB = bcoin.wallet.WalletDB;
var Wallet = bcoin.wallet.Wallet;
var consensus = require("bcoin/lib/protocol/consensus");
var assert = require("assert");

(async () => {
/*
 *  Start Setup
 */
  const COIN = consensus.COIN;

  var full = new FullNode({
    network: "regtest",
    port: 48448,
    bip37: true,
    listen: true,
    passphrase: "secret"
  });

  var spv = new SPVNode({
    network: "regtest",
    port: 48445,
    passphrase: "secret",
    // logConsole: true,
    // logLevel: "debug",
    nodes: ["127.0.0.1:48448"]
  });

  await full.open();
  await spv.open();

  var fullWalletDB = new WalletDB({
    network: "regtest",
    db: "memory",
    client: new bcoin.node.NodeClient(full)
  });
  await fullWalletDB.open();
  await fullWalletDB.connect();

  var spvWalletDB = new WalletDB({
    network: "regtest",
    db: "memory",
    client: new bcoin.node.NodeClient(spv)
  });
  await spvWalletDB.open();
  await spvWalletDB.connect();

  // The spv node must connect BEFORE the full node
  // in order for the spv node to correctly receive txs
  await spv.connect();
  await full.connect();

  full.startSync();
  spv.startSync();

  // var fullWatcher = new testHelpers.NodeWatcher(full);
  // var spvWatcher = new testHelpers.NodeWatcher(spv);

  //  var minerNames = {
  //    "alice": "alice",
  //    "bob": "bob",
  //    "eve": "eve",
  //    "frank": "frank",
  //    "george": "george"
  //  };

  //  var spvNames = {
  //    "charlie": "charlie",
  //    "dave": "dave"
  //  };

  var fullWallet = await fullWalletDB.create({
    id: "full",
    passphrase: "secret",
    witness: false,
    type: "pubkeyhash"
  });

  var spvWallet = await spvWalletDB.create({
    id: "full",
    passphrase: "secret",
    witness: false,
    type: "pubkeyhash"
  });

  var fullRing = await fullWallet.getPrivateKey(
      fullWallet.getAddress("base58"), "secret"
  );
  var fullAddr = Address.fromHash(bcoin.crypto.hash160(
      fullRing.getPublicKey())).toBase58();
  var spvRing = await spvWallet.getPrivateKey(
      spvWallet.getAddress("base58"), "secret"
  );
  var spvAddr = Address.fromHash(bcoin.crypto.hash160(
      spvRing.getPublicKey())).toBase58();

/*
 *  End setup
 */

/*
 *  Start mining and distributing
 */

  // Full mines three blocks, each rewards her with 50 spendable BTC
  consensus.COINBASE_MATURITY = 0;
  var blockCount = 3;
  var coinbaseHashes = [];
  for(let i = 0; i < blockCount; i++) {
    var block = await full.miner.mineBlock(
        full.chain.tip, fullAddr
    );
    await full.chain.add(block);
    block = await full.getBlock(full.chain.tip.hash);
    coinbaseHashes.push(block.txs[0].hash());
    await delay(500);
  }

  // Full sends 20 BTC to everyone (including herself) via P2PKH
  var sendAmount = 20;
  outputs = [];
  outputs.push(new Output({
    script: Script.fromPubkeyhash(bcoin.crypto.hash160(
        fullRing.getPublicKey()
    )),
    value: sendAmount * consensus.COIN
  }));
  outputs.push(new bcoin.primitives.Output({
    script: Script.fromPubkeyhash(bcoin.crypto.hash160(
        spvRing.getPublicKey()
    )),
    value: sendAmount * consensus.COIN
  }));

  // We have to use a change output, because transactions with too large a fee are
  // considered invalid.
  var fee = 0.01;
  var changeAmount = 50 * blockCount - sendAmount * 2 - fee;
  if (changeAmount >= 0.01) {
    outputs.push(new Output({
      script: Script.fromPubkeyhash(bcoin.crypto.hash160(
          fullRing.getPublicKey()
      )),
      value: changeAmount * consensus.COIN
    }));
  }

  // Use the coinbase coins as inputs
  var coinbaseCoins = await Promise.all(coinbaseHashes.map((hash) => {
    return full.getCoin(hash.toString("hex"), 0);
  }));
  var mtx = new MTX({outputs});
  coinbaseCoins.forEach((coin) => mtx.addCoin(coin));

  var signedCount = mtx.sign(fullRing);
  assert(signedCount === blockCount);
  assert(await mtx.verify());
  
  var tx = mtx.toTX();

  full.sendTX(tx);
  await delay(3000);

  fullWallet.db.addTX(tx);
  spvWallet.db.addTX(tx);

  /*
   *  End mining and distributing
   */

  let mtx2 = new MTX({
    outputs: [ new Output({
        script: Script.fromMultisig(1, 2,
            [fullRing.getPublicKey(), spvRing.getPublicKey()]),
        value: 19 * consensus.COIN
    })]
  });
  let mtx3 = new MTX({
    outputs: [ new Output({
        script: Script.fromMultisig(1, 2,
            [fullRing.getPublicKey(), spvRing.getPublicKey()]),
        value: 19 * consensus.COIN
    })]
  });

  var coin = bcoin.coin.fromTX(tx, 0, -1);
  mtx2.addCoin(await full.getCoin(tx.hash().toString("hex"), 0));
  mtx3.addCoin(coin);

  signedCount = mtx2.sign(fullRing);
  assert(signedCount === 1);
  signedCount = mtx3.sign(fullRing);
  assert(signedCount === 1);
  assert(await mtx2.verify());

  console.log("success!");
  process.exit();
})();

var delay = async (milliseconds) => {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, milliseconds);
  });
}
