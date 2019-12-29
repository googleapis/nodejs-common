// Copyright 2015 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as assert from 'assert';
import {describe, it} from 'mocha';
import * as extend from 'extend';
import * as proxyquire from 'proxyquire';
import {Request} from 'teeny-request';

import {Interceptor} from '../src';
import {ServiceConfig, ServiceOptions} from '../src/service';
import {
  BodyResponseCallback,
  DecorateRequestOptions,
  MakeAuthenticatedRequest,
  MakeAuthenticatedRequestFactoryConfig,
  util,
  Util,
} from '../src/util';

proxyquire.noPreserveCache();

const fakeCfg = {} as ServiceConfig;

const makeAuthRequestFactoryCache = util.makeAuthenticatedRequestFactory;
let makeAuthenticatedRequestFactoryOverride:
  | null
  | ((
      config: MakeAuthenticatedRequestFactoryConfig
    ) => MakeAuthenticatedRequest);

util.makeAuthenticatedRequestFactory = function(
  this: Util,
  config: MakeAuthenticatedRequestFactoryConfig
) {
  if (makeAuthenticatedRequestFactoryOverride) {
    return makeAuthenticatedRequestFactoryOverride.call(this, config);
  }
  return makeAuthRequestFactoryCache.call(this, config);
};

describe('Service', () => {
  // tslint:disable-next-line:no-any
  let service: any;
  const Service = proxyquire('../src/service', {
    './util': util,
  }).Service;

  const CONFIG = {
    scopes: [],
    baseUrl: 'base-url',
    projectIdRequired: false,
    apiEndpoint: 'common.endpoint.local',
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
    token: 'token',
  } as ServiceOptions;

  beforeEach(() => {
    makeAuthenticatedRequestFactoryOverride = null;
    service = new Service(CONFIG, OPTIONS);
  });

  describe('instantiation', () => {
    it('should not require options', () => {
      assert.doesNotThrow(() => {
        const s = new Service(CONFIG);
      });
    });

    it('should create an authenticated request factory', () => {
      const authenticatedRequest = {} as MakeAuthenticatedRequest;

      makeAuthenticatedRequestFactoryOverride = (
        config: MakeAuthenticatedRequestFactoryConfig
      ) => {
        const expectedConfig = extend({}, CONFIG, {
          credentials: OPTIONS.credentials,
          keyFile: OPTIONS.keyFilename,
          email: OPTIONS.email,
          projectIdRequired: CONFIG.projectIdRequired,
          projectId: OPTIONS.projectId,
          token: OPTIONS.token,
        });

        assert.deepStrictEqual(config, expectedConfig);

        return authenticatedRequest;
      };

      const svc = new Service(CONFIG, OPTIONS);
      assert.strictEqual(svc.makeAuthenticatedRequest, authenticatedRequest);
    });

    it('should localize the authClient', () => {
      const authClient = {};

      makeAuthenticatedRequestFactoryOverride = (
        config?: MakeAuthenticatedRequestFactoryConfig
      ) => {
        return {
          authClient,
        } as MakeAuthenticatedRequest;
      };

      const service = new Service(CONFIG, OPTIONS);
      assert.strictEqual(service.authClient, authClient);
    });

    it('should allow passing a custom GoogleAuth client', () => {
      const authClient = {getCredentials: () => {}};
      const cfg = Object.assign({}, {authClient}, CONFIG);
      const service = new Service(cfg);
      assert.strictEqual(service.authClient, authClient);
    });

    it('should localize the baseUrl', () => {
      assert.strictEqual(service.baseUrl, CONFIG.baseUrl);
    });

    it('should localize the apiEndpoint', () => {
      assert.strictEqual(service.apiEndpoint, CONFIG.apiEndpoint);
    });

    it('should default the timeout to undefined', () => {
      assert.strictEqual(service.timeout, undefined);
    });

    it('should localize the timeout', () => {
      const timeout = 10000;
      const options = extend({}, OPTIONS, {timeout});
      const service = new Service(fakeCfg, options);
      assert.strictEqual(service.timeout, timeout);
    });

    it('should localize the getCredentials method', () => {
      function getCredentials() {}

      makeAuthenticatedRequestFactoryOverride = (
        config?: MakeAuthenticatedRequestFactoryConfig
      ) => {
        return {
          authClient: {},
          getCredentials,
          // tslint:disable-next-line:no-any
        } as any;
      };

      const service = new Service(CONFIG, OPTIONS);
      assert.strictEqual(service.getCredentials, getCredentials);
    });

    it('should default globalInterceptors to an empty array', () => {
      assert.deepStrictEqual(service.globalInterceptors, []);
    });

    it('should preserve the original global interceptors', () => {
      const globalInterceptors: Interceptor[] = [];
      const options = extend({}, OPTIONS);
      options.interceptors_ = globalInterceptors;
      const service = new Service(fakeCfg, options);
      assert.strictEqual(service.globalInterceptors, globalInterceptors);
    });

    it('should default interceptors to an empty array', () => {
      assert.deepStrictEqual(service.interceptors, []);
    });

    it('should localize package.json', () => {
      assert.strictEqual(service.packageJson, CONFIG.packageJson);
    });

    it('should localize the projectId', () => {
      assert.strictEqual(service.projectId, OPTIONS.projectId);
    });

    it('should default projectId with placeholder', () => {
      const service = new Service(fakeCfg, {});
      assert.strictEqual(service.projectId, '{{projectId}}');
    });

    it('should localize the projectIdRequired', () => {
      assert.strictEqual(service.projectIdRequired, CONFIG.projectIdRequired);
    });

    it('should default projectIdRequired to true', () => {
      const service = new Service(fakeCfg, OPTIONS);
      assert.strictEqual(service.projectIdRequired, true);
    });

    it('should localize the Promise object', () => {
      // tslint:disable-next-line:variable-name
      const FakePromise = () => {};
      const service = new Service(fakeCfg, {promise: FakePromise});
      assert.strictEqual(service.Promise, FakePromise);
    });

    it('should localize the native Promise object by default', () => {
      assert.strictEqual(service.Promise, global.Promise);
    });

    it('should disable forever agent for Cloud Function envs', () => {
      process.env.FUNCTION_NAME = 'cloud-function-name';
      const service = new Service(CONFIG, OPTIONS);
      delete process.env.FUNCTION_NAME;

      const interceptor = service.interceptors[0];

      const modifiedReqOpts = interceptor.request({forever: true});
      assert.strictEqual(modifiedReqOpts.forever, false);
    });
  });

  describe('getProjectId', () => {
    it('should get the project ID from the auth client', done => {
      service.authClient = {
        getProjectId() {
          done();
        },
      };

      service.getProjectId(assert.ifError);
    });

    it('should return error from auth client', done => {
      const error = new Error('Error.');

      service.authClient = {
        async getProjectId() {
          throw error;
        },
      };

      service.getProjectId((err: Error) => {
        assert.strictEqual(err, error);
        done();
      });
    });

    it('should update and return the project ID if found', done => {
      const service = new Service(fakeCfg, {});
      const projectId = 'detected-project-id';

      service.authClient = {
        async getProjectId() {
          return projectId;
        },
      };

      service.getProjectId((err: Error, projectId_: string) => {
        assert.ifError(err);
        assert.strictEqual(service.projectId, projectId);
        assert.strictEqual(projectId_, projectId);
        done();
      });
    });

    it('should return a promise if no callback is provided', () => {
      const value = {};
      service.getProjectIdAsync = () => value;
      assert.strictEqual(service.getProjectId(), value);
    });
  });

  describe('request_', () => {
    let reqOpts: DecorateRequestOptions;

    beforeEach(() => {
      reqOpts = {
        uri: 'uri',
      };
    });

    it('should compose the correct request', done => {
      const expectedUri = [service.baseUrl, reqOpts.uri].join('/');
      service.makeAuthenticatedRequest = (
        reqOpts_: DecorateRequestOptions,
        callback: BodyResponseCallback
      ) => {
        assert.notStrictEqual(reqOpts_, reqOpts);
        assert.strictEqual(reqOpts_.uri, expectedUri);
        assert.strictEqual(reqOpts.interceptors_, undefined);
        callback(null); // done()
      };
      service.request_(reqOpts, () => done());
    });

    it('should support absolute uris', done => {
      const expectedUri = 'http://www.google.com';

      service.makeAuthenticatedRequest = (reqOpts: DecorateRequestOptions) => {
        assert.strictEqual(reqOpts.uri, expectedUri);
        done();
      };

      service.request_({uri: expectedUri}, assert.ifError);
    });

    it('should trim slashes', done => {
      const reqOpts = {
        uri: '//1/2//',
      };

      const expectedUri = [service.baseUrl, '1/2'].join('/');

      service.makeAuthenticatedRequest = (reqOpts_: DecorateRequestOptions) => {
        assert.strictEqual(reqOpts_.uri, expectedUri);
        done();
      };

      service.request_(reqOpts, assert.ifError);
    });

    it('should replace path/:subpath with path:subpath', done => {
      const reqOpts = {
        uri: ':test',
      };

      const expectedUri = service.baseUrl + reqOpts.uri;
      service.makeAuthenticatedRequest = (reqOpts_: DecorateRequestOptions) => {
        assert.strictEqual(reqOpts_.uri, expectedUri);
        done();
      };
      service.request_(reqOpts, assert.ifError);
    });

    it('should not set timeout', done => {
      service.makeAuthenticatedRequest = (reqOpts_: DecorateRequestOptions) => {
        assert.strictEqual(reqOpts_.timeout, undefined);
        done();
      };
      service.request_(reqOpts, assert.ifError);
    });

    it('should set reqOpt.timeout', done => {
      const timeout = 10000;
      const config = extend({}, CONFIG);
      const options = extend({}, OPTIONS, {timeout});
      const service = new Service(config, options);

      service.makeAuthenticatedRequest = (reqOpts_: DecorateRequestOptions) => {
        assert.strictEqual(reqOpts_.timeout, timeout);
        done();
      };
      service.request_(reqOpts, assert.ifError);
    });

    it('should add the User Agent', done => {
      const userAgent = 'user-agent/0.0.0';

      const getUserAgentFn = util.getUserAgentFromPackageJson;
      util.getUserAgentFromPackageJson = packageJson => {
        util.getUserAgentFromPackageJson = getUserAgentFn;
        assert.strictEqual(packageJson, service.packageJson);
        return userAgent;
      };

      service.makeAuthenticatedRequest = (reqOpts: DecorateRequestOptions) => {
        assert.strictEqual(reqOpts.headers!['User-Agent'], userAgent);
        done();
      };

      service.request_(reqOpts, assert.ifError);
    });

    it('should add the api-client header', done => {
      service.makeAuthenticatedRequest = (reqOpts: DecorateRequestOptions) => {
        const pkg = service.packageJson;
        assert.strictEqual(
          reqOpts.headers!['x-goog-api-client'],
          `gl-node/${process.versions.node} gccl/${pkg.version}`
        );
        done();
      };

      service.request_(reqOpts, assert.ifError);
    });

    describe('projectIdRequired', () => {
      describe('false', () => {
        it('should include the projectId', done => {
          const config = extend({}, CONFIG, {projectIdRequired: false});
          const service = new Service(config, OPTIONS);

          const expectedUri = [service.baseUrl, reqOpts.uri].join('/');

          service.makeAuthenticatedRequest = (
            reqOpts_: DecorateRequestOptions
          ) => {
            assert.strictEqual(reqOpts_.uri, expectedUri);

            done();
          };

          service.request_(reqOpts, assert.ifError);
        });
      });

      describe('true', () => {
        it('should not include the projectId', done => {
          const config = extend({}, CONFIG, {projectIdRequired: true});
          const service = new Service(config, OPTIONS);

          const expectedUri = [
            service.baseUrl,
            'projects',
            service.projectId,
            reqOpts.uri,
          ].join('/');

          service.makeAuthenticatedRequest = (
            reqOpts_: DecorateRequestOptions
          ) => {
            assert.strictEqual(reqOpts_.uri, expectedUri);

            done();
          };

          service.request_(reqOpts, assert.ifError);
        });
      });
    });

    describe('request interceptors', () => {
      it('should call the request interceptors in order', done => {
        const reqOpts = {
          uri: '',
          interceptors_: [] as Array<{}>,
        };
        type FakeRequestOptions = DecorateRequestOptions & {order: string};

        // Called first.
        service.globalInterceptors.push({
          request(reqOpts: FakeRequestOptions) {
            reqOpts.order = '1';
            return reqOpts;
          },
        });

        // Called third.
        service.interceptors.push({
          request(reqOpts: FakeRequestOptions) {
            reqOpts.order += '3';
            return reqOpts;
          },
        });

        // Called second.
        service.globalInterceptors.push({
          request(reqOpts: FakeRequestOptions) {
            reqOpts.order += '2';
            return reqOpts;
          },
        });

        // Called fifth.
        reqOpts.interceptors_.push({
          request(reqOpts: FakeRequestOptions) {
            reqOpts.order += '5';
            return reqOpts;
          },
        });

        // Called fourth.
        service.interceptors.push({
          request(reqOpts: FakeRequestOptions) {
            reqOpts.order += '4';
            return reqOpts;
          },
        });

        // Called sixth.
        reqOpts.interceptors_.push({
          request(reqOpts: FakeRequestOptions) {
            reqOpts.order += '6';
            return reqOpts;
          },
        });

        service.makeAuthenticatedRequest = (reqOpts: FakeRequestOptions) => {
          assert.strictEqual(reqOpts.order, '123456');
          done();
        };

        service.request_(reqOpts, assert.ifError);
      });

      it('should not affect original interceptor arrays', done => {
        function request(reqOpts: DecorateRequestOptions) {
          return reqOpts;
        }

        const globalInterceptors = [{request}];
        const localInterceptors = [{request}];
        const requestInterceptors = [{request}];

        const originalGlobalInterceptors = [].slice.call(globalInterceptors);
        const originalLocalInterceptors = [].slice.call(localInterceptors);
        const originalRequestInterceptors = [].slice.call(requestInterceptors);

        service.makeAuthenticatedRequest = () => {
          assert.deepStrictEqual(
            globalInterceptors,
            originalGlobalInterceptors
          );
          assert.deepStrictEqual(localInterceptors, originalLocalInterceptors);
          assert.deepStrictEqual(
            requestInterceptors,
            originalRequestInterceptors
          );
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

      it('should not call unrelated interceptors', done => {
        service.interceptors.push({
          anotherInterceptor() {
            done(); // Will throw.
          },
          request() {
            setImmediate(done);
            return {};
          },
        });

        service.makeAuthenticatedRequest = util.noop;

        service.request_({uri: ''}, assert.ifError);
      });
    });
    describe('error handling', () => {
      it('should re-throw any makeAuthenticatedRequest callback error', done => {
        const err = new Error('🥓');
        const res = {body: undefined};
        service.makeAuthenticatedRequest = (_: void, callback: Function) => {
          callback(err, res.body, res);
        };
        service.request_({uri: ''}, (e: Error) => {
          assert.strictEqual(e, err);
          done();
        });
      });
    });
  });

  describe('request', () => {
    let request_: Request;

    before(() => {
      request_ = Service.prototype.request_;
    });

    after(() => {
      Service.prototype.request_ = request_;
    });

    it('should call through to _request', async () => {
      const fakeOpts = {};
      Service.prototype.request_ = async (reqOpts: DecorateRequestOptions) => {
        assert.strictEqual(reqOpts, fakeOpts);
        return Promise.resolve({});
      };
      await service.request(fakeOpts);
    });

    it('should accept a callback', done => {
      const fakeOpts = {};
      const response = {body: {abc: '123'}, statusCode: 200};
      Service.prototype.request_ = (
        reqOpts: DecorateRequestOptions,
        callback: Function
      ) => {
        assert.strictEqual(reqOpts, fakeOpts);
        callback(null, response.body, response);
      };

      service.request(fakeOpts, (err: Error, body: {}, res: {}) => {
        assert.ifError(err);
        assert.deepStrictEqual(res, response);
        assert.deepStrictEqual(body, response.body);
        done();
      });
    });
  });

  describe('requestStream', () => {
    let request_: Request;

    before(() => {
      request_ = Service.prototype.request_;
    });

    after(() => {
      Service.prototype.request_ = request_;
    });

    it('should return whatever _request returns', async () => {
      const fakeOpts = {};
      const fakeStream = {};

      Service.prototype.request_ = async (reqOpts: DecorateRequestOptions) => {
        assert.strictEqual(reqOpts, fakeOpts);
        return fakeStream;
      };

      const stream = await service.requestStream(fakeOpts);
      assert.strictEqual(stream, fakeStream);
    });
  });
});
