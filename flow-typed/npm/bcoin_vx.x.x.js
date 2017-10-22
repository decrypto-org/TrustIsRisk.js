// This is a work-in-progress attempt to type the bcoin library.

type Hash = (string | Buffer);
type Network = any;

declare class bcoin$FullNode {
  pool : bcoin$Pool;
  spv : boolean;
  chain : bcoin$Chain;

  on(eventName : string, eventHandler : Function) : void;
  getTX(hash : Hash) : Promise<bcoin$TX>;
  getCoin(hash : Hash, index : number) : bcoin$Coin;
}

declare class bcoin$SPVNode {
  pool : bcoin$Pool;
  spv : boolean;
  chain : bcoin$Chain;

  on(eventName : string, eventHandler : Function) : void;
  getTX(hash : Hash) : Promise<bcoin$TX>;
  getCoin(hash : Hash, index : number) : bcoin$Coin;
}

declare class bcoin$Chain {}

declare class bcoin$WalletDB {}

declare class bcoin$Wallet {
  getTX(hash : Hash) : Promise<bcoin$TX>;
}

declare class bcoin$Pool {
  peers : bcoin$PeerList;
  spvFilter : bcoin$Bloom;

  watchAddress(address : (bcoin$Address | Buffer)) : void;
  watchOutpoint(outpoint : bcoin$Outpoint) : void;
  hasTX(hash : Hash) : boolean;
}

declare class bcoin$Bloom {
  test(val : (Buffer | string), enc :
    (typeof undefined | string)) : boolean;
}

declare class bcoin$Peer {}

declare class bcoin$PeerList {
  get(hostname : string) : bcoin$Peer;
  add(peer : bcoin$Peer) : void;
  head() : bcoin$Peer;
  next() : bcoin$Peer;
}

declare class bcoin$Address {
  toBase58() : string;
  hash : Buffer;
  static fromHash(Hash) : bcoin$Address;
  static fromBase58(string) : bcoin$Address;
}

declare class bcoin$TX {
  inputs : bcoin$Input[];
  outputs : bcoin$Output[];

  hash(enc : ?'hex') : Buffer;
  getOutputValue() : number;
}


declare class bcoin$MTX {
  inputs : bcoin$Input[];
  outputs : bcoin$Output[];

  toTX() : bcoin$TX;
  template(ring : bcoin$KeyRing) : number;
  scriptVector(outputScript : bcoin$Script, inputScript : bcoin$Script, ring : bcoin$KeyRing) : boolean;
  addOutput(output : bcoin$Output) : void;
  addCoin(coin : bcoin$Coin) : void;
  addInput(input : (bcoin$Input | Object)) : void;
  sign(ring : bcoin$KeyRing) : number;
  signInput(index : number, coin : bcoin$Coin, keyRing : bcoin$KeyRing) : boolean;
}

declare class bcoin$Output {
  script : bcoin$Script;
  value : number;

  getType() : ('pubkeyhash' | 'multisig');
  getAddress() : bcoin$Address;
}

declare class bcoin$Input {
  static fromOutpoint(outpoint : bcoin$Outpoint) : bcoin$Input;

  script : bcoin$Script;
  prevout : bcoin$Outpoint;

  getType() : ('pubkeyhash' | 'multisig');
  getAddress() : bcoin$Address;
}

declare class bcoin$Script {
  static fromMultisig(m : number, n : number, keys : Buffer[]) : bcoin$Script;
  static fromPubkeyhash(hash : Hash) : bcoin$Script;

  get(n : number) : (Buffer);
}

declare class bcoin$Outpoint {
  hash : Buffer;
  index : number;

  txid() : Buffer;
}

declare class bcoin$KeyRing {
  static fromPrivate(key : Buffer, compressed : ?boolean, network : ?Network) : bcoin$KeyRing;
  static fromPublic(key : Buffer, network : ?Network) : bcoin$KeyRing;

  getPublicKey() : Buffer;
  getPrivateKey() : Buffer;
  getAddress() : Buffer;
}

declare class bcoin$Coin extends bcoin$Output {
  script : bcoin$Script;
  value : number;
}

declare module 'bcoin' {
  declare module.exports: {
    fullnode : Class<bcoin$FullNode>,
    spvnode : Class<bcoin$SPVNode>,
    script : Class<bcoin$Script>,
    pool : Class<bcoin$Pool>,
    wallet : {
      Wallet : Class<bcoin$Wallet>,
      WalletDB : Class<bcoin$WalletDB>
    },
    primitives : {
      Address : Class<bcoin$Address>,
      TX : Class<bcoin$TX>,
      MTX : Class<bcoin$MTX>,
      Output : Class<bcoin$Output>,
      Input : Class<bcoin$Input>,
      Outpoint : Class<bcoin$Outpoint>,
      KeyRing : Class<bcoin$KeyRing>,
      Coin : Class<bcoin$Coin>
    },
    crypto : {
      hash160(str : (string | Buffer)) : Hash,
      hash256(str : (string | Buffer)) : Hash
    },
    base58 : {
      encode(str : (string | Buffer)) : Buffer
    },
  }
}


