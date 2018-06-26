async function delay(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  })
};

(async () => {
  const sinon = require("sinon");
  const EventEmitter = require("events");

  class MyClass {
    constructor() {
      EventEmitter.call(this);
      this.dummy = (() => {console.log("dummy was called")}).bind(this);
    }

    func() {
      console.log("I have indeed been called!");
    }
  };

  Object.setPrototypeOf(MyClass.prototype, EventEmitter.prototype);

  const obj = new MyClass();
  sinon.spy(obj, "dummy");
  obj.on("tx", obj.dummy);

  obj.emit("tx");
  //obj.func.call(null); // weird

  console.log((obj.dummy.calledOnce) ?
      "And the spy knows!" : "But the spy is ignorant...");
})();
