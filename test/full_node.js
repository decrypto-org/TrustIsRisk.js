var Trust = require('../');
var helpers = require('../lib/helpers.js');
var bcoin = require('bcoin');
var Script = bcoin.script;
var Address = bcoin.primitives.Address;
var KeyRing = bcoin.primitives.KeyRing;
var MTX = bcoin.primitives.MTX;
var Input = bcoin.primitives.Input;
var Output = bcoin.primitives.Output;
var Outpoint = bcoin.primitives.Outpoint;
var testHelpers = require('./helpers');
var consensus = require('bcoin/lib/protocol/consensus');
var sinon = require('sinon');
var should = require('should');
require('should-sinon');

const COIN = consensus.COIN;

describe('FullNode', () => {
  var node = null;
  var walletDB = null;
  sinon.spy(Trust.TrustIsRisk.prototype, 'addTX');

  beforeEach('get node', () => testHelpers.getNode().then((n) => {
    node = n;
  }));

  beforeEach('get walletDB', () => testHelpers.getWalletDB(node).then((w) => {
    walletDB = w;
  }));

  afterEach('close walletDB', async () => walletDB.close());
  afterEach('close node', async () => node.close());

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
        value: 10 * COIN,
        address: receiver.getAddress('base58')
      }]
    });

    await testHelpers.time(100);
    node.trust.addTX.should.be.calledOnce();
  });

  describe('with the nobodyLikesFrank.json example', () => {
    var addresses, rings = {};

    beforeEach('apply graph transactions', async () => {
      addresses = {};
      rings = {};

      for (var i = 0; i < testHelpers.names.length; i++) {
        var name = testHelpers.names[i];
        rings[name] = testHelpers.rings[i];
        addresses[name] = helpers.pubKeyToEntity(rings[name].getPublicKey());
      }

      // Alice mines three blocks, each rewards her with 50 spendable BTC
      consensus.COINBASE_MATURITY = 0;
      var coinbaseCoinsCount = 3;
      var coinbaseHashes = [];
      for(var i = 0; i < coinbaseCoinsCount; i++) {
        var block = await testHelpers.mineBlock(node, addresses.alice);
        coinbaseHashes.push(block.txs[0].hash());
        await testHelpers.time(200);
      }

      // Alice sends 20 BTC to everyone (including herself) via P2PKH
      var sendAmount = 20;
      var outputs = testHelpers.names.map((name) => {
        return new Output({
          script: Script.fromPubkeyhash(bcoin.crypto.hash160(rings[name].getPublicKey())),
          value: sendAmount * consensus.COIN
        });
      });

      // We have to use a change output, because transaction with too large a fee are considered
      // invalid.
      var fee = 0.01;
      var changeAmount = 50 * coinbaseCoinsCount - sendAmount * testHelpers.names.length - fee;
      if (changeAmount >= 0.01) {
        outputs.push(new Output({
          script: Script.fromPubkeyhash(bcoin.crypto.hash160(rings.alice.getPublicKey())),
          value: changeAmount * consensus.COIN
        }));
      }

      // Use the coinbase coins as inputs
      var coinbaseCoins = await Promise.all(coinbaseHashes.map((hash) => {
          return node.getCoin(hash.toString('hex'), 0);
      }));
      var mtx = new MTX({outputs});
      coinbaseCoins.forEach((coin) => mtx.addCoin(coin));

      var signedCount = mtx.sign(rings.alice);
      signedCount.should.equal(coinbaseCoinsCount);
      should(await mtx.verify());
      
      var tx = mtx.toTX();
      node.sendTX(tx);
			prevout = {};
			testHelpers.names.forEach((name) => {
				prevout[name] = {
					hash: tx.hash().toString('hex'),
					index: testHelpers.names.indexOf(name)
				};
			});
      await testHelpers.time(500);
      
      // Alice mines another block
      await testHelpers.mineBlock(node, helpers.pubKeyToEntity(rings.alice.getPublicKey()));
      await testHelpers.time(500);

      var graph = require('./graphs/nobodyLikesFrank.json');
      var promises = [];
      for (var from in graph) {
        var neighbours = graph[from];
        for (var to in neighbours) {
          var value = neighbours[to];
					if (!value || value < 1) continue;

          var outpoint = new Outpoint(prevout[from].hash, prevout[from].index);
					
          var mtx = await node.trust.getTrustIncreasingMTX(rings[from].getPrivateKey(),
              rings[to].getPublicKey(), outpoint, value * consensus.COIN);
					
					should(await mtx.verify());

					// The change output from this transaction will be used in other transactions from the
					// same origin. We therefore need to sleep until the transaction is added to the pool. 
					var tx = mtx.toTX();
					node.sendTX(tx);
					await testHelpers.time(250);
					
					prevout[from] = {hash: tx.hash().toString('hex'), index: 1};
        }
      }
      //mtxs.forEach((mtx) => node.sendTX(mtx.toTX()));
      await testHelpers.time(500);
      
      // Alice mines yet another block
      await testHelpers.mineBlock(node, helpers.pubKeyToEntity(rings.alice.getPublicKey()));
      await testHelpers.time(500);
    });

    it('computes trusts correctly', () => {
      for (name in addresses) { // Add addresses to scope
        eval(`var ${name} = "${addresses[name]}";`);
      }	

			should(node.trust.getTrust(alice, alice)).equal(Infinity);
			should(node.trust.getTrust(alice, bob)).equal(10 * COIN);
			should(node.trust.getTrust(alice, charlie)).equal(1 * COIN);
			should(node.trust.getTrust(alice, frank)).equal(0);
			should(node.trust.getTrust(alice, eve)).equal(6 * COIN);

			should(node.trust.getTrust(bob, alice)).equal(1 * COIN);
			should(node.trust.getTrust(bob, eve)).equal(3 * COIN);
			should(node.trust.getTrust(dave, eve)).equal(12 * COIN);
			should(node.trust.getTrust(george, eve)).equal(0);
    });

    it('after decreasing some trusts computes trusts correctly', async () => {
      var mtxs = node.trust.getTrustDecreasingMTXs(rings.alice.getPrivateKey(),
          rings.bob.getPublicKey(), 3 * COIN);
      mtxs.length.should.equal(1);
      var mtx = mtxs[0];

      should(await mtx.verify());
      node.sendTX(mtx.toTX());

      await testHelpers.time(500);
      should(node.trust.getTrust(addresses.alice, addresses.bob)).equal(7 * COIN);
    });
  });
});
