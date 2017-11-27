var bcoin = require("bcoin").set("regtest");
var consensus = require("bcoin/lib/protocol/consensus");
var WalletDB = bcoin.wallet.WalletDB;

var delay = async (milliseconds) => {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, milliseconds);
  });
};

(async () => {
    var spvNode = new bcoin.node.SPVNode({
      network: "regtest",
      port: 48445,
      passphrase: "secret",
      nodes: ["127.0.0.1:48448"]
    });

    spvNode.on("tx", () => {console.log("spv says: TX arrived!"); process.exit();});

    await spvNode.open();
    await spvNode.connect();
    spvNode.startSync();

    var miner = new bcoin.node.FullNode({
      network: "regtest",
      port: 48448,
      bip37: true,
      listen: true,
      // logConsole: true,
      // logLevel: "debug",
      passphrase: "secret",
    });
    await miner.open();

    var minerWalletDB = await getWalletDB(miner);
    var minerAlpha = await createWallet(minerWalletDB, "minerAlpha");

    miner.on("tx", () => {console.log("full says: TX arrived!");});
    await miner.connect();
    miner.startSync();

    await delay(1000);
    // Produce a block and reward the minerAlpha, so that we have a coin to spend.
    await mineBlock(miner, minerAlpha.getAddress("base58"));

    // Make the coin spendable.
    consensus.COINBASE_MATURITY = 0;


    await delay(100);

    await minerAlpha.send({
      outputs: [{
        value: 10 * consensus.COIN,
        address: minerAlpha.getAddress("base58")
      }]
    });

    delay(1000);

})();

var createWallet = async (walletDB, id) => {
  var options = {
    id,
    passphrase: "secret",
    witness: false,
    type: "pubkeyhash"
  };

  return walletDB.create(options); 
};

var getWalletDB = async (node) => {
  var walletDB = new bcoin.wallet.WalletDB({
    network: "regtest",
    db: "memory",
    client: new bcoin.node.NodeClient(node)
  });

  await walletDB.open();
  await walletDB.connect();

  return walletDB;
};

var mineBlock = async (node, rewardAddress) => {
  var block = await node.miner.mineBlock(node.chain.tip, rewardAddress);
  await node.chain.add(block);
  return node.getBlock(node.chain.tip.hash);
};
