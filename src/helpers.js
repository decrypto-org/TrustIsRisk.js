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

  async waitForTX(initialCount : ?number) : Promise<void> {
    var localInitialCount : number;
    if (initialCount === undefined) localInitialCount = this.txCount;
    else if (typeof initialCount === "number") localInitialCount = initialCount;
    await new Promise((resolve, reject) => {
      var check = (() => {
        if (this.txCount > localInitialCount) resolve();
        else setTimeout(check, 100);
      }).bind(this);

      check();
    });
  }
}

var helpers = {
  NodeWatcher : NodeWatcher,

  pubKeyToEntity: (key : Key) : Entity => {
    return Address.fromHash(bcoin.crypto.hash160(key)).toBase58();
  },

  delay: async (milliseconds : number) => {
    return new Promise((resolve, reject) => {
      setTimeout(resolve, milliseconds);
    });
  }
};

helpers.NodeWatcher = NodeWatcher;

module.exports = helpers;
