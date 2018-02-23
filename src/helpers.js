// @flow
import type {Entity, TXHash, Key} from "./types";
var bcoin = require("bcoin");
var Address = bcoin.primitives.Address;

class NodeWatcher {
  txCount : number;
  blockCount : number;
  node : (bcoin$FullNode | bcoin$SPVNode);
  waitForBlock : Promise<void>;

  constructor(node : (bcoin$FullNode | bcoin$SPVNode)) {
    this.txCount = 0;
    this.blockCount = 0;
    this.node = node;
    this.node.on("tx", this.onTX.bind(this));
    this.node.on("block", this.onBlock.bind(this));
  }

  onTX() : void {
    this.txCount++;
  }

  onBlock() : void {
    this.blockCount++;
  }

  async waitForBlock(initialCount : number) : Promise<void> {
    if (initialCount === undefined) initialCount = this.blockCount;
    await new Promise((resolve, reject) => {
      var check = (() => {
        if (this.blockCount > initialCount) resolve();
        else setTimeout(check, 100);
      }).bind(this);

      check();
    });
  }

  async waitForTX(input : (number | bcoin$TX |
      Hash | typeof undefined)) : Promise<void> {
    var initialCount : number = Number.MAX_VALUE;
    switch (typeof input) {
    case "number":
      initialCount = input;
      await new Promise((resolve, reject) => {
        var check = (() => {
          if (this.txCount > initialCount)
            resolve();
          else setTimeout(check, 100);
        }).bind(this);

        check();
      });
      break;

    case "object":
      var tx : bcoin$TX = input;
      await new Promise((resolve, reject) => {
        var check = (() => {
            // This breaks node.pool.on("tx", ...)
          if (this.node.pool.hasTX(tx.hash().toString("hex")))
            resolve();
          else setTimeout(check, 100);
        }).bind(this);

        check();
      });
      break;

    case "string": // TODO: reuse code
      var hash : Hash = input;
      await new Promise((resolve, reject) => {
        var check = (() => {
            // This breaks node.pool.on("tx", ...)
          if (this.node.pool.hasTX(hash))
            resolve();
          else setTimeout(check, 100);
        }).bind(this);

        check();
      });
      break;

    case "undefined": // TODO: reuse code
      initialCount = this.txCount;
      await new Promise((resolve, reject) => {
        var check = (() => {
          if (this.txCount > initialCount)
            resolve();
          else setTimeout(check, 100);
        }).bind(this);

        check();
      });
      break;

    default:
      throw new TypeError("input cannot be " + typeof input);
    }
  }
}

var helpers = {
  NodeWatcher : NodeWatcher,

  pubKeyToEntity: (key : Key, network : bcoin$Network) : Entity => {
    return Address.fromHash(bcoin.crypto.hash160(key),
        Address.types.PUBKEYHASH, -1, network).toString();
  },

  delay: async (milliseconds : number) => {
    return new Promise((resolve, reject) => {
      setTimeout(resolve, milliseconds);
    });
  }
};

helpers.NodeWatcher = NodeWatcher;

module.exports = helpers;
