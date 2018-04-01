var Trust = require("../");
var helpers = require("../lib/helpers.js");
var bcoin = require("bcoin");
var Coin = bcoin.primitives.Coin;
var Address = bcoin.primitives.Address;
var Input = bcoin.primitives.Input;
var MTX = bcoin.primitives.MTX;
var walletPlugin = bcoin.wallet.plugin;
var TX = bcoin.primitives.TX;
var TXRecord = bcoin.wallet.records.TXRecord;
var testHelpers = require("./helpers");
var tag = require("../lib/tag");
var consensus = require("bcoin/lib/protocol/consensus");
var secp256k1 = require("bcoin/lib/crypto/secp256k1");
var sinon = require("sinon");
var should = require("should");
var fixtures = require("./fixtures");
var assert = require("assert");
require("should-sinon");

const COIN = bcoin.consensus.COIN;

var addr = {};
for (let [name, keyRing] of Object.entries(fixtures.keyRings)) {
  var pubKey = keyRing.getPublicKey();
  var privKey = keyRing.getPrivateKey();

  addr[name] = {};
  addr[name].pubKey = pubKey;
  addr[name].privKey = privKey;
  addr[name].base58 = helpers.pubKeyToEntity(pubKey);
}

// Add base58 address variables to scope.
for (name in fixtures.keyRings) {
  var keyRing = fixtures.keyRings[name];
  eval(`var ${name} = "${bcoin.primitives.Address.fromHash(bcoin.crypto.hash160(keyRing.getPublicKey())).toString()}";`);
}

var node, tir, walletDB, wallet,
  trustIncreasingMTX, trustDecreasingMTX, trustIncreasingTX;

setupTest = async (isFullNode) => {
  if (isFullNode) {
    node = new bcoin.fullnode({network: bcoin.network.get().toString()});
  }
  else {
    node = new bcoin.spvnode({network: bcoin.network.get().toString()});
  }
  node.use(walletPlugin);
  tir = new Trust.TrustIsRisk(node);
  walletDB = node.require("walletdb");
  await node.open();
  wallet = await testHelpers.createWallet(walletDB, "wallet");

  trustIncreasingMTX = testHelpers.getTrustIncreasingMTX(addr.alice.pubKey, addr.bob.pubKey, 42 * COIN);
  trustIncreasingTX = trustIncreasingMTX.toTX();

  var inputOneOfThreeMultisig = new Input({
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
      inputOneOfThreeMultisig
    ],
    outputs: [
      testHelpers.getOneOfThreeMultisigOutput(addr.alice.pubKey, addr.bob.pubKey, 20 * COIN),
      testHelpers.getP2PKHOutput(addr.alice.base58, 22 * COIN)
    ]
  });
};

tearDownTest = async () => {
  await node.close();
};

describe("tag", () => {
  it("corresponds to a valid public key", () => {
    Buffer.isBuffer(tag).should.be.true();
    secp256k1.publicKeyVerify(tag).should.be.true();
  });

  it("is a valid bitcoin address", () => {
    const address = bcoin.primitives.KeyRing.fromPublic(
        tag).getAddress("base58").toString();
    bcoin.primitives.Address.fromString(address).should.not.throw();
  });
});

testEach = (isFullNode) => {
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
        tir.addTX(tx).should.be.true();
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
        // trustDecreasingMTX does not verify correctly
        // because it is not part of a valid blockchain
      });

      it("decreases trust to zero for trust decreasing transactions with a wrong recipient", () => {
        // By changing the trust recipient from bob to charlie, we make the transaction a
        // nullifying trust transaction.
        trustDecreasingMTX.outputs[0] =
            testHelpers.getOneOfThreeMultisigOutput(addr.alice.pubKey, addr.charlie.pubKey, 20 * COIN);

        tir.addTX(trustDecreasingMTX.toTX());
        tir.getDirectTrust(alice, bob).should.equal(0);
      });

      it("which has a second input decreases trust to zero", () => {
        trustDecreasingMTX.inputs.push(testHelpers.getP2PKHInput(addr.alice.pubKey));
        tir.addTX(trustDecreasingMTX.toTX());

        tir.getDirectTrust(alice, bob).should.equal(0);
      });

      it("which has more than one trust outputs decreases trust to zero", () => {
        trustDecreasingMTX.outputs[0].value -= 15 * COIN;
        trustDecreasingMTX.outputs.push(
            testHelpers.getOneOfThreeMultisigOutput(addr.alice.pubKey, addr.bob.pubKey, 5 * COIN));
        tir.addTX(trustDecreasingMTX.toTX());

        tir.getDirectTrust(alice, bob).should.equal(0);
      });
    });
  });

  describe(".createTrustIncreasingMTX()", () => {
    it("creates valid trust-increasing transactions", async () => {
      var getTXStub = sinon.stub(wallet, "getTX");

      var prevOutpoint = {
        hash: "v1pnhp2af4r5wz63j60vnh27s1bftl260qq621y458tn0g4x64u64yqz6d7qi6i8",
        index: 0
      };

      getTXStub.withArgs(prevOutpoint.hash).returns(TXRecord.fromTX(
          TX.fromOptions({
            inputs: [testHelpers.getP2PKHInput(addr.alice.pubKey)],
            outputs: [testHelpers.getP2PKHOutput(alice, 1000 * COIN)]
          })));

      var mtx = await tir.createTrustIncreasingMTX(addr.alice.privKey,
          addr.bob.pubKey, prevOutpoint, 100 * COIN, wallet);

      mtx.inputs.length.should.equal(1);

      mtx.outputs.length.should.equal(2);

      var trustOutput = mtx.outputs[0];
      trustOutput.getType().should.equal("multisig");
      [1, 2].map((i) => helpers.pubKeyToEntity(
          trustOutput.script.get(i).data, tir.network
      )).sort().should.deepEqual([alice, bob].sort());
      trustOutput.script.get(3).data.should.deepEqual(tag);
      trustOutput.value.should.equal(100 * COIN);

      var changeOutput = mtx.outputs[1];
      changeOutput.getType().should.equal("pubkeyhash");
      changeOutput.getAddress().toString().should.equal(alice);
      changeOutput.value.should.equal(900 * COIN - 1000);
    });
  });

  describe(".getTrustDecreasingMTX()", () => {
    var trustTXs;
    beforeEach(() => {
      var getTXStub = sinon.stub(wallet, "getTX");

      var tx;
      trustTXs = [];

      tx = trustIncreasingTX;
      trustTXs.push(tx);
      tir.addTX(tx);

      getTXStub.withArgs(tx.hash("hex")).returns(TXRecord.fromTX(tx));

      trustIncreasingMTX.outputs[0].value = 100 * COIN;
      tx = trustIncreasingMTX.toTX();
      trustTXs.push(tx);
      tir.addTX(tx);

      getTXStub.withArgs(tx.hash("hex")).returns(TXRecord.fromTX(tx));

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
    var checkMTXs = async (mtxs, recipient) => {
      mtxs = await mtxs;
      mtxs.length.should.equal(2);

      var mtx = await mtxs[0];

      mtx.inputs.length.should.equal(1);
      mtx.inputs[0].prevout.should.have.properties({
        hash: trustTXs[0].hash().toString("hex"),
        index: 0
      });

      mtx.outputs.length.should.equal(1); // Single P2PKH output
      mtx.outputs[0].getType().should.equal("pubkeyhash");
      mtx.outputs[0].getAddress().toString().should.equal(recipient);
      mtx.outputs[0].value.should.equal(42 * COIN - 1000);

      mtx = await mtxs[1];

      mtx.inputs.length.should.equal(1);
      mtx.inputs[0].prevout.should.have.properties({
        hash: trustTXs[1].hash().toString("hex"),
        index: 0
      });

      mtx.outputs.length.should.equal(2); // One P2PKH output and one multisig trust output
      mtx.outputs[1].script.toString().should.equal(trustTXs[1].outputs[0].script.toString());
      mtx.outputs[1].value.should.equal(60 * COIN);
      mtx.outputs[0].getType().should.equal("pubkeyhash");
      mtx.outputs[0].getAddress().toString().should.equal(recipient);
      mtx.outputs[0].value.should.equal(40 * COIN - 1000);
    };

    it("creates correct trust decreasing transactions", async () => {
      var mtxs = tir.createTrustDecreasingMTXs(
          addr.alice.privKey, addr.bob.pubKey, 82 * COIN, wallet);
      await checkMTXs(mtxs, alice);
    });

    it("creates correct trust stealing transactions", async () => {
      var mtxs = tir.createTrustDecreasingMTXs(
          addr.alice.privKey, addr.bob.pubKey, 82 * COIN,
          wallet, charlie);
      await checkMTXs(mtxs, charlie);
    });

    it("throws when trying to decrease self-trust", () => {
      tir.createTrustDecreasingMTXs(
          addr.alice.privKey, addr.alice.pubKey, 10 * COIN
      ).should.be.rejectedWith("Can't decrease self-trust");
    });

    it("throws when there is not enough trust", () => {
      tir.createTrustDecreasingMTXs(
          addr.alice.privKey, addr.bob.pubKey, 700 * COIN
      ).should.be.rejectedWith("Insufficient trust");
    });
  });

  describe(".getIndirectTrust()", () => {
    it("returns zero for two arbitary parties that do not trust each other", () => {
      tir.getIndirectTrust(alice, bob).should.equal(0);
      tir.getIndirectTrust(bob, alice).should.equal(0);
      tir.getIndirectTrust(charlie, alice).should.equal(0);
      tir.getIndirectTrust(alice, charlie).should.equal(0);
    });

    it("returns Infinity for one's trust to themselves", () => {
      tir.getIndirectTrust(alice, alice).should.equal(Infinity);
      tir.getIndirectTrust(bob, bob).should.equal(Infinity);
    });

    describe("after applying the Nobody Likes Frank graph example", () => {
      beforeEach(() => {
        testHelpers.applyGraph(tir, "./graphs/nobodyLikesFrank.json", addr);
      });

      it("correctly computes trusts", () => {
        tir.getIndirectTrust(alice, alice).should.equal(Infinity);
        tir.getIndirectTrust(alice, bob).should.equal(10);
        tir.getIndirectTrust(alice, charlie).should.equal(1);
        tir.getIndirectTrust(alice, dave).should.equal(4);
        tir.getIndirectTrust(alice, eve).should.equal(6);
        tir.getIndirectTrust(alice, frank).should.equal(0);
        tir.getIndirectTrust(alice, george).should.equal(2);

        tir.getIndirectTrust(bob, alice).should.equal(1);
        tir.getIndirectTrust(bob, bob).should.equal(Infinity);
        tir.getIndirectTrust(bob, charlie).should.equal(1);
        tir.getIndirectTrust(bob, dave).should.equal(1);
        tir.getIndirectTrust(bob, eve).should.equal(3);
        tir.getIndirectTrust(bob, frank).should.equal(0);
        tir.getIndirectTrust(bob, george).should.equal(2);

        tir.getIndirectTrust(charlie, alice).should.equal(0);
        tir.getIndirectTrust(charlie, bob).should.equal(0);
        tir.getIndirectTrust(charlie, charlie).should.equal(Infinity);
        tir.getIndirectTrust(charlie, dave).should.equal(0);
        tir.getIndirectTrust(charlie, eve).should.equal(0);
        tir.getIndirectTrust(charlie, frank).should.equal(0);
        tir.getIndirectTrust(charlie, george).should.equal(3);

        tir.getIndirectTrust(dave, alice).should.equal(2);
        tir.getIndirectTrust(dave, bob).should.equal(2);
        tir.getIndirectTrust(dave, charlie).should.equal(1);
        tir.getIndirectTrust(dave, dave).should.equal(Infinity);
        tir.getIndirectTrust(dave, eve).should.equal(12);
        tir.getIndirectTrust(dave, frank).should.equal(0);
        tir.getIndirectTrust(dave, george).should.equal(2);

        tir.getIndirectTrust(eve, alice).should.equal(0);
        tir.getIndirectTrust(eve, bob).should.equal(0);
        tir.getIndirectTrust(eve, charlie).should.equal(0);
        tir.getIndirectTrust(eve, dave).should.equal(0);
        tir.getIndirectTrust(eve, eve).should.equal(Infinity);
        tir.getIndirectTrust(eve, frank).should.equal(0);
        tir.getIndirectTrust(eve, george).should.equal(0);

        tir.getIndirectTrust(frank, alice).should.equal(0);
        tir.getIndirectTrust(frank, bob).should.equal(0);
        tir.getIndirectTrust(frank, charlie).should.equal(10);
        tir.getIndirectTrust(frank, dave).should.equal(0);
        tir.getIndirectTrust(frank, eve).should.equal(0);
        tir.getIndirectTrust(frank, frank).should.equal(Infinity);
        tir.getIndirectTrust(frank, george).should.equal(3);

        tir.getIndirectTrust(george, alice).should.equal(0);
        tir.getIndirectTrust(george, bob).should.equal(0);
        tir.getIndirectTrust(george, charlie).should.equal(0);
        tir.getIndirectTrust(george, dave).should.equal(0);
        tir.getIndirectTrust(george, eve).should.equal(0);
        tir.getIndirectTrust(george, frank).should.equal(0);
        tir.getIndirectTrust(george, george).should.equal(Infinity);
      });

      it("correctly computes trusts when bob trusts frank", () => {
        tir.addTX(testHelpers.getTrustIncreasingMTX(addr.bob.pubKey, addr.frank.pubKey, 8).toTX());
        tir.getIndirectTrust(george, frank).should.equal(0);
        tir.getIndirectTrust(alice, frank).should.equal(8);
        tir.getIndirectTrust(dave, frank).should.equal(2);
        tir.getIndirectTrust(bob, frank).should.equal(8);
      });

      // TODO: Decrement direct trusts and test that indirect trusts update correctly
    });
  });
};

describeTest = (isFullNode) => {
  beforeEach(async () => {
    await setupTest(isFullNode);
  });
  testEach(isFullNode);
  afterEach(async () => {
    await tearDownTest();
  });
};

describe("TrustIsRisk full node", () => {
  describeTest(true);
});

describe("TrustIsRisk SPV node", () => {
  describeTest(false);
});
