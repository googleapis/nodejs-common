/**
 * Copyright 2014 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as assert from 'assert';
import * as sinon from 'sinon';

import * as util from '../src';

const noop = () => {};

let sandbox: sinon.SinonSandbox;
beforeEach(() => {
  sandbox = sinon.createSandbox();
});
afterEach(() => {
  sandbox.restore();
});
describe('promisifyAll', () => {
  const fakeArgs = [null, 1, 2, 3];
  const fakeError = new Error('err.');

  // tslint:disable-next-line
  let FakeClass: any;

  beforeEach(() => {
    FakeClass = () => {};

    FakeClass.prototype.methodName = (callback: Function) => {
      callback.apply(null, fakeArgs);
    };

    FakeClass.prototype.methodSingle = (callback: Function) => {
      callback(null, fakeArgs[1]);
    };

    FakeClass.prototype.methodError = (callback: Function) => {
      callback(fakeError);
    };

    FakeClass.prototype.method_ = noop;
    FakeClass.prototype._method = noop;
    FakeClass.prototype.methodStream = noop;
    FakeClass.prototype.promise = noop;

    util.promisifyAll(FakeClass);
    const fc = new FakeClass();
  });

  it('should promisify the correct method', () => {
    assert(FakeClass.prototype.methodName.promisified_);
    assert(FakeClass.prototype.methodSingle.promisified_);
    assert(FakeClass.prototype.methodError.promisified_);

    assert.strictEqual(FakeClass.prototype.method_, noop);
    assert.strictEqual(FakeClass.prototype._method, noop);
    assert.strictEqual(FakeClass.prototype.methodStream, noop);
    assert.strictEqual(FakeClass.prototype.promise, noop);
  });

  // The ts compiler will convert a class to the current node version target,
  // in this case v4, which means that using the class keyword to create a
  // class won't actually test that this method works on ES classes. Using
  // eval works around that compilation. The class syntax is a syntax error
  // in node v4 which is why the eval call is wrapped in a try catch block.
  try {
    eval(`
      const assert2 = require('assert');
      const util = require('../src');
      it('should work on ES classes', () => {
        class MyESClass {
          myMethod(str, callback) {
            callback(str.toUpperCase());
          }
        }
        util.promisifyAll(MyESClass);
        assert2(MyESClass.prototype.myMethod.promisified_);
      });
    `);
  } catch (error) {
    it.skip('should work on ES classes');
  }

  it('should optionally accept an exclude list', () => {
    function FakeClass2() {}
    FakeClass2.prototype.methodSync = noop;
    FakeClass2.prototype.method = () => {};
    util.promisifyAll(FakeClass2, {
      exclude: ['methodSync'],
    });
    assert.strictEqual(FakeClass2.prototype.methodSync, noop);
    assert(FakeClass2.prototype.method.promisified_);
  });

  it('should pass the options object to promisify', (done) => {
    const fakeOptions = {
      a: 'a',
    } as util.PromisifyAllOptions;

    const stub =
        sandbox.stub(util, 'promisify').callsFake((method, options) => {
          assert.strictEqual(method, FakeClass2.prototype.method);
          assert.strictEqual(options, fakeOptions);
          done();
          stub.restore();
        });

    function FakeClass2() {}
    FakeClass2.prototype.method = () => {};
    util.promisifyAll(FakeClass2, fakeOptions);
  });

  it('should not re-promisify methods', () => {
    const method = FakeClass.prototype.methodName;
    util.promisifyAll(FakeClass);
    assert.strictEqual(FakeClass.prototype.methodName, method);
  });
});

describe('promisify', () => {
  const fakeContext = {};
  let func: Function;
  // tslint:disable-next-line:no-any
  let fakeArgs: any[];

  beforeEach(() => {
    fakeArgs = [null, 1, 2, 3];

    func = util.promisify(function(this: {}, callback: () => void) {
      callback.apply(this, fakeArgs);
    });
  });

  it('should not re-promisify the function', () => {
    const original = func;
    func = util.promisify(func);
    assert.strictEqual(original, func);
  });

  it('should not return a promise in callback mode', (done) => {
    let returnVal: {};
    returnVal = func.call(fakeContext, function(this: {}) {
      const args = [].slice.call(arguments);
      assert.deepEqual(args, fakeArgs);
      assert.strictEqual(this, fakeContext);
      assert(!returnVal);
      done();
    });
  });

  it('should return a promise when the callback is omitted', () => {
    return func().then((args: Array<{}>) => {
      assert.deepEqual(args, fakeArgs.slice(1));
    });
  });

  it('should reject the promise on a failed request', () => {
    const error = new Error('err');
    fakeArgs = [error];
    return func().then(
        () => {
          throw new Error('Should have gone to failure block');
        },
        (err: Error) => {
          assert.strictEqual(err, error);
        });
  });

  it('should allow the Promise object to be overridden', () => {
    // tslint:disable-next-line:variable-name
    const FakePromise = () => {};
    const promise = func.call({Promise: FakePromise});
    assert(promise instanceof FakePromise);
  });

  it('should resolve singular arguments', () => {
    const fakeArg = 'hi';

    func = util.promisify((callback: () => void) => {
      callback.apply(func, [null, fakeArg]);
    }, {
      singular: true,
    });

    return func().then((arg: {}) => {
      assert.strictEqual(arg, fakeArg);
    });
  });

  it('should ignore singular when multiple args are present', () => {
    // tslint:disable-next-line:no-any
    const fakeArgs: any[] = ['a', 'b'];

    func = util.promisify((callback: Function) => {
      callback.apply(func, [null].concat(fakeArgs));
    }, {
      singular: true,
    });

    return func().then((args: Array<{}>) => {
      assert.deepEqual(args, fakeArgs);
    });
  });

  describe('trailing undefined arguments', () => {
    it('should not return a promise in callback mode', () => {
      const func = util.promisify((optional: Function) => {
        assert.equal(typeof optional, 'function');
        optional(null);
      });

      const returnVal = func(() => {});
      assert.equal(returnVal, undefined);
    });

    it('should return a promise when callback omitted', (done) => {
      const func = util.promisify((optional: Function, ...args: Array<{}>) => {
        assert.strictEqual(args.length, 0);
        assert.equal(typeof optional, 'function');
        optional(null);
      });

      func(undefined, undefined).then(() => {
        done();
      });
    });

    it('should not mistake non-function args for callbacks', (done) => {
      const func =
          util.promisify((foo: {}, optional: Function, ...args: Array<{}>) => {
            assert.strictEqual(args.length, 0);
            assert.equal(typeof optional, 'function');
            optional(null);
          });

      func('foo').then(() => {
        done();
      });
    });
  });
});
