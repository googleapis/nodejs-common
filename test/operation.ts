/*!
 * Copyright 2016 Google Inc. All Rights Reserved.
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
import {EventEmitter} from 'events';
import * as sinon from 'sinon';
import {ServiceObject} from '../src/service-object';

const Operation = require('../src/operation');
const util = require('../src/util');

describe('Operation', () => {
  const FAKE_SERVICE = {};
  const OPERATION_ID = '/a/b/c/d';

  let operation;
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    operation = new Operation({
      parent: FAKE_SERVICE,
      id: OPERATION_ID,
    });
    operation.Promise = Promise;
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('instantiation', () => {
    it('should extend ServiceObject and EventEmitter', () => {
      const svcObj = ServiceObject;
      assert(operation instanceof Operation);
      assert(operation instanceof svcObj);
      assert(operation.on);
    });

    it('should pass ServiceObject the correct config', () => {
      assert.strictEqual(operation.baseUrl, '');
      assert.strictEqual(operation.parent, FAKE_SERVICE);
      assert.strictEqual(operation.id, OPERATION_ID);
      assert.deepEqual(operation.methods, {
        exists: true,
        get: true,
        getMetadata: {
          reqOpts: {
            name: OPERATION_ID,
          },
        },
      });
    });

    it('should allow overriding baseUrl', () => {
      const baseUrl = 'baseUrl';
      const operation = new Operation({baseUrl});
      assert.strictEqual(operation.baseUrl, baseUrl);
    });

    it('should localize listener variables', () => {
      assert.strictEqual(operation.completeListeners, 0);
      assert.strictEqual(operation.hasActiveListeners, false);
    });

    it('should call listenForEvents_', () => {
      let called = false;
      sandbox.stub(Operation.prototype, 'listenForEvents_').callsFake(() => {
        called = true;
      });
      new Operation(FAKE_SERVICE, OPERATION_ID);
      assert.strictEqual(called, true);
    });
  });

  describe('promise', () => {
    beforeEach(() => {
      operation.startPolling_ = util.noop;
    });

    it('should return an instance of the localized Promise', () => {
      const FakePromise = (operation.Promise = () => {});
      const promise = operation.promise();

      assert(promise instanceof FakePromise);
    });

    it('should reject the promise if an error occurs', () => {
      const error = new Error('err');

      setImmediate(() => {
        operation.emit('error', error);
      });

      return operation.promise()
        .then(() => {
          throw new Error('Promise should have been rejected.');
        }, (err) => {
          assert.strictEqual(err, error);
        });
    });

    it('should resolve the promise on complete', () => {
      const metadata = {};

      setImmediate(() => {
        operation.emit('complete', metadata);
      });

      return operation.promise().then(data => {
        assert.deepEqual(data, [metadata]);
      });
    });
  });

  describe('listenForEvents_', () => {
    beforeEach(() => {
      operation.startPolling_ = util.noop;
    });

    it('should start polling when complete listener is bound', (done) => {
      operation.startPolling_ = () => {
        done();
      };
      operation.on('complete', util.noop);
    });

    it('should track the number of listeners', () => {
      assert.strictEqual(operation.completeListeners, 0);

      operation.on('complete', util.noop);
      assert.strictEqual(operation.completeListeners, 1);

      operation.removeListener('complete', util.noop);
      assert.strictEqual(operation.completeListeners, 0);
    });

    it('should only run a single pulling loop', () => {
      let startPollingCallCount = 0;

      operation.startPolling_ = () => {
        startPollingCallCount++;
      };

      operation.on('complete', util.noop);
      operation.on('complete', util.noop);

      assert.strictEqual(startPollingCallCount, 1);
    });

    it('should close when no more message listeners are bound', () => {
      operation.on('complete', util.noop);
      operation.on('complete', util.noop);
      assert.strictEqual(operation.hasActiveListeners, true);

      operation.removeListener('complete', util.noop);
      assert.strictEqual(operation.hasActiveListeners, true);

      operation.removeListener('complete', util.noop);
      assert.strictEqual(operation.hasActiveListeners, false);
    });
  });

  describe('poll_', () => {
    it('should call getMetdata', (done) => {
      operation.getMetadata = () => {
        done();
      };

      operation.poll_(assert.ifError);
    });

    describe('could not get metadata', () => {
      it('should callback with an error', (done) => {
        const error = new Error('Error.');

        operation.getMetadata = (callback) => {
          callback(error);
        };

        operation.poll_((err) => {
          assert.strictEqual(err, error);
          done();
        });
      });

      it('should callback with the operation error', (done) => {
        const apiResponse = {
          error: {},
        };

        operation.getMetadata = (callback) => {
          callback(null, apiResponse, apiResponse);
        };

        operation.poll_((err) => {
          assert.strictEqual(err, apiResponse.error);
          done();
        });
      });
    });

    describe('operation incomplete', () => {
      const apiResponse = {done: false};

      beforeEach(() => {
        operation.getMetadata = (callback) => {
          callback(null, apiResponse);
        };
      });

      it('should callback with no arguments', (done) => {
        operation.poll_((err, resp) => {
          assert.strictEqual(err, undefined);
          assert.strictEqual(resp, undefined);
          done();
        });
      });
    });

    describe('operation complete', () => {
      const apiResponse = {done: true};

      beforeEach(() => {
        operation.getMetadata = (callback) => {
          callback(null, apiResponse);
        };
      });

      it('should emit complete with metadata', (done) => {
        operation.poll_((err, resp) => {
          assert.ifError(err);
          assert.strictEqual(resp, apiResponse);
          done();
        });
      });
    });
  });

  describe('startPolling_', () => {

    beforeEach(() => {
      sandbox.stub(Operation.prototype, 'listenForEvents_').callsFake(util.noop);
      operation.hasActiveListeners = true;
    });

    it('should not call getMetadata if no listeners', (done) => {
      operation.hasActiveListeners = false;
      operation.getMetadata = done; // if called, test will fail.
      operation.startPolling_();
      done();
    });

    it('should call getMetadata if listeners are registered', (done) => {
      operation.hasActiveListeners = true;
      operation.getMetadata = () => {
        done();
      };
      operation.startPolling_();
    });

    describe('API error', () => {
      const error = new Error('Error.');

      beforeEach(() => {
        operation.getMetadata = (callback) => {
          callback(error);
        };
      });

      it('should emit the error', (done) => {
        operation.on('error', (err) => {
          assert.strictEqual(err, error);
          done();
        });

        operation.startPolling_();
      });
    });

    describe('operation pending', () => {
      const apiResponse = {done: false};
      const setTimeoutCached = global.setTimeout;

      beforeEach(() => {
        operation.getMetadata = (callback) => {
          callback(null, apiResponse, apiResponse);
        };
      });

      after(() => {
        global.setTimeout = setTimeoutCached;
      });

      it('should call startPolling_ after 500 ms', (done) => {
        const startPolling_ = operation.startPolling_;
        let startPollingCalled = false;

        (global as any).setTimeout = (fn, timeoutMs) => {
          fn(); // should call startPolling_
          assert.strictEqual(timeoutMs, 500);
        };

        operation.startPolling_ = function() {
          if (!startPollingCalled) {
            // Call #1.
            startPollingCalled = true;
            startPolling_.apply(this, arguments);
            return;
          }

          // This is from the setTimeout call.
          assert.strictEqual(this, operation);
          done();
        };

        operation.startPolling_();
      });
    });

    describe('operation complete', () => {
      const apiResponse = {done: true};

      beforeEach(() => {
        operation.getMetadata = (callback) => {
          callback(null, apiResponse, apiResponse);
        };
      });

      it('should emit complete with metadata', (done) => {
        operation.on('complete', (metadata) => {
          assert.strictEqual(metadata, apiResponse);
          done();
        });

        operation.startPolling_();
      });
    });
  });
});
