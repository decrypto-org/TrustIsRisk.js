var bcoin = require("bcoin");
var KeyRing = bcoin.primitives.KeyRing;

var privateKeys = {
  "alice": "cSxTT76c6Dr9LBqqJUgz5zhvE6TCNdSkM3vVmDnTue99JitVPAa6",
  "bob": "cQxfCPseKaNq4hNbcgX53tfk7Y4hYTJNP176eTo1FRACdiFPTJQk",
  "charlie": "cSi94uAg7wk8JiwkdWF48uz2rea1zBheRwMoH7z8SLk3tuuysqJg",
  "dave": "cNFdijFuW73DyqpayUjo6cGQNvtZzcNBYZr7b84Njkg6GPFYAmGr",
  "eve": "cQPKx8fUnn7qh9vnWzqurQDAhigy22AiWq8EBGGcJfdG75j1i6mW",
  "frank": "cVejVCD18z8LhibFCxBTz7xdSQ5fuogYR3W4igoBP3BUj26V9yQJ",
  "george": "cPno2fuQTfLh7MRTJiPDvyo8Y1XmEJ2JtUo4zwocpxTc22LDSiBi"
};

var keyRings = {};
for (let name in privateKeys) {
  let key = privateKeys[name];
  keyRings[name] = KeyRing.fromPrivate(Buffer.from(key, "ascii"));
}

module.exports = {
  keyRings,
  names: Object.keys(keyRings)
};
