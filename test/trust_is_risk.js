var Trust = require('../');
var bcoin = require('bcoin');
var testHelpers = require('./helpers');
var consensus = require('bcoin/lib/protocol/consensus');
var sinon = require('sinon');
var should = require('should');
require('should-sinon');

describe('TrustIsRisk', () => {
  var alice = "17P8kCbDBPmqLDCCe9dYwbfiEDaRb5xDYE";
  var bob = "1P6NdQWeZTLrYCpQNbYeXsLeaEjn8h6UFx";
  var charlie = "1JDfVQkZxMvRwM3Lc6LkDrpX55Ldk3JqND";

  var inputP2PKH, outputOneOfTwoMultisig, inputOneOfTwoMultisig;
  var tir, trustIncreasingMTX, trustDecreasingMTX, trustIncreasingTX;
  beforeEach(() => {
    tir = new Trust.TrustIsRisk(new bcoin.fullnode({}));

    inputP2PKH = new bcoin.primitives.Input({
      prevout: {
        hash: 'v0pnhphaf4r5wz63j60vnh27s1bftl260qq621y458tn0g4x64u64yqz6d7qi6i8',
        index: 2
      },
      script: bcoin.script.fromString(
        // 17P8kCbDBPmqLDCCe9dYwbfiEDaRb5xDYE (alice)
        "0x47 0x3044022035e32834c6ee4db1696cc06762feca2809d865ca12a3b98c801f3f451341a2570220573bf3ffef55f2651e1563acc0a22f8056222f277f5ddf17dd583d4edd40fa6001 0x21 0x02b8f07a401eca4888039b1898f94db44c43ccc6d3aa8b27e9b6ed7b377b24c083")
    });

    outputOneOfTwoMultisig = new bcoin.primitives.Output({
      script: bcoin.script.fromString(
        // 1/{17P8kCbDBPmqLDCCe9dYwbfiEDaRb5xDYE (alice), 1P6NdQWeZTLrYCpQNbYeXsLeaEjn8h6UFx (bob)}
        "OP_1 0x21 0x02b8f07a401eca4888039b1898f94db44c43ccc6d3aa8b27e9b6ed7b377b24c083 0x28 0x2437025954568a8273968aa7535dbfc444fd8f8d0f5237cd96ac7234c77810ada53054a3654e669b OP_2 OP_CHECKMULTISIG"),
      value: 42
    });

    trustIncreasingMTX = new bcoin.primitives.MTX({
      inputs: [
        inputP2PKH 
      ],
      outputs: [
        outputOneOfTwoMultisig
      ]
    });

    trustIncreasingTX = trustIncreasingMTX.toTX();
    inputOneOfTwoMultisig = new bcoin.primitives.Input({
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
        Object.assign(outputOneOfTwoMultisig.clone(), {value: 20}),
        testHelpers.P2PKHOutput(alice, 22)
      ]
    });

  });

  describe('.getDirectTrust()', () => {
    it('returns zero for two arbitary parties that do not trust each other', () => {
      should(tir.getDirectTrust(alice, bob)).equal(0);
      should(tir.getDirectTrust(bob, alice)).equal(0);
      should(tir.getDirectTrust(charlie, alice)).equal(0);
      should(tir.getDirectTrust(alice, charlie)).equal(0);
    });
  });

  describe('.addTX()', () => {
    describe('with a non-TIR transaction', () => {
      it('does not change trust', () => {
        trustIncreasingMTX.outputs[0] = new bcoin.primitives.Output({
          script: bcoin.script.fromString(
            // Pays to 1JDfVQkZxMvRwM3Lc6LkDrpX55Ldk3JqND (neither alice or bob)
            "OP_DUP OP_HASH160 0x14 0xBCDF4271C6600E7D02E60F9206A9AD862FFBD4F0 OP_EQUALVERIFY OP_CHECKSIG"),
          value: 10
        });
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
        trustIncreasingMTX.inputs.push(inputP2PKH);
        tir.addTX(trustIncreasingMTX.toTX());

        should(tir.getDirectTrust(alice, bob)).equal(0);
      });

      it('which has a change output correctly increases trust', () => {
        trustIncreasingMTX.outputs[0].value -= 10;
        trustIncreasingMTX.outputs.push(testHelpers.P2PKHOutput(alice, 10));
        tir.addTX(trustIncreasingMTX.toTX());

        should(tir.getDirectTrust(alice, bob)).equal(32);
      });

      it('which has two change outputs does not change trust', () => {
        trustIncreasingMTX.outputs[0].value -= 10;
        for (var i = 0; i < 2; i++) {
          trustIncreasingMTX.outputs.push(testHelpers.P2PKHOutput(alice, 5));
        }
        tir.addTX(trustIncreasingMTX.toTX());

        should(tir.getDirectTrust(alice, bob)).equal(0);
      });

      it('which has a second output that is not a change output does not change trust', () => {
        trustIncreasingMTX.outputs[0].value -= 10;
        trustIncreasingMTX.outputs.push(testHelpers.P2PKHOutput(charlie, 5));
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
        trustDecreasingMTX.inputs.push(inputP2PKH);
        tir.addTX(trustDecreasingMTX.toTX());

        should(tir.getDirectTrust(alice, bob)).equal(0);
      });

      it('which has more than one trust outputs decreases trust to zero', () => {
        trustDecreasingMTX.outputs[0].value -= 15;
        trustDecreasingMTX.outputs.push(Object.assign(outputOneOfTwoMultisig.clone(), {value: 5}));
        tir.addTX(trustDecreasingMTX.toTX());

        should(tir.getDirectTrust(alice, bob)).equal(0);
      });
    });
  });
});
