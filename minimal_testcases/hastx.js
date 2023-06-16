const bcoin = require("bcoin");

const myhash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

var spv = new bcoin.node.SPVNode({
  network: "regtest", passphrase: "secret"
});

console.log("spv hasTX(), try 1:", spv.pool.hasTX(myhash));
console.log("spv hasTX(), try 2:", spv.pool.hasTX(myhash));

var full = new bcoin.node.FullNode({
  network: "regtest", passphrase: "secret"
});

console.log("full hasTX(), try 1:", full.pool.hasTX(myhash));
console.log("full hasTX(), try 2:", full.pool.hasTX(myhash));
