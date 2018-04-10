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
import * as sinon from 'sinon';
import {ServiceObject, ExtendedRequestOptions} from '../src/service-object';
import * as SO from '../src/service-object';

const util = require('../src/util');

describe('ServiceObject', () => {

  let serviceObject: ServiceObject;
  let sandbox: sinon.SinonSandbox;

  const CONFIG = {
    baseUrl: 'base-url',
    parent: {},
    id: 'id',
    createMethod: util.noop,
  };

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    serviceObject = new ServiceObject(CONFIG);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('instantiation', () => {
    it('should promisify all the things', (done) => {
      serviceObject.request = (reqOpts, callback) => {
        callback(null, { statusCode: 123, body: 'sunny'});
      };
      (serviceObject as any).delete()
        .then(r => {
          assert.equal(r[0].body, 'sunny');
          assert.equal(r[0].statusCode, 123);
          done();
        })
    });

    it('should create an empty metadata object', () => {
      assert.deepEqual((serviceObject as any).metadata, {});
    });

    it('should localize the baseUrl', () => {
      assert.strictEqual((serviceObject as any).baseUrl, CONFIG.baseUrl);
    });

    it('should localize the parent instance', () => {
      assert.strictEqual((serviceObject as any).parent, CONFIG.parent);
    });

    it('should localize the ID', () => {
      assert.strictEqual((serviceObject as any).id, CONFIG.id);
    });

    it('should localize the createMethod', () => {
      assert.strictEqual((serviceObject as any).createMethod, CONFIG.createMethod);
    });

    it('should localize the methods', () => {
      const methods = {};
      const config = extend({}, CONFIG, { methods });
      const serviceObject = new ServiceObject(config);
      assert.strictEqual((serviceObject as any).methods, methods);
    });

    it('should default methods to an empty object', () => {
      assert.deepEqual((serviceObject as any).methods, {});
    });

    it('should clear out methods that are not asked for', () => {
      const config = extend({}, CONFIG, {
        methods: {
          create: true,
        },
      });

      const serviceObject = new ServiceObject(config);

      assert.strictEqual(typeof serviceObject.create, 'function');
      assert.strictEqual(serviceObject.delete, undefined);
    });

    it('should localize the Promise object', () => {
      const FakePromise = () => {};
      const config = extend({}, CONFIG, {
        parent: {
          Promise: FakePromise,
        },
      });

      const serviceObject = new ServiceObject(config);
      assert.strictEqual((serviceObject as any).Promise, FakePromise);
    });
  });

  describe('create', () => {
    it('should call createMethod', (done) => {
      const config = extend({}, CONFIG, {
        createMethod,
      });
      const options = {};

      function createMethod(id, options_, callback) {
        assert.strictEqual(id, config.id);
        assert.strictEqual(options_, options);
        callback(null, {}, {}); // calls done()
      }

      const serviceObject = new ServiceObject(config);
      serviceObject.create(options, done);
    });

    it('should not require options', (done) => {
      const config = extend({}, CONFIG, {
        createMethod,
      });

      function createMethod(id, options, callback) {
        assert.strictEqual(id, config.id);
        assert.strictEqual(typeof options, 'function');
        assert.strictEqual(callback, undefined);
        options(null, {}, {}); // calls done()
      }

      const serviceObject = new ServiceObject(config);
      serviceObject.create(done);
    });

    it('should pass error to callback', (done) => {
      const config = extend({}, CONFIG, {
        createMethod,
      });
      const options = {};

      const error = new Error('Error.');
      const apiResponse = {};

      function createMethod(id, options_, callback) {
        callback(error, null, apiResponse);
      }

      const serviceObject = new ServiceObject(config);
      serviceObject.create(options, function(err, instance, apiResponse_) {
        assert.strictEqual(err, error);
        assert.strictEqual(instance, null);
        assert.strictEqual(apiResponse_, apiResponse);
        done();
      });
    });

    it('should return instance and apiResponse to callback', (done) => {
      const config = extend({}, CONFIG, {
        createMethod,
      });
      const options = {};

      const apiResponse = {};

      function createMethod(id, options_, callback) {
        callback(null, {}, apiResponse);
      }

      const serviceObject = new ServiceObject(config);
      serviceObject.create(options, function(err, instance_, apiResponse_) {
        assert.ifError(err);
        assert.strictEqual(instance_, serviceObject);
        assert.strictEqual(apiResponse_, apiResponse);
        done();
      });
    });

    it('should assign metadata', (done) => {
      const config = extend({}, CONFIG, {
        createMethod,
      });
      const options = {};

      const instance = {
        metadata: {},
      };

      function createMethod(id, options_, callback) {
        callback(null, instance, {});
      }

      const serviceObject = new ServiceObject(config);
      serviceObject.create(options, function(err, instance_) {
        assert.ifError(err);
        assert.strictEqual(instance_.metadata, instance.metadata);
        done();
      });
    });

    it('should execute callback with any amount of arguments', (done) => {
      const config = extend({}, CONFIG, {
        createMethod,
      });
      const options = {};

      const args = ['a', 'b', 'c', 'd', 'e', 'f'];

      function createMethod(id, options_, callback) {
        callback.apply(null, args);
      }

      const serviceObject = new ServiceObject(config);
      serviceObject.create(options, (...args) => {
        assert.deepEqual([].slice.call(args), args);
        done();
      });
    });
  });

  describe('delete', () => {
    it('should make the correct request', (done) => {
      serviceObject.request = function(reqOpts) {
        assert.strictEqual(this, serviceObject);
        assert.strictEqual(reqOpts.method, 'DELETE');
        assert.strictEqual(reqOpts.uri, '');
        done();
      };
      serviceObject.delete(assert.ifError);
    });

    it('should extend the request options with defaults', (done) => {
      const method = {
        reqOpts: {
          method: 'override',
          qs: {
            custom: true,
          },
        },
      };

      sandbox.stub(ServiceObject.prototype, 'request').callsFake((reqOpts_) => {
        assert.strictEqual(reqOpts_.method, method.reqOpts.method);
        assert.deepEqual(reqOpts_.qs, method.reqOpts.qs);
        done();
      });

      const serviceObject = new ServiceObject(CONFIG);
      (serviceObject as any).methods.delete = method;
      serviceObject.delete();
    });

    it('should not require a callback', () => {
      serviceObject.request = (reqOpts, callback) => {
        callback();
      };
      assert.doesNotThrow(() => {
        serviceObject.delete();
      });
    });

    it('should execute callback with correct arguments', (done) => {
      const error = new Error('Error.');
      const apiResponse = {};

      sandbox.stub(ServiceObject.prototype, 'request').callsFake((reqOpts, callback) => {
        callback(error, apiResponse);
      });

      const serviceObject = new ServiceObject(CONFIG);
      serviceObject.delete((err, apiResponse_) => {
        assert.strictEqual(err, error);
        assert.strictEqual(apiResponse_, apiResponse);
        done();
      });
    });
  });

  describe('exists', () => {
    it('should call get', (done) => {
      serviceObject.get = () => {
        done();
      };

      serviceObject.exists(() => {});
    });

    it('should execute callback with false if 404', (done) => {
      serviceObject.get = function(callback) {
        callback({code: 404});
      };

      serviceObject.exists(function(err, exists) {
        assert.ifError(err);
        assert.strictEqual(exists, false);
        done();
      });
    });

    it('should execute callback with error if not 404', (done) => {
      const error = {code: 500};

      serviceObject.get = function(callback) {
        callback(error);
      };

      serviceObject.exists(function(err, exists) {
        assert.strictEqual(err, error);
        assert.strictEqual(exists, undefined);
        done();
      });
    });

    it('should execute callback with true if no error', (done) => {
      serviceObject.get = function(callback) {
        callback();
      };

      serviceObject.exists(function(err, exists) {
        assert.ifError(err);
        assert.strictEqual(exists, true);
        done();
      });
    });
  });

  describe('get', () => {
    it('should get the metadata', (done) => {
      serviceObject.getMetadata = () => {
        done();
      };

      serviceObject.get(assert.ifError);
    });

    it('handles not getting a config', (done) => {
      serviceObject.getMetadata = () => {
        done();
      };
      serviceObject.get(undefined as any, assert.ifError);
    });

    it('should execute callback with error & metadata', (done) => {
      const error = new Error('Error.');
      const metadata = {};

      serviceObject.getMetadata = function(callback) {
        callback(error, metadata);
      };

      serviceObject.get(function(err, instance, metadata_) {
        assert.strictEqual(err, error);
        assert.strictEqual(instance, null);
        assert.strictEqual(metadata_, metadata);

        done();
      });
    });

    it('should execute callback with instance & metadata', (done) => {
      const metadata = {};

      serviceObject.getMetadata = function(callback) {
        callback(null, metadata);
      };

      serviceObject.get(function(err, instance, metadata_) {
        assert.ifError(err);

        assert.strictEqual(instance, serviceObject);
        assert.strictEqual(metadata_, metadata);

        done();
      });
    });

    describe('autoCreate', () => {
      let AUTO_CREATE_CONFIG;

      const ERROR = {code: 404} as any;
      const METADATA = {};

      beforeEach(() => {
        AUTO_CREATE_CONFIG = {
          autoCreate: true,
        };

        serviceObject.getMetadata = function(callback) {
          callback(ERROR, METADATA);
        };
      });

      it('should not auto create if there is no create method', (done) => {
        serviceObject.create = undefined as any;

        serviceObject.get(AUTO_CREATE_CONFIG, function(err) {
          assert.strictEqual(err, ERROR);
          done();
        });
      });

      it('should pass config to create if it was provided', (done) => {
        const config = extend({}, AUTO_CREATE_CONFIG, {
          maxResults: 5,
        });

        serviceObject.create = function(config_) {
          assert.strictEqual(config_, config);
          done();
        };

        serviceObject.get(config, assert.ifError);
      });

      it('should pass only a callback to create if no config', (done) => {
        serviceObject.create = function(callback) {
          callback(); // done()
        };

        serviceObject.get(AUTO_CREATE_CONFIG, done);
      });

      describe('error', () => {
        it('should execute callback with error & API response', (done) => {
          const error = new Error('Error.');
          const apiResponse = {};

          serviceObject.create = function(callback) {
            serviceObject.get = function(config, callback) {
              assert.deepEqual(config, {});
              callback(); // done()
            } as any;

            callback(error, null, apiResponse);
          };

          serviceObject.get(AUTO_CREATE_CONFIG, function(err, instance, resp) {
            assert.strictEqual(err, error);
            assert.strictEqual(instance, null);
            assert.strictEqual(resp, apiResponse);
            done();
          });
        });

        it('should refresh the metadata after a 409', (done) => {
          const error = {
            code: 409,
          };

          serviceObject.create = function(callback) {
            serviceObject.get = function(config, callback) {
              assert.deepEqual(config, {});
              callback(); // done()
            } as any;

            callback(error);
          };

          serviceObject.get(AUTO_CREATE_CONFIG, done);
        });
      });
    });
  });

  describe('getMetadata', () => {
    it('should make the correct request', (done) => {
      serviceObject.request = function(reqOpts) {
        assert.strictEqual(this, serviceObject);
        assert.strictEqual(reqOpts.uri, '');
        done();
      };
      serviceObject.getMetadata(() => {});
    });

    it('should extend the request options with defaults', (done) => {
      const method = {
        reqOpts: {
          method: 'override',
          qs: {
            custom: true,
          },
        },
      };

      sandbox.stub(ServiceObject.prototype, 'request').callsFake((reqOpts_) => {
        assert.strictEqual(reqOpts_.method, method.reqOpts.method);
        assert.deepEqual(reqOpts_.qs, method.reqOpts.qs);
        done();
      });

      const serviceObject = new ServiceObject(CONFIG);
      (serviceObject as any).methods.getMetadata = method;
      serviceObject.getMetadata(() => {});
    });

    it('should execute callback with error & apiResponse', (done) => {
      const error = new Error('Error.');
      const apiResponse = {};

      sandbox.stub(ServiceObject.prototype, 'request').callsFake((reqOpts, callback) => {
        callback(error, apiResponse);
      });

      serviceObject.getMetadata(function(err, metadata, apiResponse_) {
        assert.strictEqual(err, error);
        assert.strictEqual(metadata, null);
        assert.strictEqual(apiResponse_, apiResponse);
        done();
      });
    });

    it('should update metadata', (done) => {
      const apiResponse = {};

      sandbox.stub(ServiceObject.prototype, 'request').callsFake((reqOpts, callback) => {
        callback(null, apiResponse);
      });

      serviceObject.getMetadata(function(err) {
        assert.ifError(err);
        assert.strictEqual((serviceObject as any).metadata, apiResponse);
        done();
      });
    });

    it('should execute callback with metadata & API response', (done) => {
      const apiResponse = {};

      sandbox.stub(ServiceObject.prototype, 'request').callsFake((reqOpts, callback) => {
        callback(null, apiResponse);
      });

      serviceObject.getMetadata(function(err, metadata, apiResponse_) {
        assert.ifError(err);
        assert.strictEqual(metadata, apiResponse);
        assert.strictEqual(apiResponse_, apiResponse);
        done();
      });
    });
  });

  describe('setMetadata', () => {
    it('should make the correct request', (done) => {
      const metadata = {};
      serviceObject.request = function(reqOpts) {
        assert.strictEqual(this, serviceObject);
        assert.strictEqual(reqOpts.method, 'PATCH');
        assert.strictEqual(reqOpts.uri, '');
        assert.strictEqual(reqOpts.json, metadata);
        done();
      };
      serviceObject.setMetadata(metadata);
    });

    it('should extend the request options with defaults', (done) => {
      const metadataDefault = {
        a: 'b',
      };

      const metadata = {
        c: 'd',
      };

      const method = {
        reqOpts: {
          method: 'override',
          qs: {
            custom: true,
          },
          json: metadataDefault,
        },
      };

      const expectedJson = extend(true, {}, metadataDefault, metadata);

      sandbox.stub(ServiceObject.prototype, 'request').callsFake((reqOpts_) => {
        assert.strictEqual(reqOpts_.method, method.reqOpts.method);
        assert.deepEqual(reqOpts_.qs, method.reqOpts.qs);
        assert.deepEqual(reqOpts_.json, expectedJson);
        done();
      });

      const serviceObject = new ServiceObject(CONFIG);
      (serviceObject as any).methods.setMetadata = method;
      serviceObject.setMetadata(metadata);
    });

    it('should execute callback with error & apiResponse', (done) => {
      const error = new Error('Error.');
      const apiResponse = {};

      sandbox.stub(ServiceObject.prototype, 'request').callsFake((reqOpts, callback) => {
        callback(error, apiResponse);
      });

      serviceObject.setMetadata({}, function(err, apiResponse_) {
        assert.strictEqual(err, error);
        assert.strictEqual(apiResponse_, apiResponse);
        done();
      });
    });

    it('should update metadata', (done) => {
      const apiResponse = {};

      sandbox.stub(ServiceObject.prototype, 'request').callsFake((reqOpts, callback) => {
        callback(null, apiResponse);
      });

      serviceObject.setMetadata({}, (err) => {
        assert.ifError(err);
        assert.strictEqual((serviceObject as any).metadata, apiResponse);
        done();
      });
    });

    it('should execute callback with metadata & API response', (done) => {
      const apiResponse = {};

      sandbox.stub(ServiceObject.prototype, 'request').callsFake((reqOpts, callback) =>{
        callback(null, apiResponse);
      });

      serviceObject.setMetadata({}, function(err, apiResponse_) {
        assert.ifError(err);
        assert.strictEqual(apiResponse_, apiResponse);
        done();
      });
    });
  });

  describe('request_', () => {
    let reqOpts;

    beforeEach(() => {
      reqOpts = {
        uri: 'uri',
      };
    });

    it('should compose the correct request', (done) => {
      const expectedUri = [
        (serviceObject as any).baseUrl,
        (serviceObject as any).id,
        reqOpts.uri,
      ].join('/');

      (serviceObject as any).parent.request = function(reqOpts_, callback) {
        assert.notStrictEqual(reqOpts_, reqOpts);
        assert.strictEqual(reqOpts_.uri, expectedUri);
        assert.deepEqual(reqOpts_.interceptors_, []);
        callback(); // done()
      };

      serviceObject.request_(reqOpts, done);
    });

    it('should not require a service object ID', (done) => {
      const expectedUri = [(serviceObject as any).baseUrl, reqOpts.uri].join('/');

      (serviceObject as any).parent.request = function(reqOpts) {
        assert.strictEqual(reqOpts.uri, expectedUri);
        done();
      };

      (serviceObject as any).id = undefined;

      serviceObject.request_(reqOpts, assert.ifError);
    });

    it('should support absolute uris', (done) => {
      const expectedUri = 'http://www.google.com';

      (serviceObject as any).parent.request = function(reqOpts) {
        assert.strictEqual(reqOpts.uri, expectedUri);
        done();
      };

      serviceObject.request_({uri: expectedUri}, assert.ifError);
    });

    it('should remove empty components', (done) => {
      const reqOpts = {
        uri: '',
      };

      const expectedUri = [
        (serviceObject as any).baseUrl,
        (serviceObject as any).id,
        // reqOpts.uri (reqOpts.uri is an empty string, so it should be removed)
      ].join('/');

      (serviceObject as any).parent.request = function(reqOpts_) {
        assert.strictEqual(reqOpts_.uri, expectedUri);
        done();
      };

      serviceObject.request_(reqOpts, assert.ifError);
    });

    it('should trim slashes', (done) => {
      const reqOpts = {
        uri: '//1/2//',
      };

      const expectedUri = [(serviceObject as any).baseUrl, (serviceObject as any).id, '1/2'].join(
        '/'
      );

      (serviceObject as any).parent.request = function(reqOpts_) {
        assert.strictEqual(reqOpts_.uri, expectedUri);
        done();
      };

      serviceObject.request_(reqOpts, assert.ifError);
    });

    it('should extend interceptors from child ServiceObjects', (done) => {
      const parent = new ServiceObject(CONFIG);
      (parent as any).interceptors.push({
        request(reqOpts) {
          reqOpts.parent = true;
          return reqOpts;
        },
      });

      const child = new ServiceObject(extend({}, CONFIG, {parent}));
      (child as any).interceptors.push({
        request(reqOpts) {
          reqOpts.child = true;
          return reqOpts;
        },
      });

      (parent as any).parent.request = function(reqOpts) {
        assert.deepEqual(reqOpts.interceptors_[0].request({}), {
          child: true,
        });

        assert.deepEqual(reqOpts.interceptors_[1].request({}), {
          parent: true,
        });

        done();
      };

      child.request_({uri: ''}, assert.ifError);
    });

    it('should pass a clone of the interceptors', (done) => {
      (serviceObject as any).interceptors.push({
        request(reqOpts) {
          reqOpts.one = true;
          return reqOpts;
        },
      });

      (serviceObject as any).parent.request = function(reqOpts) {
        const serviceObjectInterceptors = (serviceObject as any).interceptors;
        assert.deepEqual(reqOpts.interceptors_, serviceObjectInterceptors);
        assert.notStrictEqual(reqOpts.interceptors_, serviceObjectInterceptors);
        done();
      };

      serviceObject.request_({uri: ''}, assert.ifError);
    });

    it('should call the parent requestStream method', () => {
      const fakeObj = {};

      const expectedUri = [
        (serviceObject as any).baseUrl,
        (serviceObject as any).id,
        reqOpts.uri,
      ].join('/');

      (serviceObject as any).parent.requestStream = function(reqOpts_) {
        assert.notStrictEqual(reqOpts_, reqOpts);
        assert.strictEqual(reqOpts_.uri, expectedUri);
        assert.deepEqual(reqOpts_.interceptors_, []);
        return fakeObj;
      };

      const returnVal = serviceObject.request_(reqOpts);
      assert.strictEqual(returnVal, fakeObj);
    });
  });

  describe('request', () => {

    it('should call through to request_', (done) => {
      const fakeOptions = {} as ExtendedRequestOptions;
      serviceObject.request_ = (reqOpts, callback) => {
        assert.strictEqual(reqOpts, fakeOptions);
        done();
      };
      serviceObject.request(fakeOptions, util.noop);
    });
  });

  describe('requestStream', () => {

    it('should call through to request_', (done) => {
      const fakeOptions = {} as ExtendedRequestOptions;
      const serviceObject = new ServiceObject(CONFIG);
      serviceObject.request_ = (reqOpts) => {
        assert.strictEqual(reqOpts, fakeOptions);
        done();
      };
      serviceObject.requestStream(fakeOptions);
    });
  });
});
