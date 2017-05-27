//      
                                                   
var bcoin = require('bcoin');
var Address = bcoin.primitives.Address;
var KeyRing = bcoin.primitives.KeyRing;
var MTX = bcoin.primitives.MTX;
var Input = bcoin.primitives.Input;
var Output = bcoin.primitives.Output;
var Outpoint = bcoin.primitives.Outpoint;
var assert = require('assert');
var helpers = require('./helpers');
var TrustDB = require('./trust_db');
var DirectTrust = require('./direct_trust');

class TrustIsRisk {
                       
                   

  constructor(node                 ) {
    this.node = node;
    this.trustDB = new TrustDB();

    this.node.on('tx', this.addTX.bind(this));
  }

  getTrust(from         , to         ) {
    return this.trustDB.getTrustAmount(from, to);
  }

  getDirectTrust(from         , to         ) {
    return this.trustDB.getDirectTrustAmount(from, to);
  }

  // Attempts to parse a bitcoin transaction as a trust change and adds it to the trust network
  // if successful.
  // Returns true if the transaction is a TIR transaction and was successfully added to the
  // network, false otherwise.
  // Throws an error if the transaction was processed earlier.
  addTX(tx           )           {
    var txHash = tx.hash().toString('hex');
    if (this.trustDB.isTrustTX(txHash)) {
      throw new Error(`Transaction already processed: Transaction ${txHash} already carries trust`);
    }

    var directTrusts = this.getDirectTrusts(tx);
    if (directTrusts.length === 0) return false;
    else {
      directTrusts.map(this.trustDB.add.bind(this.trustDB));
      return true;
    }
  }

  // Returns a list of trusts that a transaction contains, which will be one of the following:
  //   * An empty list (for non-TIR transactions).
  //   * A list containing a single trust increase (for trust-increasing transactions).
  //   * A list containing one or more trust decreases (for trust-decreasing transactions).
  getDirectTrusts(tx           )                 {
    var trustIncrease = this.parseTXAsTrustIncrease(tx);
    if (trustIncrease !== null) {
      return [trustIncrease];
    } else {
      return this.getTrustDecreases(tx);
    }
  }

  async getTrustIncreasingMTX(from         , to         , outpoint                 , trustAmount         )
                           {
    var prevTX = await this.node.getTX(outpoint.hash);
    if (!prevTX) throw new Error('Could not find transaction');

    var prevOutput = prevTX.outputs[outpoint.index];
    if (!prevOutput) throw new Error('Could not find transaction output');

    var mtx = new MTX({
      inputs: [
        Input.fromOutpoint(outpoint)
      ],
      outputs: [
        new Output({
          script: bcoin.script.fromMultisig(1, 2, [from, to]),
          value: trustAmount
        })
      ]
    });

    var changeAmount = prevOutput.value - trustAmount;
    if (changeAmount) {
      mtx.addOutput(new Output({
        script: bcoin.script.fromPubkeyhash(bcoin.crypto.hash160(from)),
        value: changeAmount
      }));
    }

    var success = mtx.scriptVector(prevOutput.script, mtx.inputs[0].script, KeyRing.fromPublic(from));
    assert(success);

    return mtx;
  }

  getTrustDecreasingMTXs(from         , to         , trustDecreaseAmount         , payTo          )
                  {
    var fromAddress = helpers.pubKeyToEntity(from);
    var toAddress = helpers.pubKeyToEntity(to);

    if (fromAddress === toAddress) throw new Error('Can\'t decrease self-trust');

    var existingTrustAmount = this.trustDB.getDirectTrustAmount(fromAddress, toAddress);
    if (existingTrustAmount < trustDecreaseAmount) throw new Error('Insufficient trust');
    
    var directTrusts = this.trustDB.getSpendableDirectTrusts(fromAddress, toAddress);
    return directTrusts.map((directTrust) => {
      var decrease = Math.min(trustDecreaseAmount, directTrust.amount);
      if (decrease === 0) return null;
      trustDecreaseAmount -= decrease;
      return this.getTrustDecreasingMTX(directTrust, decrease, payTo);
    }).filter(Boolean);
  }

  getTrustDecreasingMTX(directTrust              , decreaseAmount         , payTo          ) {
    if (!payTo) payTo = directTrust.getFromEntity();
    var remainingTrustAmount = directTrust.amount - decreaseAmount;

    var mtx = new MTX({
      inputs: [
        Input.fromOutpoint(new Outpoint(directTrust.txHash, directTrust.outputIndex))
      ],
      outputs: [new Output({
        script: bcoin.script.fromPubkeyhash(Address.fromBase58(payTo).hash),
        value: decreaseAmount
      })]
    });

    if (remainingTrustAmount > 0) {
      mtx.addOutput(new Output({
        script: bcoin.script.fromMultisig(1, 2, [directTrust.from, directTrust.to]),
        value: remainingTrustAmount
      }));
    }

    var success = mtx.scriptVector(((directTrust.script      )               ),
        mtx.inputs[0].script, KeyRing.fromPublic(directTrust.from));
    assert(success);

    return mtx;
  }

  parseTXAsTrustIncrease(tx           )                        {
    if (tx.inputs.length !== 1) return null;
    if (tx.inputs[0].getType() !== 'pubkeyhash') return null; // TODO: This is unreliable
    if (this.trustDB.isTrustTX(tx.inputs[0].prevout.hash.toString('hex'))) return null;
    var sender = tx.inputs[0].getAddress().toBase58();

    if (tx.outputs.length === 0 || tx.outputs.length > 2) return null;

    var trustOutputs = this.searchForDirectTrustOutputs(tx, sender);
    if (trustOutputs.length !== 1) return null;

    var changeOutputCount = tx.outputs.filter((o) => this.isChangeOutput(o, sender)).length
    if (changeOutputCount + 1 !== tx.outputs.length) return null;

    return trustOutputs[0];
  }

  getTrustDecreases(tx           )                 {
    var inputTrusts = this.getInputTrusts(tx.inputs);
    return inputTrusts.map(this.getTrustDecrease.bind(this, tx));
  }

  getInputTrusts(inputs                )                 {
    return inputs.map((input) => {
      var trust = this.trustDB.getDirectTrustByOutpoint(input.prevout);
      if (trust && trust.outputIndex === input.prevout.index) return trust;
      else return null;
    }).filter(Boolean);
  }

  getTrustDecrease(tx           , prevTrust              )               {
    var txHash = tx.hash().toString('hex');
    var nullTrust = prevTrust.getNullifying(txHash);

    if (tx.inputs.length !== 1) return nullTrust;

    var trustOutputs = this.searchForDirectTrustOutputs(tx, prevTrust.getFromEntity(),
        prevTrust.getToEntity());
    if (trustOutputs.length != 1) return nullTrust;
    var nextTrust = trustOutputs[0];

    nextTrust.prev = prevTrust;

    assert(nextTrust.amount - prevTrust.amount <= 0);
    return nextTrust;
  }
  
  // Looks for direct trust outputs that originate from a sender in an array of bitcoin outputs.
  // Returns a list of the corresponding DirectTrust objects.
  // If the recipient parameter is set, it will limit the results only to the outputs being sent to
  // the recipient.
  searchForDirectTrustOutputs(tx           , sender         , recipient          )                 {
    var directTrusts = tx.outputs.map((output, outputIndex) =>
      this.parseOutputAsDirectTrust(tx, outputIndex, sender)
    ).filter(Boolean);

    if (recipient) {
      directTrusts.filter((trust) => trust.to === recipient);
    }
    
    return directTrusts;
  }

  isChangeOutput(output               , sender         )           {
    return (output.getType() === 'pubkeyhash')
            && (output.getAddress().toBase58() === sender);
  }

  parseOutputAsDirectTrust(tx           , outputIndex         , sender         )
                             {
    var txHash = tx.hash().toString('hex');
    var output = tx.outputs[outputIndex];
    if (output.getType() !== 'multisig') return null;
    
    var entities = [1, 2].map((i) => helpers.pubKeyToEntity(output.script.get(i)));
    if (entities[0] === entities[1]) return null;

    var from, to;
    if (entities[0] === sender) {
      from = output.script.get(1);
      to = output.script.get(2);
    }
    else if (entities[1] === sender) {
      from = output.script.get(2);
      to = output.script.get(1);
    }
    else return null; 

    return new DirectTrust({
      from,
      to,
      amount: Number(output.value),

      txHash,
      outputIndex,
      script: output.script
    });
  }
}

module.exports = TrustIsRisk;
