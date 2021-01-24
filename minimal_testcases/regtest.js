var bcoin = require("bcoin").set("regtest");
var Script = bcoin.script;
var Address = bcoin.primitives.Address;
var KeyRing = bcoin.primitives.KeyRing;
var MTX = bcoin.primitives.MTX;
var Input = bcoin.primitives.Input;
var Output = bcoin.primitives.Output;
var Outpoint = bcoin.primitives.Outpoint;
var consensus = require("bcoin/lib/protocol/consensus");
var assert = require("assert");

var delay = async (milliseconds) => {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, milliseconds);
  });
};

(async () => {
  const COIN = consensus.COIN;
  consensus.COINBASE_MATURITY = 0;
  await delay(100);

  var node = new bcoin.node.FullNode({
    network: "regtest", passphrase: "secret"
  });

  await node.open();

  var walletDB = new bcoin.wallet.WalletDB({
    network: "regtest", db: "memory",
    client: new bcoin.node.NodeClient(node)
  });

  await walletDB.open();
  await walletDB.connect();

  await node.connect();
  node.startSync();

  var wallet = await walletDB.create({
    id: "wallet",
    passphrase: "secret",
    witness: false,
    type: "pubkeyhash"
  });

  var block = await node.miner.mineBlock(
    node.chain.tip, wallet.getAddress("base58")
  );
  await node.chain.add(block);

  await delay(1000);
  await wallet.send({
    outputs: [{
      value: 10 * COIN,
      address: wallet.getAddress("base58")
    }]
  });
  console.log("success!");
  process.exit();
})();
