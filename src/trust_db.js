// @flow
import type {Entity, TXHash, Key} from "./types";
var assert = require("assert");
var SortedSet = require("sorted-set");
var maxFlow = require("graph-theory-ford-fulkerson");
var bcoin = require("bcoin");
var Address = bcoin.primitives.Address;
var KeyRing = bcoin.primitives.KeyRing;
var MTX = bcoin.primitives.MTX;
var Input = bcoin.primitives.Input;
var Output = bcoin.primitives.Output;
var Outpoint = bcoin.primitives.Outpoint;
var DirectTrust = require("./direct_trust");

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
    var trust = this.txToDirectTrust.get(outpoint.hash.toString("hex"));
    if (!trust) return null;
    if (trust.outputIndex !== outpoint.index) return null;
    return trust;
  }

  getDirectTrustAmount(origin : Entity, dest : Entity) : number {
    if (origin === dest) return Infinity;

    var trusts = this.getSpendableDirectTrusts(origin, dest);
    return trusts.reduce((sum, t) => sum + t.amount, 0);
  }

  getSpendableDirectTrusts(origin : Entity, dest : Entity) : DirectTrust[] {
    return this.getDirectTrusts(origin, dest).filter((t) => t.isSpendable());
  }

  getDirectTrusts(origin : Entity, dest : Entity) : DirectTrust[] {
    var originMap = this.directTrusts.get(origin);
    if (!originMap) return [];

    var trusts = originMap.get(dest);
    if (!trusts) return [];

    return trusts;
  }

  getGraphWeightMatrix() : number[][] {
    var entitiesArr = this.getEntities();
    return entitiesArr.map((origin) => {
      return entitiesArr.map((dest) => this.getDirectTrustAmount(origin, dest));
    });
  }

  getTrustAmount(origin : Entity, dest : Entity) : number {
    // TODO: Optimize
    if (origin === dest) return Infinity;

    var graph = this.getGraphWeightMatrix();
    var originIndex = this.getEntityIndex(origin);
    var destIndex = this.getEntityIndex(dest);

    if (originIndex === -1 || destIndex === -1) return 0;
    else return maxFlow(graph, originIndex, destIndex);
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

  isTrustOutput(txHash : string, outputIndex : number) : boolean {
    var trust = this.txToDirectTrust.get(txHash);
    return trust !== undefined && trust.outputIndex === outputIndex;
  }

  add(trust : DirectTrust) {
    var origin = trust.getOriginEntity();
    var dest = trust.getDestEntity();
    assert(origin !== dest);

    if (!this.directTrusts.has(origin)) this.directTrusts.set(origin, new Map());
    var originMap = ((this.directTrusts.get(origin) : any) : Map<string, Array<DirectTrust>>);

    if (!originMap.has(dest)) originMap.set(dest, []);
    var trusts = ((originMap.get(dest) : any) : Array<DirectTrust>);

    if (trust.prev !== null) {
      trust.prev.spend(trust);
      assert(trust.prev && trust.prev.isValid() && !trust.prev.isSpendable());
    }

    assert(trust.isValid());
    trusts.push(trust);
    this.txToDirectTrust.set(trust.txHash, trust);

    this.entities.add(origin);
    this.entities.add(dest);
  }
}

module.exports = TrustDB;
