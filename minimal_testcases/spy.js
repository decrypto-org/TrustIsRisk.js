const sinon = require("sinon");

class MyClass {
  constructor() {
  }

  func() {
    return;
  }
};

const obj = new MyClass();

sinon.spy(obj, "func");

obj.func()

console.log(obj.func.calledOnce)
