// Works with bcoin PR #578
const bcoin = require('bcoin').set('regtest');
const NetAddress = bcoin.net.NetAddress;
const WalletDB = bcoin.wallet.WalletDB;
const NodeClient = bcoin.wallet.NodeClient;

const regtest = bcoin.Network.get().toString();

function delay(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  })
}

const one = new bcoin.SPVNode({ // Full: OK | SPV: Fail
  network: regtest,
 // logConsole: true,  // try to see the logs of
 // logLevel: 'debug', // the Full node as well
  httpPort: 48445,
  port: 48446,
  nodes: ["127.0.0.1:48448"],
  passphrase: 'secret'
});

const oneWalletDB = new WalletDB({
  network: regtest,
  client: new NodeClient(one)
});

const two = new bcoin.FullNode({
  network: regtest,
  httpPort: 48446,
  port: 48448,
  bip37: true,
  listen: true,
  passphrase: 'secret'
});

const addr = new NetAddress({
  host: '127.0.0.1',
  port: two.pool.options.port
});

(async () => {
  // You can experiment with delay()s
  // and reorder open()s and connect()s
  // for a variety of similar errors
  await one.open();

  // Comment next line out and nodes connect
  await oneWalletDB.open();

  await two.open();

  //await delay(4000);

  await one.connect();
  await two.connect();

  const peer = one.pool.createOutbound(addr);
  one.pool.peers.add(peer);

  await delay(4000);

  for (node of [one, two])
    if (node.pool.peers.size() !== 1)
      throw new Error('Node ' + ((node === one) ? 'one' : 'two') +
        ' has peer list size ' + node.pool.peers.size());

  await two.disconnect();
  await two.close();

  await one.disconnect();
  await one.close();

  console.log('success!');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
