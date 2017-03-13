var EventEmitter = require('events').EventEmitter;
var bitcore = require('bitcore-lib');

class MyService extends EventEmitter {
  node : any;

  constructor(options : Object) {
    super(options);
    this.node = options.node;

    this.node.services.bitcoind.on('tx', this.onTransaction.bind(this));
  }

  start(callback : Function) {
    console.log("Starting...");
    callback();
  }

  stop(callback : Function) {
    console.log("Stopping...");
    callback();
  }

  getAPIMethods() {
      return [];
  }

  getPublishEvents() {
    return [];
  }

  onTransaction(txBuffer : any) {
    console.log("Got transaction!");
    var tx = bitcore.Transaction().fromBuffer(txBuffer);
  }
}

// Bitcore service dependencies
MyService.dependencies = ['bitcoind'];

module.exports = MyService;
