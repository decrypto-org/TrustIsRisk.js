// @flow
var bcoin = require('bcoin');
var assert = require('assert');
var Address = bcoin.primitives.Address;

type Entity = string; // base58 bitcoin address
type DirectTrust = {
  from : Entity,
  to: Entity,
  amount: number,
  txHash: string,
  outputIndex: ?number, // Not set for nullifying trust changes
}
type TrustChange = DirectTrust;
type TXHash = string;

class TrustIsRisk {
  node : bcoin$FullNode
  
  directTrust : {
    [from : Entity] : ({
      [to : Entity] : number
    })
  }

  TXToTrust : {
    [hash : TXHash] : DirectTrust
  }

  constructor(node : bcoin$FullNode) {
    this.node = node;
    this.directTrust = {};
    this.TXToTrust = {};

    this.node.on('tx', this.addTX.bind(this));
  }

  getDirectTrust(from : Entity, to : Entity) : number {
    if (!this.directTrust.hasOwnProperty(from)) return 0;
    if (!this.directTrust[from].hasOwnProperty(to)) return 0;
    return this.directTrust[from][to];
  }

  // Attempts to parse a bitcoin transaction as a trust change and adds it to the trust network
  // if successful.
  // Returns true if the transaction is a TIR transaction and was successfully added to the
  // network, false otherwise.
  // Throws an error if the transaction was processed earlier.
  addTX(tx : bcoin$TX) : boolean {
    var txHash = tx.hash().toString('hex');
    if (this.TXToTrust.hasOwnProperty(txHash)) {
      throw new Error('Duplicate TX: Transaction with hash ' + txHash + ' has been seen again.');
    }

    var trustChanges = this.getTrustChanges(tx);
    if (trustChanges.length === 0) return false;
    else {
      trustChanges.map(this.applyTrustChange.bind(this));
      return true;
    }
  }

  // Returns a list of trust changes that a transaction causes, which will be one of the following:
  //   * An empty list (for non-TIR transactions).
  //   * A list containing a single trust increase (for trust-increasing transactions).
  //   * A list containing one or more trust decreases (for trust-decreasing transactions).
  getTrustChanges(tx : bcoin$TX) : TrustChange[] {
    var trustIncrease = this.parseTXAsTrustIncrease(tx);
    if (trustIncrease !== null) {
      return [trustIncrease];
    } else {
      return this.getTrustDecreases(tx);
    }
  }

  applyTrustChange(trustChange : TrustChange) {
    if (!this.directTrust.hasOwnProperty(trustChange.from)) this.directTrust[trustChange.from] = {};
    if (!this.directTrust[trustChange.from].hasOwnProperty(trustChange.to)) {
      this.directTrust[trustChange.from][trustChange.to] = 0
    }

    this.directTrust[trustChange.from][trustChange.to] += trustChange.amount;

    if (this.directTrust[trustChange.from][trustChange.to] > 0) {
      this.TXToTrust[trustChange.txHash] = {
        from: trustChange.from,
        to: trustChange.to,
        amount: this.directTrust[trustChange.from][trustChange.to],
        txHash: trustChange.txHash,
        outputIndex: trustChange.outputIndex
      };
    }
  }

  parseTXAsTrustIncrease(tx : bcoin$TX) : (TrustChange | null) {
    if (tx.inputs.length !== 1) return null;
    if (tx.inputs[0].getType() !== 'pubkeyhash') return null; // TODO: This is unreliable
    if (this.TXToTrust[tx.inputs[0].prevout.hash.toString('hex')]) return null;
    var sender = tx.inputs[0].getAddress().toBase58();

    if (tx.outputs.length === 0 || tx.outputs.length > 2) return null;

    var trustOutputs = this.searchForDirectTrustOutputs(tx, sender);
    if (trustOutputs.length !== 1) return null;

    var changeOutputCount = tx.outputs.filter((o) => this.isChangeOutput(o, sender)).length
    if (changeOutputCount + 1 !== tx.outputs.length) return null;

    return trustOutputs[0];
  }

  getTrustDecreases(tx : bcoin$TX) : TrustChange[] {
    var inputTrusts = this.getInputTrusts(tx.inputs);
    return inputTrusts.map(this.getTrustDecrease.bind(this, tx));
  }

  getInputTrusts(inputs : bcoin$Input[]) : DirectTrust[] {
    return inputs.map((input) => {
      var trust = this.TXToTrust[input.prevout.hash.toString('hex')]
      if (trust && trust.outputIndex === input.prevout.index) return trust;
      else return null;
    }).filter(Boolean);
  }

  getTrustDecrease(tx : bcoin$TX, prevTrust : DirectTrust) : TrustChange {
    var txHash = tx.hash().toString('hex');
    var nullifyTrust = {
      from: prevTrust.from,
      to: prevTrust.to,
      amount: -prevTrust.amount,
      txHash,
      outputIndex: null
    };

    if (tx.inputs.length !== 1) return nullifyTrust;

    var trustOutputs = this.searchForDirectTrustOutputs(tx, prevTrust.from, prevTrust.to);
    if (trustOutputs.length != 1) return nullifyTrust;
    var nextTrust = trustOutputs[0];

    assert(nextTrust.from === prevTrust.from);
    assert(nextTrust.to === prevTrust.to);

    var trustAmountChange = nextTrust.amount - prevTrust.amount;
    assert(trustAmountChange <= 0);
    return {
      from: nextTrust.from,
      to: nextTrust.to,
      amount: trustAmountChange,
      txHash,
      outputIndex: nextTrust.outputIndex
    }
  }

  // Looks for direct trust outputs that originate from a sender in an array of bitcoin outputs.
  // If the recipient parameter is set, it will limit the results only to the outputs being sent to
  // the recipient.
  searchForDirectTrustOutputs(tx : bcoin$TX, sender : Entity, recipient : ?Entity) : DirectTrust[] {
    var directTrusts = tx.outputs.map((output, outputIndex) =>
      this.parseOutputAsDirectTrust(tx, outputIndex, sender)
    ).filter(Boolean);

    if (recipient) {
      directTrusts.filter((trust) => trust.to === recipient);
    }
    
    return directTrusts;
  }

  isChangeOutput(output : bcoin$Output, sender : Entity) : boolean {
    return (output.getType() === 'pubkeyhash')
            && (output.getAddress().toBase58() === sender);
  }

  parseOutputAsDirectTrust(tx : bcoin$TX, outputIndex : number, sender : Entity)
      : (DirectTrust | null) {
    var txHash = tx.hash().toString('hex');
    var output = tx.outputs[outputIndex];
    if (output.getType() !== 'multisig') return null;
    
    var addressA = Address.fromHash(bcoin.crypto.hash160(output.script.get(1))).toBase58()
    var addressB = Address.fromHash(bcoin.crypto.hash160(output.script.get(2))).toBase58();

    if (addressA === addressB) return null;

    var recipient;
    if (addressA === sender) recipient = addressB;
    else if (addressB === sender) recipient = addressA;
    else return null; 

    return {
      from: sender,
      to: recipient,
      amount: Number(output.value),
      txHash,
      outputIndex
    };
  }

}

module.exports = TrustIsRisk;
