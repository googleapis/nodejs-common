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

'use strict';

const assert = require('assert');
const extend = require('extend');
const proxyquire = require('proxyquire').noPreserveCache();

const util = require('../src/util.js');

const makeAuthenticatedRequestFactoryCache =
  util.makeAuthenticatedRequestFactory;
let makeAuthenticatedRequestFactoryOverride;
util.makeAuthenticatedRequestFactory = function() {
  if (makeAuthenticatedRequestFactoryOverride) {
    return makeAuthenticatedRequestFactoryOverride.apply(this, arguments);
  }

  return makeAuthenticatedRequestFactoryCache.apply(this, arguments);
};

describe('Service', function() {
  let Service;
  let service;

  const CONFIG = {
    scopes: [],
    baseUrl: 'base-url',
    projectIdRequired: false,
    packageJson: {
      name: '@google-cloud/service',
      version: '0.2.0',
    },
  };

  const OPTIONS = {
    credentials: {},
    keyFile: {},
    email: 'email',
    projectId: 'project-id',
  };

  before(function() {
    Service = proxyquire('../src/service.js', {
      './util.js': util,
    });
  });

  beforeEach(function() {
    makeAuthenticatedRequestFactoryOverride = null;
    service = new Service(CONFIG, OPTIONS);
  });

  describe('instantiation', function() {
    it('should not require options', function() {
      assert.doesNotThrow(function() {
        new Service(CONFIG);
      });
    });

    it('should create an authenticated request factory', function() {
      const authenticatedRequest = {};

      makeAuthenticatedRequestFactoryOverride = function(config) {
        const expectedConfig = extend({}, CONFIG, {
          credentials: OPTIONS.credentials,
          keyFile: OPTIONS.keyFilename,
          email: OPTIONS.email,
          projectIdRequired: CONFIG.projectIdRequired,
          projectId: OPTIONS.projectId,
        });

        assert.deepEqual(config, expectedConfig);

        return authenticatedRequest;
      };

      const svc = new Service(CONFIG, OPTIONS);
      assert.strictEqual(svc.makeAuthenticatedRequest, authenticatedRequest);
    });

    it('should localize the authClient', function() {
      const authClient = {};

      makeAuthenticatedRequestFactoryOverride = function() {
        return {
          authClient: authClient,
        };
      };

      const service = new Service(CONFIG, OPTIONS);
      assert.strictEqual(service.authClient, authClient);
    });

    it('should localize the baseUrl', function() {
      assert.strictEqual(service.baseUrl, CONFIG.baseUrl);
    });

    it('should localize the getCredentials method', function() {
      function getCredentials() {}

      makeAuthenticatedRequestFactoryOverride = function() {
        return {
          authClient: {},
          getCredentials: getCredentials,
        };
      };

      const service = new Service(CONFIG, OPTIONS);
      assert.strictEqual(service.getCredentials, getCredentials);
    });

    it('should default globalInterceptors to an empty array', function() {
      assert.deepEqual(service.globalInterceptors, []);
    });

    it('should preserve the original global interceptors', function() {
      const globalInterceptors = [];

      const options = extend({}, OPTIONS);
      options.interceptors_ = globalInterceptors;

      const service = new Service({}, options);
      assert.strictEqual(service.globalInterceptors, globalInterceptors);
    });

    it('should default interceptors to an empty array', function() {
      assert.deepEqual(service.interceptors, []);
    });

    it('should localize package.json', function() {
      assert.strictEqual(service.packageJson, CONFIG.packageJson);
    });

    it('should localize the projectId', function() {
      assert.strictEqual(service.projectId, OPTIONS.projectId);
    });

    it('should default projectId with placeholder', function() {
      const service = new Service({}, {});
      assert.strictEqual(service.projectId, '{{projectId}}');
    });

    it('should localize the projectIdRequired', function() {
      assert.strictEqual(service.projectIdRequired, CONFIG.projectIdRequired);
    });

    it('should default projectIdRequired to true', function() {
      const service = new Service({}, OPTIONS);
      assert.strictEqual(service.projectIdRequired, true);
    });

    it('should localize the Promise object', function() {
      const FakePromise = function() {};
      const service = new Service({}, {promise: FakePromise});

      assert.strictEqual(service.Promise, FakePromise);
    });

    it('should localize the native Promise object by default', function() {
      assert.strictEqual(service.Promise, global.Promise);
    });

    it('should disable forever agent for Cloud Function envs', function() {
      process.env.FUNCTION_NAME = 'cloud-function-name';
      const service = new Service(CONFIG, OPTIONS);
      delete process.env.FUNCTION_NAME;

      const interceptor = service.interceptors[0];

      const modifiedReqOpts = interceptor.request({forever: true});
      assert.strictEqual(modifiedReqOpts.forever, false);
    });
  });

  describe('getProjectId', function() {
    it('should get the project ID from the auth client', function(done) {
      service.authClient = {
        getProjectId: function() {
          done();
        },
      };

      service.getProjectId(assert.ifError);
    });

    it('should return error from auth client', function(done) {
      const error = new Error('Error.');

      service.authClient = {
        getProjectId: function(callback) {
          callback(error);
        },
      };

      service.getProjectId(function(err) {
        assert.strictEqual(err, error);
        done();
      });
    });

    it('should update and return the project ID if found', function(done) {
      const service = new Service({}, {});
      const projectId = 'detected-project-id';

      service.authClient = {
        getProjectId: function(callback) {
          callback(null, projectId);
        },
      };

      service.getProjectId(function(err, projectId_) {
        assert.ifError(err);
        assert.strictEqual(service.projectId, projectId);
        assert.strictEqual(projectId_, projectId);
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
      const expectedUri = [service.baseUrl, reqOpts.uri].join('/');

      service.makeAuthenticatedRequest = function(reqOpts_, callback) {
        assert.notStrictEqual(reqOpts_, reqOpts);
        assert.strictEqual(reqOpts_.uri, expectedUri);
        assert.strictEqual(reqOpts.interceptors_, undefined);
        callback(); // done()
      };

      service.request_(reqOpts, done);
    });

    it('should support absolute uris', function(done) {
      const expectedUri = 'http://www.google.com';

      service.makeAuthenticatedRequest = function(reqOpts) {
        assert.strictEqual(reqOpts.uri, expectedUri);
        done();
      };

      service.request_({uri: expectedUri}, assert.ifError);
    });

    it('should trim slashes', function(done) {
      const reqOpts = {
        uri: '//1/2//',
      };

      const expectedUri = [service.baseUrl, '1/2'].join('/');

      service.makeAuthenticatedRequest = function(reqOpts_) {
        assert.strictEqual(reqOpts_.uri, expectedUri);
        done();
      };

      service.request_(reqOpts, assert.ifError);
    });

    it('should replace path/:subpath with path:subpath', function(done) {
      const reqOpts = {
        uri: ':test',
      };

      const expectedUri = service.baseUrl + reqOpts.uri;

      service.makeAuthenticatedRequest = function(reqOpts_) {
        assert.strictEqual(reqOpts_.uri, expectedUri);
        done();
      };

      service.request_(reqOpts, assert.ifError);
    });

    it('should add the User Agent', function(done) {
      const userAgent = 'user-agent/0.0.0';

      const getUserAgentFn = util.getUserAgentFromPackageJson;
      util.getUserAgentFromPackageJson = function(packageJson) {
        util.getUserAgentFromPackageJson = getUserAgentFn;
        assert.strictEqual(packageJson, service.packageJson);
        return userAgent;
      };

      service.makeAuthenticatedRequest = function(reqOpts) {
        assert.strictEqual(reqOpts.headers['User-Agent'], userAgent);
        done();
      };

      service.request_(reqOpts, assert.ifError);
    });

    it('should add the api-client header', function(done) {
      service.makeAuthenticatedRequest = function(reqOpts) {
        const pkg = service.packageJson;
        assert.strictEqual(
          reqOpts.headers['x-goog-api-client'],
          `gl-node/${process.versions.node} gccl/${pkg.version}`
        );
        done();
      };

      service.request_(reqOpts, assert.ifError);
    });

    describe('projectIdRequired', function() {
      describe('false', function() {
        it('should include the projectId', function(done) {
          const config = extend({}, CONFIG, {projectIdRequired: false});
          const service = new Service(config, OPTIONS);

          const expectedUri = [service.baseUrl, reqOpts.uri].join('/');

          service.makeAuthenticatedRequest = function(reqOpts_) {
            assert.strictEqual(reqOpts_.uri, expectedUri);

            done();
          };

          service.request_(reqOpts, assert.ifError);
        });
      });

      describe('true', function() {
        it('should not include the projectId', function(done) {
          const config = extend({}, CONFIG, {projectIdRequired: true});
          const service = new Service(config, OPTIONS);

          const expectedUri = [
            service.baseUrl,
            'projects',
            service.projectId,
            reqOpts.uri,
          ].join('/');

          service.makeAuthenticatedRequest = function(reqOpts_) {
            assert.strictEqual(reqOpts_.uri, expectedUri);

            done();
          };

          service.request_(reqOpts, assert.ifError);
        });
      });
    });

    describe('request interceptors', function() {
      it('should call the request interceptors in order', function(done) {
        const reqOpts = {
          uri: '',
          interceptors_: [],
        };

        // Called first.
        service.globalInterceptors.push({
          request: function(reqOpts) {
            reqOpts.order = '1';
            return reqOpts;
          },
        });

        // Called third.
        service.interceptors.push({
          request: function(reqOpts) {
            reqOpts.order += '3';
            return reqOpts;
          },
        });

        // Called second.
        service.globalInterceptors.push({
          request: function(reqOpts) {
            reqOpts.order += '2';
            return reqOpts;
          },
        });

        // Called fifth.
        reqOpts.interceptors_.push({
          request: function(reqOpts) {
            reqOpts.order += '5';
            return reqOpts;
          },
        });

        // Called fourth.
        service.interceptors.push({
          request: function(reqOpts) {
            reqOpts.order += '4';
            return reqOpts;
          },
        });

        // Called sixth.
        reqOpts.interceptors_.push({
          request: function(reqOpts) {
            reqOpts.order += '6';
            return reqOpts;
          },
        });

        service.makeAuthenticatedRequest = function(reqOpts) {
          assert.strictEqual(reqOpts.order, '123456');
          done();
        };

        service.request_(reqOpts, assert.ifError);
      });

      it('should not affect original interceptor arrays', function(done) {
        function request(reqOpts) {
          return reqOpts;
        }

        const globalInterceptors = [{request: request}];
        const localInterceptors = [{request: request}];
        const requestInterceptors = [{request: request}];

        const originalGlobalInterceptors = [].slice.call(globalInterceptors);
        const originalLocalInterceptors = [].slice.call(localInterceptors);
        const originalRequestInterceptors = [].slice.call(requestInterceptors);

        service.makeAuthenticatedRequest = function() {
          assert.deepEqual(globalInterceptors, originalGlobalInterceptors);
          assert.deepEqual(localInterceptors, originalLocalInterceptors);
          assert.deepEqual(requestInterceptors, originalRequestInterceptors);
          done();
        };

        service.request_(
          {
            uri: '',
            interceptors_: requestInterceptors,
          },
          assert.ifError
        );
      });

      it('should not call unrelated interceptors', function(done) {
        service.interceptors.push({
          anotherInterceptor: function() {
            done(); // Will throw.
          },
          request: function() {
            setImmediate(done);
            return {};
          },
        });

        service.makeAuthenticatedRequest = util.noop;

        service.request_({uri: ''}, assert.ifError);
      });
    });
  });

  describe('request', function() {
    let request_;

    before(function() {
      request_ = Service.prototype.request_;
    });

    after(function() {
      Service.prototype.request_ = request_;
    });

    it('should call through to _request', function(done) {
      const fakeOpts = {};

      Service.prototype.request_ = function(reqOpts, callback) {
        assert.strictEqual(reqOpts, fakeOpts);
        callback();
      };

      service.request(fakeOpts, done);
    });
  });

  describe('requestStream', function() {
    let request_;

    before(function() {
      request_ = Service.prototype.request_;
    });

    after(function() {
      Service.prototype.request_ = request_;
    });

    it('should return whatever _request returns', function() {
      const fakeOpts = {};
      const fakeStream = {};

      Service.prototype.request_ = function(reqOpts) {
        assert.strictEqual(reqOpts, fakeOpts);
        return fakeStream;
      };

      const stream = service.requestStream(fakeOpts);
      assert.strictEqual(stream, fakeStream);
    });
  });
});
