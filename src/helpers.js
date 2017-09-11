// @flow
import type {Entity, TXHash, Key} from "./types";
var bcoin = require("bcoin");
var Address = bcoin.primitives.Address;

var helpers = {
  pubKeyToEntity: (key : Key) : Entity => {
    return Address.fromHash(bcoin.crypto.hash160(key)).toBase58();
  }
};

module.exports = helpers;
