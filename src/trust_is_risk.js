// @flow
import type {Entity, TXHash, Key} from "./types";
var bcoin = require("bcoin");
var bcrypto = require("bcrypto");
var Address = bcoin.primitives.Address;
var KeyRing = bcoin.primitives.KeyRing;
var WalletDB = bcoin.wallet.WalletDB;
var Wallet = bcoin.wallet.Wallet;
var MTX = bcoin.primitives.MTX;
var Input = bcoin.primitives.Input;
var Output = bcoin.primitives.Output;
var Outpoint = bcoin.primitives.Outpoint;
var Coin = bcoin.primitives.Coin;
var Script = bcoin.Script;
var assert = require("assert");
var helpers = require("./helpers");
var TrustDB = require("./trust_db");
var DirectTrust = require("./direct_trust");
var tag = require("./tag").publicKey;

class TrustIsRisk {
  node : (bcoin$FullNode | bcoin$SPVNode)
  db : TrustDB

  constructor(node : (bcoin$FullNode | bcoin$SPVNode)) {
    this.node = node;
    this.db = new TrustDB();
  }

  async initialize() {
    this.node.on("tx", this.addTX.bind(this));
  }

  getIndirectTrust(origin : Entity, dest : Entity) {
    return this.db.getTrustAmount(origin, dest);
  }

  getDirectTrust(origin : Entity, dest : Entity) {
    return this.db.getDirectTrustAmount(origin, dest);
  }

  // Attempts to parse a bitcoin transaction as a trust change and adds it to the trust network
  // if successful.
  // Returns true if the transaction is a TIR transaction and was successfully added to the
  // network, false otherwise.
  // Throws an error if the transaction was processed earlier.
  addTX(tx : bcoin$TX) : boolean {
    var txHash = tx.hash();
    if (this.db.isTrustTX(txHash)) {
      throw new Error(`Transaction already processed: Transaction ${txHash} already carries trust`);
    }

    var directTrusts = this.getDirectTrusts(tx);
    if (directTrusts.length === 0) return false;
    else {
      directTrusts.forEach(this.db.add.bind(this.db));
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
  // payable to the sender. The origin key must be a private key. Any satoshis not spent will be
  // returned to the sender, minus the fees, via P2PKH.
  async createTrustIncreasingMTX(origin : Key, dest : Key, outpoint : bcoin$Outpoint,
      trustAmount : number, wallet : bcoin$Wallet, fee : ?number)
      : Promise<bcoin$MTX> {
    if (!fee) fee = 1000; // TODO: estimate this
    var coin = await Coin.fromTX(
        (await wallet.getTX(outpoint.hash)).tx, outpoint.index, -1);
    if (!coin) throw new Error("Could not find coin");
    if (origin === dest) throw new Error("Can not increase self-trust.");

    var originKeyRing = KeyRing.fromPrivate(origin);
    var originPubKey = originKeyRing.getPublicKey();

    var mtx = new MTX({
      outputs: [
        new Output({
          script: bcoin.Script.fromMultisig(1, 3, [originPubKey, dest, tag]),
          value: trustAmount
        })
      ]
    });

    var changeAmount = coin.value - trustAmount - fee;
    assert(changeAmount >= 0);
    if (changeAmount) {
      mtx.addOutput(new Output({
        script: bcoin.Script.fromPubkeyhash(bcrypto.Hash160.digest(originPubKey)),
        value: changeAmount
      }));
    }

    mtx.addCoin(coin);
    mtx.inputs[0].script = Script.fromStack(mtx.scriptVector(coin.script, originKeyRing));
    assert(Script.isScript(mtx.inputs[0].script));

    var signedCount = mtx.sign(originKeyRing);
    assert(signedCount === 1);

    return mtx;
  }

  // Returns an array of trust-decreasing mutable transaction objects, which reduce a trust
  // relationship by the amount specified. The payee will receive the amount deducted minus the
  // transaction fees via P2PKH.
  // If steal is undefined or set to false, then the `origin` key is expected to be a private key
  // and the `dest` key is expected to be a public key. If steal is set to true, then `origin` is
  // expected to be a public key and `dest` is expected to be a private key. The private key will be
  // used to sign the transaction.
  async createTrustDecreasingMTXs(origin : Key, dest : Key,
      trustDecreaseAmount : number, wallet : bcoin$Wallet,
      payee : ?Entity, steal : ?boolean, fee : ?number)
      : Promise<Promise<bcoin$MTX>[]> {
    if (steal === undefined) steal = false;

    var signingKeyRing, originKeyRing, destKeyRing;
    if (!steal) {
      signingKeyRing = KeyRing.fromPrivate(origin);
      originKeyRing = KeyRing.fromPrivate(origin);
      destKeyRing = KeyRing.fromPublic(dest);
    } else {
      signingKeyRing = KeyRing.fromPrivate(dest);
      originKeyRing = KeyRing.fromPublic(origin);
      destKeyRing = KeyRing.fromPrivate(dest);
    }

    var originAddress = helpers.pubKeyToEntity(
        originKeyRing.getPublicKey(), this.node.network
    );
    var destAddress = helpers.pubKeyToEntity(
        destKeyRing.getPublicKey(), this.node.network
    );

    if (originAddress === destAddress) throw new Error("Can't decrease self-trust");

    var existingTrustAmount = this.db.getDirectTrustAmount(originAddress, destAddress);
    if (existingTrustAmount < trustDecreaseAmount) throw new Error("Insufficient trust");

    var directTrusts = this.db.getSpendableDirectTrusts(originAddress, destAddress);
    return directTrusts.map((directTrust) => {
      var decrease = Math.min(trustDecreaseAmount, directTrust.amount);
      if (decrease === 0) return null;
      trustDecreaseAmount -= decrease;
      return this.createTrustDecreasingMTX(directTrust, decrease, signingKeyRing, wallet, payee, fee);
    }).filter(Boolean);
  }

  async createTrustDecreasingMTX(directTrust : DirectTrust,
    decreaseAmount : number, signingKeyRing : bcoin$KeyRing,
    wallet : bcoin$Wallet, payee : ?Entity, fee : ?number)
    : Promise<bcoin$MTX> {
    if (!payee) payee = directTrust.getOriginEntity();
    if (!fee) fee = 1000; // TODO: estimate this
    var outpoint = new Outpoint(directTrust.txHash, directTrust.outputIndex);
    var coin = await Coin.fromTX(
        (await wallet.getTX(outpoint.hash)).tx, outpoint.index, -1);
    if (!coin) throw new Error("Could not find coin");

    var mtx = new MTX({
      outputs: [new Output({
        script: bcoin.Script.fromPubkeyhash(Address.fromString(payee).hash),
        value: ((decreaseAmount - fee) < 0) ? 0 : (decreaseAmount - fee)
      })] // TODO: do not add this output if its value is 0
    });

    var remainingTrustAmount = directTrust.amount - decreaseAmount;
    if (remainingTrustAmount > 0) {
      mtx.addOutput(new Output({
        script: bcoin.Script.fromMultisig(1, 3, [directTrust.origin, directTrust.dest, tag]),
        value: remainingTrustAmount
      }));
    }

    mtx.addCoin(coin);
    mtx.inputs[0].script = Script.fromStack(mtx.scriptVector(
        ((directTrust.script : any) : bcoin$Script), KeyRing.fromPublic(directTrust.origin)));
    assert(Script.isScript(mtx.inputs[0].script));

    var success = mtx.signInput(0,
        new Coin({script: directTrust.script, value: directTrust.amount}), signingKeyRing);
    assert(success);

    return mtx;
  }

  parseTXAsTrustIncrease(tx : bcoin$TX) : (DirectTrust | null) {
    if (tx.inputs.length !== 1) return null;
    var input = tx.inputs[0];
    if (input.getType() !== "pubkeyhash") return null; // TODO: This is unreliable
    if (this.db.isTrustOutput(input.prevout.hash, input.prevout.index)) return null;
    var origin = tx.inputs[0].getAddress().toString();

    if (tx.outputs.length === 0 || tx.outputs.length > 2) return null;

    var trustOutputs = this.searchForDirectTrustOutputs(tx, origin);
    if (trustOutputs.length !== 1) return null;

    var changeOutputCount = tx.outputs.filter((o) => this.isChangeOutput(o, origin)).length;
    if (changeOutputCount + 1 !== tx.outputs.length) return null;

    return trustOutputs[0];
  }

  getTrustDecreases(tx : bcoin$TX) : DirectTrust[] {
    var inputTrusts = this.getInputTrusts(tx.inputs);
    return inputTrusts.map(this.getTrustDecrease.bind(this, tx));
  }

  getInputTrusts(inputs : bcoin$Input[]) : DirectTrust[] {
    return inputs.map((input) => {
      return this.db.getDirectTrustByOutpoint(input.prevout);
    }).filter(Boolean);
  }

  getTrustDecrease(tx : bcoin$TX, prevTrust : DirectTrust) : DirectTrust {
    var txHash = tx.hash();
    var nullTrust = prevTrust.getNullifying(txHash);

    if (tx.inputs.length !== 1) return nullTrust;

    var trustOutputs = this.searchForDirectTrustOutputs(tx, prevTrust.getOriginEntity(),
        prevTrust.getDestEntity());
    if (trustOutputs.length != 1) return nullTrust;
    var nextTrust = trustOutputs[0];

    nextTrust.prev = prevTrust;

    assert(nextTrust.amount <= prevTrust.amount);
    return nextTrust;
  }
  
  // Looks for direct trust outputs that originate from a sender in a transaction.
  // Returns an array of the corresponding DirectTrust objects.
  // If the recipient parameter is set, it will limit the results only to the outputs being sent to
  // the recipient.
  searchForDirectTrustOutputs(tx : bcoin$TX, origin : Entity,
      recipient : ?Entity) : DirectTrust[] {
    var directTrusts = tx.outputs.map((output, outputIndex) =>
      this.parseOutputAsDirectTrust(tx, outputIndex, origin)
    ).filter(Boolean); // filter out nulls

    if (recipient) {
      directTrusts = directTrusts.filter((trust) =>
          helpers.pubKeyToEntity(trust.dest, this.node.network) === recipient);
    }
    
    return directTrusts;
  }

  isChangeOutput(output : bcoin$Output, origin : Entity) : boolean {
    return (output.getType() === "pubkeyhash")
            && (output.getAddress().toString() === origin);
  }

  parseOutputAsDirectTrust(tx : bcoin$TX, outputIndex : number,
      origin : Entity) : (DirectTrust | null) {
    var txHash = tx.hash();
    var output = tx.outputs[outputIndex];
    if (output.getType() !== "multisig") return null;

    var entities = [1, 2].map((i) => helpers.pubKeyToEntity(
        output.script.get(i).data, this.node.network
    ));
    if (entities[0] === entities[1]) return null;

    var originPubKey, destPubKey;
    if (entities[0] === origin) {
      originPubKey = output.script.get(1).data;
      destPubKey = output.script.get(2).data;
    }
    else if (entities[1] === origin) {
      originPubKey = output.script.get(2).data;
      destPubKey = output.script.get(1).data;
    }
    else return null; 

    return new DirectTrust({
      origin: originPubKey,
      dest: destPubKey,
      amount: Number(output.value),

      network: this.node.network,

      txHash,
      outputIndex,
      script: output.script
    });
  }
}

module.exports = TrustIsRisk;
