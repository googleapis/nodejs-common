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
import * as googleAuth from 'google-auto-auth';
import * as is from 'is';
import * as proxyquire from 'proxyquire';
import * as request from 'request';
import * as retryRequest from 'retry-request';
import * as stream from 'stream';
import * as streamEvents from 'stream-events';
let duplexify;

export class GoogleError extends Error {
  code?: number;
  errors?: Array<{ reason: string }>;
}

let googleAutoAuthOverride;
function fakeGoogleAutoAuth() {
  return (googleAutoAuthOverride || googleAuth).apply(null, arguments);
}

let REQUEST_DEFAULT_CONF;
let requestOverride;
function fakeRequest() {
  return (requestOverride || request).apply(null, arguments);
}
(fakeRequest as any).defaults = function(defaultConfiguration) {
  // Ignore the default values, so we don't have to test for them in every API
  // call.
  REQUEST_DEFAULT_CONF = defaultConfiguration;
  return fakeRequest;
};

let retryRequestOverride;
function fakeRetryRequest() {
  return (retryRequestOverride || retryRequest).apply(null, arguments);
}

let streamEventsOverride;
function fakeStreamEvents() {
  return (streamEventsOverride || streamEvents).apply(null, arguments);
}

describe('common/util', function() {
  let util;
  let utilOverrides: any = {};

  before(function() {
    util = proxyquire('../src/util', {
      'google-auto-auth': fakeGoogleAutoAuth,
      request: fakeRequest,
      'retry-request': fakeRetryRequest,
      'stream-events': fakeStreamEvents,
    });
    const utilCached = extend(true, {}, util);

    // Override all util methods, allowing them to be mocked. Overrides are
    // removed before each test.
    Object.keys(util).forEach(function(utilMethod) {
      if (typeof util[utilMethod] !== 'function') {
        return;
      }

      util[utilMethod] = function() {
        return (utilOverrides[utilMethod] || utilCached[utilMethod]).apply(
          this,
          arguments
        );
      };
    });

    duplexify = require('duplexify');
  });

  beforeEach(function() {
    googleAutoAuthOverride = null;
    requestOverride = null;
    retryRequestOverride = null;
    streamEventsOverride = null;
    utilOverrides = {};
  });

  it('should have set correct defaults on Request', function() {
    assert.deepEqual(REQUEST_DEFAULT_CONF, {
      timeout: 60000,
      gzip: true,
      forever: true,
      pool: {
        maxSockets: Infinity,
      },
    });
  });

  it('should export an error for module instantiation errors', function() {
    const errorMessage = `Sorry, we cannot connect to Cloud Services without a project
    ID. You may specify one with an environment variable named
    "GOOGLE_CLOUD_PROJECT".`.replace(/ +/g, ' ');

    const missingProjectIdError = new util.MissingProjectIdError();
    assert.strictEqual(missingProjectIdError.message, errorMessage);
  });

  describe('ApiError', function() {
    it('should build correct ApiError', function() {
      const error = {
        errors: [new Error(), new Error()],
        code: 100,
        message: 'Uh oh',
        response: {a: 'b', c: 'd'},
      };

      const apiError = new util.ApiError(error);

      assert.strictEqual(apiError.errors, error.errors);
      assert.strictEqual(apiError.code, error.code);
      assert.strictEqual(apiError.message, error.message);
      assert.strictEqual(apiError.response, error.response);
    });

    it('should detect ApiError message from response body', function() {
      const errorMessage = 'API error message';

      const error = {
        errors: [new Error(errorMessage)],
        code: 100,
        response: {a: 'b', c: 'd'},
      };

      const apiError = new util.ApiError(error);

      assert.strictEqual(apiError.message, errorMessage);
    });

    it('should parse the response body for errors', function() {
      const error = new Error('Error.');
      const errors = [error, error];

      const errorBody = {
        response: {
          body: JSON.stringify({
            error: {
              errors,
            },
          }),
        },
      };

      const apiError = new util.ApiError(errorBody);

      assert.deepEqual(apiError.errors, errors);
    });

    it('should append the custom error message', function() {
      const errorMessage = 'API error message';
      const customErrorMessage = 'Custom error message';
      const expectedErrorMessage = [customErrorMessage, errorMessage].join(
        ' - '
      );

      const error = {
        errors: [new Error(errorMessage)],
        code: 100,
        response: {a: 'b', c: 'd'},
        message: customErrorMessage,
      };

      const apiError = new util.ApiError(error);

      assert.strictEqual(apiError.message, expectedErrorMessage);
    });

    it('should parse and append the decoded response body', function() {
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
        },
      };

      const apiError = new util.ApiError(error);

      assert.strictEqual(apiError.message, expectedErrorMessage);
    });

    it('should use default message if there are no errors', function() {
      const expectedErrorMessage = 'Error during request.';

      const error = {
        code: 100,
        response: {a: 'b', c: 'd'},
      };

      const apiError = new util.ApiError(error);

      assert.strictEqual(apiError.message, expectedErrorMessage);
    });

    it('should use default message if too many errors', function() {
      const expectedErrorMessage = 'Error during request.';

      const error = {
        errors: [new Error(), new Error()],
        code: 100,
        response: {a: 'b', c: 'd'},
      };

      const apiError = new util.ApiError(error);

      assert.strictEqual(apiError.message, expectedErrorMessage);
    });

    it('should filter out duplicate errors', function() {
      const expectedErrorMessage = 'Error during request.';

      const error = {
        code: 100,
        message: expectedErrorMessage,
        response: {
          body: expectedErrorMessage,
        },
      };

      const apiError = new util.ApiError(error);

      assert.strictEqual(apiError.message, expectedErrorMessage);
    });
  });

  describe('PartialFailureError', function() {
    it('should build correct PartialFailureError', function() {
      const error = {
        errors: [new Error(), new Error()],
        response: {a: 'b', c: 'd'},
        message: 'Partial failure occurred',
      };

      const partialFailureError = new util.PartialFailureError(error);

      assert.strictEqual(partialFailureError.errors, error.errors);
      assert.strictEqual(partialFailureError.response, error.response);
      assert.strictEqual(partialFailureError.message, error.message);
    });

    it('should use default message', function() {
      const expectedErrorMessage = 'A failure occurred during this request.';

      const error = {
        errors: [],
        response: {a: 'b', c: 'd'},
      };

      const partialFailureError = new util.PartialFailureError(error);

      assert.strictEqual(partialFailureError.message, expectedErrorMessage);
    });
  });

  describe('extendGlobalConfig', function() {
    it('should favor `keyFilename` when `credentials` is global', function() {
      const globalConfig = {credentials: {}};
      const options = util.extendGlobalConfig(globalConfig, {
        keyFilename: 'key.json',
      });
      assert.strictEqual(options.credentials, undefined);
    });

    it('should favor `credentials` when `keyFilename` is global', function() {
      const globalConfig = {keyFilename: 'key.json'};
      const options = util.extendGlobalConfig(globalConfig, {credentials: {}});
      assert.strictEqual(options.keyFilename, undefined);
    });

    it('should honor the GCLOUD_PROJECT environment variable', function() {
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

    it('should not modify original object', function() {
      const globalConfig = {keyFilename: 'key.json'};
      util.extendGlobalConfig(globalConfig, {credentials: {}});
      assert.deepEqual(globalConfig, {keyFilename: 'key.json'});
    });

    it('should link the original interceptors_', function() {
      const interceptors = [];
      const globalConfig = {interceptors_: interceptors};
      util.extendGlobalConfig(globalConfig, {});
      assert.strictEqual(globalConfig.interceptors_, interceptors);
    });
  });

  describe('handleResp', function() {
    it('should handle errors', function(done) {
      const error = new Error('Error.');

      util.handleResp(error, {}, null, function(err) {
        assert.strictEqual(err, error);
        done();
      });
    });

    it('uses a no-op callback if none is sent', function() {
      util.handleResp(undefined, {}, '');
    });

    it('should parse response', function(done) {
      const err = {a: 'b', c: 'd'};
      const resp = {a: 'b', c: 'd'};
      const body = {a: 'b', c: 'd'};

      const returnedErr = {a: 'b', c: 'd'};
      const returnedBody = {a: 'b', c: 'd'};
      const returnedResp = {a: 'b', c: 'd'};

      utilOverrides.parseHttpRespMessage = function(resp_) {
        assert.strictEqual(resp_, resp);

        return {
          resp: returnedResp,
        };
      };

      utilOverrides.parseHttpRespBody = function(body_) {
        assert.strictEqual(body_, body);

        return {
          body: returnedBody,
        };
      };

      util.handleResp(err, resp, body, function(err, body, resp) {
        assert.deepEqual(err, returnedErr);
        assert.deepEqual(body, returnedBody);
        assert.deepEqual(resp, returnedResp);
        done();
      });
    });

    it('should parse response for error', function(done) {
      const error = new Error('Error.');

      utilOverrides.parseHttpRespMessage = function() {
        return {err: error};
      };

      util.handleResp(null, {}, {}, function(err) {
        assert.deepEqual(err, error);
        done();
      });
    });

    it('should parse body for error', function(done) {
      const error = new Error('Error.');

      utilOverrides.parseHttpRespBody = function() {
        return {err: error};
      };

      util.handleResp(null, {}, {}, function(err) {
        assert.deepEqual(err, error);
        done();
      });
    });

    it('should not parse undefined response', function(done) {
      utilOverrides.parseHttpRespMessage = function() {
        done(); // Will throw.
      };

      util.handleResp(null, null, null, done);
    });

    it('should not parse undefined body', function(done) {
      utilOverrides.parseHttpRespBody = function() {
        done(); // Will throw.
      };

      util.handleResp(null, null, null, done);
    });
  });

  describe('parseHttpRespMessage', function() {
    it('should build ApiError with non-200 status and message', function(done) {
      const httpRespMessage = {statusCode: 400, statusMessage: 'Not Good'};

      utilOverrides.ApiError = function(error_) {
        assert.strictEqual(error_.code, httpRespMessage.statusCode);
        assert.strictEqual(error_.message, httpRespMessage.statusMessage);
        assert.strictEqual(error_.response, httpRespMessage);

        done();
      };

      util.parseHttpRespMessage(httpRespMessage);
    });

    it('should return the original response message', function() {
      const httpRespMessage = {};
      const parsedHttpRespMessage = util.parseHttpRespMessage(httpRespMessage);
      assert.strictEqual(parsedHttpRespMessage.resp, httpRespMessage);
    });
  });

  describe('parseHttpRespBody', function() {
    it('should detect body errors', function() {
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

      assert.deepEqual(parsedHttpRespBody.err.errors, apiErr.errors);
      assert.strictEqual(parsedHttpRespBody.err.code, apiErr.code);
      assert.deepEqual(parsedHttpRespBody.err.message, expectedErrorMessage);
    });

    it('should try to parse JSON if body is string', function() {
      const httpRespBody = '{ "foo": "bar" }';
      const parsedHttpRespBody = util.parseHttpRespBody(httpRespBody);

      assert.strictEqual(parsedHttpRespBody.body.foo, 'bar');
    });

    it('should return the original body', function() {
      const httpRespBody = {};
      const parsedHttpRespBody = util.parseHttpRespBody(httpRespBody);

      assert.strictEqual(parsedHttpRespBody.body, httpRespBody);
    });
  });

  describe('makeWritableStream', function() {
    it('should use defaults', function(done) {
      const dup = duplexify();
      const metadata = {a: 'b', c: 'd'};

      util.makeWritableStream(dup, {
        metadata,
        makeAuthenticatedRequest(request) {
          assert.equal(request.method, 'POST');
          assert.equal(request.qs.uploadType, 'multipart');

          assert.strictEqual(Array.isArray(request.multipart), true);

          const mp = request.multipart;

          assert.strictEqual(mp[0]['Content-Type'], 'application/json');
          assert.strictEqual(mp[0].body, JSON.stringify(metadata));

          assert.strictEqual(mp[1]['Content-Type'], 'application/octet-stream');
          // (is a writable stream:)
          assert.strictEqual(typeof mp[1].body._writableState, 'object');

          done();
        },
      });
    });

    it('should allow overriding defaults', function(done) {
      const dup = duplexify();

      const req = {
        method: 'PUT',
        qs: {
          uploadType: 'media',
        },
        something: 'else',
      };

      util.makeWritableStream(dup, {
        metadata: {
          contentType: 'application/json',
        },
        makeAuthenticatedRequest(request) {
          assert.equal(request.method, req.method);
          assert.deepEqual(request.qs, req.qs);
          assert.equal(request.something, req.something);

          const mp = request.multipart;
          assert.strictEqual(mp[1]['Content-Type'], 'application/json');

          done();
        },

        request: req,
      });
    });

    it('should emit an error', function(done) {
      const error = new Error('Error.');

      const ws = duplexify();
      ws.on('error', function(err) {
        assert.equal(err, error);
        done();
      });

      util.makeWritableStream(ws, {
        makeAuthenticatedRequest(request, opts) {
          opts.onAuthenticated(error);
        },
      });
    });

    it('should set the writable stream', function(done) {
      const dup = duplexify();

      dup.setWritable = function() {
        done();
      };

      util.makeWritableStream(dup, {
        makeAuthenticatedRequest() {},
      });
    });

    it('should emit an error if the request fails', function(done) {
      const dup = duplexify();
      const fakeStream: any = new stream.Writable();
      const error = new Error('Error.');

      fakeStream.write = function() {};
      dup.end = function() {};

      utilOverrides.handleResp = function(err, res, body, callback) {
        callback(error);
      };

      requestOverride = function(reqOpts, callback) {
        callback(error);
      };

      dup.on('error', function(err) {
        assert.strictEqual(err, error);
        done();
      });

      util.makeWritableStream(dup, {
        makeAuthenticatedRequest(request, opts) {
          opts.onAuthenticated();
        },
      });

      setImmediate(function() {
        fakeStream.emit('complete', {});
      });
    });

    it('should emit the response', function(done) {
      const dup = duplexify();
      const fakeStream: any = new stream.Writable();
      const fakeResponse = {};

      fakeStream.write = function() {};

      utilOverrides.handleResp = function(err, res, body, callback) {
        callback();
      };

      requestOverride = function(reqOpts, callback) {
        callback(null, fakeResponse);
      };

      const options = {
        makeAuthenticatedRequest(request, opts) {
          opts.onAuthenticated();
        },
      };

      dup.on('response', function(resp) {
        assert.strictEqual(resp, fakeResponse);
        done();
      });

      util.makeWritableStream(dup, options, util.noop);
    });

    it('should pass back the response data to the callback', function(done) {
      const dup = duplexify();
      const fakeStream: any = new stream.Writable();
      const fakeResponse = {};

      fakeStream.write = function() {};

      utilOverrides.handleResp = function(err, res, body, callback) {
        callback(null, fakeResponse);
      };

      requestOverride = function(reqOpts, callback) {
        callback();
      };

      const options = {
        makeAuthenticatedRequest(request, opts) {
          opts.onAuthenticated();
        },
      };

      util.makeWritableStream(dup, options, function(data) {
        assert.strictEqual(data, fakeResponse);
        done();
      });

      setImmediate(function() {
        fakeStream.emit('complete', {});
      });
    });
  });

  describe('makeAuthenticatedRequestFactory', function() {
    const authClient: any = {
      getCredentials() {},
      projectId: 'project-id',
    };

    beforeEach(function() {
      googleAutoAuthOverride = function() {
        return authClient;
      };
    });

    it('should create an authClient', function(done) {
      const config = {
        test: true,
      };

      googleAutoAuthOverride = function(config_) {
        assert.deepStrictEqual(config_, config);
        setImmediate(done);
        return authClient;
      };

      util.makeAuthenticatedRequestFactory(config);
    });

    it('should not pass projectId token to google-auto-auth', function(done) {
      const config = {
        projectId: '{{projectId}}',
      };

      googleAutoAuthOverride = function(config_) {
        assert.strictEqual(config_.projectId, undefined);
        setImmediate(done);
        return authClient;
      };

      util.makeAuthenticatedRequestFactory(config);
    });

    it('should not remove projectId from config object', function(done) {
      const config = {
        projectId: '{{projectId}}',
      };

      googleAutoAuthOverride = function() {
        assert.strictEqual(config.projectId, '{{projectId}}');
        setImmediate(done);
        return authClient;
      };

      util.makeAuthenticatedRequestFactory(config);
    });

    it('should return a function', function() {
      assert.equal(typeof util.makeAuthenticatedRequestFactory(), 'function');
    });

    it('should return a getCredentials method', function(done) {
      function getCredentials() {
        done();
      }

      googleAutoAuthOverride = function() {
        return {getCredentials};
      };

      const makeAuthenticatedRequest = util.makeAuthenticatedRequestFactory();
      makeAuthenticatedRequest.getCredentials();
    });

    it('should return the authClient', function() {
      const authClient = {getCredentials() {}};

      googleAutoAuthOverride = function() {
        return authClient;
      };

      const makeAuthenticatedRequest = util.makeAuthenticatedRequestFactory();
      assert.strictEqual(makeAuthenticatedRequest.authClient, authClient);
    });

    describe('customEndpoint (no authentication attempted)', function() {
      let makeAuthenticatedRequest;
      const config = {
        customEndpoint: true,
      };
      const expectedProjectId = authClient.projectId;

      beforeEach(function() {
        makeAuthenticatedRequest = util.makeAuthenticatedRequestFactory(config);
      });

      it('should decorate the request', function(done) {
        const reqOpts = {a: 'b', c: 'd'};
        const decoratedRequest = {};

        utilOverrides.decorateRequest = function(reqOpts_, projectId) {
          assert.strictEqual(reqOpts_, reqOpts);
          assert.deepEqual(projectId, expectedProjectId);
          return decoratedRequest;
        };

        makeAuthenticatedRequest(reqOpts, {
          onAuthenticated(err, authenticatedReqOpts) {
            assert.ifError(err);
            assert.strictEqual(authenticatedReqOpts, decoratedRequest);
            done();
          },
        });
      });

      it('should return an error while decorating', function(done) {
        const error = new Error('Error.');
        const reqOpts = {a: 'b', c: 'd'};

        utilOverrides.decorateRequest = function() {
          throw error;
        };

        makeAuthenticatedRequest(reqOpts, {
          onAuthenticated(err) {
            assert.strictEqual(err, error);
            done();
          },
        });
      });

      it('should pass options back to callback', function(done) {
        const reqOpts = {a: 'b', c: 'd'};

        makeAuthenticatedRequest(reqOpts, {
          onAuthenticated(err, authenticatedReqOpts) {
            assert.ifError(err);
            assert.deepEqual(reqOpts, authenticatedReqOpts);
            done();
          },
        });
      });

      it('should not authenticate requests with a custom API', function(done) {
        const reqOpts = {a: 'b', c: 'd'};

        utilOverrides.makeRequest = function(rOpts) {
          assert.deepEqual(rOpts, reqOpts);
          done();
        };

        makeAuthenticatedRequest(reqOpts, assert.ifError);
      });
    });

    describe('needs authentication', function() {
      it('should pass correct args to authorizeRequest', function(done) {
        const reqOpts = {e: 'f', g: 'h'};

        authClient.authorizeRequest = function(rOpts) {
          assert.deepEqual(rOpts, reqOpts);
          done();
        };

        const makeAuthenticatedRequest = util.makeAuthenticatedRequestFactory();
        makeAuthenticatedRequest(reqOpts, {});
      });

      it('should return a stream if callback is missing', function() {
        authClient.authorizeRequest = function() {};

        const makeAuthenticatedRequest = util.makeAuthenticatedRequestFactory({});
        assert(makeAuthenticatedRequest({}) instanceof stream.Stream);
      });

      describe('projectId', function() {
        it('should default to authClient projectId', function(done) {
          authClient.projectId = 'authclient-project-id';

          utilOverrides.decorateRequest = function(reqOpts, projectId) {
            assert.strictEqual(projectId, authClient.projectId);
            setImmediate(done);
          };

          const makeAuthenticatedRequest = util.makeAuthenticatedRequestFactory({
            customEndpoint: true,
          });

          makeAuthenticatedRequest(
            {},
            {
              onAuthenticated: assert.ifError,
            }
          );
        });

        it('should use user-provided projectId', function(done) {
          authClient.projectId = 'authclient-project-id';

          const config = {
            customEndpoint: true,
            projectId: 'project-id',
          };

          utilOverrides.decorateRequest = function(reqOpts, projectId) {
            assert.strictEqual(projectId, config.projectId);
            setImmediate(done);
          };

          const makeAuthenticatedRequest = util.makeAuthenticatedRequestFactory(
            config
          );

          makeAuthenticatedRequest(
            {},
            {
              onAuthenticated: assert.ifError,
            }
          );
        });
      });

      describe('authentication errors', function() {
        const error = new Error('Error.');

        beforeEach(function() {
          authClient.authorizeRequest = function(rOpts, callback) {
            setImmediate(function() {
              callback(error);
            });
          };
        });

        it('should attempt request anyway', function(done) {
          const makeAuthenticatedRequest = util.makeAuthenticatedRequestFactory();

          const correctReqOpts = {};
          const incorrectReqOpts = {};

          authClient.authorizeRequest = function(rOpts, callback) {
            const error = new Error('Could not load the default credentials');
            callback(error, incorrectReqOpts);
          };

          makeAuthenticatedRequest(correctReqOpts, {
            onAuthenticated(err, reqOpts) {
              assert.ifError(err);

              assert.strictEqual(reqOpts, correctReqOpts);
              assert.notStrictEqual(reqOpts, incorrectReqOpts);

              done();
            },
          });
        });

        it('should block decorateRequest error', function(done) {
          const decorateRequestError = new Error('Error.');
          utilOverrides.decorateRequest = function() {
            throw decorateRequestError;
          };

          const makeAuthenticatedRequest = util.makeAuthenticatedRequestFactory();
          makeAuthenticatedRequest(
            {},
            {
              onAuthenticated(err) {
                assert.notStrictEqual(err, decorateRequestError);
                assert.strictEqual(err, error);
                done();
              },
            }
          );
        });

        it('should invoke the callback with error', function(done) {
          const makeAuthenticatedRequest = util.makeAuthenticatedRequestFactory();
          makeAuthenticatedRequest({}, function(err) {
            assert.strictEqual(err, error);
            done();
          });
        });

        it('should exec onAuthenticated callback with error', function(done) {
          const makeAuthenticatedRequest = util.makeAuthenticatedRequestFactory();
          makeAuthenticatedRequest(
            {},
            {
              onAuthenticated(err) {
                assert.strictEqual(err, error);
                done();
              },
            }
          );
        });

        it('should emit an error and end the stream', function(done) {
          const makeAuthenticatedRequest = util.makeAuthenticatedRequestFactory();
          makeAuthenticatedRequest({}).on('error', function(err) {
            assert.strictEqual(err, error);

            const stream = this;
            setImmediate(function() {
              assert.strictEqual(stream.destroyed, true);
              done();
            });
          });
        });
      });

      describe('authentication success', function() {
        const reqOpts = {a: 'b', c: 'd'};

        beforeEach(function() {
          authClient.authorizeRequest = function(rOpts, callback) {
            callback(null, rOpts);
          };
        });

        it('should return authenticated request to callback', function(done) {
          utilOverrides.decorateRequest = function(reqOpts_) {
            assert.strictEqual(reqOpts_, reqOpts);
            return reqOpts;
          };

          const makeAuthenticatedRequest = util.makeAuthenticatedRequestFactory();
          makeAuthenticatedRequest(reqOpts, {
            onAuthenticated(err, authenticatedReqOpts) {
              assert.strictEqual(authenticatedReqOpts, reqOpts);
              done();
            },
          });
        });

        it('should make request with correct options', function(done) {
          const config = {a: 'b', c: 'd'};

          utilOverrides.decorateRequest = function(reqOpts_) {
            assert.strictEqual(reqOpts_, reqOpts);
            return reqOpts;
          };

          utilOverrides.makeRequest = function(authenticatedReqOpts, cfg, cb) {
            assert.strictEqual(authenticatedReqOpts, reqOpts);
            assert.deepEqual(cfg, config);
            cb();
          };

          const makeAuthenticatedRequest = util.makeAuthenticatedRequestFactory(
            config
          );
          makeAuthenticatedRequest(reqOpts, done);
        });

        it('should return abort() from the active request', function(done) {
          const retryRequest = {
            abort: done,
          };

          utilOverrides.makeRequest = function() {
            return retryRequest;
          };

          const makeAuthenticatedRequest = util.makeAuthenticatedRequestFactory();
          makeAuthenticatedRequest(reqOpts, assert.ifError).abort();
        });

        it('should only abort() once', function(done) {
          const retryRequest = {
            abort: done, // Will throw if called more than once.
          };

          utilOverrides.makeRequest = function() {
            return retryRequest;
          };

          const makeAuthenticatedRequest = util.makeAuthenticatedRequestFactory();
          const request = makeAuthenticatedRequest(reqOpts, assert.ifError);

          request.abort(); // done()
          request.abort(); // done()
        });

        it('should provide stream to makeRequest', function(done) {
          let stream;

          utilOverrides.makeRequest = function(authenticatedReqOpts, cfg) {
            setImmediate(function() {
              assert.strictEqual(cfg.stream, stream);
              done();
            });
          };

          const makeAuthenticatedRequest = util.makeAuthenticatedRequestFactory(
            {}
          );
          stream = makeAuthenticatedRequest(reqOpts);
        });
      });
    });
  });

  describe('shouldRetryRequest', function() {
    it('should return false if there is no error', function() {
      assert.strictEqual(util.shouldRetryRequest(), false);
    });

    it('should return false from generic error', function() {
      const error = new Error('Generic error with no code');

      assert.strictEqual(util.shouldRetryRequest(error), false);
    });

    it('should return true with error code 429', function() {
      const error = new GoogleError('429');
      error.code = 429;

      assert.strictEqual(util.shouldRetryRequest(error), true);
    });

    it('should return true with error code 500', function() {
      const error = new GoogleError('500');
      error.code = 500;

      assert.strictEqual(util.shouldRetryRequest(error), true);
    });

    it('should return true with error code 502', function() {
      const error = new GoogleError('502');
      error.code = 502;

      assert.strictEqual(util.shouldRetryRequest(error), true);
    });

    it('should return true with error code 503', function() {
      const error = new GoogleError('503');
      error.code = 503;

      assert.strictEqual(util.shouldRetryRequest(error), true);
    });

    it('should detect rateLimitExceeded reason', function() {
      const rateLimitError = new GoogleError('Rate limit error without code.');
      rateLimitError.errors = [{reason: 'rateLimitExceeded'}];

      assert.strictEqual(util.shouldRetryRequest(rateLimitError), true);
    });

    it('should detect userRateLimitExceeded reason', function() {
      const rateLimitError = new GoogleError('Rate limit error without code.');
      rateLimitError.errors = [{reason: 'userRateLimitExceeded'}];

      assert.strictEqual(util.shouldRetryRequest(rateLimitError), true);
    });
  });

  describe('makeRequest', function() {
    const reqOpts = {
      method: 'GET',
    };

    function testDefaultRetryRequestConfig(done) {
      return function(reqOpts_, config) {
        assert.strictEqual(reqOpts_, reqOpts);
        assert.equal(config.retries, 3);
        assert.strictEqual(config.request, fakeRequest);

        const error = new Error('Error.');
        utilOverrides.parseHttpRespMessage = function() {
          return {err: error};
        };
        utilOverrides.shouldRetryRequest = function(err) {
          assert.strictEqual(err, error);
          done();
        };

        config.shouldRetryFn();
      };
    }

    const noRetryRequestConfig = {autoRetry: false};
    function testNoRetryRequestConfig(done) {
      return function(reqOpts, config) {
        assert.strictEqual(config.retries, 0);
        done();
      };
    }

    const customRetryRequestConfig = {maxRetries: 10};
    function testCustomRetryRequestConfig(done) {
      return function(reqOpts, config) {
        assert.strictEqual(config.retries, customRetryRequestConfig.maxRetries);
        done();
      };
    }

    describe('callback mode', function() {
      it('should pass the default options to retryRequest', function(done) {
        retryRequestOverride = testDefaultRetryRequestConfig(done);
        util.makeRequest(reqOpts, {});
      });

      it('should allow turning off retries to retryRequest', function(done) {
        retryRequestOverride = testNoRetryRequestConfig(done);
        util.makeRequest(reqOpts, noRetryRequestConfig);
      });

      it('should override number of retries to retryRequest', function(done) {
        retryRequestOverride = testCustomRetryRequestConfig(done);
        util.makeRequest(reqOpts, customRetryRequestConfig);
      });

      it('should return the instance of retryRequest', function() {
        const requestInstance = {};
        retryRequestOverride = function() {
          return requestInstance;
        };
        const request = util.makeRequest(reqOpts, assert.ifError);
        assert.strictEqual(request, requestInstance);
      });
    });

    describe('stream mode', function() {
      it('should forward the specified events to the stream', function(done) {
        const requestStream = duplexify();
        const userStream = duplexify();

        const error = new Error('Error.');
        const response = {};
        const complete = {};

        userStream
          .on('error', function(error_) {
            assert.strictEqual(error_, error);
            requestStream.emit('response', response);
          })
          .on('response', function(response_) {
            assert.strictEqual(response_, response);
            requestStream.emit('complete', complete);
          })
          .on('complete', function(complete_) {
            assert.strictEqual(complete_, complete);
            done();
          });

        retryRequestOverride = function() {
          setImmediate(function() {
            requestStream.emit('error', error);
          });

          return requestStream;
        };

        util.makeRequest(reqOpts, {stream: userStream});
      });

      describe('GET requests', function() {
        it('should use retryRequest', function(done) {
          const userStream = duplexify();

          retryRequestOverride = function(reqOpts_) {
            assert.strictEqual(reqOpts_, reqOpts);
            setImmediate(done);
            return new stream.Stream();
          };

          util.makeRequest(reqOpts, {stream: userStream});
        });

        it('should set the readable stream', function(done) {
          const userStream = duplexify();
          const retryRequestStream = new stream.Stream();

          retryRequestOverride = function() {
            return retryRequestStream;
          };

          userStream.setReadable = function(stream) {
            assert.strictEqual(stream, retryRequestStream);
            done();
          };

          util.makeRequest(reqOpts, {stream: userStream});
        });

        it('should expose the abort method from retryRequest', function(done) {
          const userStream = duplexify();

          retryRequestOverride = function() {
            const requestStream: any = new stream.Stream();
            requestStream.abort = done;
            return requestStream;
          };

          util.makeRequest(reqOpts, {stream: userStream});
          userStream.abort();
        });
      });

      describe('non-GET requests', function() {
        it('should not use retryRequest', function(done) {
          const userStream = duplexify();
          const reqOpts = {
            method: 'POST',
          };

          retryRequestOverride = done; // will throw.
          requestOverride = function(reqOpts_) {
            assert.strictEqual(reqOpts_, reqOpts);
            setImmediate(done);
            return userStream;
          };

          util.makeRequest(reqOpts, {stream: userStream});
        });

        it('should set the writable stream', function(done) {
          const userStream = duplexify();
          const requestStream = new stream.Stream();

          requestOverride = function() {
            return requestStream;
          };

          userStream.setWritable = function(stream) {
            assert.strictEqual(stream, requestStream);
            done();
          };

          util.makeRequest({method: 'POST'}, {stream: userStream});
        });

        it('should expose the abort method from request', function(done) {
          const userStream = duplexify();

          requestOverride = function() {
            const requestStream = duplexify();
            requestStream.abort = done;
            return requestStream;
          };

          util.makeRequest(reqOpts, {stream: userStream});
          userStream.abort();
        });
      });
    });

    describe('callback mode', function() {
      it('should optionally accept config', function(done) {
        retryRequestOverride = testDefaultRetryRequestConfig(done);
        util.makeRequest(reqOpts, assert.ifError);
      });

      it('should pass the default options to retryRequest', function(done) {
        retryRequestOverride = testDefaultRetryRequestConfig(done);
        util.makeRequest(reqOpts, {}, assert.ifError);
      });

      it('should allow turning off retries to retryRequest', function(done) {
        retryRequestOverride = testNoRetryRequestConfig(done);
        util.makeRequest(reqOpts, noRetryRequestConfig, assert.ifError);
      });

      it('should override number of retries to retryRequest', function(done) {
        retryRequestOverride = testCustomRetryRequestConfig(done);
        util.makeRequest(reqOpts, customRetryRequestConfig, assert.ifError);
      });

      it('should let handleResp handle the response', function(done) {
        const error = new Error('Error.');
        const response = {a: 'b', c: 'd'};
        const body = response.a;

        retryRequestOverride = function(rOpts, opts, callback) {
          callback(error, response, body);
        };

        utilOverrides.handleResp = function(err, resp, body_) {
          assert.strictEqual(err, error);
          assert.strictEqual(resp, response);
          assert.strictEqual(body_, body);
          done();
        };

        util.makeRequest({}, {}, assert.ifError);
      });
    });
  });

  describe('decorateRequest', function() {
    it('should delete qs.autoPaginate', function() {
      const decoratedReqOpts = util.decorateRequest({
        autoPaginate: true,
      });

      assert.strictEqual(decoratedReqOpts.autoPaginate, undefined);
    });

    it('should delete qs.autoPaginateVal', function() {
      const decoratedReqOpts = util.decorateRequest({
        autoPaginateVal: true,
      });

      assert.strictEqual(decoratedReqOpts.autoPaginateVal, undefined);
    });

    it('should delete objectMode', function() {
      const decoratedReqOpts = util.decorateRequest({
        objectMode: true,
      });

      assert.strictEqual(decoratedReqOpts.objectMode, undefined);
    });

    it('should delete qs.autoPaginate', function() {
      const decoratedReqOpts = util.decorateRequest({
        qs: {
          autoPaginate: true,
        },
      });

      assert.strictEqual(decoratedReqOpts.qs.autoPaginate, undefined);
    });

    it('should delete qs.autoPaginateVal', function() {
      const decoratedReqOpts = util.decorateRequest({
        qs: {
          autoPaginateVal: true,
        },
      });

      assert.strictEqual(decoratedReqOpts.qs.autoPaginateVal, undefined);
    });

    it('should delete json.autoPaginate', function() {
      const decoratedReqOpts = util.decorateRequest({
        json: {
          autoPaginate: true,
        },
      });

      assert.strictEqual(decoratedReqOpts.json.autoPaginate, undefined);
    });

    it('should delete json.autoPaginateVal', function() {
      const decoratedReqOpts = util.decorateRequest({
        json: {
          autoPaginateVal: true,
        },
      });

      assert.strictEqual(decoratedReqOpts.json.autoPaginateVal, undefined);
    });

    it('should replace project ID tokens for qs object', function() {
      const projectId = 'project-id';
      const reqOpts = {
        uri: 'http://',
        qs: {},
      };
      const decoratedQs = {};

      utilOverrides.replaceProjectIdToken = function(qs, projectId_) {
        utilOverrides = {};
        assert.strictEqual(qs, reqOpts.qs);
        assert.strictEqual(projectId_, projectId);
        return decoratedQs;
      };

      const decoratedRequest = util.decorateRequest(reqOpts, projectId);
      assert.strictEqual(decoratedRequest.qs, decoratedQs);
    });

    it('should replace project ID tokens for json object', function() {
      const projectId = 'project-id';
      const reqOpts = {
        uri: 'http://',
        json: {},
      };
      const decoratedJson = {};

      utilOverrides.replaceProjectIdToken = function(json, projectId_) {
        utilOverrides = {};
        assert.strictEqual(reqOpts.json, json);
        assert.strictEqual(projectId_, projectId);
        return decoratedJson;
      };

      const decoratedRequest = util.decorateRequest(reqOpts, projectId);
      assert.strictEqual(decoratedRequest.json, decoratedJson);
    });

    it('should decorate the request', function() {
      const projectId = 'project-id';
      const reqOpts = {
        uri: 'http://',
      };
      const decoratedUri = 'http://decorated';

      utilOverrides.replaceProjectIdToken = function(uri, projectId_) {
        assert.strictEqual(uri, reqOpts.uri);
        assert.strictEqual(projectId_, projectId);
        return decoratedUri;
      };

      assert.deepEqual(util.decorateRequest(reqOpts, projectId), {
        uri: decoratedUri,
      });
    });
  });

  describe('projectId placeholder', function() {
    const PROJECT_ID = 'project-id';

    it('should replace any {{projectId}} it finds', function() {
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
          PROJECT_ID
        ),
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
        }
      );
    });

    it('should replace more than one {{projectId}}', function() {
      assert.deepEqual(
        util.replaceProjectIdToken(
          {
            here: 'A {{projectId}} M {{projectId}} Z',
          },
          PROJECT_ID
        ),
        {
          here: 'A ' + PROJECT_ID + ' M ' + PROJECT_ID + ' Z',
        }
      );
    });

    it('should throw if it needs a projectId and cannot find it', function() {
      assert.throws(function() {
        util.replaceProjectIdToken({
          here: '{{projectId}}',
        });
      }, new RegExp(util.missingProjectIdError));
    });
  });

  describe('normalizeArguments', function() {
    const fakeContext = {
      config_: {
        projectId: 'grapespaceship911',
      },
    };

    it('should return an extended object', function() {
      const local = {a: 'b'};
      let config;

      utilOverrides.extendGlobalConfig = function(globalConfig, localConfig) {
        assert.strictEqual(globalConfig, fakeContext.config_);
        assert.strictEqual(localConfig, local);
        return fakeContext.config_;
      };

      config = util.normalizeArguments(fakeContext, local);
      assert.strictEqual(config, fakeContext.config_);
    });
  });

  describe('createLimiter', function() {
    function REQUEST_FN() {}
    const OPTIONS = {
      streamOptions: {
        highWaterMark: 8,
      },
    };

    it('should create an object stream with stream-events', function(done) {
      streamEventsOverride = function(stream) {
        assert.strictEqual(stream._readableState.objectMode, true);
        setImmediate(done);
        return stream;
      };

      util.createLimiter(REQUEST_FN, OPTIONS);
    });

    it('should return a makeRequest function', function() {
      const limiter = util.createLimiter(REQUEST_FN, OPTIONS);
      assert(is.fn(limiter.makeRequest));
    });

    it('should return the created stream', function() {
      const streamEventsStream = {};

      streamEventsOverride = function() {
        return streamEventsStream;
      };

      const limiter = util.createLimiter(REQUEST_FN, OPTIONS);
      assert.strictEqual(limiter.stream, streamEventsStream);
    });

    it('should pass stream options to through', function() {
      const limiter = util.createLimiter(REQUEST_FN, OPTIONS);

      assert.strictEqual(
        limiter.stream._readableState.highWaterMark,
        OPTIONS.streamOptions.highWaterMark
      );
    });

    describe('makeRequest', function() {
      it('should pass arguments to request method', function(done) {
        const args = [{}, {}];

        const limiter = util.createLimiter(function(obj1, obj2) {
          assert.strictEqual(obj1, args[0]);
          assert.strictEqual(obj2, args[1]);
          done();
        });

        limiter.makeRequest.apply(null, args);
      });

      it('should not make more requests than the limit', function(done) {
        let callsMade = 0;
        const maxApiCalls = 10;

        const limiter = util.createLimiter(
          function() {
            callsMade++;
            limiter.makeRequest();
          },
          {
            maxApiCalls,
          }
        );

        limiter.makeRequest();

        limiter.stream.on('data', util.noop).on('end', function() {
          assert.strictEqual(callsMade, maxApiCalls);
          done();
        });
      });
    });
  });

  describe('isCustomType', function() {
    function PubSub() {}

    function MiddleLayer() {
      this.parent = new PubSub();
    }

    function Subscription() {
      this.parent = new MiddleLayer();
    }

    const pubsub = new PubSub();
    const subscription = new Subscription();

    describe('Service objects', function() {
      it('should match by constructor name', function() {
        assert(util.isCustomType(pubsub, 'pubsub'));
      });

      it('should support any casing', function() {
        assert(util.isCustomType(pubsub, 'PubSub'));
      });

      it('should not match if the wrong Service', function() {
        assert(!util.isCustomType(subscription, 'BigQuery'));
      });
    });

    describe('ServiceObject objects', function() {
      it('should match by constructor names', function() {
        assert(util.isCustomType(subscription, 'pubsub'));
        assert(util.isCustomType(subscription, 'pubsub/subscription'));

        assert(util.isCustomType(subscription, 'middlelayer'));
        assert(util.isCustomType(subscription, 'middlelayer/subscription'));
      });

      it('should support any casing', function() {
        assert(util.isCustomType(subscription, 'PubSub/Subscription'));
      });

      it('should not match if the wrong ServiceObject', function() {
        assert(!util.isCustomType(subscription, 'pubsub/topic'));
      });
    });
  });

  describe('getUserAgentFromPackageJson', function() {
    it('should format a User Agent string from a package.json', function() {
      const userAgent = util.getUserAgentFromPackageJson({
        name: '@google-cloud/storage',
        version: '0.1.0',
      });

      assert.strictEqual(userAgent, 'gcloud-node-storage/0.1.0');
    });
  });

  describe('promisifyAll', function() {
    const fakeArgs = [null, 1, 2, 3];
    const fakeError = new Error('err.');

    let FakeClass;

    beforeEach(function() {
      FakeClass = function() {};

      FakeClass.prototype.methodName = function(callback) {
        callback.apply(null, fakeArgs);
      };

      FakeClass.prototype.methodSingle = function(callback) {
        callback(null, fakeArgs[1]);
      };

      FakeClass.prototype.methodError = function(callback) {
        callback(fakeError);
      };

      FakeClass.prototype.method_ = util.noop;
      FakeClass.prototype._method = util.noop;
      FakeClass.prototype.methodStream = util.noop;
      FakeClass.prototype.promise = util.noop;

      util.promisifyAll(FakeClass);
      new FakeClass();
    });

    it('should promisify the correct method', function() {
      assert(FakeClass.prototype.methodName.promisified_);
      assert(FakeClass.prototype.methodSingle.promisified_);
      assert(FakeClass.prototype.methodError.promisified_);

      assert.strictEqual(FakeClass.prototype.method_, util.noop);
      assert.strictEqual(FakeClass.prototype._method, util.noop);
      assert.strictEqual(FakeClass.prototype.methodStream, util.noop);
      assert.strictEqual(FakeClass.prototype.promise, util.noop);
    });

    it('should optionally except an exclude list', function() {
      function FakeClass2() {}

      FakeClass2.prototype.methodSync = util.noop;
      FakeClass2.prototype.method = function() {};

      util.promisifyAll(FakeClass2, {
        exclude: ['methodSync'],
      });

      assert.strictEqual(FakeClass2.prototype.methodSync, util.noop);
      assert(FakeClass2.prototype.method.promisified_);
    });

    it('should pass the options object to promisify', function(done) {
      const promisify = util.promisify;
      const fakeOptions = {
        a: 'a',
      };

      util.promisify = function(method, options) {
        assert.strictEqual(method, FakeClass2.prototype.method);
        assert.strictEqual(options, fakeOptions);
        util.promisify = promisify;
        done();
      };

      function FakeClass2() {}
      FakeClass2.prototype.method = function() {};

      util.promisifyAll(FakeClass2, fakeOptions);
    });

    it('should not re-promisify methods', function() {
      const method = FakeClass.prototype.methodName;

      util.promisifyAll(FakeClass);

      assert.strictEqual(FakeClass.prototype.methodName, method);
    });
  });

  describe('promisify', function() {
    const fakeContext = {};
    let func;
    let fakeArgs;

    beforeEach(function() {
      fakeArgs = [null, 1, 2, 3];

      func = util.promisify(function(callback) {
        callback.apply(this, fakeArgs);
      });
    });

    it('should not re-promisify the function', function() {
      const original = func;

      func = util.promisify(func);

      assert.strictEqual(original, func);
    });

    it('should not return a promise in callback mode', function(done) {
      const returnVal = func.call(fakeContext, function() {
        const args = [].slice.call(arguments);

        assert.deepEqual(args, fakeArgs);
        assert.strictEqual(this, fakeContext);
        assert(!returnVal);
        done();
      });
    });

    it('should return a promise when the callback is omitted', function() {
      return func().then(function(args) {
        assert.deepEqual(args, fakeArgs.slice(1));
      });
    });

    it('should reject the promise on a failed request', function() {
      const error = new Error('err');

      fakeArgs = [error];

      return func().then(
        function() {
          throw new Error('Should have gone to failure block');
        },
        function(err) {
          assert.strictEqual(err, error);
        }
      );
    });

    it('should allow the Promise object to be overridden', function() {
      const FakePromise = function() {};
      const promise = func.call({Promise: FakePromise});

      assert(promise instanceof FakePromise);
    });

    it('should resolve singular arguments', function() {
      const fakeArg = 'hi';

      func = util.promisify(
        function(callback) {
          callback.apply(this, [null, fakeArg]);
        },
        {
          singular: true,
        }
      );

      return func().then(function(arg) {
        assert.strictEqual(arg, fakeArg);
      });
    });

    it('should ignore singular when multiple args are present', function() {
      const fakeArgs = ['a', 'b'];

      func = util.promisify(
        function(callback) {
          callback.apply(this, [null].concat(fakeArgs as any));
        },
        {
          singular: true,
        }
      );

      return func().then(function(args) {
        assert.deepEqual(args, fakeArgs);
      });
    });

    describe('trailing undefined arguments', function() {
      it('should not return a promise in callback mode', function(done) {
        const func = util.promisify(function(optional) {
          assert(is.fn(optional));
          optional(null);
        });

        const returnVal = func(function() {
          assert(!returnVal);
          done();
        });
      });

      it('should return a promise when callback omitted', function(done) {
        const func = util.promisify(function(optional) {
          assert.strictEqual(arguments.length, 1);
          assert(is.fn(optional));
          optional(null);
        });

        func(undefined, undefined).then(function() {
          done();
        });
      });

      it('should not mistake non-function args for callbacks', function(done) {
        const func = util.promisify(function(foo, optional) {
          assert.strictEqual(arguments.length, 2);
          assert(is.fn(optional));
          optional(null);
        });

        func('foo').then(function() {
          done();
        });
      });
    });
  });

  describe('privatize', function() {
    it('should set value', function() {
      const obj: any = {};
      util.privatize(obj, 'value', true);
      assert.strictEqual(obj.value, true);
    });

    it('should allow values to be overwritten', function() {
      const obj: any = {};
      util.privatize(obj, 'value', true);
      obj.value = false;
      assert.strictEqual(obj.value, false);
    });
  });
});
