var TrustIsRisk = require('../');
var bcoin = require('bcoin');
var should = require('should');

describe('new TrustIsRisk.fullnode', () => {
  it('should be a bcoin instance', () => {
    var node = new TrustIsRisk.fullnode({});
    should(node).be.an.instanceof(bcoin.fullnode);
  });
});
