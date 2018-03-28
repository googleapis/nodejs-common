/**
 * Copyright 2015 Google Inc. All Rights Reserved.
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
import * as extend from 'extend';
import * as proxyquire from 'proxyquire';
import * as stream from 'stream';
import * as through from 'through2';
import * as uuid from 'uuid';

let paginator = require('../src/paginator.js');
const util = extend({}, require('../src/util.js'));

let overrides: any = {};

function override(name, object) {
  const cachedObject = extend({}, object);
  overrides[name] = {};

  Object.keys(object).forEach((methodName) =>{
    if (typeof object[methodName] !== 'function') {
      return;
    }

    object[methodName] = function () {
      const args = arguments;

      if (overrides[name][methodName]) {
        return overrides[name][methodName].apply(this, args);
      }

      return cachedObject[methodName].apply(this, args);
    };
  });
}

function resetOverrides() {
  overrides = Object.keys(overrides).reduce(function(acc, name) {
    acc[name] = {};
    return acc;
  }, {});
}

describe('paginator', () => {
  const UUID = uuid.v1();

  function FakeClass() {}

  before(() => {
    override('util', util);
    paginator = proxyquire('../src/paginator.js', {
      './util.js': util,
    });
    override('paginator', paginator);
  });

  beforeEach(() => {
    FakeClass.prototype = {
      methodToExtend() {
        return UUID;
      },
    };
    resetOverrides();
  });

  after(() => {
    resetOverrides();
  });

  describe('extend', () => {
    it('should overwrite a method on a class', () => {
      const originalMethod = FakeClass.prototype.methodToExtend;
      paginator.extend(FakeClass, 'methodToExtend');
      const overwrittenMethod = FakeClass.prototype.methodToExtend;

      assert.notEqual(originalMethod, overwrittenMethod);
    });

    it('should store the original method as a private member', () => {
      const originalMethod = FakeClass.prototype.methodToExtend;
      paginator.extend(FakeClass, 'methodToExtend');

      assert.strictEqual(originalMethod, FakeClass.prototype.methodToExtend_);
    });

    it('should accept an array or string method names', () => {
      const originalMethod = FakeClass.prototype.methodToExtend;

      FakeClass.prototype.anotherMethodToExtend = () => {};
      const anotherMethod = FakeClass.prototype.anotherMethodToExtend;

      const methodsToExtend = ['methodToExtend', 'anotherMethodToExtend'];
      paginator.extend(FakeClass, methodsToExtend);

      assert.notEqual(originalMethod, FakeClass.prototype.methodToExtend);
      assert.notEqual(anotherMethod, FakeClass.prototype.anotherMethodToExtend);
    });

    it('should parse the arguments', (done) => {
      overrides.paginator.parseArguments_ = (args) => {
        assert.deepEqual([].slice.call(args), [1, 2, 3]);
        done();
      };

      overrides.paginator.run_ = util.noop;

      paginator.extend(FakeClass, 'methodToExtend');
      FakeClass.prototype.methodToExtend(1, 2, 3);
    });

    it('should call router when the original method is called', (done) => {
      const expectedReturnValue = FakeClass.prototype.methodToExtend();
      const parsedArguments = {a: 'b', c: 'd'};

      overrides.paginator.parseArguments_ = () => {
        return parsedArguments;
      };

      overrides.paginator.run_ = (args, originalMethod) => {
        assert.strictEqual(args, parsedArguments);
        assert.equal(originalMethod(), expectedReturnValue);
        done();
      };

      paginator.extend(FakeClass, 'methodToExtend');
      FakeClass.prototype.methodToExtend();
    });

    it('should maintain `this` context', (done) => {
      FakeClass.prototype.methodToExtend = function() {
        return this.uuid;
      };

      const cls = new FakeClass();
      cls.uuid = uuid.v1();

      overrides.paginator.run_ = (args, originalMethod) => {
        assert.equal(originalMethod(), cls.uuid);
        done();
      };

      paginator.extend(FakeClass, 'methodToExtend');
      cls.methodToExtend();
    });

    it('should return what the router returns', () => {
      const uniqueValue = 234;
      overrides.paginator.run_ = () => {
        return uniqueValue;
      };

      paginator.extend(FakeClass, 'methodToExtend');
      assert.equal(FakeClass.prototype.methodToExtend(), uniqueValue);
    });
  });

  describe('streamify', () => {
    beforeEach(() => {
      FakeClass.prototype.streamMethod = paginator.streamify('methodToExtend');
    });

    it('should return a function', () => {
      const fakeStreamMethod = FakeClass.prototype.streamMethod;
      assert.strictEqual(typeof fakeStreamMethod, 'function');
    });

    it('should parse the arguments', (done) => {
      const fakeArgs = [1, 2, 3];

      overrides.paginator.parseArguments_ = (args) => {
        assert.deepEqual(fakeArgs, [].slice.call(args));
        done();
      };

      overrides.paginator.runAsStream_ = util.noop;
      FakeClass.prototype.streamMethod.apply(FakeClass.prototype, fakeArgs);
    });

    it('should run the method as a stream', (done) => {
      const parsedArguments = {a: 'b', c: 'd'};

      overrides.paginator.parseArguments_ = () => {
        return parsedArguments;
      };

      overrides.paginator.runAsStream_ = (args, callback) => {
        assert.strictEqual(args, parsedArguments);
        assert.strictEqual(callback(), UUID);
        done();
      };

      FakeClass.prototype.streamMethod();
    });

    it('should apply the proper context', (done) => {
      const parsedArguments = {a: 'b', c: 'd'};

      FakeClass.prototype.methodToExtend = function() {
        return this;
      };

      overrides.paginator.parseArguments_ = () => {
        return parsedArguments;
      };

      overrides.paginator.runAsStream_ = (args, callback)  => {
        assert.strictEqual(callback(), FakeClass.prototype);
        done();
      };

      FakeClass.prototype.streamMethod();
    });

    it('should check for a private member', (done) => {
      const parsedArguments = {a: 'b', c: 'd'};
      const fakeValue = 123;

      FakeClass.prototype.methodToExtend_ = () => {
        return fakeValue;
      };

      overrides.paginator.parseArguments_ = () => {
        return parsedArguments;
      };

      overrides.paginator.runAsStream_ = function(args, callback) {
        assert.strictEqual(callback(), fakeValue);
        done();
      };

      FakeClass.prototype.streamMethod();
    });

    it('should return a stream', () => {
      const fakeStream = through.obj();

      overrides.paginator.parseArguments_ = util.noop;

      overrides.paginator.runAsStream_ = () => {
        return fakeStream;
      };

      const stream = FakeClass.prototype.streamMethod();

      assert.strictEqual(fakeStream, stream);
    });
  });

  describe('parseArguments_', () => {
    it('should set defaults', () => {
      const parsedArguments = paginator.parseArguments_([]);

      assert.strictEqual(Object.keys(parsedArguments.query).length, 0);
      assert.strictEqual(parsedArguments.autoPaginate, true);
      assert.strictEqual(parsedArguments.maxApiCalls, -1);
      assert.strictEqual(parsedArguments.maxResults, -1);
      assert.strictEqual(parsedArguments.callback, undefined);
    });

    it('should detect a callback if first argument is a function', () => {
      const args = [util.noop];
      const parsedArguments = paginator.parseArguments_(args);

      assert.strictEqual(parsedArguments.callback, args[0]);
    });

    it('should use any other first argument as query', () => {
      const args = ['string'];
      const parsedArguments = paginator.parseArguments_(args);

      assert.strictEqual(parsedArguments.query, args[0]);
    });

    it('should not make an undefined value the query', () => {
      const args = [undefined, util.noop];
      const parsedArguments = paginator.parseArguments_(args);

      assert.deepEqual(parsedArguments.query, {});
    });

    it('should detect a callback if last argument is a function', () => {
      const args = ['string', util.noop];
      const parsedArguments = paginator.parseArguments_(args);

      assert.strictEqual(parsedArguments.callback, args[1]);
    });

    it('should not assign a callback if a fn is not provided', () => {
      const args = ['string'];
      const parsedArguments = paginator.parseArguments_(args);

      assert.strictEqual(parsedArguments.callback, undefined);
    });

    it('should set maxApiCalls from query.maxApiCalls', () => {
      const args = [{maxApiCalls: 10}];
      const parsedArguments = paginator.parseArguments_(args);

      assert.strictEqual(parsedArguments.maxApiCalls, args[0].maxApiCalls);
      assert.strictEqual(parsedArguments.query.maxApiCalls, undefined);
    });

    it('should set maxResults from query.maxResults', () => {
      const args = [{maxResults: 10}];
      const parsedArguments = paginator.parseArguments_(args);

      assert.strictEqual(parsedArguments.maxResults, args[0].maxResults);
    });

    it('should set maxResults from query.pageSize', () => {
      const args = [{pageSize: 10}];
      const parsedArguments = paginator.parseArguments_(args);

      assert.strictEqual(parsedArguments.maxResults, args[0].pageSize);
    });

    it('should set autoPaginate: false if there is a maxResults', () => {
      const args = [{maxResults: 10}, util.noop];
      const parsedArguments = paginator.parseArguments_(args);

      assert.strictEqual(parsedArguments.autoPaginate, false);
    });

    it('should set autoPaginate: false query.autoPaginate', () => {
      const args = [{autoPaginate: false}, util.noop];
      const parsedArguments = paginator.parseArguments_(args);

      assert.strictEqual(parsedArguments.autoPaginate, false);
    });

    it('should parse streamOptions', () => {
      const args = [{maxResults: 10, highWaterMark: 8}];
      const parsedArguments = paginator.parseArguments_(args);

      assert.strictEqual(parsedArguments.maxResults, 10);
      assert.deepStrictEqual(parsedArguments.streamOptions, {
        highWaterMark: 8,
      });
    });
  });

  describe('run_', () => {
    beforeEach(() => {
      overrides.paginator.runAsStream_ = util.noop;
    });

    describe('autoPaginate', () => {
      it('should call runAsStream_ when autoPaginate:true', (done) => {
        const parsedArguments = {
          autoPaginate: true,
          callback: util.noop,
        };

        overrides.paginator.runAsStream_ = (args, originalMethod) => {
          assert.strictEqual(args, parsedArguments);
          originalMethod();
          return through();
        };

        paginator.run_(parsedArguments, done);
      });

      it('should execute callback on error', (done) => {
        const error = new Error('Error.');

        const parsedArguments = {
          autoPaginate: true,
          callback(err) {
            assert.strictEqual(err, error);
            done();
          },
        };

        overrides.paginator.runAsStream_ = () => {
          const stream = through();
          setImmediate(() => {
            stream.emit('error', error);
          });
          return stream;
        };

        paginator.run_(parsedArguments, util.noop);
      });

      it('should return all results on end', (done) => {
        const results = ['a', 'b', 'c'];

        const parsedArguments = {
          autoPaginate: true,
          callback(err, results_) {
            assert.deepEqual(results_.toString().split(''), results);
            done();
          },
        };

        overrides.paginator.runAsStream_ = () => {
          const stream = through();

          setImmediate(() => {
            results.forEach((result) => {
              stream.push(result);
            });

            stream.push(null);
          });

          return stream;
        };

        paginator.run_(parsedArguments, util.noop);
      });
    });

    describe('manual pagination', () => {
      it('should recoginze autoPaginate: false', (done) => {
        const parsedArguments = {
          autoPaginate: false,
          query: {
            a: 'b',
            c: 'd',
          },
          callback: done,
        };

        paginator.run_(parsedArguments, (query, callback) => {
          assert.deepEqual(query, parsedArguments.query);
          callback();
        });
      });
    });
  });

  describe('runAsStream_', () => {
    const PARSED_ARGUMENTS = {
      query: {
        a: 'b',
        c: 'd',
      },
    };

    beforeEach(() => {
      overrides.util.createLimiter = (makeRequest) => {
        const transformStream = new stream.Transform({objectMode: true});
        transformStream.destroy = through.obj().destroy.bind(transformStream);

        setImmediate(() => {
          transformStream.emit('reading');
        });

        return {
          makeRequest,
          stream: transformStream,
        };
      };
    });

    it('should call original method when stream opens', (done) => {
      function originalMethod(query) {
        assert.strictEqual(query, PARSED_ARGUMENTS.query);
        done();
      }

      paginator.runAsStream_(PARSED_ARGUMENTS, originalMethod);
    });

    it('should emit an error if one occurs', (done) => {
      const error = new Error('Error.');

      function originalMethod(query, callback) {
        setImmediate(() => {
          callback(error);
        });
      }

      const rs = paginator.runAsStream_(PARSED_ARGUMENTS, originalMethod);
      rs.on('error', (err) => {
        assert.deepEqual(err, error);
        done();
      });
    });

    it('should push results onto the stream', (done) => {
      const results = ['a', 'b', 'c'];
      const resultsReceived = [];

      function originalMethod(query, callback) {
        setImmediate(() => {
          callback(null, results);
        });
      }

      const rs = paginator.runAsStream_(PARSED_ARGUMENTS, originalMethod);
      rs.on('data', (result) => {
        (resultsReceived.push as any)(result);
      });
      rs.on('end', () => {
        assert.deepEqual(resultsReceived, ['a', 'b', 'c']);
        done();
      });
    });

    describe('maxApiCalls', () => {
      const maxApiCalls = 10;

      it('should create a limiter', (done) => {
        overrides.util.createLimiter = (makeRequest, options) => {
          assert.strictEqual(options.maxApiCalls, maxApiCalls);
          setImmediate(done);
          return {
            stream: through.obj(),
          };
        };
        paginator.runAsStream_({maxApiCalls}, util.noop);
      });
    });

    describe('streamOptions', () => {
      const streamOptions = {
        highWaterMark: 8,
      };

      it('should pass through stream options', (done) => {
        overrides.util.createLimiter = function(makeRequest, options) {
          assert.strictEqual(options.streamOptions, streamOptions);

          setImmediate(done);

          return {
            stream: through.obj(),
          };
        };

        paginator.runAsStream_(
          {
            maxApiCalls: 100,
            streamOptions,
          },
          util.noop
        );
      });
    });

    describe('limits', () => {
      const limit = 1;

      function originalMethod(query, callback) {
        setImmediate(() => {
          callback(null, [1, 2, 3]);
        });
      }

      it('should respect maxResults', (done) => {
        let numResultsReceived = 0;

        paginator
          .runAsStream_({maxResults: limit}, originalMethod)
          .on('data', () => {
            numResultsReceived++;
          })
          .on('end', () => {
            assert.strictEqual(numResultsReceived, limit);
            done();
          });
      });
    });

    it('should get more results if nextQuery exists', (done) => {
      const nextQuery = {a: 'b', c: 'd'};
      let nextQuerySent = false;

      function originalMethod(query, callback) {
        if (nextQuerySent) {
          assert.deepEqual(query, nextQuery);
          done();
          return;
        }

        setImmediate(() => {
          nextQuerySent = true;
          callback(null, [], nextQuery);
        });
      }

      paginator.runAsStream_(PARSED_ARGUMENTS, originalMethod);
    });

    it('should not push more results if stream ends early', (done) => {
      const results = ['a', 'b', 'c'];

      function originalMethod(query, callback) {
        setImmediate(() => {
          callback(null, results);
        });
      }

      const rs = paginator.runAsStream_(PARSED_ARGUMENTS, originalMethod);
      rs.on('data', function(result) {
        if (result === 'b') {
          // Pre-maturely end the stream.
          this.end();
        }

        assert.notEqual(result, 'c');
      });
      rs.on('end', () => {
        done();
      });
    });

    it('should not get more results if stream ends early', (done) => {
      const results = ['a', 'b', 'c'];

      let originalMethodCalledCount = 0;

      function originalMethod(query, callback) {
        originalMethodCalledCount++;

        setImmediate(() => {
          callback(null, results, {});
        });
      }

      const rs = paginator.runAsStream_(PARSED_ARGUMENTS, originalMethod);
      rs.on('data', function(result) {
        if (result === 'b') {
          // Pre-maturely end the stream.
          this.end();
        }
      });
      rs.on('end', () => {
        assert.equal(originalMethodCalledCount, 1);
        done();
      });
    });
  });
});
