var Trust = require("../");
var helpers = require("../lib/helpers.js");
var bcoin = require("bcoin");
var Coin = bcoin.primitives.Coin;
var Address = bcoin.primitives.Address;
var Input = bcoin.primitives.Input;
var MTX = bcoin.primitives.MTX;
var testHelpers = require("./helpers");
var consensus = require("bcoin/lib/protocol/consensus");
var sinon = require("sinon");
var should = require("should");
require("should-sinon");

const COIN = bcoin.consensus.COIN;

describe("TrustIsRisk", () => {
  var addr = testHelpers.getAddressFixtures();
  // Add base58 address variables to scope.
  for (name in addr) {
    eval(`var ${name} = "${addr[name].base58}";`);
  }

  var node, tir, trustIncreasingMTX, trustDecreasingMTX, trustIncreasingTX;
  beforeEach(() => {
    node = new bcoin.fullnode({});
    tir = new Trust.TrustIsRisk(node);

    trustIncreasingMTX = testHelpers.getTrustIncreasingMTX(addr.alice.pubKey, addr.bob.pubKey, 42 * COIN);
    trustIncreasingTX = trustIncreasingMTX.toTX();

    var inputOneOfTwoMultisig = new Input({
      prevout: {
        hash: trustIncreasingTX.hash().toString("hex"),
        index: 0
      },
      script: bcoin.script.fromString(
        // 17P8kCbDBPmqLDCCe9dYwbfiEDaRb5xDYE
        "0x47 0x3044022035e32834c6ee4db1696cc06762feca2809d865ca12a3b98c801f3f451341a2570220573bf3ffef55f2651e1563acc0a22f8056222f277f5ddf17dd583d4edd40fa6001 0x21 0x02b8f07a401eca4888039b1898f94db44c43ccc6d3aa8b27e9b6ed7b377b24c083")
    });

    trustDecreasingMTX = new MTX({
      inputs: [
        inputOneOfTwoMultisig
      ],
      outputs: [
        testHelpers.getOneOfTwoMultisigOutput(addr.alice.pubKey, addr.bob.pubKey, 20 * COIN),
        testHelpers.getP2PKHOutput(addr.alice.base58, 22 * COIN)
      ]
    });
  });

  describe(".getDirectTrust()", () => {
    it("returns zero for two arbitary parties that do not trust each other", () => {
      tir.getDirectTrust(alice, bob).should.equal(0);
      tir.getDirectTrust(bob, alice).should.equal(0);
      tir.getDirectTrust(charlie, alice).should.equal(0);
      tir.getDirectTrust(alice, charlie).should.equal(0);
      tir.getDirectTrust(charlie, frank).should.equal(0);
    });

    it("returns Infinity for one's direct trust to themselves", () => {
      tir.getDirectTrust(alice, alice).should.equal(Infinity);
      tir.getDirectTrust(bob, bob).should.equal(Infinity);
    });
  });

  describe(".addTX()", () => {
    describe("with a non-TIR transaction", () => {
      it("does not change trust", () => {
        trustIncreasingMTX.outputs[0] = testHelpers.getP2PKHOutput(charlie, 50 * COIN); 
        tir.addTX(trustIncreasingMTX.toTX());

        tir.getDirectTrust(alice, bob).should.equal(0);
        tir.getDirectTrust(bob, alice).should.equal(0);
        tir.getDirectTrust(alice, charlie).should.equal(0);
        tir.getDirectTrust(charlie, alice).should.equal(0);
        tir.getDirectTrust(charlie, dave).should.equal(0);
      });
    });

    describe("with a trust increasing transaction", () => {
      it("correctly increases trust", () => {
        tir.addTX(trustIncreasingTX);

        tir.getDirectTrust(alice, bob).should.equal(42 * COIN);
        tir.getDirectTrust(bob, alice).should.equal(0);
        tir.getDirectTrust(charlie, dave).should.equal(0);
      });

      it("which has more than one input does not change trust", () => {
        trustIncreasingMTX.inputs.push(trustIncreasingMTX.inputs[0].clone());
        tir.addTX(trustIncreasingMTX.toTX());

        tir.getDirectTrust(alice, bob).should.equal(0);
      });

      it("which has a change output correctly increases trust", () => {
        trustIncreasingMTX.outputs[0].value -= 10 * COIN;
        trustIncreasingMTX.outputs.push(testHelpers.getP2PKHOutput(alice, 10 * COIN));
        tir.addTX(trustIncreasingMTX.toTX());

        tir.getDirectTrust(alice, bob).should.equal(32 * COIN);
      });

      it("which has two change outputs does not change trust", () => {
        trustIncreasingMTX.outputs[0].value -= 10;
        for (var i = 0; i < 2; i++) {
          trustIncreasingMTX.outputs.push(testHelpers.getP2PKHOutput(alice, 5 * COIN));
        }
        tir.addTX(trustIncreasingMTX.toTX());

        tir.getDirectTrust(alice, bob).should.equal(0);
      });

      it("which has a second output that is not a change output does not change trust", () => {
        trustIncreasingMTX.outputs[0].value -= 10 * COIN;
        trustIncreasingMTX.outputs.push(testHelpers.getP2PKHOutput(charlie, 5 * COIN));
        tir.addTX(trustIncreasingMTX.toTX());

        tir.getDirectTrust(alice, bob).should.equal(0);
      });

      it("which has been processed before throws", () => {
        var tx = trustIncreasingMTX.toTX();
        should(tir.addTX(tx));
        should.throws(() => tir.addTX(tx), /already processed/i);
        tir.getDirectTrust(alice, bob).should.equal(42 * COIN);
      });
    });

    describe("with a trust decreasing transaction", () => {
      beforeEach(() => {
        tir.addTX(trustIncreasingTX);
      });

      it("correctly decreases trust", () => {
        tir.addTX(trustDecreasingMTX.toTX());
        tir.getDirectTrust(alice, bob).should.equal(20 * COIN);
      });

      it("which has a second input decreases trust to zero", () => {
        trustDecreasingMTX.inputs.push(testHelpers.getP2PKHInput(addr.alice.pubKey));
        tir.addTX(trustDecreasingMTX.toTX());

        tir.getDirectTrust(alice, bob).should.equal(0);
      });

      it("which has more than one trust outputs decreases trust to zero", () => {
        trustDecreasingMTX.outputs[0].value -= 15 * COIN;
        trustDecreasingMTX.outputs.push(
            testHelpers.getOneOfTwoMultisigOutput(addr.alice.pubKey, addr.bob.pubKey, 5 * COIN));
        tir.addTX(trustDecreasingMTX.toTX());

        tir.getDirectTrust(alice, bob).should.equal(0);
      });
    });
  });

  describe(".createTrustIncreasingMTX()", () => {
    it("creates valid trust-increasing transactions", async () => {
      var getTXStub = sinon.stub(node, "getCoin");

      var prevOutput = {
        hash: "v1pnhp2af4r5wz63j60vnh27s1bftl260qq621y458tn0g4x64u64yqz6d7qi6i8",
        index: 1
      };

      getTXStub.withArgs(prevOutput.hash).returns(new Coin({
        script: testHelpers.getP2PKHOutput(alice, 1).script,
        value: 1000 * COIN
      }));

      var mtx = await tir.createTrustIncreasingMTX(addr.alice.privKey, addr.bob.pubKey, prevOutput,
          100 * COIN);

      mtx.inputs.length.should.equal(1);

      mtx.outputs.length.should.equal(2);

      var trustOutput = mtx.outputs[0];
      trustOutput.getType().should.equal("multisig");
      [1, 2].map((i) => helpers.pubKeyToEntity(trustOutput.script.get(i))).sort()
          .should.deepEqual([alice, bob].sort());
      trustOutput.value.should.equal(100 * COIN);

      var changeOutput = mtx.outputs[1];
      changeOutput.getType().should.equal("pubkeyhash");
      changeOutput.getAddress().toBase58().should.equal(alice);
      changeOutput.value.should.equal(900 * COIN - 1000);
    });
  });

  describe(".getTrustDecreasingMTX()", () => {
    var trustTXs;
    beforeEach(() => {
      var tx;
      trustTXs = [];

      tx = trustIncreasingTX;
      trustTXs.push(tx);
      tir.addTX(tx);

      trustIncreasingMTX.outputs[0].value = 100 * COIN;
      tx = trustIncreasingMTX.toTX();
      trustTXs.push(tx);
      tir.addTX(tx);

      trustIncreasingMTX.outputs[0].value = 500 * COIN;
      tx = trustIncreasingMTX.toTX();
      trustTXs.push(tx);
      tir.addTX(tx);

      // Total trust 642 BTC
    });

    // Helper specific to the next couple of tests:
    // Checks that mtxs is a list of two trust decreasing transactions. The first one spends the
    // entire first trust increasing transaction, and the second spends part of the second.
    // Also checks that the reduced trust is sent via P2PKH outputs to the correct recipient.
    var checkMTXs = (mtxs, recipient) => {
      mtxs.length.should.equal(2);

      var mtx = mtxs[0];

      mtx.inputs.length.should.equal(1);
      mtx.inputs[0].prevout.should.have.properties({
        hash: trustTXs[0].hash().toString("hex"),
        index: 0
      });

      mtx.outputs.length.should.equal(1); // Single P2PKH output
      mtx.outputs[0].getType().should.equal("pubkeyhash");
      mtx.outputs[0].getAddress().toBase58().should.equal(recipient);
      mtx.outputs[0].value.should.equal(42 * COIN - 1000);

      mtx = mtxs[1];

      mtx.inputs.length.should.equal(1);
      mtx.inputs[0].prevout.should.have.properties({
        hash: trustTXs[1].hash().toString("hex"),
        index: 0
      });

      mtx.outputs.length.should.equal(2); // One P2PKH output and one multisig trust output
      mtx.outputs[1].script.toString().should.equal(trustTXs[1].outputs[0].script.toString());
      mtx.outputs[1].value.should.equal(60 * COIN);
      mtx.outputs[0].getType().should.equal("pubkeyhash");
      mtx.outputs[0].getAddress().toBase58().should.equal(recipient);
      mtx.outputs[0].value.should.equal(40 * COIN - 1000);
    };

    it("creates correct trust decreasing transactions", () => {
      var mtxs = tir.createTrustDecreasingMTXs(addr.alice.privKey, addr.bob.pubKey, 82 * COIN);
      checkMTXs(mtxs, alice);
    });

    it("creates correct trust stealing transactions", () => {
      var mtxs = tir.createTrustDecreasingMTXs(addr.alice.privKey, addr.bob.pubKey, 82 * COIN, charlie);
      checkMTXs(mtxs, charlie);
    });

    it("throws when trying to decrease self-trust", () => {
      should.throws(() => tir.createTrustDecreasingMTXs(addr.alice.privKey, addr.alice.pubKey, 10 * COIN)
          , /self-trust/i);
    });

    it("throws when there is not enough trust", () => {
      should.throws(() => tir.createTrustDecreasingMTXs(addr.alice.privKey, addr.bob.pubKey, 700 * COIN)
        , /insufficient trust/i);
      
    });
  });

  describe(".getIndirectTrust()", () => {
    it("returns zero for two arbitary parties that do not trust each other", () => {
      should(tir.getIndirectTrust(alice, bob)).equal(0);
      should(tir.getIndirectTrust(bob, alice)).equal(0);
      should(tir.getIndirectTrust(charlie, alice)).equal(0);
      should(tir.getIndirectTrust(alice, charlie)).equal(0);
    });     

    it("returns Infinity for one's trust to themselves", () => {
      should(tir.getIndirectTrust(alice, alice)).equal(Infinity);
      should(tir.getIndirectTrust(bob, bob)).equal(Infinity);
    });

    describe("after applying the Nobody Likes Frank graph example", () => {
      beforeEach(() => {
        testHelpers.applyGraph(tir, "./graphs/nobodyLikesFrank.json", addr);
      });

      it("correctly computes trusts", () => {
        should(tir.getIndirectTrust(alice, alice)).equal(Infinity);
        should(tir.getIndirectTrust(alice, bob)).equal(10);
        should(tir.getIndirectTrust(alice, charlie)).equal(1);
        should(tir.getIndirectTrust(alice, dave)).equal(4);
        should(tir.getIndirectTrust(alice, eve)).equal(6);
        should(tir.getIndirectTrust(alice, frank)).equal(0);
        should(tir.getIndirectTrust(alice, george)).equal(2);

        should(tir.getIndirectTrust(bob, alice)).equal(1);
        should(tir.getIndirectTrust(bob, bob)).equal(Infinity);
        should(tir.getIndirectTrust(bob, charlie)).equal(1);
        should(tir.getIndirectTrust(bob, dave)).equal(1);
        should(tir.getIndirectTrust(bob, eve)).equal(3);
        should(tir.getIndirectTrust(bob, frank)).equal(0);
        should(tir.getIndirectTrust(bob, george)).equal(2);

        should(tir.getIndirectTrust(charlie, alice)).equal(0);
        should(tir.getIndirectTrust(charlie, bob)).equal(0);
        should(tir.getIndirectTrust(charlie, charlie)).equal(Infinity);
        should(tir.getIndirectTrust(charlie, dave)).equal(0);
        should(tir.getIndirectTrust(charlie, eve)).equal(0);
        should(tir.getIndirectTrust(charlie, frank)).equal(0);
        should(tir.getIndirectTrust(charlie, george)).equal(3);

        should(tir.getIndirectTrust(dave, alice)).equal(2);
        should(tir.getIndirectTrust(dave, bob)).equal(2);
        should(tir.getIndirectTrust(dave, charlie)).equal(1);
        should(tir.getIndirectTrust(dave, dave)).equal(Infinity);
        should(tir.getIndirectTrust(dave, eve)).equal(12);
        should(tir.getIndirectTrust(dave, frank)).equal(0);
        should(tir.getIndirectTrust(dave, george)).equal(2);

        should(tir.getIndirectTrust(eve, alice)).equal(0);
        should(tir.getIndirectTrust(eve, bob)).equal(0);
        should(tir.getIndirectTrust(eve, charlie)).equal(0);
        should(tir.getIndirectTrust(eve, dave)).equal(0);
        should(tir.getIndirectTrust(eve, eve)).equal(Infinity);
        should(tir.getIndirectTrust(eve, frank)).equal(0);
        should(tir.getIndirectTrust(eve, george)).equal(0);

        should(tir.getIndirectTrust(frank, alice)).equal(0);
        should(tir.getIndirectTrust(frank, bob)).equal(0);
        should(tir.getIndirectTrust(frank, charlie)).equal(10);
        should(tir.getIndirectTrust(frank, dave)).equal(0);
        should(tir.getIndirectTrust(frank, eve)).equal(0);
        should(tir.getIndirectTrust(frank, frank)).equal(Infinity);
        should(tir.getIndirectTrust(frank, george)).equal(3);

        should(tir.getIndirectTrust(george, alice)).equal(0);
        should(tir.getIndirectTrust(george, bob)).equal(0);
        should(tir.getIndirectTrust(george, charlie)).equal(0);
        should(tir.getIndirectTrust(george, dave)).equal(0);
        should(tir.getIndirectTrust(george, eve)).equal(0);
        should(tir.getIndirectTrust(george, frank)).equal(0);
        should(tir.getIndirectTrust(george, george)).equal(Infinity);
      });

      it("correctly computes trusts when bob trusts frank", () => {
        tir.addTX(testHelpers.getTrustIncreasingMTX(addr.bob.pubKey, addr.frank.pubKey, 8).toTX());
        should(tir.getIndirectTrust(george, frank)).equal(0);
        should(tir.getIndirectTrust(alice, frank)).equal(8);
        should(tir.getIndirectTrust(dave, frank)).equal(2);
        should(tir.getIndirectTrust(bob, frank)).equal(8);
      });

      // TODO: Decrement direct trusts and test that indirect trusts update correctly
    });
  });
});
