const bcoin = require("bcoin").set("regtest");
const NetAddress = require("bcoin/lib/net/netaddress");

async function delay(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

const one = new bcoin.FullNode({
  network: bcoin.Network.get().toString(),
//  logConsole: true,
//  logLevel: "debug",
  httpPort: 48440,
  port: 48441
});

const two = new bcoin.FullNode({
  network: bcoin.Network.get().toString(),
  httpPort: 48444,
  port: 48445,
  listen: true
});

(async () => {
  await one.open()
  await one.connect();

  await two.open();
  await two.connect();

  const addr = new NetAddress({
    host: "127.0.0.1",
    port: 48445
  });
  const peer = one.pool.createOutbound(addr);
  //one.pool.peers.add(peer);
  //one.pool.setLoader(one.pool.peers.head());

  await delay(3000);

  console.log(one.pool.peers.size());
  console.log(two.pool.peers.size());
  await two.disconnect();
  await two.close();

  await one.disconnect();
  await one.close();
})();
