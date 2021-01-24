let Trust = require("../");
let helpers = require("../lib/helpers.js");
let bcoin = require("bcoin").set("regtest");
var bcrypto = require("bcrypto");
let NetAddress = bcoin.net.NetAddress;
let Peer = bcoin.net.Peer;
let WalletDB = bcoin.wallet.WalletDB;
var WalletKey = bcoin.wallet.WalletKey;
let NodeClient = bcoin.wallet.NodeClient;
let Script = bcoin.script.Script;
let Address = bcoin.primitives.Address;
let KeyRing = bcoin.primitives.KeyRing;
let MTX = bcoin.primitives.MTX;
let Input = bcoin.primitives.Input;
let Output = bcoin.primitives.Output;
let Outpoint = bcoin.primitives.Outpoint;
let tag = require("../lib/tag");
let testHelpers = require("../test/helpers");
let consensus = require("bcoin/lib/protocol/consensus");
let sinon = require("sinon");
let should = require("should");
let assert = require("assert");
let fixtures = require("../test/fixtures");
require("should-sinon");

const COIN = consensus.COIN;
const regtest = bcoin.Network.get().toString();

let spvNode1, spvNode2, miner;
let spvWalletDB1, spvWalletDB2, minerWalletDB;
let minerWatcher, spvWatcher1, spvWatcher2;

async function test() {
}

(async () => {
  consensus.COINBASE_MATURITY = 0;

  spvNode1 = new Trust.SPVNode({
    network: regtest,
    httpPort: 48445,
    passphrase: "secret",
    nodes: ["127.0.0.1:48448"]
  });

  spvNode2 = new Trust.SPVNode({
    network: regtest,
    httpPort: 48446,
    passphrase: "secret",
    nodes: ["127.0.0.1:48448"]
  });
  sinon.spy(spvNode1.trust, "addTX");
  sinon.spy(spvNode2.trust, "addTX");

  spvWalletDB1 = new WalletDB({
    network: bcoin.Network.get().toString(),
    client: new NodeClient(spvNode1)
  });

  spvWalletDB2 = new WalletDB({
    network: bcoin.Network.get().toString(),
    client: new NodeClient(spvNode2)
  });

  await spvNode1.initialize();
  await spvWalletDB1.open();
  await spvNode2.initialize();
  await spvWalletDB2.open();

  miner = new Trust.FullNode({
    network: regtest,
    //logConsole: true,
    //logLevel: "debug",
    port: 48448,
    bip37: true,
    listen: true,
    passphrase: "secret"
  });
  sinon.spy(miner.trust, "addTX");

  minerWalletDB = new WalletDB({
    network: bcoin.Network.get().toString(),
    client: new NodeClient(miner)
  });

  await miner.initialize();
  await minerWalletDB.open();


  miner.startSync();
  spvNode1.startSync();
  spvNode2.startSync();

  minerWatcher = new testHelpers.NodeWatcher(miner);
  spvWatcher1 = new testHelpers.NodeWatcher(spvNode1);
  spvWatcher2 = new testHelpers.NodeWatcher(spvNode2);

  await test()

  spvNode1.stopSync();
  spvNode2.stopSync();
  miner.stopSync();

  await minerWalletDB.close();
  await spvWalletDB1.close();
  await spvWalletDB2.close();

  await spvNode1.tearDown();
  await spvNode2.tearDown();
  await miner.tearDown();

  console.log("success!");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
