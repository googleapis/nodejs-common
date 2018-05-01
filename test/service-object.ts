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
import * as r from 'request';
import * as sinon from 'sinon';

import {Service} from '../src';
import * as SO from '../src/service-object';
import {ServiceObject} from '../src/service-object';
import {ApiError, DecorateRequestOptions, util} from '../src/util';

describe('ServiceObject', () => {
  let serviceObject: ServiceObject;
  // tslint:disable-next-line:no-any
  type FakeServiceObject = any;
  let sandbox: sinon.SinonSandbox;

  // This is a simple any cast to allow checking the values of private
  // variables.  Tests should be refactored so this isn't needed.
  function pSvc(): FakeServiceObject {
    return serviceObject;
  }

  const CONFIG = {
    baseUrl: 'base-url',
    parent: {} as Service,
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
      // tslint:disable-next-line:no-any
      serviceObject.request = async (reqOpts: any) => {
        return {statusCode: 123, body: 'sunny'} as r.Response;
      };

      // tslint:disable-next-line:no-any
      (serviceObject.delete() as any)
          // tslint:disable-next-line:no-any
          .then((r: any) => {
            assert.equal(r[0].body, 'sunny');
            assert.equal(r[0].statusCode, 123);
            done();
          });
    });

    it('should create an empty metadata object', () => {
      assert.deepEqual(pSvc().metadata, {});
    });

    it('should localize the baseUrl', () => {
      assert.strictEqual(serviceObject.baseUrl, CONFIG.baseUrl);
    });

    it('should localize the parent instance', () => {
      assert.strictEqual(pSvc().parent, CONFIG.parent);
    });

    it('should localize the ID', () => {
      assert.strictEqual(pSvc().id, CONFIG.id);
    });

    it('should localize the createMethod', () => {
      assert.strictEqual(pSvc().createMethod, CONFIG.createMethod);
    });

    it('should localize the methods', () => {
      const methods = {};
      const config = extend({}, CONFIG, {methods});
      const serviceObject = new ServiceObject(config);
      assert.deepStrictEqual(pSvc().methods, methods);
    });

    it('should default methods to an empty object', () => {
      assert.deepEqual(pSvc().methods, {});
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
      // tslint:disable-next-line:variable-name
      const FakePromise = () => {};
      const config = extend({}, CONFIG, {
        parent: {
          Promise: FakePromise,
        },
      });
      const serviceObject = new ServiceObject(config) as FakeServiceObject;
      assert.strictEqual(serviceObject.Promise, FakePromise);
    });
  });

  describe('create', () => {
    it('should call createMethod', (done) => {
      const config = extend({}, CONFIG, {
        createMethod,
      });
      const options = {};

      function createMethod(
          id: string, options_: {},
          callback: (err: Error|null, a: {}, b: {}) => void) {
        assert.strictEqual(id, config.id);
        assert.strictEqual(options_, options);
        callback(null, {}, {});  // calls done()
      }

      const serviceObject = new ServiceObject(config);
      serviceObject.create(options, done);
    });

    it('should not require options', (done) => {
      const config = extend({}, CONFIG, {
        createMethod,
      });

      function createMethod(id: string, options: Function, callback: Function) {
        assert.strictEqual(id, config.id);
        assert.strictEqual(typeof options, 'function');
        assert.strictEqual(callback, undefined);
        options(null, {}, {});  // calls done()
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

      function createMethod(id: string, options_: {}, callback: Function) {
        callback(error, null, apiResponse);
      }

      const serviceObject = new ServiceObject(config);
      serviceObject.create(options, (err, instance, apiResponse_) => {
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

      function createMethod(id: string, options_: {}, callback: Function) {
        callback(null, {}, apiResponse);
      }

      const serviceObject = new ServiceObject(config);
      serviceObject.create(options, (err, instance_, apiResponse_) => {
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

      function createMethod(id: string, options_: {}, callback: Function) {
        callback(null, instance, {});
      }

      const serviceObject = new ServiceObject(config);
      serviceObject.create(options, (err, instance_) => {
        assert.ifError(err);
        assert.strictEqual(instance_!.metadata, instance.metadata);
        done();
      });
    });

    it('should execute callback with any amount of arguments', (done) => {
      const config = extend({}, CONFIG, {
        createMethod,
      });
      const options = {};

      const args = ['a', 'b', 'c', 'd', 'e', 'f'];

      function createMethod(id: string, options_: {}, callback: Function) {
        callback.apply(null, args);
      }

      const serviceObject = new ServiceObject(config);
      // tslint:disable-next-line:no-any
      serviceObject.create(options, (...args: any[]) => {
        assert.deepEqual([].slice.call(args), args);
        done();
      });
    });
  });

  describe('delete', () => {
    it('should make the correct request', (done) => {
      // tslint:disable-next-line:no-any
      serviceObject.request = async function(reqOpts: any) {
        assert.strictEqual(this, serviceObject);
        assert.strictEqual(reqOpts.method, 'DELETE');
        assert.strictEqual(reqOpts.uri, '');
        done();
        return {} as r.Response;
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

      sandbox.stub(ServiceObject.prototype, 'request')
          .callsFake(async (reqOpts_) => {
            assert.strictEqual(reqOpts_.method, method.reqOpts.method);
            assert.deepEqual(reqOpts_.qs, method.reqOpts.qs);
            done();
          });

      const serviceObject = new ServiceObject(CONFIG) as FakeServiceObject;
      serviceObject.methods.delete = method;
      serviceObject.delete();
    });

    it('should not require a callback', () => {
      // tslint:disable-next-line:no-any
      serviceObject.request = async (reqOpts: any) => {
        return {} as r.Response;
      };
      assert.doesNotThrow(() => {
        serviceObject.delete();
      });
    });

    it('should execute callback with correct arguments', (done) => {
      const error = new Error('🦃');

      sandbox.stub(ServiceObject.prototype, 'request')
          .callsFake(async (reqOpts) => {
            throw error;
          });

      const serviceObject = new ServiceObject(CONFIG);
      serviceObject.delete((err, apiResponse_) => {
        assert.strictEqual(err, error);
        assert.strictEqual(apiResponse_, undefined);
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
      const error = new ApiError('');
      error.code = 404;
      serviceObject.get =
          (configOrCallback: SO.GetConfig|SO.InstanceResponseCallback,
           callback?: SO.InstanceResponseCallback) => {
            callback = typeof configOrCallback === 'function' ?
                configOrCallback :
                callback;
            callback!(error);
          };

      serviceObject.exists((err, exists) => {
        assert.ifError(err);
        assert.strictEqual(exists, false);
        done();
      });
    });

    it('should execute callback with error if not 404', (done) => {
      const error = new ApiError('');
      error.code = 500;

      serviceObject.get =
          (configOrCallback: SO.GetConfig|SO.InstanceResponseCallback,
           callback?: SO.InstanceResponseCallback) => {
            callback = typeof configOrCallback === 'function' ?
                configOrCallback :
                callback;
            callback!(error);
          };

      serviceObject.exists((err, exists) => {
        assert.strictEqual(err, error);
        assert.strictEqual(exists, undefined);
        done();
      });
    });

    it('should execute callback with true if no error', (done) => {
      serviceObject.get =
          (configOrCallback: SO.GetConfig|SO.InstanceResponseCallback,
           callback?: SO.InstanceResponseCallback) => {
            callback = typeof configOrCallback === 'function' ?
                configOrCallback :
                callback;
            callback!(null);
          };

      serviceObject.exists((err, exists) => {
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
      (serviceObject as FakeServiceObject).get(undefined, assert.ifError);
    });

    it('should execute callback with error & metadata', (done) => {
      const error = new Error('Error.');
      const metadata = {} as SO.Metadata;

      serviceObject.getMetadata = (callback) => {
        callback(error, metadata);
      };

      serviceObject.get((err, instance, metadata_) => {
        assert.strictEqual(err, error);
        assert.strictEqual(instance, null);
        assert.strictEqual(metadata_, metadata);

        done();
      });
    });

    it('should execute callback with instance & metadata', (done) => {
      const metadata = {} as SO.Metadata;

      serviceObject.getMetadata = (callback) => {
        callback(null, metadata);
      };

      serviceObject.get((err, instance, metadata_) => {
        assert.ifError(err);

        assert.strictEqual(instance, serviceObject);
        assert.strictEqual(metadata_, metadata);

        done();
      });
    });

    describe('autoCreate', () => {
      let AUTO_CREATE_CONFIG: {};

      const ERROR = new ApiError('bad');
      ERROR.code = 404;
      const METADATA = {} as SO.Metadata;

      beforeEach(() => {
        AUTO_CREATE_CONFIG = {
          autoCreate: true,
        };

        serviceObject.getMetadata = (callback) => {
          callback(ERROR, METADATA);
        };
      });

      it('should not auto create if there is no create method', (done) => {
        (serviceObject as FakeServiceObject).create = undefined;

        serviceObject.get(AUTO_CREATE_CONFIG, (err) => {
          assert.strictEqual(err, ERROR);
          done();
        });
      });

      it('should pass config to create if it was provided', (done) => {
        const config = extend({}, AUTO_CREATE_CONFIG, {
                         maxResults: 5,
                       }) as SO.GetConfig;

        serviceObject.create = (config_: SO.InstanceResponseCallback) => {
          assert.strictEqual(config_, config);
          done();
        };

        serviceObject.get(config, assert.ifError);
      });

      it('should pass only a callback to create if no config', (done) => {
        serviceObject.create = (callback: SO.InstanceResponseCallback) => {
          callback(null);  // done()
        };
        serviceObject.get(AUTO_CREATE_CONFIG, done);
      });

      describe('error', () => {
        it('should execute callback with error & API response', (done) => {
          const error = new Error('Error.');
          const apiResponse = {} as r.Response;

          serviceObject.create =
              (optionsOrCallback?: SO.CreateOptions|SO.InstanceResponseCallback,
               callback?: SO.InstanceResponseCallback) => {
                callback = typeof optionsOrCallback === 'function' ?
                    optionsOrCallback :
                    callback;
                serviceObject.get =
                    (configOrCallback: SO.GetConfig|SO.InstanceResponseCallback,
                     callback?: SO.InstanceResponseCallback) => {
                      const config = configOrCallback as SO.GetConfig;
                      assert.deepEqual(config, {});
                      callback!(null);  // done()
                    };
                callback!(error, null, apiResponse);
              };

          serviceObject.get(AUTO_CREATE_CONFIG, (err, instance, resp) => {
            assert.strictEqual(err, error);
            assert.strictEqual(instance, null);
            assert.strictEqual(resp, apiResponse);
            done();
          });
        });

        it('should refresh the metadata after a 409', (done) => {
          const error = new ApiError('errrr');
          error.code = 409;
          serviceObject.create = (callback: SO.InstanceResponseCallback) => {
            serviceObject.get =
                (configOrCallback: SO.GetConfig|SO.InstanceResponseCallback,
                 callback?: SO.InstanceResponseCallback) => {
                  const config = typeof configOrCallback === 'object' ?
                      configOrCallback :
                      {};
                  callback = typeof configOrCallback === 'function' ?
                      configOrCallback :
                      callback;
                  assert.deepEqual(config, {});
                  callback!(null, null, {} as r.Response);  // done()
                };
            callback(error, null, undefined);
          };
          serviceObject.get(AUTO_CREATE_CONFIG, done);
        });
      });
    });
  });

  describe('getMetadata', () => {
    it('should make the correct request', (done) => {
      // tslint:disable-next-line:no-any
      serviceObject.request = async function(reqOpts: any) {
        assert.strictEqual(this, serviceObject);
        assert.strictEqual(reqOpts.uri, '');
        done();
        return {} as r.Response;
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

      sandbox.stub(ServiceObject.prototype, 'request')
          .callsFake(async (reqOpts_) => {
            assert.strictEqual(reqOpts_.method, method.reqOpts.method);
            assert.deepEqual(reqOpts_.qs, method.reqOpts.qs);
            done();
          });

      const serviceObject = new ServiceObject(CONFIG) as FakeServiceObject;
      serviceObject.methods.getMetadata = method;
      serviceObject.getMetadata(() => {});
    });

    it('should execute callback with error & apiResponse', (done) => {
      const error = new Error('ಠ_ಠ');

      sandbox.stub(ServiceObject.prototype, 'request')
          .callsFake(async (reqOpts) => {
            throw error;
          });

      serviceObject.getMetadata((err, metadata, apiResponse_) => {
        assert.strictEqual(err, error);
        assert.strictEqual(metadata, undefined);
        assert.strictEqual(apiResponse_, undefined);
        done();
      });
    });

    it('should update metadata', (done) => {
      const apiResponse = {};

      sandbox.stub(ServiceObject.prototype, 'request')
          .callsFake(async (reqOpts) => {
            return apiResponse;
          });

      serviceObject.getMetadata((err) => {
        assert.ifError(err);
        assert.strictEqual(pSvc().metadata, apiResponse);
        done();
      });
    });

    it('should execute callback with metadata & API response', (done) => {
      const apiResponse = {};

      sandbox.stub(ServiceObject.prototype, 'request')
          .callsFake(async (reqOpts) => {
            return apiResponse;
          });

      serviceObject.getMetadata((err, metadata, apiResponse_) => {
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
      // tslint:disable-next-line:no-any
      serviceObject.request = async function(reqOpts: any) {
        assert.strictEqual(this, serviceObject);
        assert.strictEqual(reqOpts.method, 'PATCH');
        assert.strictEqual(reqOpts.uri, '');
        assert.strictEqual(reqOpts.json, metadata);
        done();
        return {} as r.Response;
      };
      serviceObject.setMetadata(metadata);
    });

    it('should extend the request options with defaults', (done) => {
      const metadataDefault = {a: 'b'};
      const metadata = {c: 'd'};

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

      sandbox.stub(ServiceObject.prototype, 'request')
          .callsFake(async (reqOpts_) => {
            assert.deepStrictEqual(reqOpts_.method, method.reqOpts.method);
            assert.deepStrictEqual(reqOpts_.qs, method.reqOpts.qs);
            assert.deepStrictEqual(reqOpts_.json, expectedJson);
            done();
          });

      const serviceObject = new ServiceObject(CONFIG) as FakeServiceObject;
      serviceObject.methods.setMetadata = method;
      serviceObject.setMetadata(metadata);
    });

    it('should execute callback with error & apiResponse', (done) => {
      const error = new Error('Error.');

      sandbox.stub(ServiceObject.prototype, 'request')
          .callsFake(async (reqOpts) => {
            throw error;
          });

      serviceObject.setMetadata({}, (err, apiResponse_) => {
        assert.strictEqual(err, error);
        assert.strictEqual(apiResponse_, undefined);
        done();
      });
    });

    it('should update metadata', (done) => {
      const apiResponse = {};

      sandbox.stub(ServiceObject.prototype, 'request')
          .callsFake(async (reqOpts) => {
            return apiResponse;
          });

      serviceObject.setMetadata({}, (err) => {
        assert.ifError(err);
        assert.strictEqual(pSvc().metadata, apiResponse);
        done();
      });
    });

    it('should execute callback with metadata & API response', (done) => {
      const apiResponse = {};

      sandbox.stub(ServiceObject.prototype, 'request')
          .callsFake(async (reqOpts) => {
            return apiResponse;
          });

      serviceObject.setMetadata({}, (err, apiResponse_) => {
        assert.ifError(err);
        assert.strictEqual(apiResponse_, apiResponse);
        done();
      });
    });
  });

  describe('request_', () => {
    let reqOpts: DecorateRequestOptions;

    beforeEach(() => {
      reqOpts = {
        uri: 'uri',
      };
    });

    it('should compose the correct request', async () => {
      const expectedUri = [
        serviceObject.baseUrl,
        pSvc().id,
        reqOpts.uri,
      ].join('/');

      pSvc().parent.request = async (reqOpts_: DecorateRequestOptions) => {
        assert.notStrictEqual(reqOpts_, reqOpts);
        assert.strictEqual(reqOpts_.uri, expectedUri);
        assert.deepEqual(reqOpts_.interceptors_, []);
        return {} as r.Response;
      };

      await serviceObject.request_(reqOpts);
    });

    it('should not require a service object ID', async () => {
      const expectedUri = [serviceObject.baseUrl, reqOpts.uri].join('/');
      pSvc().parent.request = async (reqOpts: DecorateRequestOptions) => {
        assert.strictEqual(reqOpts.uri, expectedUri);
        return {} as r.Response;
      };
      pSvc().id = undefined;
      await serviceObject.request_(reqOpts);
    });

    it('should support absolute uris', async () => {
      const expectedUri = 'http://www.google.com';
      pSvc().parent.request = async (reqOpts: DecorateRequestOptions) => {
        assert.strictEqual(reqOpts.uri, expectedUri);
        return {} as r.Response;
      };
      await serviceObject.request_({uri: expectedUri});
    });

    it('should remove empty components', async () => {
      const reqOpts = {
        uri: '',
      };

      const expectedUri = [
        serviceObject.baseUrl, pSvc().id,
        // reqOpts.uri (reqOpts.uri is an empty string, so it should be removed)
      ].join('/');

      pSvc().parent.request = async (reqOpts_: DecorateRequestOptions) => {
        assert.strictEqual(reqOpts_.uri, expectedUri);
        return {} as r.Response;
      };

      await serviceObject.request_(reqOpts);
    });

    it('should trim slashes', async () => {
      const reqOpts = {
        uri: '//1/2//',
      };

      const expectedUri = [serviceObject.baseUrl, pSvc().id, '1/2'].join('/');

      pSvc().parent.request = async (reqOpts_: DecorateRequestOptions) => {
        assert.strictEqual(reqOpts_.uri, expectedUri);
        return {} as r.Response;
      };

      await serviceObject.request_(reqOpts);
    });

    it('should extend interceptors from child ServiceObjects', async () => {
      const parent = new ServiceObject(CONFIG) as FakeServiceObject;
      parent.interceptors.push({
        request(reqOpts: DecorateRequestOptions) {
          // tslint:disable-next-line:no-any
          (reqOpts as any).parent = true;
          return reqOpts;
        },
      });

      const child =
          new ServiceObject(extend({}, CONFIG, {parent})) as FakeServiceObject;
      child.interceptors.push({
        request(reqOpts: DecorateRequestOptions) {
          // tslint:disable-next-line:no-any
          (reqOpts as any).child = true;
          return reqOpts;
        },
      });

      parent.parent.request = async (reqOpts: DecorateRequestOptions) => {
        assert.deepEqual(reqOpts.interceptors_![0].request({}), {
          child: true,
        });
        assert.deepEqual(reqOpts.interceptors_![1].request({}), {
          parent: true,
        });
        return {} as r.Response;
      };

      const res = await child.request_({uri: ''});
    });

    it('should pass a clone of the interceptors', async () => {
      pSvc().interceptors.push({
        request(reqOpts: DecorateRequestOptions) {
          // tslint:disable-next-line:no-any
          (reqOpts as any).one = true;
          return reqOpts;
        },
      });

      pSvc().parent.request = async (reqOpts: DecorateRequestOptions) => {
        const serviceObjectInterceptors = pSvc().interceptors;
        assert.deepEqual(reqOpts.interceptors_, serviceObjectInterceptors);
        assert.notStrictEqual(reqOpts.interceptors_, serviceObjectInterceptors);
        return {} as r.Response;
      };

      await serviceObject.request_({uri: ''});
    });

    it('should call the parent requestStream method', async () => {
      const fakeObj = {};

      const expectedUri = [
        serviceObject.baseUrl,
        pSvc().id,
        reqOpts.uri,
      ].join('/');

      pSvc().parent.requestStream =
          async (reqOpts_: DecorateRequestOptions) => {
        assert.notStrictEqual(reqOpts_, reqOpts);
        assert.strictEqual(reqOpts_.uri, expectedUri);
        assert.deepEqual(reqOpts_.interceptors_, []);
        return fakeObj;
      };

      const opts = extend(true, reqOpts, {shouldReturnStream: true});
      const returnVal = await serviceObject.request_(opts);
      assert.strictEqual(returnVal, fakeObj);
    });
  });

  describe('request', () => {
    it('should call through to request_', (done) => {
      const fakeOptions = {} as DecorateRequestOptions;
      serviceObject.request_ = (reqOpts) => {
        assert.strictEqual(reqOpts, fakeOptions);
        return Promise.resolve({} as r.Response);
      };
      serviceObject.request(fakeOptions)
          .then(
              r => {
                done();
              },
              err => {
                console.error(err);
              });
    });

    it('should accept a callback', (done) => {
      const response = {body: {abc: '123'}, statusCode: 200} as r.Response;

      serviceObject.request_ = (reqOpts) => {
        return Promise.resolve(response);
      };

      serviceObject.request({} as DecorateRequestOptions, (err, res, body) => {
        assert.ifError(err);
        assert.deepStrictEqual(res, response);
        assert.deepStrictEqual(body, response.body);
        done();
      });
    });
  });

  describe('requestStream', () => {
    it('should call through to request_', async () => {
      const fakeOptions = {} as DecorateRequestOptions;
      const serviceObject = new ServiceObject(CONFIG);
      serviceObject.request_ = async (reqOpts) => {
        assert.strictEqual(reqOpts, fakeOptions);
        return {} as r.Response;
      };
      await serviceObject.requestStream(fakeOptions);
    });
  });
});
