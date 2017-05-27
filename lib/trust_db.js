//      
                                                   
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
    var trust = this.txToDirectTrust.get(outpoint.hash.toString('hex'));
    if (!trust) return null;
    if (trust.outputIndex !== outpoint.index) return null;
    return trust;
  }

  getDirectTrustAmount(from         , to         )          {
    if (from === to) return Infinity;

    var trusts = this.getSpendableDirectTrusts(from, to);
    return trusts.reduce((sum, t) => sum + t.amount, 0);
  }

  getSpendableDirectTrusts(from         , to         )                 {
    return this.getDirectTrusts(from, to).filter((t) => t.isSpendable());
  }

  getDirectTrusts(from         , to         )                 {
    var fromMap = this.directTrusts.get(from);
    if (!fromMap) return [];

    var trusts = fromMap.get(to);
    if (!trusts) return [];

    return trusts;
  }

  getGraphWeightMatrix()              {
    var entitiesArr = this.getEntities();
    return entitiesArr.map((from) => {
      return entitiesArr.map((to) => this.getDirectTrustAmount(from, to));
    });
  }

  getTrustAmount(from         , to         )          {
    // TODO: Optimize
    if (from === to) return Infinity;

    var graph = this.getGraphWeightMatrix();
    var fromIndex = this.getEntityIndex(from);
    var toIndex = this.getEntityIndex(to);

    if (fromIndex === -1 || toIndex === -1) return 0;
    else return maxFlow(graph, fromIndex, toIndex);
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

  add(trust              ) {
    var from = trust.getFromEntity();
    var to = trust.getToEntity();
    assert(from !== to);

    if (!this.directTrusts.has(from)) this.directTrusts.set(from, new Map());
    var fromMap = ((this.directTrusts.get(from)      )                                  );

    if (!fromMap.has(to)) fromMap.set(to, []);
    var trusts = ((fromMap.get(to)      )                     );

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
