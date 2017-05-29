//      
                                                 
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
                                                             
                                            
                       

  constructor() {
    this.directTrusts = new Map();
    this.txToDirectTrust = new Map();
    this.entities = new SortedSet();
  }

  getDirectTrustByTX(txHash         )                        {
    if (!this.isTrustTX(txHash)) return null;
    return ((this.txToDirectTrust.get(txHash)      )              );
  }

  getDirectTrustByOutpoint(outpoint                 )                        {
    var trust = this.txToDirectTrust.get(outpoint.hash.toString("hex"));
    if (!trust) return null;
    if (trust.outputIndex !== outpoint.index) return null;
    return trust;
  }

  getDirectTrustAmount(origin         , dest         )          {
    if (origin === dest) return Infinity;

    var trusts = this.getSpendableDirectTrusts(origin, dest);
    return trusts.reduce((sum, t) => sum + t.amount, 0);
  }

  getSpendableDirectTrusts(origin         , dest         )                 {
    return this.getDirectTrusts(origin, dest).filter((t) => t.isSpendable());
  }

  getDirectTrusts(origin         , dest         )                 {
    var originMap = this.directTrusts.get(origin);
    if (!originMap) return [];

    var trusts = originMap.get(dest);
    if (!trusts) return [];

    return trusts;
  }

  getGraphWeightMatrix()              {
    var entitiesArr = this.getEntities();
    return entitiesArr.map((origin) => {
      return entitiesArr.map((dest) => this.getDirectTrustAmount(origin, dest));
    });
  }

  getTrustAmount(origin         , dest         )          {
    // TODO: Optimize
    if (origin === dest) return Infinity;

    var graph = this.getGraphWeightMatrix();
    var originIndex = this.getEntityIndex(origin);
    var destIndex = this.getEntityIndex(dest);

    if (originIndex === -1 || destIndex === -1) return 0;
    else return maxFlow(graph, originIndex, destIndex);
  }

  getEntities()            {
    return this.entities.slice(0, this.entities.length);
  }

  getEntityIndex(entity         )          {
    return this.entities.rank(entity);
  }

  isTrustTX(txHash         )           {
    return this.txToDirectTrust.has(txHash);
  }

  isTrustOutput(txHash         , outputIndex         )           {
    var trust = this.txToDirectTrust.get(txHash);
    return trust !== undefined && trust.outputIndex === outputIndex;
  }

  add(trust              ) {
    var origin = trust.getOriginEntity();
    var dest = trust.getDestEntity();
    assert(origin !== dest);

    if (!this.directTrusts.has(origin)) this.directTrusts.set(origin, new Map());
    var originMap = ((this.directTrusts.get(origin)      )                                  );

    if (!originMap.has(dest)) originMap.set(dest, []);
    var trusts = ((originMap.get(dest)      )                     );

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
