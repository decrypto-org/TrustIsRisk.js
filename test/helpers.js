var TrustIsRisk = require('../');
var WalletDB = require('bcoin/lib/wallet/walletdb');
var bcoin = require('bcoin');
var assert = require('assert');

var testHelpers = {
  getAddressFixtures: () => {
    var names = ['alice', 'bob', 'charlie', 'dave', 'eve', 'frank', 'george'];
    var pubkeys = [
      '02b8f07a401eca4888039b1898f94db44c43ccc6d3aa8b27e9b6ed7b377b24c083',
      '2437025954568a8273968aa7535dbfc444fd8f8d0f5237cd96ac7234c77810ada53054a3654e669b',
      '3BBA2AF9539D09B4FD2BDEA1D3A2CE4BF5D779831B8781EE2ACF9C03378B2AD782',
      '19BD8D853FAEFDB9B01E4DE7F6096FF8F5F96D43E6564A5258307334A4AA59F351',
      '0503054CF7EBB4E62191AF1D8DE97945178D3F465EE88EF1FB4E80A70CB4A49A84',
      '878DFE5B43AC858EA37B3A9EEBA9E244F1848A30F78B2E5AC5B3EBDE81AC7D4516',
      '1349A1318B1426E6F724CBFE7ECD2C46008A364A96C4BD20C83FC1C4EBB2EB4A93'
    ];
    assert(pubkeys.length === names.length);

    var addr = {};
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      addr[name] = {};
      addr[name].pubkey = Buffer.from(pubkeys[i], 'hex');
      addr[name].base58 = bcoin.primitives.Address.fromHash(bcoin.crypto.hash160(addr[name].pubkey)).toString();
    }

    return addr;
  },

  getNode: async () => {
    var node = new TrustIsRisk.FullNode({network: 'regtest', passphrase: 'secret'});

    await node.open();
    await node.connect();
    node.startSync();

    return node;
  },

  getWalletDB: async (node) => {
    var walletDB = new WalletDB({
      network: 'regtest',
      db: 'memory',
      client: new bcoin.node.NodeClient(node)
    });

    await walletDB.open();
    await walletDB.connect();

    return walletDB;
  },

  getWallet: async (walletDB, id) => {
    var options = {
      id,
      passphrase: 'secret',
      witness: false,
      type: 'pubkeyhash'
    };

    return walletDB.create(options); 
  },

  mineBlock: async (node, rewardAddress) => {
    var block = await node.miner.mineBlock(node.chain.tip, rewardAddress);
    await node.chain.add(block);
  },

  time: async (milliseconds) => {
    return new Promise((resolve, reject) => {
      setTimeout(resolve, milliseconds);
    });
  },

  bufferToScript: (data) => {
    return `0x${Number(data.length).toString(16)} 0x${data.toString('hex')}`;
  },

  getP2PKHOutput: (to, value) => {
    var address = bcoin.primitives.Address.fromBase58(to);
    var script = bcoin.script.fromString(
        `OP_DUP OP_HASH160 ${testHelpers.bufferToScript(address.hash)} OP_EQUALVERIFY OP_CHECKSIG`);
    
    return new bcoin.primitives.Output({script, value});
  },

  getP2PKHInput: (pubKey, prevout) => {
    if (!prevout) {
      prevout = { // Don't care
        hash: 'v0pnhphaf4r5wz63j60vnh27s1bftl260qq621y458tn0g4x64u64yqz6d7qi6i8',
        index: 2
      };
    }

    return new bcoin.primitives.Input({
      prevout,
      script: bcoin.script.fromString(
          // Don't care about the signature
          "0x47 0x3044022035e32834c6ee4db1696cc06762feca2809d865ca12a3b98c801f3f451341a2570220573bf3ffef55f2651e1563acc0a22f8056222f277f5ddf17dd583d4edd40fa6001 "
          + testHelpers.bufferToScript(pubKey))
    }); 
  },

  getOneOfTwoMultisigOutput: (pubKeyFrom, pubKeyTo, value) => {
    return new bcoin.primitives.Output({
      value,
      script: bcoin.script.fromString(
          "OP_1 "
          + testHelpers.bufferToScript(pubKeyFrom) + " "
          + testHelpers.bufferToScript(pubKeyTo) + " "
          + "OP_2 OP_CHECKMULTISIG")
    });
  },

  getTrustIncreasingMTX: (pubKeyFrom, pubKeyTo, value) => {
    return new bcoin.primitives.MTX({
      inputs: [
        testHelpers.getP2PKHInput(pubKeyFrom)
      ],
      outputs: [
        testHelpers.getOneOfTwoMultisigOutput(pubKeyFrom, pubKeyTo, value)
      ]
    });
  },

  applyGraph: (tir, fileName, addr) => {
    var graph = require(fileName);

    for (var from in graph) {
      var neighbours = graph[from];
      for (var to in neighbours) {
        var value = neighbours[to];
        tir.addTX(testHelpers.getTrustIncreasingMTX(addr[from].pubkey, addr[to].pubkey, value).toTX()); 
      }
    }
  }
};



module.exports = testHelpers;
