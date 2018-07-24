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
  await one.open()
  await one.connect();

  await two.open();
  await two.connect();

  await delay(3000);

  await two.disconnect();
  await two.close();

  await one.disconnect();
  await one.close();
})();
