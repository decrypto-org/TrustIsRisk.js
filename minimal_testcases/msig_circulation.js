const bcoin = require("bcoin").set("regtest");
const Trust = require("../");
const WalletDB = bcoin.wallet.WalletDB;
const NodeClient = bcoin.wallet.NodeClient;
const MTX = bcoin.primitives.MTX;
const Script = bcoin.Script;
const Output = bcoin.primitives.Output;
const testHelpers = require("../test/helpers");
const consensus = require("bcoin/lib/protocol/consensus");
const assert = require("assert");
const tag = require("../lib/tag");

const regtest = bcoin.Network.get().toString();

const wallets = Array(2);
const accounts = Array(2);
const rings = Array(2);
const pubKeys = Array(2);
const addresses = Array(2);

let watcher = null;
let tx = null;

const node = new Trust.FullNode({
  network: regtest,
 // passphrase: "secret"
});

const wdb = new WalletDB({
  network: regtest,
  client: new NodeClient(node)
});

async function setup() {
  await node.open();
  await node.connect();
  await wdb.open();
  node.startSync();

  for (let i = 0; i < 2; i++) {
    wallets[i] = await wdb.create({});
    accounts[i] = await wallets[i].getAccount("default");
    addresses[i] = accounts[i].receiveAddress();
    rings[i] = accounts[i].deriveReceive(
      accounts[i].receiveDepth - 1, wallets[i].master
    );
    pubKeys[i] = rings[i].getPublicKey();
  }

  consensus.COINBASE_MATURITY = 0;
  await testHelpers.delay(500);

  watcher = new testHelpers.NodeWatcher(node);
}

async function tearDown() {
  await wdb.close();
  await node.close();
}

async function wait() {
  for (let i = 0; i < 2; i++) {
    console.log(i + " before");
    await watcher.waitForTX(tx/*, wallets[i]*/);
    console.log(i + " after");
  }
}
// TOUNDERSTAND: trustisrisk.addTX() is never called...

async function buildTX() {
  // get coin
  const block = await testHelpers.mineBlock(node, addresses[0]);
  await testHelpers.delay(500);

  const hash = block.txs[0].hash().toString("hex");
  const coin = await node.getCoin(hash, 0);

  // build and send tx
  const script = Script.fromMultisig(1, 3, [pubKeys[0], pubKeys[1], tag]);
  //const script = Script.fromPubkeyhash(addresses[1].getHash());

  const fee = 1000;
  const trustAmount = coin.value - fee;
  const outputs = [
    new Output({
      script: script,
      value: trustAmount
    })
  ]
  const mtx = new MTX({outputs});
  mtx.addCoin(coin);
  const signedCount = mtx.sign(rings[0]);
  assert(signedCount === 1);
  assert(mtx.verify());

  return mtx.toTX();
}

(async () => {
  await setup();

  tx = await buildTX();

  node.sendTX(tx);

  await wait();

  await tearDown();
})();
