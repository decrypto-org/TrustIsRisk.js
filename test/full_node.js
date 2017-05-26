var Trust = require('../');
var bcoin = require('bcoin');
var testHelpers = require('./helpers');
var consensus = require('bcoin/lib/protocol/consensus');
var sinon = require('sinon');
var should = require('should');
require('should-sinon');

describe('FullNode', () => {
  var node = null;
  var walletDB = null;
  sinon.spy(Trust.TrustIsRisk.prototype, 'addTX');

  beforeEach(() => testHelpers.getNode().then((n) => {
    node = n;
  }));

  beforeEach(() => testHelpers.getWalletDB(node).then((w) => {
    walletDB = w;
  }));

  afterEach(() => walletDB.close());
  afterEach(() => node.close());

  it('should be a bcoin instance', () => {
    node.should.be.an.instanceof(bcoin.fullnode);
  });

  it('should call trust.addTX() on every transaction', async function() {
    var sender = await testHelpers.getWallet(walletDB, 'sender');
    var receiver = await testHelpers.getWallet(walletDB, 'receiver');

    // Produce a block and reward the sender, so that we have a coin to spend.
    await testHelpers.mineBlock(node, sender.getAddress('base58'));

    // Make the coin spendable.
    consensus.COINBASE_MATURITY = 0;

    await testHelpers.time(100);
    await sender.send({
      outputs: [{
        value: 10 * consensus.COIN,
        address: receiver.getAddress('base58')
      }]
    });

    await testHelpers.time(100);
    node.trust.addTX.should.be.calledOnce();
  });
});
