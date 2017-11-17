var bcoin = require("bcoin").set("regtest");

(async () => {
  var spv = new bcoin.node.SPVNode({
    network: bcoin.network.get().toString(),
    port: 48445,
    passphrase: "secret",
    nodes: ["127.0.0.1:48448"]
  });
  await spv.open();

  var full = new bcoin.node.FullNode({
    network: bcoin.network.get().toString(),
    port: 48448,
    bip37: true,
    listen: true,
    passphrase: "secret"
  });
  await full.open();

  address = new bcoin.primitives.Address();
  setUpFilterLoadWatcher(full.pool, spv.pool, address);

  await spv.connect();
  await full.connect();

  full.startSync();
  spv.startSync();

  await delay(3000);

  spv.pool.watchAddress(address);

  await delay(3000);
  await delay(3000);
  process.exit();
})();

var delay = async (milliseconds) => {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, milliseconds);
  });
};

var setUpFilterLoadWatcher = async (fullPool, spvPool, address) => {
  return new Promise((resolve, reject) => {
    var check = () => {
      if (fullPool.peers.size() > 0 && fullPool.peers.head().handshake) {
        fullPool.peers.head().on("packet", (packet) => {
          if (packet.cmd == "filterload") {
            console.log("\nA filterload packet was just received by full");
            if (packet.filter.test(address.hash))
              console.log("The filter as seen by full *sees* the address")
            else
              console.log("The filter as seen by full *doesn't see* the address");
            if (spvPool.spvFilter.test(address.hash))
              console.log("The filter as seen by spv *sees* the address")
            else
              console.log("The filter as seen by spv *doesn't see* the address");
          }
        });
        resolve();
      }
      else {
        setTimeout(check, 90);
      }
    };

    check();
  });
}
