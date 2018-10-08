const bcoin = require("bcoin");
const WalletDB = bcoin.wallet.WalletDB;
const NodeClient = bcoin.wallet.NodeClient;

const node = new bcoin.SPVNode({});

const wdb = new WalletDB({
  client: new NodeClient(node)
});

(async () => {
  await node.open();
  await wdb.open();

  const wallet = await wdb.create({});
  const account = await wallet.getAccount("default");

  node.pool.spvFilter.add(account.receiveAddress().getHash())
  console.log(node.pool.spvFilter.test(account.receiveAddress().getHash()));

  await wdb.close();
  await node.close();
})();
