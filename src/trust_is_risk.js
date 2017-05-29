// @flow
import type {Entity, TXHash, Key} from "./types"
var bcoin = require('bcoin');
var Address = bcoin.primitives.Address;
var KeyRing = bcoin.primitives.KeyRing;
var MTX = bcoin.primitives.MTX;
var Input = bcoin.primitives.Input;
var Output = bcoin.primitives.Output;
var Outpoint = bcoin.primitives.Outpoint;
var Coin = bcoin.primitives.Coin;
var assert = require('assert');
var helpers = require('./helpers');
var TrustDB = require('./trust_db');
var DirectTrust = require('./direct_trust');

class TrustIsRisk {
  node : bcoin$FullNode
  db : TrustDB

  constructor(node : bcoin$FullNode) {
    this.node = node;
    this.db = new TrustDB();

    this.node.on('tx', this.addTX.bind(this));
  }

  getTrust(from : Entity, to : Entity) {
    return this.db.getTrustAmount(from, to);
  }

  getDirectTrust(from : Entity, to : Entity) {
    return this.db.getDirectTrustAmount(from, to);
  }

  // Attempts to parse a bitcoin transaction as a trust change and adds it to the trust network
  // if successful.
  // Returns true if the transaction is a TIR transaction and was successfully added to the
  // network, false otherwise.
  // Throws an error if the transaction was processed earlier.
  addTX(tx : bcoin$TX) : boolean {
    var txHash = tx.hash().toString('hex');
    if (this.db.isTrustTX(txHash)) {
      throw new Error(`Transaction already processed: Transaction ${txHash} already carries trust`);
    }

    var directTrusts = this.getDirectTrusts(tx);
    if (directTrusts.length === 0) return false;
    else {
      directTrusts.map(this.db.add.bind(this.db));
      return true;
    }
  }

  // Returns a list of trusts that a transaction contains, which will be one of the following:
  //   * An empty list (for non-TIR transactions).
  //   * A list containing a single trust increase (for trust-increasing transactions).
  //   * A list containing one or more trust decreases (for trust-decreasing transactions).
  getDirectTrusts(tx : bcoin$TX) : DirectTrust[] {
    var trustIncrease = this.parseTXAsTrustIncrease(tx);
    if (trustIncrease !== null) {
      return [trustIncrease];
    } else {
      return this.getTrustDecreases(tx);
    }
  }

  // Returns a promise resolving to a mutable transaction object, which increases a trust
  // relationship by some amount. It will spend the outpoint, which must reference a P2PKH output
  // payable to the sender.
  // Any satoshis not spent will be returned to the sender, minus the fees, via P2PKH.
  async getTrustIncreasingMTX(fromPrivate : Key, to : Key, outpoint : bcoin$Outpoint,
      trustAmount : number, fee : ?number)
      : Promise<bcoin$MTX> {
		if (!fee) fee = 1000; // TODO: estimate this
    var coin = await this.node.getCoin(outpoint.hash, outpoint.index);
    if (!coin) throw new Error('Could not find coin');

    var fromKeyRing = KeyRing.fromPrivate(fromPrivate);
    var from = fromKeyRing.getPublicKey();

    var mtx = new MTX({
      outputs: [
        new Output({
          script: bcoin.script.fromMultisig(1, 2, [from, to]),
          value: trustAmount
        })
      ]
    });

    var changeAmount = coin.value - trustAmount - fee;
    if (changeAmount) {
      mtx.addOutput(new Output({
        script: bcoin.script.fromPubkeyhash(bcoin.crypto.hash160(from)),
        value: changeAmount
      }));
    }

		mtx.addCoin(coin);
    var success = mtx.scriptVector(coin.script, mtx.inputs[0].script, fromKeyRing);
    assert(success);

    var signedCount = mtx.sign(fromKeyRing);
    assert(signedCount === 1);

    return mtx;
  }

  // Returns an array of trust-decreasing mutable transaction objects, which reduce a trust
  // relationship by the amount specified. The payee will receive the amount deducted minus the
  // transaction fees via P2PKH.
  // If steal is undefined or set to false, then the `from` key is expected to be a private key and
  // the `to` key is expected to be a public key. If steal is set to true, then `from` is expected
  // to be a public key and `to` is expected to be a private key. The private key will be used to
  // sign the transaction.
  getTrustDecreasingMTXs(from : Key, to : Key, trustDecreaseAmount : number, payee : ?Entity,
      steal : ?boolean, fee : ?number) : bcoin$MTX[] {
    if (steal === undefined) steal = false;

    var signingKeyRing, fromKeyRing, toKeyRing;
    if (!steal) {
      signingKeyRing = KeyRing.fromPrivate(from);
      fromKeyRing = KeyRing.fromPrivate(from);
      toKeyRing = KeyRing.fromPublic(to);
    } else {
      signingKeyRing = KeyRing.fromPrivate(to);
      fromKeyRing = KeyRing.fromPublic(from);
      toKeyRing = KeyRing.fromPrivate(to);
    }

    var fromAddress = helpers.pubKeyToEntity(fromKeyRing.getPublicKey());
    var toAddress = helpers.pubKeyToEntity(toKeyRing.getPublicKey());

    if (fromAddress === toAddress) throw new Error('Can\'t decrease self-trust');

    var existingTrustAmount = this.db.getDirectTrustAmount(fromAddress, toAddress);
    if (existingTrustAmount < trustDecreaseAmount) throw new Error('Insufficient trust');
    
    var directTrusts = this.db.getSpendableDirectTrusts(fromAddress, toAddress);
    return directTrusts.map((directTrust) => {
      var decrease = Math.min(trustDecreaseAmount, directTrust.amount);
      if (decrease === 0) return null;
      trustDecreaseAmount -= decrease;
      return this.getTrustDecreasingMTX(directTrust, decrease, payee, signingKeyRing, fee);
    }).filter(Boolean);
  }

  getTrustDecreasingMTX(directTrust : DirectTrust, decreaseAmount : number, payee : ?Entity,
      signingKeyRing : bcoin$KeyRing, fee : ?number) {
    if (!payee) payee = directTrust.getFromEntity();
		if (!fee) fee = 1000; // TODO: estimate this

    var mtx = new MTX({
      inputs: [
        Input.fromOutpoint(new Outpoint(directTrust.txHash, directTrust.outputIndex))
      ],
      outputs: [new Output({
        script: bcoin.script.fromPubkeyhash(Address.fromBase58(payee).hash),
        value: decreaseAmount - fee
      })]
    });

    var remainingTrustAmount = directTrust.amount - decreaseAmount;
    if (remainingTrustAmount > 0) {
      mtx.addOutput(new Output({
        script: bcoin.script.fromMultisig(1, 2, [directTrust.from, directTrust.to]),
        value: remainingTrustAmount
      }));
    }

    var success = mtx.scriptVector(((directTrust.script : any) : bcoin$Script),
        mtx.inputs[0].script, KeyRing.fromPublic(directTrust.from));
    assert(success);

    success = mtx.signInput(0, new Coin({script: directTrust.script, value: directTrust.amount}),
        signingKeyRing);
    assert(success);

    return mtx;
  }

  parseTXAsTrustIncrease(tx : bcoin$TX) : (DirectTrust | null) {
    if (tx.inputs.length !== 1) return null;
		var input = tx.inputs[0];
    if (input.getType() !== 'pubkeyhash') return null; // TODO: This is unreliable
    if (this.db.isTrustOutput(input.prevout.hash.toString('hex'), input.prevout.index)) return null;
    var sender = tx.inputs[0].getAddress().toBase58();

    if (tx.outputs.length === 0 || tx.outputs.length > 2) return null;

    var trustOutputs = this.searchForDirectTrustOutputs(tx, sender);
    if (trustOutputs.length !== 1) return null;

    var changeOutputCount = tx.outputs.filter((o) => this.isChangeOutput(o, sender)).length
    if (changeOutputCount + 1 !== tx.outputs.length) return null;

    return trustOutputs[0];
  }

  getTrustDecreases(tx : bcoin$TX) : DirectTrust[] {
    var inputTrusts = this.getInputTrusts(tx.inputs);
    return inputTrusts.map(this.getTrustDecrease.bind(this, tx));
  }

  getInputTrusts(inputs : bcoin$Input[]) : DirectTrust[] {
    return inputs.map((input) => {
      var trust = this.db.getDirectTrustByOutpoint(input.prevout);
      if (trust && trust.outputIndex === input.prevout.index) return trust;
      else return null;
    }).filter(Boolean);
  }

  getTrustDecrease(tx : bcoin$TX, prevTrust : DirectTrust) : DirectTrust {
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
