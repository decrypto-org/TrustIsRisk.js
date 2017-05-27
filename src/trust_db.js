// @flow
import type {Entity, TXHash, PubKey} from "./types"
var assert = require('assert');
var SortedSet = require('sorted-set');
var maxFlow = require('graph-theory-ford-fulkerson');
var bcoin = require('bcoin');
var Address = bcoin.primitives.Address;
var KeyRing = bcoin.primitives.KeyRing;
var MTX = bcoin.primitives.MTX;
var Input = bcoin.primitives.Input;
var Output = bcoin.primitives.Output;
var Outpoint = bcoin.primitives.Outpoint;
var DirectTrust = require('./direct_trust');

class TrustDB {
  directTrusts : Map<Entity, Map<Entity, Array<DirectTrust>>>
  txToDirectTrust : Map<string, DirectTrust>
  entities : SortedSet;

  constructor() {
    this.directTrusts = new Map();
    this.txToDirectTrust = new Map();
    this.entities = new SortedSet();
  }

  getDirectTrustByTX(txHash : string) : (DirectTrust | null) {
    if (!this.isTrustTX(txHash)) return null;
    return ((this.txToDirectTrust.get(txHash) : any) : DirectTrust);
  }

  getDirectTrustByOutpoint(outpoint : bcoin$Outpoint) : (DirectTrust | null) {
    var trust = this.txToDirectTrust.get(outpoint.hash.toString('hex'));
    if (!trust) return null;
    if (trust.outputIndex !== outpoint.index) return null;
    return trust;
  }

  getDirectTrustAmount(from : Entity, to : Entity) : number {
    if (from === to) return Infinity;

    var trusts = this.getSpendableDirectTrusts(from, to);
    return trusts.reduce((sum, t) => sum + t.amount, 0);
  }

  getSpendableDirectTrusts(from : Entity, to : Entity) : DirectTrust[] {
    return this.getDirectTrusts(from, to).filter((t) => t.isSpendable());
  }

  getDirectTrusts(from : Entity, to : Entity) : DirectTrust[] {
    var fromMap = this.directTrusts.get(from);
    if (!fromMap) return [];

    var trusts = fromMap.get(to);
    if (!trusts) return [];

    return trusts;
  }

  getGraphWeightMatrix() : number[][] {
    var entitiesArr = this.getEntities();
    return entitiesArr.map((from) => {
      return entitiesArr.map((to) => this.getDirectTrustAmount(from, to));
    });
  }

  getTrustAmount(from : Entity, to : Entity) : number {
    // TODO: Optimize
    if (from === to) return Infinity;

    var graph = this.getGraphWeightMatrix();
    var fromIndex = this.getEntityIndex(from);
    var toIndex = this.getEntityIndex(to);

    if (fromIndex === -1 || toIndex === -1) return 0;
    else return maxFlow(graph, fromIndex, toIndex);
  }

  getEntities() : Entity[] {
    return this.entities.slice(0, this.entities.length);
  }

  getEntityIndex(entity : Entity) : number {
    return this.entities.rank(entity);
  }

  isTrustTX(txHash : string) : boolean {
    return this.txToDirectTrust.has(txHash);
  }

  add(trust : DirectTrust) {
    var from = trust.getFromEntity();
    var to = trust.getToEntity();
    assert(from !== to);

    if (!this.directTrusts.has(from)) this.directTrusts.set(from, new Map());
    var fromMap = ((this.directTrusts.get(from) : any) : Map<string, Array<DirectTrust>>);

    if (!fromMap.has(to)) fromMap.set(to, []);
    var trusts = ((fromMap.get(to) : any) : Array<DirectTrust>);

    if (trust.prev !== null) {
      trust.prev.spend(trust);
      assert(trust.prev && trust.prev.isValid() && !trust.prev.isSpendable());
    }

    assert(trust.isValid());
    trusts.push(trust);
    this.txToDirectTrust.set(trust.txHash, trust);

    this.entities.add(from);
    this.entities.add(to);
  }
}

module.exports = TrustDB;
