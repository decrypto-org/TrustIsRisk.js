(async () => {
  var Trust = require("../");
  var helpers = require("../lib/helpers.js");
  var bcoin = require("bcoin").set("regtest");
  var NetAddress = bcoin.net.NetAddress;
  var Peer = bcoin.net.Peer;
  var bcrypto = require("bcrypto");
  var WalletDB = bcoin.wallet.WalletDB;
  var NodeClient = bcoin.wallet.NodeClient;
  var Script = bcoin.script.Script;
  var Address = bcoin.primitives.Address;
  var KeyRing = bcoin.primitives.KeyRing;
  var MTX = bcoin.primitives.MTX;
  var Input = bcoin.primitives.Input;
  var Output = bcoin.primitives.Output;
  var Outpoint = bcoin.primitives.Outpoint;
  var secp256k1 = bcrypto.secp256k1;
  var tag = require("../lib/tag");
  var testHelpers = require("../test/helpers");
  var consensus = require("bcoin/lib/protocol/consensus");
  var sinon = require("sinon");
  var should = require("should");
  var assert = require("assert");
  var fixtures = require("../test/fixtures");
  require("should-sinon");

  const COIN = consensus.COIN;
  const regtest = bcoin.Network.get().toString();

  var spvNode = null;
  var miner = null;
  var spvWalletDB = null;
  var minerWalletDB = null;
  var spvWatcher = null;
  var minerWatcher = null;

  consensus.COINBASE_MATURITY = 0;

  spvNode = new Trust.SPVNode({
    network: regtest,
    httpPort: 48445,
    passphrase: "secret"
  });
  await spvNode.initialize();

  spvWalletDB = new WalletDB({
    network: regtest,
    client: new NodeClient(spvNode)
  });
  await spvWalletDB.open(); // this breaks stuff

  miner = new Trust.FullNode({
    network: regtest,
    //logConsole: true,
    //logLevel: "debug",
    port: 48448,
    bip37: true,
    listen: true,
    passphrase: "secret"
  });
  await miner.initialize();

  minerWalletDB = new WalletDB({
    network: regtest,
    client: new NodeClient(miner)
  });
  await minerWalletDB.open();

  const addr = new NetAddress({
    host: "127.0.0.1",
    port: miner.pool.options.port
  });
  const peer = spvNode.pool.createOutbound(addr);
  spvNode.pool.peers.add(peer);

  await testHelpers.delay(4000);

  for (node of [spvNode, miner])
    if (node.pool.peers.size() !== 1)
      throw new Error("Node " +
        ((node === spvNode) ? "spvNode" : "miner") +
        " has peer list size " + node.pool.peers.size());

  await miner.tearDown();
  await spvNode.tearDown();
  console.log("success!");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
