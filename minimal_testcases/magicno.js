const bcoin = require("bcoin").set("regtest");

async function delay(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

const one = new bcoin.FullNode({
  network: bcoin.Network.get().toString(),
   //logConsole: true,
   //logLevel: "debug",
  nodes: ["127.0.0.1:48448"]
});

const two = new bcoin.FullNode({
  network: bcoin.Network.get().toString(),
  httpPort: 48448
});

(async () => {
if (one.pool.peers.head()) console.log("1",one.pool.peers.head().socket._events.drain);
  await one.open()
if (one.pool.peers.head()) console.log("2",one.pool.peers.head().socket._events.drain);
  await one.connect();
if (one.pool.peers.head()) console.log("3",one.pool.peers.head().socket._events.drain);

  await two.open();
if (one.pool.peers.head()) console.log("4",one.pool.peers.head().socket._events.drain);
  await two.connect();
if (one.pool.peers.head()) console.log("5",one.pool.peers.head().socket._events.drain);

  await delay(3000);
if (one.pool.peers.head()) console.log("6",one.pool.peers.head().socket._events.drain);

  await two.disconnect();
  await two.close();

  await one.disconnect();
  await one.close();
})();
