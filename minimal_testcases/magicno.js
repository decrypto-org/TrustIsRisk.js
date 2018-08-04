const bcoin = require("bcoin").set("regtest");
const NetAddress = bcoin.net.NetAddress;

async function delay(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

const one = new bcoin.FullNode({
  network: bcoin.Network.get().toString(),
  //logConsole: true,
  //logLevel: "debug",
  httpPort: 48449
});

const two = new bcoin.FullNode({
  network: bcoin.Network.get().toString(),
  port: 48445,
  listen: true
});

(async () => {
  await one.open();
  await two.open();

  await one.connect();
  await two.connect();

  const addr = new NetAddress({
    host: "127.0.0.1",
    port: two.pool.options.port
  });
  const peer = one.pool.createOutbound(addr);
  one.pool.peers.add(peer);

  await delay(4000);

  for (node of [one, two])
    if (node.pool.peers.size() !== 1)
      throw new Error("Node " + ((node === one) ? "one" : "two") +
        " has peer list size " + node.pool.peers.size());

  await two.disconnect();
  await one.disconnect();

  await two.close();
  await one.close();
  console.log("success!");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
