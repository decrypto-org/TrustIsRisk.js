// This is a work-in-progress attempt to type the bcoin library.

type Hash = (string | Buffer);
type Network = any;

declare class bcoin$FullNode {
  on(eventName : string, eventHandler : Function) : void;
  getTX(hash : Hash) : Promise<bcoin$TX>;
  getCoin(hash : Hash, index : number) : bcoin$Coin;
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
}


declare class bcoin$MTX {
  inputs : bcoin$Input[];
  outputs : bcoin$Output[];

  toTX : bcoin$TX;
  template(ring : bcoin$KeyRing) : number;
  scriptVector(outputScript : bcoin$Script, inputScript : bcoin$Script, ring : bcoin$KeyRing) : boolean;
  addOutput(output : bcoin$Output) : void;
  addCoin(coin : bcoin$Coin) : void;
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
}

declare class bcoin$KeyRing {
  static fromPrivate(key : Buffer, compressed : ?boolean, network : ?Network) : bcoin$KeyRing;
  static fromPublic(key : Buffer, network : ?Network) : bcoin$KeyRing;

  getPublicKey() : Buffer;
  getPrivateKey() : Buffer;
}

declare class bcoin$Coin extends bcoin$Output {
  script : bcoin$Script;
  value : number;
}

declare module 'bcoin' {
  declare module.exports: {
    fullnode : Class<bcoin$FullNode>,
    script : Class<bcoin$Script>,
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
      hash160(str : (string | Buffer)) : Hash
    }
  }
}


