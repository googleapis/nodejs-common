/**
 * Copyright 2014 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http:// www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as assert from 'assert';
import * as extend from 'extend';
import * as is from 'is';
import * as proxyquire from 'proxyquire';
import * as request from 'request';
import * as retryRequest from 'retry-request';
import * as stream from 'stream';
const streamEvents = require('stream-events');
import * as sinon from 'sinon';
import {Util, ApiError, GlobalConfig, DecorateRequestOptions, MakeRequestConfig, MakeAuthenticatedRequest, MakeAuthenticatedRequestFactoryConfig, Abortable, PromisifyAllOptions, MakeWritableStreamOptions, MakeAuthenticatedRequestOptions} from '../src/util';
import * as duplexify from 'duplexify';
import {GoogleAuthOptions, GoogleAuth} from 'google-auth-library';
import {AxiosRequestConfig} from 'axios';
import * as nock from 'nock';

nock.disableNetConnect();

const fakeResponse = {
  statusCode: 200,
  body: {star: 'trek'}
} as request.Response;

const fakeBadResp = {
  statusCode: 400,
  statusMessage: 'Not Good'
} as request.Response;

const fakeReqOpts: DecorateRequestOptions = {
  uri: 'http://so-fake',
  method: 'GET'
};

const fakeError = new Error('this error is like so fake');

let REQUEST_DEFAULT_CONF: request.CoreOptions;

// tslint:disable-next-line:no-any
let requestOverride: any;
function fakeRequest() {
  return (requestOverride || request).apply(null, arguments);
}

// tslint:disable-next-line:no-any
(fakeRequest as any).defaults = (defaultConfiguration: any) => {
  // Ignore the default values, so we don't have to test for them in every API
  // call.
  REQUEST_DEFAULT_CONF = defaultConfiguration;
  return fakeRequest;
};

// tslint:disable-next-line:no-any
let retryRequestOverride: any;
function fakeRetryRequest() {
  return (retryRequestOverride || retryRequest).apply(null, arguments);
}

// tslint:disable-next-line:no-any
let streamEventsOverride: any;
function fakeStreamEvents() {
  return (streamEventsOverride || streamEvents).apply(null, arguments);
}

describe('common/util', () => {
  let util: Util;
  // tslint:disable-next-line:no-any
  let utilOverrides = {} as any;

  // tslint:disable-next-line:no-any
  function stub(method: keyof Util, meth: (...args: any[]) => void) {
    return sandbox.stub(util, method).callsFake(meth);
  }

  // tslint:disable-next-line:no-any
  const fakeGoogleAuth = {
    GoogleAuth: (config?: GoogleAuthOptions) => {
      return new GoogleAuth(config);
    }
  };

  before(() => {
    util = proxyquire('../src/util', {
             'google-auth-library': fakeGoogleAuth,
             request: fakeRequest,
             'retry-request': fakeRetryRequest,
             'stream-events': fakeStreamEvents,
           }).util;
    const utilCached = extend(true, {}, util);

    // Override all util methods, allowing them to be mocked. Overrides are
    // removed before each test.
    Object.getOwnPropertyNames(util).forEach((utilMethod) => {
      // tslint:disable-next-line:no-any
      if (typeof (util as any)[utilMethod] !== 'function') {
        return;
      }
      // tslint:disable-next-line:no-any
      (util as any)[utilMethod] = function() {
        // tslint:disable-next-line:no-any
        return ((utilOverrides as any)[utilMethod] ||
                // tslint:disable-next-line:no-any
                (utilCached as any)[utilMethod])
            .apply(this, arguments);
      };
    });
  });

  let sandbox: sinon.SinonSandbox;
  beforeEach(() => {
    sandbox = sinon.createSandbox();
    requestOverride = null;
    retryRequestOverride = null;
    streamEventsOverride = null;
    utilOverrides = {};
  });
  afterEach(() => {
    sandbox.restore();
  });

  it('should have set correct defaults on Request', () => {
    assert.deepEqual(REQUEST_DEFAULT_CONF, {
      timeout: 60000,
      gzip: true,
      forever: true,
      pool: {
        maxSockets: Infinity,
      },
    });
  });

  it('should export an error for module instantiation errors', () => {
    const errorMessage =
        `Sorry, we cannot connect to Cloud Services without a project
    ID. You may specify one with an environment variable named
    "GOOGLE_CLOUD_PROJECT".`.replace(/ +/g, ' ');

    const missingProjectIdError = new util.MissingProjectIdError();
    assert.strictEqual(missingProjectIdError.message, errorMessage);
  });

  describe('ApiError', () => {
    it('should build correct ApiError', () => {
      const fakeResponse = {statusCode: 200} as request.Response;
      const error = {
        errors: [new Error(), new Error()],
        code: 100,
        message: 'Uh oh',
        response: fakeResponse,
      };
      const apiError = new ApiError(error);
      assert.strictEqual(apiError.errors, error.errors);
      assert.strictEqual(apiError.code, error.code);
      assert.strictEqual(apiError.message, error.message);
      assert.strictEqual(apiError.response, error.response);
    });

    it('should detect ApiError message from response body', () => {
      const errorMessage = 'API error message';
      const error = {
        errors: [new Error(errorMessage)],
        code: 100,
        response: fakeResponse,
      };
      const apiError = new ApiError(error);
      assert.strictEqual(apiError.message, errorMessage);
    });

    it('should parse the response body for errors', () => {
      const error = new Error('Error.');
      const errors = [error, error];

      const errorBody = {
        code: 123,
        response: {
          body: JSON.stringify({
            error: {
              errors,
            },
          }),
        } as request.Response,
      };

      const apiError = new ApiError(errorBody);

      assert.deepEqual(apiError.errors, errors);
    });

    it('should append the custom error message', () => {
      const errorMessage = 'API error message';
      const customErrorMessage = 'Custom error message';
      const expectedErrorMessage =
          [customErrorMessage, errorMessage].join(' - ');

      const error = {
        errors: [new Error(errorMessage)],
        code: 100,
        response: fakeResponse,
        message: customErrorMessage,
      };

      const apiError = new ApiError(error);

      assert.strictEqual(apiError.message, expectedErrorMessage);
    });

    it('should parse and append the decoded response body', () => {
      const errorMessage = 'API error message';
      const responseBodyMsg = 'Response body message &lt;';
      const expectedErrorMessage = [
        errorMessage,
        'Response body message <',
      ].join(' - ');

      const error = {
        message: errorMessage,
        code: 100,
        response: {
          body: Buffer.from(responseBodyMsg),
        } as request.Response,
      };
      const apiError = new ApiError(error);
      assert.strictEqual(apiError.message, expectedErrorMessage);
    });

    it('should use default message if there are no errors', () => {
      const fakeResponse = {statusCode: 200} as request.Response;
      const expectedErrorMessage = 'Error during request.';
      const error = {
        code: 100,
        response: fakeResponse,
      };
      const apiError = new ApiError(error);
      assert.strictEqual(apiError.message, expectedErrorMessage);
    });

    it('should use default message if too many errors', () => {
      const fakeResponse = {statusCode: 200} as request.Response;
      const expectedErrorMessage = 'Error during request.';
      const error = {
        errors: [new Error(), new Error()],
        code: 100,
        response: fakeResponse,
      };
      const apiError = new ApiError(error);
      assert.strictEqual(apiError.message, expectedErrorMessage);
    });

    it('should filter out duplicate errors', () => {
      const expectedErrorMessage = 'Error during request.';
      const error = {
        code: 100,
        message: expectedErrorMessage,
        response: {
          body: expectedErrorMessage,
        } as request.Response,
      };
      const apiError = new ApiError(error);
      assert.strictEqual(apiError.message, expectedErrorMessage);
    });
  });

  describe('PartialFailureError', () => {
    it('should build correct PartialFailureError', () => {
      const error = {
        code: 123,
        errors: [new Error(), new Error()],
        response: fakeResponse,
        message: 'Partial failure occurred',
      };

      const partialFailureError = new util.PartialFailureError(error);

      assert.strictEqual(partialFailureError.errors, error.errors);
      assert.strictEqual(partialFailureError.response, error.response);
      assert.strictEqual(partialFailureError.message, error.message);
    });

    it('should use default message', () => {
      const expectedErrorMessage = 'A failure occurred during this request.';

      const error = {
        code: 123,
        errors: [],
        response: fakeResponse,
      };

      const partialFailureError = new util.PartialFailureError(error);

      assert.strictEqual(partialFailureError.message, expectedErrorMessage);
    });
  });

  describe('extendGlobalConfig', () => {
    it('should favor `keyFilename` when `credentials` is global', () => {
      const globalConfig = {credentials: {}};
      const options = util.extendGlobalConfig(globalConfig, {
        keyFilename: 'key.json',
      });
      assert.strictEqual(options.credentials, undefined);
    });

    it('should favor `credentials` when `keyFilename` is global', () => {
      const globalConfig = {keyFilename: 'key.json'};
      const options = util.extendGlobalConfig(globalConfig, {credentials: {}});
      assert.strictEqual(options.keyFilename, undefined);
    });

    it('should honor the GCLOUD_PROJECT environment variable', () => {
      const newProjectId = 'envvar-project-id';
      const cachedProjectId = process.env.GCLOUD_PROJECT;
      process.env.GCLOUD_PROJECT = newProjectId;

      // No projectId specified:
      const globalConfig = {keyFilename: 'key.json'};
      const overrides = {};

      const options = util.extendGlobalConfig(globalConfig, overrides);

      if (cachedProjectId) {
        process.env.GCLOUD_PROJECT = cachedProjectId;
      } else {
        delete process.env.GCLOUD_PROJECT;
      }

      assert.strictEqual(options.projectId, newProjectId);
    });

    it('should not modify original object', () => {
      const globalConfig = {keyFilename: 'key.json'};
      util.extendGlobalConfig(globalConfig, {credentials: {}});
      assert.deepEqual(globalConfig, {keyFilename: 'key.json'});
    });

    it('should link the original interceptors_', () => {
      const interceptors: Array<{}> = [];
      const globalConfig = {interceptors_: interceptors};
      util.extendGlobalConfig(globalConfig, {});
      assert.strictEqual(globalConfig.interceptors_, interceptors);
    });
  });

  describe('handleResp', () => {
    it('should handle errors', (done) => {
      const error = new Error('Error.');

      util.handleResp(error, fakeResponse, null, (err) => {
        assert.strictEqual(err, error);
        done();
      });
    });

    it('uses a no-op callback if none is sent', () => {
      util.handleResp(null, fakeResponse, '');
    });

    it('should parse response', (done) => {
      stub('parseHttpRespMessage', resp_ => {
        assert.deepStrictEqual(resp_, fakeResponse);
        return {
          resp: fakeResponse,
        };
      });

      stub('parseHttpRespBody', body_ => {
        assert.strictEqual(body_, fakeResponse.body);
        return {
          body: fakeResponse.body,
        };
      });

      util.handleResp(
          fakeError, fakeResponse, fakeResponse.body, (err, body, resp) => {
            assert.deepEqual(err, fakeError);
            assert.deepEqual(body, fakeResponse.body);
            assert.deepStrictEqual(resp, fakeResponse);
            done();
          });
    });

    it('should parse response for error', (done) => {
      const error = new Error('Error.');

      sandbox.stub(util, 'parseHttpRespMessage').callsFake(() => {
        return {err: error};
      });

      util.handleResp(null, fakeResponse, {}, (err) => {
        assert.deepEqual(err, error);
        done();
      });
    });

    it('should parse body for error', (done) => {
      const error = new Error('Error.');

      stub('parseHttpRespBody', () => {
        return {err: error};
      });

      util.handleResp(null, fakeResponse, {}, (err) => {
        assert.deepEqual(err, error);
        done();
      });
    });

    it('should not parse undefined response', (done) => {
      stub('parseHttpRespMessage', () => done());  // Will throw.
      util.handleResp(null, null, null, done);
    });

    it('should not parse undefined body', (done) => {
      stub('parseHttpRespBody', () => done());  // Will throw.
      util.handleResp(null, null, null, done);
    });
  });

  describe('parseHttpRespMessage', () => {
    it('should build ApiError with non-200 status and message', () => {
      const res = util.parseHttpRespMessage(fakeBadResp);
      const error_ = res.err!;
      assert.strictEqual(error_.code, fakeBadResp.statusCode);
      assert.strictEqual(error_.message, fakeBadResp.statusMessage);
      assert.strictEqual(error_.response, fakeBadResp);
    });

    it('should return the original response message', () => {
      const parsedHttpRespMessage = util.parseHttpRespMessage(fakeBadResp);
      assert.strictEqual(parsedHttpRespMessage.resp, fakeBadResp);
    });
  });

  describe('parseHttpRespBody', () => {
    it('should detect body errors', () => {
      const apiErr = {
        errors: [{message: 'bar'}],
        code: 400,
        message: 'an error occurred',
      };

      const parsedHttpRespBody = util.parseHttpRespBody({error: apiErr});
      const expectedErrorMessage = [
        apiErr.message,
        apiErr.errors[0].message,
      ].join(' - ');

      const err = parsedHttpRespBody.err as ApiError;
      assert.deepEqual(err.errors, apiErr.errors);
      assert.strictEqual(err.code, apiErr.code);
      assert.deepEqual(err.message, expectedErrorMessage);
    });

    it('should try to parse JSON if body is string', () => {
      const httpRespBody = '{ "foo": "bar" }';
      const parsedHttpRespBody = util.parseHttpRespBody(httpRespBody);

      assert.strictEqual(parsedHttpRespBody.body.foo, 'bar');
    });

    it('should return the original body', () => {
      const httpRespBody = {};
      const parsedHttpRespBody = util.parseHttpRespBody(httpRespBody);
      assert.strictEqual(parsedHttpRespBody.body, httpRespBody);
    });
  });

  describe('makeWritableStream', () => {
    it('should use defaults', (done) => {
      const dup = duplexify();
      // tslint:disable-next-line:no-any
      const metadata = {a: 'b', c: 'd'} as any;
      util.makeWritableStream(dup, {
        metadata,
        makeAuthenticatedRequest(request) {
          assert.equal(request.method, 'POST');
          assert.equal(request.qs.uploadType, 'multipart');

          assert.strictEqual(Array.isArray(request.multipart), true);

          const mp = request.multipart as request.RequestPart[];

          assert.strictEqual(
              // tslint:disable-next-line:no-any
              (mp[0] as any)['Content-Type'], 'application/json');
          assert.strictEqual(mp[0].body, JSON.stringify(metadata));

          assert.strictEqual(
              // tslint:disable-next-line:no-any
              (mp[1] as any)['Content-Type'], 'application/octet-stream');
          // (is a writable stream:)
          assert.strictEqual(typeof mp[1].body._writableState, 'object');

          done();
        },
      });
    });

    it('should allow overriding defaults', (done) => {
      const dup = duplexify();

      const req = {
        uri: 'http://foo',
        method: 'PUT',
        qs: {
          uploadType: 'media',
        },
      } as DecorateRequestOptions;

      util.makeWritableStream(dup, {
        metadata: {
          contentType: 'application/json',
        },
        makeAuthenticatedRequest(request) {
          assert.equal(request.method, req.method);
          assert.deepEqual(request.qs, req.qs);
          assert.equal(request.uri, req.uri);

          // tslint:disable-next-line:no-any
          const mp = request.multipart as any[];
          assert.strictEqual(mp[1]['Content-Type'], 'application/json');

          done();
        },

        request: req,
      });
    });

    it('should emit an error', (done) => {
      const error = new Error('Error.');

      const ws = duplexify();
      ws.on('error', (err) => {
        assert.equal(err, error);
        done();
      });

      util.makeWritableStream(ws, {
        makeAuthenticatedRequest(request, opts) {
          opts!.onAuthenticated(error);
        },
      });
    });

    it('should set the writable stream', (done) => {
      const dup = duplexify();

      dup.setWritable = () => {
        done();
      };

      util.makeWritableStream(dup, {
        makeAuthenticatedRequest() {},
      });
    });

    it('should emit an error if the request fails', (done) => {
      const dup = duplexify();
      const fakeStream = new stream.Writable();
      const error = new Error('Error.');

      fakeStream.write =
          // tslint:disable-next-line:no-any
          (chunk: any, encoding?: string|Function, cb?: Function) => false;
      dup.end = () => {};

      stub('handleResp', (err, res, body, callback) => {
        callback(error);
      });

      requestOverride =
          (reqOpts: DecorateRequestOptions, callback: (err: Error) => void) => {
            callback(error);
          };

      dup.on('error', (err) => {
        assert.strictEqual(err, error);
        done();
      });

      util.makeWritableStream(dup, {
        makeAuthenticatedRequest(request, opts) {
          opts.onAuthenticated(null);
        },
      });

      setImmediate(() => {
        fakeStream.emit('complete', {});
      });
    });

    it('should emit the response', (done) => {
      const dup = duplexify();
      // tslint:disable-next-line:no-any
      const fakeStream: any = new stream.Writable();

      fakeStream.write = () => {};

      stub('handleResp', (err, res, body, callback) => {
        callback();
      });

      requestOverride =
          (reqOpts: DecorateRequestOptions,
           callback: (err: Error|null, res: request.Response) => void) => {
            callback(null, fakeResponse);
          };

      const options = {
        // tslint:disable-next-line:no-any
        makeAuthenticatedRequest(request: DecorateRequestOptions, opts: any) {
          opts.onAuthenticated();
        },
      };

      dup.on('response', (resp) => {
        assert.strictEqual(resp, fakeResponse);
        done();
      });

      util.makeWritableStream(dup, options, util.noop);
    });

    it('should pass back the response data to the callback', (done) => {
      const dup = duplexify();
      // tslint:disable-next-line:no-any
      const fakeStream: any = new stream.Writable();
      const fakeResponse = {};

      fakeStream.write = () => {};

      stub('handleResp', (err, res, body, callback) => {
        callback(null, fakeResponse);
      });

      requestOverride =
          (reqOpts: DecorateRequestOptions, callback: () => void) => {
            callback();
          };

      const options = {
        // tslint:disable-next-line:no-any
        makeAuthenticatedRequest(request: DecorateRequestOptions, opts: any) {
          opts.onAuthenticated();
        },
      };

      util.makeWritableStream(dup, options, (data: {}) => {
        assert.strictEqual(data, fakeResponse);
        done();
      });

      setImmediate(() => {
        fakeStream.emit('complete', {});
      });
    });
  });

  describe('makeAuthenticatedRequestFactory', () => {
    const authClient = {
      getCredentials() {},
      _cachedProjectId: 'project-id'
      // tslint:disable-next-line:no-any
    } as any;

    it('should create an authClient', (done) => {
      const config = {
        test: true,
      } as MakeAuthenticatedRequestFactoryConfig;

      sandbox.stub(fakeGoogleAuth, 'GoogleAuth')
          .callsFake((config_: GoogleAuthOptions) => {
            assert.deepStrictEqual(config_, config);
            setImmediate(done);
            return authClient;
          });

      util.makeAuthenticatedRequestFactory(config);
    });

    it('should not pass projectId token to google-auth-library', (done) => {
      const config = {
        projectId: '{{projectId}}',
      };

      sandbox.stub(fakeGoogleAuth, 'GoogleAuth').callsFake(config_ => {
        assert.strictEqual(config_.projectId, undefined);
        setImmediate(done);
        return authClient;
      });

      util.makeAuthenticatedRequestFactory(config);
    });

    it('should not remove projectId from config object', (done) => {
      const config = {
        projectId: '{{projectId}}',
      };

      sandbox.stub(fakeGoogleAuth, 'GoogleAuth').callsFake(() => {
        assert.strictEqual(config.projectId, '{{projectId}}');
        setImmediate(done);
        return authClient;
      });

      util.makeAuthenticatedRequestFactory(config);
    });

    it('should return a function', () => {
      assert.equal(typeof util.makeAuthenticatedRequestFactory(), 'function');
    });

    it('should return a getCredentials method', (done) => {
      function getCredentials() {
        done();
      }

      sandbox.stub(fakeGoogleAuth, 'GoogleAuth').callsFake(() => {
        return {getCredentials};
      });

      const makeAuthenticatedRequest = util.makeAuthenticatedRequestFactory();
      makeAuthenticatedRequest.getCredentials(util.noop);
    });

    it('should return the authClient', () => {
      const authClient = {getCredentials() {}};
      sandbox.stub(fakeGoogleAuth, 'GoogleAuth').returns(authClient);
      const mar = util.makeAuthenticatedRequestFactory();
      assert.strictEqual(mar.authClient, authClient);
    });

    describe('customEndpoint (no authentication attempted)', () => {
      // tslint:disable-next-line:no-any
      let makeAuthenticatedRequest: any;
      const config = {
        customEndpoint: true,
      };
      const expectedProjectId = authClient.projectId;

      beforeEach(() => {
        makeAuthenticatedRequest = util.makeAuthenticatedRequestFactory(config);
      });

      it('should decorate the request', (done) => {
        const decoratedRequest = {};
        sandbox.stub(fakeGoogleAuth, 'GoogleAuth').returns(authClient);
        stub('decorateRequest', (reqOpts_, projectId) => {
          assert.strictEqual(reqOpts_, fakeReqOpts);
          assert.deepEqual(projectId, expectedProjectId);
          return decoratedRequest;
        });

        makeAuthenticatedRequest(fakeReqOpts, {
          onAuthenticated(
              err: Error, authenticatedReqOpts: DecorateRequestOptions) {
            assert.ifError(err);
            assert.strictEqual(authenticatedReqOpts, decoratedRequest);
            done();
          },
        });
      });

      it('should return an error while decorating', (done) => {
        const error = new Error('Error.');
        stub('decorateRequest', () => {
          throw error;
        });
        makeAuthenticatedRequest(fakeReqOpts, {
          onAuthenticated(err: Error) {
            assert.strictEqual(err, error);
            done();
          },
        });
      });

      it('should pass options back to callback', (done) => {
        const reqOpts = {a: 'b', c: 'd'};
        makeAuthenticatedRequest(reqOpts, {
          onAuthenticated(
              err: Error, authenticatedReqOpts: DecorateRequestOptions) {
            assert.ifError(err);
            assert.deepEqual(reqOpts, authenticatedReqOpts);
            done();
          },
        });
      });

      it('should not authenticate requests with a custom API', (done) => {
        const reqOpts = {a: 'b', c: 'd'};

        stub('makeRequest', rOpts => {
          assert.deepEqual(rOpts, reqOpts);
          done();
        });

        makeAuthenticatedRequest(reqOpts, assert.ifError);
      });
    });

    describe('needs authentication', () => {
      it('should pass correct args to authorizeRequest', (done) => {
        const fake = extend(true, authClient, {
          authorizeRequest: async (rOpts: AxiosRequestConfig) => {
            assert.deepEqual(rOpts, fakeReqOpts);
            done();
          }
        });
        retryRequestOverride = () => {
          return new stream.PassThrough();
        };
        sandbox.stub(fakeGoogleAuth, 'GoogleAuth').returns(fake);
        const mar = util.makeAuthenticatedRequestFactory();
        mar(fakeReqOpts);
      });

      it('should return a stream if callback is missing', () => {
        sandbox.stub(fakeGoogleAuth, 'GoogleAuth').callsFake(() => {
          return extend(true, authClient, {
            authorizeRequest: async (rOpts: AxiosRequestConfig) => {
              return rOpts;
            }
          });
        });
        retryRequestOverride = () => {
          return new stream.PassThrough();
        };
        const mar = util.makeAuthenticatedRequestFactory();
        const s = mar(fakeReqOpts);
        assert(s instanceof stream.Stream);
      });

      describe('projectId', () => {
        const reqOpts = {} as DecorateRequestOptions;

        it('should default to authClient projectId', (done) => {
          sandbox.stub(fakeGoogleAuth, 'GoogleAuth').returns(authClient);
          authClient._cachedProjectId = 'authclient-project-id';
          stub('decorateRequest', (reqOpts, projectId) => {
            assert.strictEqual(projectId, authClient._cachedProjectId);
            setImmediate(done);
          });

          const makeAuthenticatedRequest =
              util.makeAuthenticatedRequestFactory({
                customEndpoint: true,
              });

          makeAuthenticatedRequest(reqOpts, {
            onAuthenticated: assert.ifError,
          });
        });

        it('should use user-provided projectId', (done) => {
          authClient.projectId = 'authclient-project-id';

          const config = {
            customEndpoint: true,
            projectId: 'project-id',
          };

          stub('decorateRequest', (reqOpts, projectId) => {
            assert.strictEqual(projectId, config.projectId);
            setImmediate(done);
          });

          const makeAuthenticatedRequest =
              util.makeAuthenticatedRequestFactory(config);

          makeAuthenticatedRequest(reqOpts, {
            onAuthenticated: assert.ifError,
          });
        });
      });

      describe('authentication errors', () => {
        const error = new Error('🤮');

        beforeEach(() => {
          authClient.authorizeRequest = async (rOpts: AxiosRequestConfig) => {
            throw error;
          };
        });

        it('should attempt request anyway', (done) => {
          sandbox.stub(fakeGoogleAuth, 'GoogleAuth').returns(authClient);
          const makeAuthenticatedRequest =
              util.makeAuthenticatedRequestFactory();

          const correctReqOpts = {} as DecorateRequestOptions;
          const incorrectReqOpts = {} as DecorateRequestOptions;

          authClient.authorizeRequest = async (rOpts: AxiosRequestConfig) => {
            throw new Error('Could not load the default credentials');
          };

          makeAuthenticatedRequest(correctReqOpts, {
            onAuthenticated(err, reqOpts) {
              assert.ifError(err);
              assert.strictEqual(reqOpts, correctReqOpts);
              assert.notStrictEqual(reqOpts, incorrectReqOpts);
              done();
            }
          });
        });

        it('should block decorateRequest error', (done) => {
          const decorateRequestError = new Error('Error.');
          sandbox.stub(fakeGoogleAuth, 'GoogleAuth').returns(authClient);
          stub('decorateRequest', () => {
            throw decorateRequestError;
          });

          const makeAuthenticatedRequest =
              util.makeAuthenticatedRequestFactory();
          makeAuthenticatedRequest(fakeReqOpts, {
            onAuthenticated(err) {
              assert.notStrictEqual(err, decorateRequestError);
              assert.strictEqual(err, error);
              done();
            },
          });
        });

        it('should invoke the callback with error', (done) => {
          sandbox.stub(fakeGoogleAuth, 'GoogleAuth').returns(authClient);
          const mar = util.makeAuthenticatedRequestFactory();
          mar(fakeReqOpts, err => {
            assert.strictEqual(err, error);
            done();
          });
        });

        it('should exec onAuthenticated callback with error', (done) => {
          sandbox.stub(fakeGoogleAuth, 'GoogleAuth').returns(authClient);
          const mar = util.makeAuthenticatedRequestFactory();
          mar(fakeReqOpts, {
            onAuthenticated(err) {
              assert.strictEqual(err, error);
              done();
            },
          });
        });

        it('should emit an error and end the stream', (done) => {
          sandbox.stub(fakeGoogleAuth, 'GoogleAuth').returns(authClient);
          const mar = util.makeAuthenticatedRequestFactory();
          // tslint:disable-next-line:no-any
          const stream = mar(fakeReqOpts) as any;
          stream.on('error', (err: Error) => {
            assert.strictEqual(err, error);
            setImmediate(() => {
              assert.strictEqual(stream.destroyed, true);
              done();
            });
          });
        });
      });

      describe('authentication success', () => {
        const reqOpts = fakeReqOpts;
        beforeEach(() => {
          authClient.authorizeRequest = async (rOpts: AxiosRequestConfig) => {
            return reqOpts;
          };
        });

        it('should return authenticated request to callback', (done) => {
          sandbox.stub(fakeGoogleAuth, 'GoogleAuth').returns(authClient);
          stub('decorateRequest', reqOpts_ => {
            assert.deepStrictEqual(reqOpts_, reqOpts);
            return reqOpts;
          });

          const mar = util.makeAuthenticatedRequestFactory();
          mar(reqOpts, {
            onAuthenticated(err, authenticatedReqOpts) {
              assert.strictEqual(authenticatedReqOpts, reqOpts);
              done();
            },
          });
        });

        it('should make request with correct options', (done) => {
          sandbox.stub(fakeGoogleAuth, 'GoogleAuth').returns(authClient);
          const config = {keyFile: 'foo'};
          stub('decorateRequest', reqOpts_ => {
            assert.deepStrictEqual(reqOpts_, reqOpts);
            return reqOpts;
          });
          stub('makeRequest', (authenticatedReqOpts, cfg, cb) => {
            assert.deepStrictEqual(authenticatedReqOpts, reqOpts);
            assert.deepEqual(cfg, config);
            cb();
          });
          const mar = util.makeAuthenticatedRequestFactory(config);
          mar(reqOpts, done);
        });

        it('should return abort() from the active request', (done) => {
          sandbox.stub(fakeGoogleAuth, 'GoogleAuth').returns(authClient);
          const retryRequest = {
            abort: done,
          };
          sandbox.stub(util, 'makeRequest').returns(retryRequest);
          const mar = util.makeAuthenticatedRequestFactory();
          const req = mar(reqOpts, assert.ifError) as Abortable;
          req.abort();
        });

        it('should only abort() once', (done) => {
          sandbox.stub(fakeGoogleAuth, 'GoogleAuth').returns(authClient);
          const retryRequest = {
            abort: done,  // Will throw if called more than once.
          };
          stub('makeRequest', () => {
            return retryRequest;
          });

          const mar = util.makeAuthenticatedRequestFactory();
          const request = mar(reqOpts, assert.ifError) as Abortable;

          request.abort();  // done()
          request.abort();  // done()
        });

        it('should provide stream to makeRequest', (done) => {
          sandbox.stub(fakeGoogleAuth, 'GoogleAuth').returns(authClient);
          stub('makeRequest', (authenticatedReqOpts, cfg) => {
            setImmediate(() => {
              assert.strictEqual(cfg.stream, stream);
              done();
            });
          });
          const mar = util.makeAuthenticatedRequestFactory({});
          const stream = mar(reqOpts);
        });
      });
    });
  });

  describe('shouldRetryRequest', () => {
    it('should return false if there is no error', () => {
      assert.strictEqual(util.shouldRetryRequest(), false);
    });

    it('should return false from generic error', () => {
      const error = new ApiError('Generic error with no code');
      assert.strictEqual(util.shouldRetryRequest(error), false);
    });

    it('should return true with error code 429', () => {
      const error = new ApiError('429');
      error.code = 429;
      assert.strictEqual(util.shouldRetryRequest(error), true);
    });

    it('should return true with error code 500', () => {
      const error = new ApiError('500');
      error.code = 500;
      assert.strictEqual(util.shouldRetryRequest(error), true);
    });

    it('should return true with error code 502', () => {
      const error = new ApiError('502');
      error.code = 502;
      assert.strictEqual(util.shouldRetryRequest(error), true);
    });

    it('should return true with error code 503', () => {
      const error = new ApiError('503');
      error.code = 503;
      assert.strictEqual(util.shouldRetryRequest(error), true);
    });

    it('should detect rateLimitExceeded reason', () => {
      const rateLimitError = new ApiError('Rate limit error without code.');
      rateLimitError.errors = [{reason: 'rateLimitExceeded'}];
      assert.strictEqual(util.shouldRetryRequest(rateLimitError), true);
    });

    it('should detect userRateLimitExceeded reason', () => {
      const rateLimitError = new ApiError('Rate limit error without code.');
      rateLimitError.errors = [{reason: 'userRateLimitExceeded'}];
      assert.strictEqual(util.shouldRetryRequest(rateLimitError), true);
    });
  });

  describe('makeRequest', () => {
    const reqOpts = {
      method: 'GET',
    } as DecorateRequestOptions;

    function testDefaultRetryRequestConfig(done: () => void) {
      return (reqOpts_: DecorateRequestOptions, config: MakeRequestConfig) => {
        assert.strictEqual(reqOpts_, reqOpts);
        assert.equal(config.retries, 3);
        assert.strictEqual(config.request, fakeRequest);

        const error = new Error('Error.');
        stub('parseHttpRespMessage', () => {
          return {err: error};
        });
        stub('shouldRetryRequest', err => {
          assert.strictEqual(err, error);
          done();
        });

        config.shouldRetryFn!();
      };
    }

    const noRetryRequestConfig = {autoRetry: false};
    function testNoRetryRequestConfig(done: () => void) {
      return (reqOpts: DecorateRequestOptions, config: MakeRequestConfig) => {
        assert.strictEqual(config.retries, 0);
        done();
      };
    }

    const customRetryRequestConfig = {maxRetries: 10};
    function testCustomRetryRequestConfig(done: () => void) {
      return (reqOpts: DecorateRequestOptions, config: MakeRequestConfig) => {
        assert.strictEqual(config.retries, customRetryRequestConfig.maxRetries);
        done();
      };
    }

    describe('callback mode', () => {
      it('should pass the default options to retryRequest', (done) => {
        retryRequestOverride = testDefaultRetryRequestConfig(done);
        util.makeRequest(reqOpts, {}, () => {});
      });

      it('should allow turning off retries to retryRequest', (done) => {
        retryRequestOverride = testNoRetryRequestConfig(done);
        util.makeRequest(reqOpts, noRetryRequestConfig, () => {});
      });

      it('should override number of retries to retryRequest', (done) => {
        retryRequestOverride = testCustomRetryRequestConfig(done);
        util.makeRequest(reqOpts, customRetryRequestConfig, () => {});
      });

      it('should return the instance of retryRequest', () => {
        const requestInstance = {};
        retryRequestOverride = () => {
          return requestInstance;
        };
        const request = util.makeRequest(reqOpts, assert.ifError);
        assert.strictEqual(request, requestInstance);
      });
    });

    describe('stream mode', () => {
      it('should forward the specified events to the stream', (done) => {
        const requestStream = duplexify();
        const userStream = duplexify();

        const error = new Error('Error.');
        const response = {};
        const complete = {};

        userStream
            .on('error',
                (error_) => {
                  assert.strictEqual(error_, error);
                  requestStream.emit('response', response);
                })
            .on('response',
                (response_) => {
                  assert.strictEqual(response_, response);
                  requestStream.emit('complete', complete);
                })
            .on('complete', (complete_) => {
              assert.strictEqual(complete_, complete);
              done();
            });

        retryRequestOverride = () => {
          setImmediate(() => {
            requestStream.emit('error', error);
          });

          return requestStream;
        };

        util.makeRequest(reqOpts, {stream: userStream}, util.noop);
      });

      describe('GET requests', () => {
        it('should use retryRequest', (done) => {
          const userStream = duplexify();
          retryRequestOverride = (reqOpts_: DecorateRequestOptions) => {
            assert.strictEqual(reqOpts_, reqOpts);
            setImmediate(done);
            return new stream.Stream();
          };
          util.makeRequest(reqOpts, {stream: userStream}, util.noop);
        });

        it('should set the readable stream', (done) => {
          const userStream = duplexify();
          const retryRequestStream = new stream.Stream();
          retryRequestOverride = () => {
            return retryRequestStream;
          };
          userStream.setReadable = (stream) => {
            assert.strictEqual(stream, retryRequestStream);
            done();
          };
          util.makeRequest(reqOpts, {stream: userStream}, util.noop);
        });

        it('should expose the abort method from retryRequest', (done) => {
          const userStream = duplexify() as duplexify.Duplexify & Abortable;

          retryRequestOverride = () => {
            // tslint:disable-next-line:no-any
            const requestStream: any = new stream.Stream();
            requestStream.abort = done;
            return requestStream;
          };

          util.makeRequest(reqOpts, {stream: userStream}, util.noop);
          userStream.abort();
        });
      });

      describe('non-GET requests', () => {
        it('should not use retryRequest', (done) => {
          const userStream = duplexify();
          const reqOpts = {
            method: 'POST',
          } as DecorateRequestOptions;

          retryRequestOverride = done;  // will throw.
          requestOverride = (reqOpts_: DecorateRequestOptions) => {
            assert.strictEqual(reqOpts_, reqOpts);
            setImmediate(done);
            return userStream;
          };

          util.makeRequest(reqOpts, {stream: userStream}, util.noop);
        });

        it('should set the writable stream', (done) => {
          const userStream = duplexify();
          const requestStream = new stream.Stream();

          requestOverride = () => {
            return requestStream;
          };

          userStream.setWritable = (stream) => {
            assert.strictEqual(stream, requestStream);
            done();
          };

          util.makeRequest(
              {method: 'POST'} as DecorateRequestOptions, {stream: userStream},
              util.noop);
        });

        it('should expose the abort method from request', (done) => {
          const userStream = duplexify() as duplexify.Duplexify & Abortable;

          requestOverride = () => {
            const requestStream =
                duplexify() as duplexify.Duplexify & Abortable;
            requestStream.abort = done;
            return requestStream;
          };

          util.makeRequest(reqOpts, {stream: userStream}, util.noop);
          userStream.abort();
        });
      });
    });

    describe('callback mode', () => {
      it('should optionally accept config', (done) => {
        retryRequestOverride = testDefaultRetryRequestConfig(done);
        util.makeRequest(reqOpts, assert.ifError);
      });

      it('should pass the default options to retryRequest', (done) => {
        retryRequestOverride = testDefaultRetryRequestConfig(done);
        util.makeRequest(reqOpts, {}, assert.ifError);
      });

      it('should allow turning off retries to retryRequest', (done) => {
        retryRequestOverride = testNoRetryRequestConfig(done);
        util.makeRequest(reqOpts, noRetryRequestConfig, assert.ifError);
      });

      it('should override number of retries to retryRequest', (done) => {
        retryRequestOverride = testCustomRetryRequestConfig(done);
        util.makeRequest(reqOpts, customRetryRequestConfig, assert.ifError);
      });

      it('should let handleResp handle the response', (done) => {
        const error = new Error('Error.');
        const body = fakeResponse.body;

        retryRequestOverride =
            (rOpts: DecorateRequestOptions, opts: MakeRequestConfig,
             callback: request.RequestCallback) => {
              callback(error, fakeResponse, body);
            };

        stub('handleResp', (err, resp, body_) => {
          assert.strictEqual(err, error);
          assert.strictEqual(resp, fakeResponse);
          assert.strictEqual(body_, body);
          done();
        });

        util.makeRequest(fakeReqOpts, {}, assert.ifError);
      });
    });
  });

  describe('decorateRequest', () => {
    const projectId = 'not-a-project-id';
    it('should delete qs.autoPaginate', () => {
      const decoratedReqOpts = util.decorateRequest(
          {
            autoPaginate: true,
          } as DecorateRequestOptions,
          projectId);

      assert.strictEqual(decoratedReqOpts.autoPaginate, undefined);
    });

    it('should delete qs.autoPaginateVal', () => {
      const decoratedReqOpts = util.decorateRequest(
          {
            autoPaginateVal: true,
          } as DecorateRequestOptions,
          projectId);

      assert.strictEqual(decoratedReqOpts.autoPaginateVal, undefined);
    });

    it('should delete objectMode', () => {
      const decoratedReqOpts = util.decorateRequest(
          {
            objectMode: true,
          } as DecorateRequestOptions,
          projectId);

      assert.strictEqual(decoratedReqOpts.objectMode, undefined);
    });

    it('should delete qs.autoPaginate', () => {
      const decoratedReqOpts = util.decorateRequest(
          {
            qs: {
              autoPaginate: true,
            },
          } as DecorateRequestOptions,
          projectId);

      assert.strictEqual(decoratedReqOpts.qs.autoPaginate, undefined);
    });

    it('should delete qs.autoPaginateVal', () => {
      const decoratedReqOpts = util.decorateRequest(
          {
            qs: {
              autoPaginateVal: true,
            },
          } as DecorateRequestOptions,
          projectId);

      assert.strictEqual(decoratedReqOpts.qs.autoPaginateVal, undefined);
    });

    it('should delete json.autoPaginate', () => {
      const decoratedReqOpts = util.decorateRequest(
          {
            json: {
              autoPaginate: true,
            },
          } as DecorateRequestOptions,
          projectId);

      assert.strictEqual(decoratedReqOpts.json.autoPaginate, undefined);
    });

    it('should delete json.autoPaginateVal', () => {
      const decoratedReqOpts = util.decorateRequest(
          {
            json: {
              autoPaginateVal: true,
            },
          } as DecorateRequestOptions,
          projectId);

      assert.strictEqual(decoratedReqOpts.json.autoPaginateVal, undefined);
    });

    it('should replace project ID tokens for qs object', () => {
      const projectId = 'project-id';
      const reqOpts = {
        uri: 'http://',
        qs: {},
      };
      const decoratedQs = {};

      utilOverrides.replaceProjectIdToken = (qs: {}, projectId_: string) => {
        utilOverrides = {};
        assert.deepStrictEqual(qs, reqOpts.qs);
        assert.strictEqual(projectId_, projectId);
        return decoratedQs;
      };

      const decoratedRequest = util.decorateRequest(reqOpts, projectId);
      assert.deepStrictEqual(decoratedRequest.qs, decoratedQs);
    });

    it('should replace project ID tokens for json object', () => {
      const projectId = 'project-id';
      const reqOpts = {
        uri: 'http://',
        json: {},
      };
      const decoratedJson = {};

      utilOverrides.replaceProjectIdToken = (json: {}, projectId_: string) => {
        utilOverrides = {};
        assert.strictEqual(reqOpts.json, json);
        assert.strictEqual(projectId_, projectId);
        return decoratedJson;
      };

      const decoratedRequest = util.decorateRequest(reqOpts, projectId);
      assert.deepStrictEqual(decoratedRequest.json, decoratedJson);
    });

    it('should decorate the request', () => {
      const projectId = 'project-id';
      const reqOpts = {
        uri: 'http://',
      };
      const decoratedUri = 'http://decorated';

      stub('replaceProjectIdToken', (uri, projectId_) => {
        assert.strictEqual(uri, reqOpts.uri);
        assert.strictEqual(projectId_, projectId);
        return decoratedUri;
      });

      assert.deepEqual(util.decorateRequest(reqOpts, projectId), {
        uri: decoratedUri,
      });
    });
  });

  describe('projectId placeholder', () => {
    const PROJECT_ID = 'project-id';

    it('should replace any {{projectId}} it finds', () => {
      assert.deepEqual(
          util.replaceProjectIdToken(
              {
                here: 'A {{projectId}} Z',
                nested: {
                  here: 'A {{projectId}} Z',
                  nested: {
                    here: 'A {{projectId}} Z',
                  },
                },
                array: [
                  {
                    here: 'A {{projectId}} Z',
                    nested: {
                      here: 'A {{projectId}} Z',
                    },
                    nestedArray: [
                      {
                        here: 'A {{projectId}} Z',
                        nested: {
                          here: 'A {{projectId}} Z',
                        },
                      },
                    ],
                  },
                ],
              },
              PROJECT_ID),
          {
            here: 'A ' + PROJECT_ID + ' Z',
            nested: {
              here: 'A ' + PROJECT_ID + ' Z',
              nested: {
                here: 'A ' + PROJECT_ID + ' Z',
              },
            },
            array: [
              {
                here: 'A ' + PROJECT_ID + ' Z',
                nested: {
                  here: 'A ' + PROJECT_ID + ' Z',
                },
                nestedArray: [
                  {
                    here: 'A ' + PROJECT_ID + ' Z',
                    nested: {
                      here: 'A ' + PROJECT_ID + ' Z',
                    },
                  },
                ],
              },
            ],
          });
    });

    it('should replace more than one {{projectId}}', () => {
      assert.deepEqual(
          util.replaceProjectIdToken(
              {
                here: 'A {{projectId}} M {{projectId}} Z',
              },
              PROJECT_ID),
          {
            here: 'A ' + PROJECT_ID + ' M ' + PROJECT_ID + ' Z',
          });
    });

    it('should throw if it needs a projectId and cannot find it', () => {
      assert.throws(() => {
        // tslint:disable-next-line:no-any
        (util as any).replaceProjectIdToken({
          here: '{{projectId}}',
        });
      }, new RegExp(util.MissingProjectIdError.name));
    });
  });

  describe('normalizeArguments', () => {
    const fakeContext = {
      config_: {
        projectId: 'grapespaceship911',
      },
    };

    it('should return an extended object', () => {
      const local = {a: 'b'} as GlobalConfig;
      let config;

      stub('extendGlobalConfig', (globalConfig, localConfig) => {
        assert.strictEqual(globalConfig, fakeContext.config_);
        assert.strictEqual(localConfig, local);
        return fakeContext.config_;
      });

      config = util.normalizeArguments(fakeContext, local);
      assert.strictEqual(config, fakeContext.config_);
    });
  });

  describe('createLimiter', () => {
    function REQUEST_FN() {}
    const OPTIONS = {
      streamOptions: {
        highWaterMark: 8,
      },
    };

    it('should create an object stream with stream-events', (done) => {
      streamEventsOverride = (stream: stream.Readable) => {
        // tslint:disable-next-line:no-any
        assert.strictEqual((stream as any)._readableState.objectMode, true);
        setImmediate(done);
        return stream;
      };

      util.createLimiter(REQUEST_FN, OPTIONS);
    });

    it('should return a makeRequest function', () => {
      const limiter = util.createLimiter(REQUEST_FN, OPTIONS);
      assert(is.fn(limiter.makeRequest));
    });

    it('should return the created stream', () => {
      const streamEventsStream = {};

      streamEventsOverride = () => {
        return streamEventsStream;
      };

      const limiter = util.createLimiter(REQUEST_FN, OPTIONS);
      assert.strictEqual(limiter.stream, streamEventsStream);
    });

    it('should pass stream options to through', () => {
      const limiter = util.createLimiter(REQUEST_FN, OPTIONS);

      assert.strictEqual(
          // tslint:disable-next-line:no-any
          (limiter.stream as any)._readableState.highWaterMark,
          OPTIONS.streamOptions.highWaterMark);
    });

    describe('makeRequest', () => {
      it('should pass arguments to request method', (done) => {
        const args = [{}, {}];

        const limiter = util.createLimiter((obj1: {}, obj2: {}) => {
          assert.strictEqual(obj1, args[0]);
          assert.strictEqual(obj2, args[1]);
          done();
        });

        limiter.makeRequest.apply(null, args);
      });

      it('should not make more requests than the limit', (done) => {
        let callsMade = 0;
        const maxApiCalls = 10;

        const limiter = util.createLimiter(() => {
          callsMade++;
          limiter.makeRequest();
        }, {
          maxApiCalls,
        });

        limiter.makeRequest();

        limiter.stream.on('data', util.noop).on('end', () => {
          assert.strictEqual(callsMade, maxApiCalls);
          done();
        });
      });
    });
  });

  describe('isCustomType', () => {
    class PubSub {}

    class MiddleLayer {
      parent = new PubSub();
    }

    class Subscription {
      parent = new MiddleLayer();
    }

    const pubsub = new PubSub();
    const subscription = new Subscription();

    describe('Service objects', () => {
      it('should match by constructor name', () => {
        assert(util.isCustomType(pubsub, 'pubsub'));
      });

      it('should support any casing', () => {
        assert(util.isCustomType(pubsub, 'PubSub'));
      });

      it('should not match if the wrong Service', () => {
        assert(!util.isCustomType(subscription, 'BigQuery'));
      });
    });

    describe('ServiceObject objects', () => {
      it('should match by constructor names', () => {
        assert(util.isCustomType(subscription, 'pubsub'));
        assert(util.isCustomType(subscription, 'pubsub/subscription'));

        assert(util.isCustomType(subscription, 'middlelayer'));
        assert(util.isCustomType(subscription, 'middlelayer/subscription'));
      });

      it('should support any casing', () => {
        assert(util.isCustomType(subscription, 'PubSub/Subscription'));
      });

      it('should not match if the wrong ServiceObject', () => {
        assert(!util.isCustomType(subscription, 'pubsub/topic'));
      });
    });
  });

  describe('getUserAgentFromPackageJson', () => {
    it('should format a User Agent string from a package.json', () => {
      const userAgent = util.getUserAgentFromPackageJson({
        name: '@google-cloud/storage',
        version: '0.1.0',
      });

      assert.strictEqual(userAgent, 'gcloud-node-storage/0.1.0');
    });
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

      FakeClass.prototype.method_ = util.noop;
      FakeClass.prototype._method = util.noop;
      FakeClass.prototype.methodStream = util.noop;
      FakeClass.prototype.promise = util.noop;

      util.promisifyAll(FakeClass);
      const fc = new FakeClass();
    });

    it('should promisify the correct method', () => {
      assert(FakeClass.prototype.methodName.promisified_);
      assert(FakeClass.prototype.methodSingle.promisified_);
      assert(FakeClass.prototype.methodError.promisified_);

      assert.strictEqual(FakeClass.prototype.method_, util.noop);
      assert.strictEqual(FakeClass.prototype._method, util.noop);
      assert.strictEqual(FakeClass.prototype.methodStream, util.noop);
      assert.strictEqual(FakeClass.prototype.promise, util.noop);
    });

    it('should optionally except an exclude list', () => {
      function FakeClass2() {}

      FakeClass2.prototype.methodSync = util.noop;
      FakeClass2.prototype.method = () => {};

      util.promisifyAll(FakeClass2, {
        exclude: ['methodSync'],
      });

      assert.strictEqual(FakeClass2.prototype.methodSync, util.noop);
      assert(FakeClass2.prototype.method.promisified_);
    });

    it('should pass the options object to promisify', (done) => {
      const promisify = util.promisify;
      const fakeOptions = {
        a: 'a',
      } as PromisifyAllOptions;

      util.promisify = (method, options) => {
        assert.strictEqual(method, FakeClass2.prototype.method);
        assert.strictEqual(options, fakeOptions);
        util.promisify = promisify;
        done();
      };

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

      // tslint:disable-next-line:no-any
      return func().then((args: any[]) => {
        assert.deepEqual(args, fakeArgs);
      });
    });

    describe('trailing undefined arguments', () => {
      it('should not return a promise in callback mode', () => {
        // tslint:disable-next-line:no-any
        const func = util.promisify((optional: any) => {
          assert(typeof optional === 'function');
          optional(null);
        });

        const returnVal = func(() => {});
        assert.equal(returnVal, undefined);
      });

      it('should return a promise when callback omitted', (done) => {
        // tslint:disable-next-line:no-any
        const func = util.promisify((optional: any, ...args: any[]) => {
          assert.strictEqual(args.length, 0);
          assert(is.fn(optional));
          optional(null);
        });

        func(undefined, undefined).then(() => {
          done();
        });
      });

      it('should not mistake non-function args for callbacks', (done) => {
        const func =
            // tslint:disable-next-line:no-any
            util.promisify((foo: any, optional: any, ...args: any[]) => {
              assert.strictEqual(args.length, 0);
              assert(is.fn(optional));
              optional(null);
            });

        func('foo').then(() => {
          done();
        });
      });
    });
  });

  describe('privatize', () => {
    it('should set value', () => {
      // tslint:disable-next-line:no-any
      const obj: any = {};
      util.privatize(obj, 'value', true);
      assert.strictEqual(obj.value, true);
    });

    it('should allow values to be overwritten', () => {
      // tslint:disable-next-line:no-any
      const obj: any = {};
      util.privatize(obj, 'value', true);
      obj.value = false;
      assert.strictEqual(obj.value, false);
    });
  });
});
