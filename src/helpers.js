// @flow
import type {Entity, TXHash, PubKey} from "./types"
var bcoin = require('bcoin');
var Address = bcoin.primitives.Address;

var helpers = {
    pubKeyToEntity: (key : PubKey) : Entity => {
      return Address.fromHash(bcoin.crypto.hash160(key)).toBase58()
    }
};

module.exports = helpers;
