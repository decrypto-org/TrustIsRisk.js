// This is a work-in-progress attempt to type the bcoin library.

declare class bcoin$FullNode {
  on(eventName : string, eventHandler : Function) : void;
}

declare class bcoin$Address {
  toBase58() : string;
  static fromHash(string|Buffer) : bcoin$Address;
}

declare class bcoin$TX {
  inputs : bcoin$Input[];
  outputs : bcoin$Output[];

  hash(enc : ?'hex') : Buffer;
}

declare class bcoin$Output {
  script : bcoin$Script;
  value : number;

  getType() : ('pubkeyhash' | 'multisig');
  getAddress() : bcoin$Address;
}

declare class bcoin$Input {
  script : bcoin$Script;
  prevout : bcoin$Outpoint;
  getType() : ('pubkeyhash' | 'multisig');
  getAddress() : bcoin$Address;
}

declare class bcoin$Script {
  get(n : number) : (Buffer);
}

declare class bcoin$Outpoint {
  hash : Buffer;
  index : number;
}

declare module 'bcoin' {
  declare module.exports: {
    fullnode : Class<bcoin$FullNode>,
    script : Class<bcoin$Script>,
    primitives : {
      Address : Class<bcoin$Address>,
      TX : Class<bcoin$TX>,
      Output : Class<bcoin$Output>,
      Input : Class<bcoin$Input>,
      Outpoint : Class<bcoin$Outpoint>
    },
    crypto : {
      hash160(str : (string | Buffer)) : (string | Buffer)
    }
  }
}

