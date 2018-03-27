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

const util = require('../src/util');

let promisified = false;
const fakeUtil = extend({}, util, {
  promisifyAll: function(Class) {
    if (Class.name === 'ServiceObject') {
      promisified = true;
    }
  },
});

describe('ServiceObject', function() {
  let ServiceObject;
  let serviceObject;
  let originalRequest;

  const CONFIG = {
    baseUrl: 'base-url',
    parent: {},
    id: 'id',
    createMethod: util.noop,
  };

  before(function() {
    ServiceObject = proxyquire('../src/service-object.js', {
      './util.js': fakeUtil,
    });

    originalRequest = ServiceObject.prototype.request;
  });

  beforeEach(function() {
    ServiceObject.prototype.request = originalRequest;
    serviceObject = new ServiceObject(CONFIG);
  });

  describe('instantiation', function() {
    it('should promisify all the things', function() {
      assert(promisified);
    });

    it('should create an empty metadata object', function() {
      assert.deepEqual(serviceObject.metadata, {});
    });

    it('should localize the baseUrl', function() {
      assert.strictEqual(serviceObject.baseUrl, CONFIG.baseUrl);
    });

    it('should localize the parent instance', function() {
      assert.strictEqual(serviceObject.parent, CONFIG.parent);
    });

    it('should localize the ID', function() {
      assert.strictEqual(serviceObject.id, CONFIG.id);
    });

    it('should localize the createMethod', function() {
      assert.strictEqual(serviceObject.createMethod, CONFIG.createMethod);
    });

    it('should localize the methods', function() {
      const methods = {};

      const config = extend({}, CONFIG, {
        methods: methods,
      });

      const serviceObject = new ServiceObject(config);

      assert.strictEqual(serviceObject.methods, methods);
    });

    it('should default methods to an empty object', function() {
      assert.deepEqual(serviceObject.methods, {});
    });

    it('should clear out methods that are not asked for', function() {
      const config = extend({}, CONFIG, {
        methods: {
          create: true,
        },
      });

      const serviceObject = new ServiceObject(config);

      assert.strictEqual(typeof serviceObject.create, 'function');
      assert.strictEqual(serviceObject.delete, undefined);
    });

    it('should localize the Promise object', function() {
      const FakePromise = function() {};
      const config = extend({}, CONFIG, {
        parent: {
          Promise: FakePromise,
        },
      });

      const serviceObject = new ServiceObject(config);

      assert.strictEqual(serviceObject.Promise, FakePromise);
    });
  });

  describe('create', function() {
    it('should call createMethod', function(done) {
      const config = extend({}, CONFIG, {
        createMethod: createMethod,
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

    it('should not require options', function(done) {
      const config = extend({}, CONFIG, {
        createMethod: createMethod,
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

    it('should pass error to callback', function(done) {
      const config = extend({}, CONFIG, {
        createMethod: createMethod,
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

    it('should return instance and apiResponse to callback', function(done) {
      const config = extend({}, CONFIG, {
        createMethod: createMethod,
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

    it('should assign metadata', function(done) {
      const config = extend({}, CONFIG, {
        createMethod: createMethod,
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

    it('should execute callback with any amount of arguments', function(done) {
      const config = extend({}, CONFIG, {
        createMethod: createMethod,
      });
      const options = {};

      const args = ['a', 'b', 'c', 'd', 'e', 'f'];

      function createMethod(id, options_, callback) {
        callback.apply(null, args);
      }

      const serviceObject = new ServiceObject(config);
      serviceObject.create(options, function() {
        assert.deepEqual([].slice.call(arguments), args);
        done();
      });
    });
  });

  describe('delete', function() {
    it('should make the correct request', function(done) {
      let serviceObject;

      ServiceObject.prototype.request = function(reqOpts) {
        assert.strictEqual(this, serviceObject);
        assert.strictEqual(reqOpts.method, 'DELETE');
        assert.strictEqual(reqOpts.uri, '');

        done();
      };

      serviceObject = new ServiceObject(CONFIG);
      serviceObject.delete(assert.ifError);
    });

    it('should extend the request options with defaults', function(done) {
      const method = {
        reqOpts: {
          method: 'override',
          qs: {
            custom: true,
          },
        },
      };

      ServiceObject.prototype.request = function(reqOpts_) {
        assert.strictEqual(reqOpts_.method, method.reqOpts.method);
        assert.deepEqual(reqOpts_.qs, method.reqOpts.qs);
        done();
      };

      const serviceObject = new ServiceObject(CONFIG);
      serviceObject.methods.delete = method;
      serviceObject.delete();
    });

    it('should not require a callback', function() {
      ServiceObject.prototype.request = function(reqOpts, callback) {
        callback();
      };

      assert.doesNotThrow(function() {
        serviceObject.delete();
      });
    });

    it('should execute callback with correct arguments', function(done) {
      const error = new Error('Error.');
      const apiResponse = {};

      ServiceObject.prototype.request = function(reqOpts, callback) {
        callback(error, apiResponse);
      };

      const serviceObject = new ServiceObject(CONFIG);
      serviceObject.delete(function(err, apiResponse_) {
        assert.strictEqual(err, error);
        assert.strictEqual(apiResponse_, apiResponse);
        done();
      });
    });
  });

  describe('exists', function() {
    it('should call get', function(done) {
      serviceObject.get = function() {
        done();
      };

      serviceObject.exists();
    });

    it('should execute callback with false if 404', function(done) {
      serviceObject.get = function(callback) {
        callback({code: 404});
      };

      serviceObject.exists(function(err, exists) {
        assert.ifError(err);
        assert.strictEqual(exists, false);
        done();
      });
    });

    it('should execute callback with error if not 404', function(done) {
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

    it('should execute callback with true if no error', function(done) {
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

  describe('get', function() {
    it('should get the metadata', function(done) {
      serviceObject.getMetadata = function() {
        done();
      };

      serviceObject.get(assert.ifError);
    });

    it('handles not getting a config', function(done) {
      serviceObject.getMetadata = function() {
        done();
      };
      serviceObject.get(undefined, assert.ifError);
    });

    it('should execute callback with error & metadata', function(done) {
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

    it('should execute callback with instance & metadata', function(done) {
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

    describe('autoCreate', function() {
      let AUTO_CREATE_CONFIG;

      const ERROR = {code: 404};
      const METADATA = {};

      beforeEach(function() {
        AUTO_CREATE_CONFIG = {
          autoCreate: true,
        };

        serviceObject.getMetadata = function(callback) {
          callback(ERROR, METADATA);
        };
      });

      it('should not auto create if there is no create method', function(done) {
        serviceObject.create = undefined;

        serviceObject.get(AUTO_CREATE_CONFIG, function(err) {
          assert.strictEqual(err, ERROR);
          done();
        });
      });

      it('should pass config to create if it was provided', function(done) {
        const config = extend({}, AUTO_CREATE_CONFIG, {
          maxResults: 5,
        });

        serviceObject.create = function(config_) {
          assert.strictEqual(config_, config);
          done();
        };

        serviceObject.get(config, assert.ifError);
      });

      it('should pass only a callback to create if no config', function(done) {
        serviceObject.create = function(callback) {
          callback(); // done()
        };

        serviceObject.get(AUTO_CREATE_CONFIG, done);
      });

      describe('error', function() {
        it('should execute callback with error & API response', function(done) {
          const error = new Error('Error.');
          const apiResponse = {};

          serviceObject.create = function(callback) {
            serviceObject.get = function(config, callback) {
              assert.deepEqual(config, {});
              callback(); // done()
            };

            callback(error, null, apiResponse);
          };

          serviceObject.get(AUTO_CREATE_CONFIG, function(err, instance, resp) {
            assert.strictEqual(err, error);
            assert.strictEqual(instance, null);
            assert.strictEqual(resp, apiResponse);
            done();
          });
        });

        it('should refresh the metadata after a 409', function(done) {
          const error = {
            code: 409,
          };

          serviceObject.create = function(callback) {
            serviceObject.get = function(config, callback) {
              assert.deepEqual(config, {});
              callback(); // done()
            };

            callback(error);
          };

          serviceObject.get(AUTO_CREATE_CONFIG, done);
        });
      });
    });
  });

  describe('getMetadata', function() {
    it('should make the correct request', function(done) {
      ServiceObject.prototype.request = function(reqOpts) {
        assert.strictEqual(this, serviceObject);
        assert.strictEqual(reqOpts.uri, '');
        done();
      };

      serviceObject.getMetadata();
    });

    it('should extend the request options with defaults', function(done) {
      const method = {
        reqOpts: {
          method: 'override',
          qs: {
            custom: true,
          },
        },
      };

      ServiceObject.prototype.request = function(reqOpts_) {
        assert.strictEqual(reqOpts_.method, method.reqOpts.method);
        assert.deepEqual(reqOpts_.qs, method.reqOpts.qs);
        done();
      };

      const serviceObject = new ServiceObject(CONFIG);
      serviceObject.methods.getMetadata = method;
      serviceObject.getMetadata();
    });

    it('should execute callback with error & apiResponse', function(done) {
      const error = new Error('Error.');
      const apiResponse = {};

      ServiceObject.prototype.request = function(reqOpts, callback) {
        callback(error, apiResponse);
      };

      serviceObject.getMetadata(function(err, metadata, apiResponse_) {
        assert.strictEqual(err, error);
        assert.strictEqual(metadata, null);
        assert.strictEqual(apiResponse_, apiResponse);
        done();
      });
    });

    it('should update metadata', function(done) {
      const apiResponse = {};

      ServiceObject.prototype.request = function(reqOpts, callback) {
        callback(null, apiResponse);
      };

      serviceObject.getMetadata(function(err) {
        assert.ifError(err);
        assert.strictEqual(serviceObject.metadata, apiResponse);
        done();
      });
    });

    it('should execute callback with metadata & API response', function(done) {
      const apiResponse = {};

      ServiceObject.prototype.request = function(reqOpts, callback) {
        callback(null, apiResponse);
      };

      serviceObject.getMetadata(function(err, metadata, apiResponse_) {
        assert.ifError(err);
        assert.strictEqual(metadata, apiResponse);
        assert.strictEqual(apiResponse_, apiResponse);
        done();
      });
    });
  });

  describe('setMetadata', function() {
    it('should make the correct request', function(done) {
      const metadata = {};

      ServiceObject.prototype.request = function(reqOpts) {
        assert.strictEqual(this, serviceObject);
        assert.strictEqual(reqOpts.method, 'PATCH');
        assert.strictEqual(reqOpts.uri, '');
        assert.strictEqual(reqOpts.json, metadata);
        done();
      };

      serviceObject.setMetadata(metadata);
    });

    it('should extend the request options with defaults', function(done) {
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

      ServiceObject.prototype.request = function(reqOpts_) {
        assert.strictEqual(reqOpts_.method, method.reqOpts.method);
        assert.deepEqual(reqOpts_.qs, method.reqOpts.qs);
        assert.deepEqual(reqOpts_.json, expectedJson);
        done();
      };

      const serviceObject = new ServiceObject(CONFIG);
      serviceObject.methods.setMetadata = method;
      serviceObject.setMetadata(metadata);
    });

    it('should execute callback with error & apiResponse', function(done) {
      const error = new Error('Error.');
      const apiResponse = {};

      ServiceObject.prototype.request = function(reqOpts, callback) {
        callback(error, apiResponse);
      };

      serviceObject.setMetadata({}, function(err, apiResponse_) {
        assert.strictEqual(err, error);
        assert.strictEqual(apiResponse_, apiResponse);
        done();
      });
    });

    it('should update metadata', function(done) {
      const apiResponse = {};

      ServiceObject.prototype.request = function(reqOpts, callback) {
        callback(null, apiResponse);
      };

      serviceObject.setMetadata({}, function(err) {
        assert.ifError(err);
        assert.strictEqual(serviceObject.metadata, apiResponse);
        done();
      });
    });

    it('should execute callback with metadata & API response', function(done) {
      const apiResponse = {};

      ServiceObject.prototype.request = function(reqOpts, callback) {
        callback(null, apiResponse);
      };

      serviceObject.setMetadata({}, function(err, apiResponse_) {
        assert.ifError(err);
        assert.strictEqual(apiResponse_, apiResponse);
        done();
      });
    });
  });

  describe('request_', function() {
    let reqOpts;

    beforeEach(function() {
      reqOpts = {
        uri: 'uri',
      };
    });

    it('should compose the correct request', function(done) {
      const expectedUri = [
        serviceObject.baseUrl,
        serviceObject.id,
        reqOpts.uri,
      ].join('/');

      serviceObject.parent.request = function(reqOpts_, callback) {
        assert.notStrictEqual(reqOpts_, reqOpts);
        assert.strictEqual(reqOpts_.uri, expectedUri);
        assert.deepEqual(reqOpts_.interceptors_, []);
        callback(); // done()
      };

      serviceObject.request_(reqOpts, done);
    });

    it('should not require a service object ID', function(done) {
      const expectedUri = [serviceObject.baseUrl, reqOpts.uri].join('/');

      serviceObject.parent.request = function(reqOpts) {
        assert.strictEqual(reqOpts.uri, expectedUri);
        done();
      };

      serviceObject.id = undefined;

      serviceObject.request_(reqOpts, assert.ifError);
    });

    it('should support absolute uris', function(done) {
      const expectedUri = 'http://www.google.com';

      serviceObject.parent.request = function(reqOpts) {
        assert.strictEqual(reqOpts.uri, expectedUri);
        done();
      };

      serviceObject.request_({uri: expectedUri}, assert.ifError);
    });

    it('should remove empty components', function(done) {
      const reqOpts = {
        uri: '',
      };

      const expectedUri = [
        serviceObject.baseUrl,
        serviceObject.id,
        // reqOpts.uri (reqOpts.uri is an empty string, so it should be removed)
      ].join('/');

      serviceObject.parent.request = function(reqOpts_) {
        assert.strictEqual(reqOpts_.uri, expectedUri);
        done();
      };

      serviceObject.request_(reqOpts, assert.ifError);
    });

    it('should trim slashes', function(done) {
      const reqOpts = {
        uri: '//1/2//',
      };

      const expectedUri = [serviceObject.baseUrl, serviceObject.id, '1/2'].join(
        '/'
      );

      serviceObject.parent.request = function(reqOpts_) {
        assert.strictEqual(reqOpts_.uri, expectedUri);
        done();
      };

      serviceObject.request_(reqOpts, assert.ifError);
    });

    it('should extend interceptors from child ServiceObjects', function(done) {
      const parent = new ServiceObject(CONFIG);
      parent.interceptors.push({
        request: function(reqOpts) {
          reqOpts.parent = true;
          return reqOpts;
        },
      });

      const child = new ServiceObject(extend({}, CONFIG, {parent: parent}));
      child.interceptors.push({
        request: function(reqOpts) {
          reqOpts.child = true;
          return reqOpts;
        },
      });

      parent.parent.request = function(reqOpts) {
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

    it('should pass a clone of the interceptors', function(done) {
      serviceObject.interceptors.push({
        request: function(reqOpts) {
          reqOpts.one = true;
          return reqOpts;
        },
      });

      serviceObject.parent.request = function(reqOpts) {
        const serviceObjectInterceptors = serviceObject.interceptors;
        assert.deepEqual(reqOpts.interceptors_, serviceObjectInterceptors);
        assert.notStrictEqual(reqOpts.interceptors_, serviceObjectInterceptors);
        done();
      };

      serviceObject.request_({uri: ''}, assert.ifError);
    });

    it('should call the parent requestStream method', function() {
      const fakeObj = {};

      const expectedUri = [
        serviceObject.baseUrl,
        serviceObject.id,
        reqOpts.uri,
      ].join('/');

      serviceObject.parent.requestStream = function(reqOpts_) {
        assert.notStrictEqual(reqOpts_, reqOpts);
        assert.strictEqual(reqOpts_.uri, expectedUri);
        assert.deepEqual(reqOpts_.interceptors_, []);
        return fakeObj;
      };

      const returnVal = serviceObject.request_(reqOpts);
      assert.strictEqual(returnVal, fakeObj);
    });
  });

  describe('request', function() {
    let request_;

    before(function() {
      request_ = ServiceObject.prototype.request_;
    });

    after(function() {
      ServiceObject.prototype.request_ = request_;
    });

    it('should call through to request_', function(done) {
      const fakeOptions = {};

      ServiceObject.prototype.request_ = function(reqOpts, callback) {
        assert.strictEqual(reqOpts, fakeOptions);
        callback();
      };

      serviceObject.request_ = function() {
        done(new Error('Should call to the prototype directly.'));
      };

      serviceObject.request(fakeOptions, done);
    });
  });

  describe('requestStream', function() {
    let request_;

    before(function() {
      request_ = ServiceObject.prototype.request_;
    });

    after(function() {
      ServiceObject.prototype.request_ = request_;
    });

    it('should call through to request_', function() {
      const fakeOptions = {};
      const fakeStream = {};

      ServiceObject.prototype.request_ = function(reqOpts) {
        assert.strictEqual(reqOpts, fakeOptions);
        return fakeStream;
      };

      serviceObject.request_ = function() {
        throw new Error('Should call to the prototype directly.');
      };

      const stream = serviceObject.requestStream(fakeOptions);
      assert.strictEqual(stream, fakeStream);
    });
  });
});
