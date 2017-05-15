//      
var bcoin = require('bcoin');
var Address = bcoin.primitives.Address;

                      // base58 bitcoin address
                    
                
             
                
 
                               

class TrustIsRisk {
                       

  constructor(node                 ) {
    this.node = node;

    this.node.on('tx', this.addTX.bind(this));
  }

  addTX(tx           )           {
    var trustChange = this.parseTXAsTrustChange(tx);
    if (trustChange === null) return false;
    
    return true;
  }

  // Parses a transaction as a trust change, or returns null if the
  // transaction is not a TIR transaction.
  parseTXAsTrustChange(tx           )                {
    var trustChange = this.parseTXAsTrustIncrease(tx);
    if (trustChange === null) {
      trustChange = this.parseTXAsTrustDecrease(tx);
    }

    return trustChange;
  }

  parseTXAsTrustIncrease(tx           )                {
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

  parseTXAsTrustDecrease(tx           )                {
    return null;
  }

  isChangeOutput(output               , sender                )           {
    return (output.getType() === 'pubkeyhash')
            && (output.getAddress().toBase58() === sender.toBase58());
  }

  parseOutputAsDirectTrust(output               , sender         )                {
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
