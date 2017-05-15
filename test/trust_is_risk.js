var Trust = require('../');
var bcoin = require('bcoin');
var testHelpers = require('./helpers');
var consensus = require('bcoin/lib/protocol/consensus');
var sinon = require('sinon');
var should = require('should');
require('should-sinon');

describe('TrustIsRisk', () => {
  var inputP2PKH = new bcoin.primitives.Input({
    prevout: {
      hash: 'v0pnhphaf4r5wz63j60vnh27s1bftl260qq621y458tn0g4x64u64yqz6d7qi6i8',
      index: 0xfffffffa
    }, script: bcoin.script.fromString(
      // 17P8kCbDBPmqLDCCe9dYwbfiEDaRb5xDYE
      "0x47 0x3044022035e32834c6ee4db1696cc06762feca2809d865ca12a3b98c801f3f451341a2570220573bf3ffef55f2651e1563acc0a22f8056222f277f5ddf17dd583d4edd40fa6001 0x21 0x02b8f07a401eca4888039b1898f94db44c43ccc6d3aa8b27e9b6ed7b377b24c083")
  });

  var outputOneOfTwoMultsig = new bcoin.primitives.Output({
    script: bcoin.script.fromString(
      // 1/{17P8kCbDBPmqLDCCe9dYwbfiEDaRb5xDYE, 1P6NdQWeZTLrYCpQNbYeXsLeaEjn8h6UFx}
      "OP_1 0x21 0x02b8f07a401eca4888039b1898f94db44c43ccc6d3aa8b27e9b6ed7b377b24c083 0x28 0x2437025954568a8273968aa7535dbfc444fd8f8d0f5237cd96ac7234c77810ada53054a3654e669b OP_2 OP_CHECKMULTISIG"),
    value: 42
  });

  var tir = null, mtx = null, changeScript = null;
  beforeEach(() => {
    tir = new Trust.TrustIsRisk(new bcoin.fullnode({}));

    mtx = new bcoin.primitives.MTX({
      inputs: [
        inputP2PKH 
      ],
      outputs: [
        outputOneOfTwoMultsig
      ]
    });

    changeScript = bcoin.script.fromString(
      // Pays to 17P8kCbDBPmqLDCCe9dYwbfiEDaRb5xDYE
      "OP_DUP OP_HASH160 0x14 0x46005EF459C9E7C37AF8871D25BC39D0EA0534D1 OP_EQUALVERIFY OP_CHECKSIG");
  });

  describe('.parseTXAsTrustIncrease', () => {
    it('correctly parses trust increasing transactions', () => {
      var trustChange = tir.parseTXAsTrustIncrease(mtx.toTX());

      should(trustChange).deepEqual({
        from: "17P8kCbDBPmqLDCCe9dYwbfiEDaRb5xDYE",
        to: "1P6NdQWeZTLrYCpQNbYeXsLeaEjn8h6UFx",
        amount: 42
      });
    });

    it('rejects transactions with more than one input', () => {
      mtx.inputs.push(inputP2PKH);
      var trustChange = tir.parseTXAsTrustIncrease(mtx.toTX());

      should(trustChange).equal(null);
    });

    it('correctly parses trust increasing transactions with change outputs', () => {
      mtx.outputs[0].value -= 10;
      mtx.outputs.push(new bcoin.primitives.Output({
        script: changeScript, 
        value: 10
      }));
      var trustChange = tir.parseTXAsTrustIncrease(mtx.toTX());

      should(trustChange).deepEqual({
        from: "17P8kCbDBPmqLDCCe9dYwbfiEDaRb5xDYE",
        to: "1P6NdQWeZTLrYCpQNbYeXsLeaEjn8h6UFx",
        amount: 32
      });
    });

    it('rejects transactions with two change outputs', () => {
      mtx.outputs[0].value -= 10;
      for (var i = 0; i < 2; i++) {
        mtx.outputs.push(new bcoin.primitives.Output({
          script: changeScript, 
          value: 5
        }));
      }
      var trustChange = tir.parseTXAsTrustIncrease(mtx.toTX());

      should(trustChange).equal(null);
    });

    it('rejects transactions with a second output that\'s not a change output', () => {
      mtx.outputs[0].value -= 10;
      mtx.outputs.push(new bcoin.primitives.Output({
        script: bcoin.script.fromString(
          // Pays to 1JDfVQkZxMvRwM3Lc6LkDrpX55Ldk3JqND
          "OP_DUP OP_HASH160 0x14 0xBCDF4271C6600E7D02E60F9206A9AD862FFBD4F0 OP_EQUALVERIFY OP_CHECKSIG"),
        value: 10
      }));
      var trustChange = tir.parseTXAsTrustIncrease(mtx.toTX());

      should(trustChange).equal(null);
    });

    it('rejects transactions with no trust outputs', () => {
      mtx.outputs[0] = new bcoin.primitives.Output({
        script: bcoin.script.fromString(
          // Pays to 1JDfVQkZxMvRwM3Lc6LkDrpX55Ldk3JqND
          "OP_DUP OP_HASH160 0x14 0xBCDF4271C6600E7D02E60F9206A9AD862FFBD4F0 OP_EQUALVERIFY OP_CHECKSIG"),
        value: 10
      });
      var trustChange = tir.parseTXAsTrustIncrease(mtx.toTX());

      should(trustChange).equal(null);
    });
  });
});
