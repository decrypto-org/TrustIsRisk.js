// @flow
var bcoin = require('bcoin');
var Address = bcoin.primitives.Address;

type Entity = string; // base58 bitcoin address
type DirectTrust = {
  from : Entity,
  to: Entity,
  amount: number
}
type TrustChange = DirectTrust;

class TrustIsRisk {
  node : bcoin$FullNode
  
  // Direct trust map
  trust : {
    [from : Entity] : ({
      [to : Entity] : number
    })
  };

  constructor(node : bcoin$FullNode) {
    this.node = node;
    this.trust = {};

    this.node.on('tx', this.addTX.bind(this));
  }

  getDirect(from : Entity, to : Entity) : number {
    if (!this.trust.hasOwnProperty(from)) return 0;
    if (!this.trust[from].hasOwnProperty(to)) return 0;
    return this.trust[from][to];
  }

  addTX(tx : bcoin$TX) : boolean {
    var trustChange = this.parseTXAsTrustChange(tx);
    if (!trustChange) return false;

    if (!this.trust.hasOwnProperty(trustChange.from)) this.trust[trustChange.from] = {}
    if (!this.trust[trustChange.from].hasOwnProperty(trustChange.to)) {
      this.trust[trustChange.from][trustChange.to] = 0
    }
    this.trust[trustChange.from][trustChange.to] += trustChange.amount;
    
    return true;
  }

  // Parses a transaction as a trust change, or returns null if the
  // transaction is not a TIR transaction.
  parseTXAsTrustChange(tx : bcoin$TX) : ?TrustChange {
    var trustChange = this.parseTXAsTrustIncrease(tx);
    if (trustChange === null) {
      trustChange = this.parseTXAsTrustDecrease(tx);
    }

    return trustChange;
  }

  parseTXAsTrustIncrease(tx : bcoin$TX) : ?TrustChange {
    if (tx.inputs.length !== 1) return null;
    if (tx.inputs[0].getType() !== 'pubkeyhash') return null;
    var sender = tx.inputs[0].getAddress();

    if (tx.outputs.length == 0 || tx.outputs.length > 2) return null;

    var trustChanges = [];
    for (var i = 0; i < tx.outputs.length; i++) {
      if (this.isChangeOutput(tx.outputs[i], sender)) continue;

      var trustChange = this.parseOutputAsDirectTrust(tx.outputs[i], sender.toBase58());
      if (trustChange === null) return null;
      trustChanges.push(trustChange);
    }
    if (trustChanges.length !== 1) return null;

    return trustChanges[0];
  }

  parseTXAsTrustDecrease(tx : bcoin$TX) : ?TrustChange {
    return null;
  }

  isChangeOutput(output : bcoin$Output, sender : bcoin$Address) : boolean {
    return (output.getType() === 'pubkeyhash')
            && (output.getAddress().toBase58() === sender.toBase58());
  }

  parseOutputAsDirectTrust(output : bcoin$Output, sender : Entity) : ?DirectTrust {
    if (output.getType() !== 'multisig') return null;
    
    var addressA = Address.fromHash(bcoin.crypto.hash160(output.script.get(1))).toBase58()
    var addressB = Address.fromHash(bcoin.crypto.hash160(output.script.get(2))).toBase58();

    if (addressA === addressB) return null;

    var receiver;
    if (addressA === sender) receiver = addressB;
    else if (addressB === sender) receiver = addressA;
    else return null; 

    return {
      from: sender,
      to: receiver,
      amount: Number(output.value)
    };
  }

}

module.exports = TrustIsRisk;
