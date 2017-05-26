var Trust = require('../');
var bcoin = require('bcoin');
var testHelpers = require('./helpers');
var consensus = require('bcoin/lib/protocol/consensus');
var sinon = require('sinon');
var should = require('should');
require('should-sinon');

var Address = bcoin.primitives.Address;

describe('TrustIsRisk', () => {
  var addr = testHelpers.getAddressFixtures();
  // Add base58 address variables to scope.
  for (name in addr) {
    eval(`var ${name} = "${addr[name].base58}";`);
  }

  var node, tir, trustIncreasingMTX, trustDecreasingMTX, trustIncreasingTX;
  beforeEach(() => {
    node = new bcoin.fullnode({});
    tir = new Trust.TrustIsRisk(node);

    trustIncreasingMTX = testHelpers.getTrustIncreasingMTX(addr.alice.pubkey, addr.bob.pubkey, 42);
    trustIncreasingTX = trustIncreasingMTX.toTX();

    var inputOneOfTwoMultisig = new bcoin.primitives.Input({
      prevout: {
        hash: trustIncreasingTX.hash().toString('hex'),
        index: 0
      },
      script: bcoin.script.fromString(
        // 17P8kCbDBPmqLDCCe9dYwbfiEDaRb5xDYE
        "0x47 0x3044022035e32834c6ee4db1696cc06762feca2809d865ca12a3b98c801f3f451341a2570220573bf3ffef55f2651e1563acc0a22f8056222f277f5ddf17dd583d4edd40fa6001 0x21 0x02b8f07a401eca4888039b1898f94db44c43ccc6d3aa8b27e9b6ed7b377b24c083")
    });

    trustDecreasingMTX = new bcoin.primitives.MTX({
      inputs: [
        inputOneOfTwoMultisig
      ],
      outputs: [
        testHelpers.getOneOfTwoMultisigOutput(addr.alice.pubkey, addr.bob.pubkey, 20),
        testHelpers.getP2PKHOutput(addr.alice.base58, 22)
      ]
    });
  });

  describe('.getDirectTrust()', () => {
    it('returns zero for two arbitary parties that do not trust each other', () => {
      should(tir.getDirectTrust(addr.alice.base58, bob)).equal(0);
      should(tir.getDirectTrust(bob, alice)).equal(0);
      should(tir.getDirectTrust(charlie, alice)).equal(0);
      should(tir.getDirectTrust(alice, charlie)).equal(0);
      should(tir.getDirectTrust(charlie, frank)).equal(0);
    });

    it('returns Infinity for one\'s direct trust to themselves', () => {
      should(tir.getDirectTrust(alice, alice)).equal(Infinity);
      should(tir.getDirectTrust(bob, bob)).equal(Infinity);
    });
  });

  describe('.addTX()', () => {
    describe('with a non-TIR transaction', () => {
      it('does not change trust', () => {
        trustIncreasingMTX.outputs[0] = testHelpers.getP2PKHOutput(charlie, 50); 
        tir.parseTXAsTrustIncrease(trustIncreasingMTX.toTX());

        should(tir.getDirectTrust(alice, bob)).equal(0);
      });
    });

    describe('with a trust increasing transaction', () => {
      it('correctly increases trust', () => {
        tir.addTX(trustIncreasingTX);

        should(tir.getDirectTrust(alice, bob)).equal(42);
        should(tir.getDirectTrust(bob, alice)).equal(0);
      });

      it('which has more than one input does not change trust', () => {
        trustIncreasingMTX.inputs.push(trustIncreasingMTX.inputs[0].clone());
        tir.addTX(trustIncreasingMTX.toTX());

        should(tir.getDirectTrust(alice, bob)).equal(0);
      });

      it('which has a change output correctly increases trust', () => {
        trustIncreasingMTX.outputs[0].value -= 10;
        trustIncreasingMTX.outputs.push(testHelpers.getP2PKHOutput(alice, 10));
        tir.addTX(trustIncreasingMTX.toTX());

        should(tir.getDirectTrust(alice, bob)).equal(32);
      });

      it('which has two change outputs does not change trust', () => {
        trustIncreasingMTX.outputs[0].value -= 10;
        for (var i = 0; i < 2; i++) {
          trustIncreasingMTX.outputs.push(testHelpers.getP2PKHOutput(alice, 5));
        }
        tir.addTX(trustIncreasingMTX.toTX());

        should(tir.getDirectTrust(alice, bob)).equal(0);
      });

      it('which has a second output that is not a change output does not change trust', () => {
        trustIncreasingMTX.outputs[0].value -= 10;
        trustIncreasingMTX.outputs.push(testHelpers.getP2PKHOutput(charlie, 5));
        tir.addTX(trustIncreasingMTX.toTX());

        should(tir.getDirectTrust(alice, bob)).equal(0);
      });

    });

    describe('with a trust decreasing transaction', () => {
      beforeEach(() => {
        tir.addTX(trustIncreasingTX);
      });

      it('correctly decreases trust', () => {
        tir.addTX(trustDecreasingMTX.toTX());
        should(tir.getDirectTrust(alice, bob)).equal(20);
      });

      it('which has a second input decreases trust to zero', () => {
        trustDecreasingMTX.inputs.push(testHelpers.getP2PKHInput(addr.alice.pubkey));
        tir.addTX(trustDecreasingMTX.toTX());

        should(tir.getDirectTrust(alice, bob)).equal(0);
      });

      it('which has more than one trust outputs decreases trust to zero', () => {
        trustDecreasingMTX.outputs[0].value -= 15;
        trustDecreasingMTX.outputs.push(
            testHelpers.getOneOfTwoMultisigOutput(addr.alice.pubkey, addr.bob.pubkey, 5));
        tir.addTX(trustDecreasingMTX.toTX());

        should(tir.getDirectTrust(alice, bob)).equal(0);
      });
    });

    describe('.getTrustIncreasingMTX()', () => {
      it('creates valid trust-increasing transactions', async () => {
        var getTXStub = sinon.stub(node, 'getTX');

        var prevOutput = {
          hash: 'v1pnhp2af4r5wz63j60vnh27s1bftl260qq621y458tn0g4x64u64yqz6d7qi6i8',
          index: 1
        };

        getTXStub.withArgs(prevOutput.hash).returns(new bcoin.primitives.MTX({
          inputs: [
            testHelpers.getP2PKHInput(addr.alice.pubkey)
          ],
          outputs: [
            testHelpers.getOneOfTwoMultisigOutput(addr.charlie.pubkey, addr.bob.pubkey, 40),
            testHelpers.getP2PKHOutput(alice, 1000), // This is the P2PKH being used
            testHelpers.getP2PKHOutput(dave, 200)
          ]
        }).toTX());

        var mtx = await tir.getTrustIncreasingMTX(addr.alice.pubkey, addr.bob.pubkey, prevOutput, 100);

        mtx.inputs.length.should.equal(1);
        var input = mtx.inputs[0];
        input.script.get(0).should.equal(0); // OP_0, because this is an unsigned bcoin input template.
        input.script.get(1).should.equal(addr.alice.pubkey);

        mtx.outputs.length.should.equal(2);

        var trustOutput = mtx.outputs[0];
        trustOutput.getType().should.equal('multisig');
        var addressA = Address.fromHash(bcoin.crypto.hash160(trustOutput.script.get(1))).toBase58();
        var addressB = Address.fromHash(bcoin.crypto.hash160(trustOutput.script.get(2))).toBase58();
        addressA.should.equal(alice);
        addressB.should.equal(bob);
        trustOutput.value.should.equal(100);

        var changeOutput = mtx.outputs[1];
        changeOutput.getType().should.equal('pubkeyhash');
        changeOutput.getAddress().toBase58().should.equal(alice);
        changeOutput.value.should.equal(900);
      });
    });

    describe('.getTrust()', () => {
      it('returns zero for two arbitary parties that do not trust each other', () => {
        should(tir.getTrust(alice, bob)).equal(0);
        should(tir.getTrust(bob, alice)).equal(0);
        should(tir.getTrust(charlie, alice)).equal(0);
        should(tir.getTrust(alice, charlie)).equal(0);
      });     

      it('returns Infinity for one\'s trust to themselves', () => {
        should(tir.getTrust(alice, alice)).equal(Infinity);
        should(tir.getTrust(bob, bob)).equal(Infinity);
      });

      describe('after applying the Nobody Likes Frank graph example', () => {
        beforeEach(() => {
          testHelpers.applyGraph(tir, './graphs/nobodyLikesFrank.json', addr);
        });

        it('correctly computes trusts', () => {
          should(tir.getTrust(alice, alice)).equal(Infinity);
          should(tir.getTrust(alice, bob)).equal(10);
          should(tir.getTrust(alice, charlie)).equal(1);
          should(tir.getTrust(alice, dave)).equal(4);
          should(tir.getTrust(alice, eve)).equal(6);
          should(tir.getTrust(alice, frank)).equal(0);
          should(tir.getTrust(alice, george)).equal(2);

          should(tir.getTrust(bob, alice)).equal(1);
          should(tir.getTrust(bob, bob)).equal(Infinity);
          should(tir.getTrust(bob, charlie)).equal(1);
          should(tir.getTrust(bob, dave)).equal(1);
          should(tir.getTrust(bob, eve)).equal(3);
          should(tir.getTrust(bob, frank)).equal(0);
          should(tir.getTrust(bob, george)).equal(2);

          should(tir.getTrust(charlie, alice)).equal(0);
          should(tir.getTrust(charlie, bob)).equal(0);
          should(tir.getTrust(charlie, charlie)).equal(Infinity);
          should(tir.getTrust(charlie, dave)).equal(0);
          should(tir.getTrust(charlie, eve)).equal(0);
          should(tir.getTrust(charlie, frank)).equal(0);
          should(tir.getTrust(charlie, george)).equal(3);

          should(tir.getTrust(dave, alice)).equal(2);
          should(tir.getTrust(dave, bob)).equal(2);
          should(tir.getTrust(dave, charlie)).equal(1);
          should(tir.getTrust(dave, dave)).equal(Infinity);
          should(tir.getTrust(dave, eve)).equal(12);
          should(tir.getTrust(dave, frank)).equal(0);
          should(tir.getTrust(dave, george)).equal(2);

          should(tir.getTrust(eve, alice)).equal(0);
          should(tir.getTrust(eve, bob)).equal(0);
          should(tir.getTrust(eve, charlie)).equal(0);
          should(tir.getTrust(eve, dave)).equal(0);
          should(tir.getTrust(eve, eve)).equal(Infinity);
          should(tir.getTrust(eve, frank)).equal(0);
          should(tir.getTrust(eve, george)).equal(0);

          should(tir.getTrust(frank, alice)).equal(0);
          should(tir.getTrust(frank, bob)).equal(0);
          should(tir.getTrust(frank, charlie)).equal(100);
          should(tir.getTrust(frank, dave)).equal(0);
          should(tir.getTrust(frank, eve)).equal(0);
          should(tir.getTrust(frank, frank)).equal(Infinity);
          should(tir.getTrust(frank, george)).equal(3);

          should(tir.getTrust(george, alice)).equal(0);
          should(tir.getTrust(george, bob)).equal(0);
          should(tir.getTrust(george, charlie)).equal(0);
          should(tir.getTrust(george, dave)).equal(0);
          should(tir.getTrust(george, eve)).equal(0);
          should(tir.getTrust(george, frank)).equal(0);
          should(tir.getTrust(george, george)).equal(Infinity);
        });

        it('correctly computes trusts when bob trusts frank', () => {
          tir.addTX(testHelpers.getTrustIncreasingMTX(addr.bob.pubkey, addr.frank.pubkey, 8).toTX());
          should(tir.getTrust(george, frank)).equal(0);
          should(tir.getTrust(alice, frank)).equal(8);
          should(tir.getTrust(dave, frank)).equal(2);
          should(tir.getTrust(bob, frank)).equal(8);
        });
        
        // TODO: Decrement direct trusts and test that indirect trusts update correctly
      });
    });
  });
});
