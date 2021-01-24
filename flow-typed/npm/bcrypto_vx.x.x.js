declare class bcrypto$Hash160 {
  static digest(data : (string | Buffer)) : Hash
}

declare class bcrypto$secp256k1 {
  publicKeyCreate(key : Buffer, bool: boolean) : Buffer;
}

declare module 'bcrypto' {
  declare module.exports: {
    Hash160 : Class<bcrypto$Hash160>,
    secp256k1 : Class<bcrypto$secp256k1>
  }
}
