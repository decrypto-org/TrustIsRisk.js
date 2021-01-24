// @flow
import type {Key} from "./types";
const bcoin = require("bcoin");
const HDPublicKey = bcoin.hd.HD.HDPublicKey;

const P = BigInt(2)**BigInt(256) - BigInt(2)**BigInt(32) - BigInt(977);

function modPow(b, e, m) {
  if (m === BigInt(1)) {
    return BigInt(0);
  }

  let c = BigInt(1);
  b %= m;
  while (e > 0) {
    if (e % BigInt(2) === BigInt(1)) {
      c = (c*b) % m;
    }
    e >>= BigInt(1);
    b = (b*b) % m;
  }

  return c;
}

function yFromX(x) {
  return modPow((x**BigInt(3) + BigInt(7)), (P+BigInt(1))/BigInt(4), P);
}

function isCurvePoint(x, y) {
  return ((y**BigInt(2)) % P) === (x**BigInt(3) + BigInt(7)) % P;
}

function hexToArr(x) {
  let str = x.toString(16);

  if (str.length % 2 === 1) {
    str = "0" + str;
  }
  let res = [];
  for (let i = 0; i < str.length; i += 2) {
    res.push(parseInt("0x" + str[i] + str[i+1], 16));
  }

  return res;
}

const str = "Trust is Risk";
let hex = "";
for (i in str) {
  hex += str.charCodeAt(i).toString(16);
}

const zeroes = "0".repeat(64 - hex.length);
let x = BigInt("0x" + hex + zeroes);
let y = yFromX(x);
while (!isCurvePoint(x, y)) {
  x++;
  y = yFromX(x);
}

x = hexToArr(x);
y = hexToArr(y);

// constant 0x04 prefix
const pubKey : Key = Buffer.from([0x04].concat(x).concat(y))

const tag : bcoin$HDPublicKey = HDPublicKey.fromOptions({
  depth: 0,
  parentFingerPrint: 0,
  childIndex: 0,
  chainCode: Buffer.from("dc446622bb58bc4bb95c7972ee75ff7bc5d23cb9e7edefe79cb9234080b9f243", "hex"),
  publicKey: pubKey
});

module.exports = tag;
