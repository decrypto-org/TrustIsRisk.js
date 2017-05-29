// @flow
import type {Entity, Key} from "./types";
import type {script} from "bcoin";
var assert = require("assert");
var helpers = require("./helpers");

type DirectTrustOptions = {
  origin : Key,
  dest : Key,
  amount : number,

  txHash : string,
  outputIndex? : number,
  script? : bcoin$Script,

  prev? : DirectTrust,
  next? : DirectTrust
}

class DirectTrust {
  origin : Key
  dest : Key
  amount : number

  // Every DT is associated with a transaction output, except for non-standard trust decreasing
  // transactions, which reduce trust to zero and are related to a whole transaction and not
  // a specific output.
  txHash : string
  outputIndex : (number | null)
  script : (bcoin$Script | null)

  prev : (DirectTrust | null)
  next : (DirectTrust  | null)

  constructor(options : DirectTrustOptions) {
    this.outputIndex = null;
    this.script = null;
    this.prev = null;
    this.next = null;
    Object.assign(this, options);
  }

  isNull() {
    return this.amount === 0;
  }

  isIncrease() : boolean {
    return this.prev === null;
  }

  isDecrease() : boolean {
    return !this.isIncrease();
  }

  isSpent() : boolean {
    return this.next !== null;
  }

  isSpendable() : boolean {
    return !this.isSpent() && !this.isNull();
  }

  isValid() : boolean {
    // TODO: Consider removing this function and ensure validity at build time by using the flow
    //       type system, possibly by creating sub-types like "IncreasingDirectTrust" etc.
    var valid = true;

    if ((this.outputIndex === null) !== (this.script === null)) valid = false;
    if (this.outputIndex === null && this.isIncrease()) valid = false;
    if (this.outputIndex === null && this.amount > 0) valid = false;
    if (this.isIncrease() && this.isNull()) valid = false;
    if (this.isSpent() && this.isNull()) valid = false;

    return valid;
  }

  getOriginEntity() : Entity {
    return helpers.pubKeyToEntity(this.origin);
  }

  getDestEntity() : Entity {
    return helpers.pubKeyToEntity(this.dest);
  }

  spend(next : DirectTrust) : void {
    assert(!this.isSpent());
    assert(this.origin.equals(next.origin) && this.dest.equals(next.dest));
    assert(next.amount <= this.amount);

    this.next = next;
    next.prev = this;
  }

  getNullifying(txHash : string) : DirectTrust {
    return new DirectTrust({
      origin: this.origin,
      dest: this.dest,
      amount: 0,

      prev: this,
      txHash,
    });
  }
}

module.exports = DirectTrust;
