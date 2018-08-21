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

/*!
 * @module common/util
 */

import {replaceProjectIdToken} from '@google-cloud/projectify';
import * as duplexify from 'duplexify';
import * as ent from 'ent';
import * as extend from 'extend';
import {GoogleAuth, GoogleAuthOptions} from 'google-auth-library';
import {CredentialBody} from 'google-auth-library/build/src/auth/credentials';
import * as is from 'is';
import * as r from 'request';
import * as retryRequest from 'retry-request';
import * as through from 'through2';

import {Interceptor} from './service-object';

const request = r.defaults({
  timeout: 60000,
  gzip: true,
  forever: true,
  pool: {
    maxSockets: Infinity,
  },
});

// tslint:disable-next-line:no-any
export type ResponseBody = any;

export interface ParsedHttpRespMessage {
  resp: r.Response;
  err?: ApiError;
}

export interface MakeAuthenticatedRequest {
  (reqOpts: DecorateRequestOptions): duplexify.Duplexify;
  (reqOpts: DecorateRequestOptions,
   options?: MakeAuthenticatedRequestOptions): void|Abortable;
  (reqOpts: DecorateRequestOptions,
   callback?: BodyResponseCallback): void|Abortable;
  (reqOpts: DecorateRequestOptions,
   optionsOrCallback?: MakeAuthenticatedRequestOptions|
   BodyResponseCallback): void|Abortable|duplexify.Duplexify;
  getCredentials:
      (callback:
           (err?: Error|null, credentials?: CredentialBody) => void) => void;
  authClient: GoogleAuth;
}

export type Abortable = {
  abort(): void
};
export type AbortableDuplex = duplexify.Duplexify&Abortable;

export interface PackageJson {
  name: string;
  version: string;
}

export interface MakeAuthenticatedRequestFactoryConfig extends
    GoogleAuthOptions {
  /**
   * Automatically retry requests if the response is related to rate limits or
   * certain intermittent server errors. We will exponentially backoff
   * subsequent requests by default. (default: true)
   */
  autoRetry?: boolean;

  /**
   * If true, just return the provided request options. Default: false.
   */
  customEndpoint?: boolean;

  /**
   * Account email address, required for PEM/P12 usage.
   */
  email?: string;

  /**
   * Maximum number of automatic retries attempted before returning the error.
   * (default: 3)
   */
  maxRetries?: number;

  stream?: duplexify.Duplexify;
}

export interface MakeAuthenticatedRequestOptions {
  onAuthenticated: OnAuthenticatedCallback;
}

export interface OnAuthenticatedCallback {
  (err: Error|null, reqOpts?: DecorateRequestOptions): void;
}

export interface GoogleErrorBody {
  code: number;
  errors?: GoogleInnerError[];
  response: r.Response;
  message?: string;
}

export interface GoogleInnerError {
  reason?: string;
  message?: string;
}

export interface MakeWritableStreamOptions {
  /**
   * A connection instance used to get a token with and send the request
   * through.
   */
  connection?: {};

  /**
   * Metadata to send at the head of the request.
   */
  metadata?: {contentType?: string};

  /**
   * Request object, in the format of a standard Node.js http.request() object.
   */
  request?: r.Options;

  makeAuthenticatedRequest(reqOpts: r.OptionsWithUri, fnobj: {
    onAuthenticated(err: Error|null, authenticatedReqOpts?: r.Options): void
  }): void;
}

export interface DecorateRequestOptions extends r.OptionsWithUri {
  autoPaginate?: boolean;
  autoPaginateVal?: boolean;
  objectMode?: boolean;
  uri: string;
  interceptors_?: Interceptor[];
  shouldReturnStream?: boolean;
}

export interface ParsedHttpResponseBody {
  body: ResponseBody;
  err?: Error;
}

/**
 * Custom error type for API errors.
 *
 * @param {object} errorBody - Error object.
 */
export class ApiError extends Error {
  code?: number;
  errors?: GoogleInnerError[];
  response?: r.Response;
  constructor(errorMessage: string);
  constructor(errorBody: GoogleErrorBody);
  constructor(errorBodyOrMessage?: GoogleErrorBody|string) {
    super();
    if (typeof errorBodyOrMessage !== 'object') {
      this.message = errorBodyOrMessage || '';
      return;
    }
    const errorBody = errorBodyOrMessage;

    this.code = errorBody.code;
    this.errors = errorBody.errors;
    this.response = errorBody.response;

    try {
      this.errors = JSON.parse(this.response.body).error.errors;
    } catch (e) {
      this.errors = errorBody.errors;
    }

    const messages: string[] = [];

    if (errorBody.message) {
      messages.push(errorBody.message);
    }

    if (this.errors && this.errors.length === 1) {
      messages.push(this.errors[0].message!);
    } else if (this.response && this.response.body) {
      messages.push(ent.decode(errorBody.response.body.toString()));
    } else if (!errorBody.message) {
      messages.push('Error during request.');
    }

    this.message = Array.from(new Set(messages)).join(' - ');
  }
}

/**
 * Custom error type for partial errors returned from the API.
 *
 * @param {object} b - Error object.
 */
export class PartialFailureError extends Error {
  errors?: GoogleInnerError[];
  response?: r.Response;
  constructor(b: GoogleErrorBody) {
    super();
    const errorObject = b;

    this.errors = errorObject.errors;
    this.name = 'PartialFailureError';
    this.response = errorObject.response;

    const defaultErrorMessage = 'A failure occurred during this request.';
    this.message = errorObject.message || defaultErrorMessage;
  }
}

export interface BodyResponseCallback {
  (err: Error|null, body?: ResponseBody, res?: r.Response): void;
}

export interface MakeRequestConfig {
  /**
   * Automatically retry requests if the response is related to rate limits or
   * certain intermittent server errors. We will exponentially backoff
   * subsequent requests by default. (default: true)
   */
  autoRetry?: boolean;

  /**
   * Maximum number of automatic retries attempted before returning the error.
   * (default: 3)
   */
  maxRetries?: number;

  retries?: number;

  stream?: duplexify.Duplexify;

  request?: {};

  shouldRetryFn?: (response?: r.Response) => boolean;
}

export class Util {
  ApiError = ApiError;
  PartialFailureError = PartialFailureError;

  /**
   * No op.
   *
   * @example
   * function doSomething(callback) {
   *   callback = callback || noop;
   * }
   */
  noop() {}

  /**
   * Uniformly process an API response.
   *
   * @param {*} err - Error value.
   * @param {*} resp - Response value.
   * @param {*} body - Body value.
   * @param {function} callback - The callback function.
   */
  handleResp(
      err: Error|null, resp?: r.Response|null, body?: ResponseBody,
      callback?: BodyResponseCallback) {
    callback = callback || util.noop;

    const parsedResp = extend(
        true, {err: err || null}, resp && util.parseHttpRespMessage(resp),
        body && util.parseHttpRespBody(body));
    // Assign the parsed body to resp.body, even if { json: false } was passed
    // as a request option.
    // We assume that nobody uses the previously unparsed value of resp.body.
    if (!parsedResp.err && resp && typeof parsedResp.body === 'object') {
      parsedResp.resp.body = parsedResp.body;
    }

    callback(parsedResp.err, parsedResp.body, parsedResp.resp);
  }

  /**
   * Sniff an incoming HTTP response message for errors.
   *
   * @param {object} httpRespMessage - An incoming HTTP response message from `request`.
   * @return {object} parsedHttpRespMessage - The parsed response.
   * @param {?error} parsedHttpRespMessage.err - An error detected.
   * @param {object} parsedHttpRespMessage.resp - The original response object.
   */
  parseHttpRespMessage(httpRespMessage: r.Response) {
    const parsedHttpRespMessage = {
      resp: httpRespMessage,
    } as ParsedHttpRespMessage;

    if (httpRespMessage.statusCode < 200 || httpRespMessage.statusCode > 299) {
      // Unknown error. Format according to ApiError standard.
      parsedHttpRespMessage.err = new ApiError({
        errors: new Array<GoogleInnerError>(),
        code: httpRespMessage.statusCode,
        message: httpRespMessage.statusMessage,
        response: httpRespMessage,
      });
    }

    return parsedHttpRespMessage;
  }

  /**
   * Parse the response body from an HTTP request.
   *
   * @param {object} body - The response body.
   * @return {object} parsedHttpRespMessage - The parsed response.
   * @param {?error} parsedHttpRespMessage.err - An error detected.
   * @param {object} parsedHttpRespMessage.body - The original body value provided
   *     will try to be JSON.parse'd. If it's successful, the parsed value will
   * be returned here, otherwise the original value.
   */
  parseHttpRespBody(body: ResponseBody) {
    const parsedHttpRespBody: ParsedHttpResponseBody = {
      body,
    };

    if (is.string(body)) {
      try {
        parsedHttpRespBody.body = JSON.parse(body);
      } catch (err) {
        parsedHttpRespBody.err = new ApiError('Cannot parse JSON response');
      }
    }

    if (parsedHttpRespBody.body && parsedHttpRespBody.body.error) {
      // Error from JSON API.
      parsedHttpRespBody.err = new ApiError(parsedHttpRespBody.body.error);
    }

    return parsedHttpRespBody;
  }

  /**
   * Take a Duplexify stream, fetch an authenticated connection header, and
   * create an outgoing writable stream.
   *
   * @param {Duplexify} dup - Duplexify stream.
   * @param {object} options - Configuration object.
   * @param {module:common/connection} options.connection - A connection instance used to get a token with and send the request through.
   * @param {object} options.metadata - Metadata to send at the head of the request.
   * @param {object} options.request - Request object, in the format of a standard Node.js http.request() object.
   * @param {string=} options.request.method - Default: "POST".
   * @param {string=} options.request.qs.uploadType - Default: "multipart".
   * @param {string=} options.streamContentType - Default: "application/octet-stream".
   * @param {function} onComplete - Callback, executed after the writable Request stream has completed.
   */
  makeWritableStream(
      dup: duplexify.Duplexify, options: MakeWritableStreamOptions,
      onComplete?: Function) {
    onComplete = onComplete || util.noop;

    const writeStream = through();
    dup.setWritable(writeStream);

    const defaultReqOpts = {
      method: 'POST',
      qs: {
        uploadType: 'multipart',
      },
    };

    const metadata = options.metadata || {};

    const reqOpts = extend(true, defaultReqOpts, options.request, {
                      multipart: [
                        {
                          'Content-Type': 'application/json',
                          body: JSON.stringify(metadata),
                        },
                        {
                          'Content-Type': metadata.contentType ||
                              'application/octet-stream',
                          body: writeStream,
                        },
                      ],
                    }) as r.OptionsWithUri;

    options.makeAuthenticatedRequest(reqOpts, {
      onAuthenticated(err, authenticatedReqOpts) {
        if (err) {
          dup.destroy(err);
          return;
        }

        request(authenticatedReqOpts!, (err, resp, body) => {
          util.handleResp(err, resp, body, (err, data) => {
            if (err) {
              dup.destroy(err);
              return;
            }
            dup.emit('response', resp);
            onComplete!(data);
          });
        });
      },
    });
  }

  /**
   * Returns true if the API request should be retried, given the error that was
   * given the first time the request was attempted. This is used for rate limit
   * related errors as well as intermittent server errors.
   *
   * @param {error} err - The API error to check if it is appropriate to retry.
   * @return {boolean} True if the API request should be retried, false otherwise.
   */
  shouldRetryRequest(err?: ApiError) {
    if (err) {
      if ([429, 500, 502, 503].indexOf(err.code!) !== -1) {
        return true;
      }

      if (err.errors) {
        for (const e of err.errors) {
          const reason = e.reason;
          if (reason === 'rateLimitExceeded') {
            return true;
          }
          if (reason === 'userRateLimitExceeded') {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Get a function for making authenticated requests.
   *
   * @param {object} config - Configuration object.
   * @param {boolean=} config.autoRetry - Automatically retry requests if the
   *     response is related to rate limits or certain intermittent server
   * errors. We will exponentially backoff subsequent requests by default.
   * (default: true)
   * @param {object=} config.credentials - Credentials object.
   * @param {boolean=} config.customEndpoint - If true, just return the provided request options. Default: false.
   * @param {string=} config.email - Account email address, required for PEM/P12 usage.
   * @param {number=} config.maxRetries - Maximum number of automatic retries attempted before returning the error. (default: 3)
   * @param {string=} config.keyFile - Path to a .json, .pem, or .p12 keyfile.
   * @param {array} config.scopes - Array of scopes required for the API.
   */
  makeAuthenticatedRequestFactory(
      config: MakeAuthenticatedRequestFactoryConfig = {}) {
    const googleAutoAuthConfig = extend({}, config);

    if (googleAutoAuthConfig.projectId === '{{projectId}}') {
      delete googleAutoAuthConfig.projectId;
    }

    const authClient = new GoogleAuth(googleAutoAuthConfig);

    /**
     * The returned function that will make an authenticated request.
     *
     * @param {type} reqOpts - Request options in the format `request` expects.
     * @param {object|function} options - Configuration object or callback function.
     * @param {function=} options.onAuthenticated - If provided, a request will
     *     not be made. Instead, this function is passed the error &
     * authenticated request options.
     */
    function makeAuthenticatedRequest(reqOpts: DecorateRequestOptions):
        duplexify.Duplexify;
    function makeAuthenticatedRequest(
        reqOpts: DecorateRequestOptions,
        options?: MakeAuthenticatedRequestOptions): void|Abortable;
    function makeAuthenticatedRequest(
        reqOpts: DecorateRequestOptions, callback?: BodyResponseCallback): void|
        Abortable;
    function makeAuthenticatedRequest(
        reqOpts: DecorateRequestOptions,
        optionsOrCallback?: MakeAuthenticatedRequestOptions|
        BodyResponseCallback): void|Abortable|duplexify.Duplexify {
      let stream: duplexify.Duplexify;
      const reqConfig = extend({}, config);
      let activeRequest_: void|Abortable|null;

      if (!optionsOrCallback) {
        stream = duplexify();
        reqConfig.stream = stream;
      }

      const options =
          typeof optionsOrCallback === 'object' ? optionsOrCallback : undefined;
      const callback = typeof optionsOrCallback === 'function' ?
          optionsOrCallback :
          undefined;

      const onAuthenticated =
          (err: Error|null, authenticatedReqOpts?: DecorateRequestOptions) => {
            const autoAuthFailed = err &&
                err.message.indexOf('Could not load the default credentials') >
                    -1;

            if (autoAuthFailed) {
              // Even though authentication failed, the API might not actually
              // care.
              authenticatedReqOpts = reqOpts;
            }

            if (!err || autoAuthFailed) {
              // tslint:disable-next-line:no-any
              let projectId = (authClient as any)._cachedProjectId;

              if (config.projectId && config.projectId !== '{{projectId}}') {
                projectId = config.projectId;
              }

              try {
                authenticatedReqOpts =
                    util.decorateRequest(authenticatedReqOpts!, projectId);
                err = null;
              } catch (e) {
                // A projectId was required, but we don't have one.
                // Re-use the "Could not load the default credentials error" if
                // auto auth failed.
                err = err || e;
              }
            }

            if (err) {
              if (stream) {
                stream.destroy(err);
              } else {
                const fn = options && options.onAuthenticated ?
                    options.onAuthenticated :
                    callback;
                (fn as Function)(err);
              }
              return;
            }

            if (options && options.onAuthenticated) {
              options.onAuthenticated(null, authenticatedReqOpts);
            } else {
              activeRequest_ =
                  util.makeRequest(authenticatedReqOpts!, reqConfig, callback!);
            }
          };

      if (reqConfig.customEndpoint) {
        // Using a custom API override. Do not use `google-auth-library` for
        // authentication. (ex: connecting to a local Datastore server)
        onAuthenticated(null, reqOpts);
      } else {
        authClient.authorizeRequest(reqOpts).then(
            res => {
              const opts = extend(true, {}, reqOpts, res);
              onAuthenticated(null, opts);
            },
            err => {
              onAuthenticated(err);
            });
      }

      if (stream!) {
        return stream!;
      }

      return {
        abort() {
          setImmediate(() => {
            if (activeRequest_) {
              activeRequest_.abort();
              activeRequest_ = null;
            }
          });
        },
      };
    }
    const mar = makeAuthenticatedRequest as MakeAuthenticatedRequest;
    mar.getCredentials = authClient.getCredentials.bind(authClient);
    mar.authClient = authClient;
    return mar;
  }

  /**
   * Make a request through the `retryRequest` module with built-in error
   * handling and exponential back off.
   *
   * @param {object} reqOpts - Request options in the format `request` expects.
   * @param {object=} config - Configuration object.
   * @param {boolean=} config.autoRetry - Automatically retry requests if the
   *     response is related to rate limits or certain intermittent server
   * errors. We will exponentially backoff subsequent requests by default.
   * (default: true)
   * @param {number=} config.maxRetries - Maximum number of automatic retries
   *     attempted before returning the error. (default: 3)
   * @param {function} callback - The callback function.
   */
  makeRequest(reqOpts: r.Options, callback: BodyResponseCallback): Abortable;
  makeRequest(
      reqOpts: r.Options, config: MakeRequestConfig,
      callback: BodyResponseCallback): void|Abortable;
  makeRequest(
      reqOpts: r.Options,
      configOrCallback: MakeRequestConfig|BodyResponseCallback,
      callback?: BodyResponseCallback): void|Abortable {
    let config: MakeRequestConfig = {};
    if (is.fn(configOrCallback)) {
      callback = configOrCallback as BodyResponseCallback;
    } else {
      config = configOrCallback as MakeRequestConfig;
    }
    config = config || {};

    const options = {
      request,
      retries: config.autoRetry !== false ? config.maxRetries || 3 : 0,
      shouldRetryFn(httpRespMessage: r.Response) {
        const err = util.parseHttpRespMessage(httpRespMessage).err;
        return err && util.shouldRetryRequest(err);
      },
    } as {} as retryRequest.Options;

    if (!config.stream) {
      return retryRequest(reqOpts, options, (err, response, body) => {
        util.handleResp(err, response, body, callback!);
      });
    }
    const dup = config.stream as AbortableDuplex;
    // tslint:disable-next-line:no-any
    let requestStream: any;
    const isGetRequest = (reqOpts.method || 'GET').toUpperCase() === 'GET';

    if (isGetRequest) {
      requestStream = retryRequest(reqOpts, options);
      dup.setReadable(requestStream);
    } else {
      // Streaming writable HTTP requests cannot be retried.
      requestStream = request(reqOpts);
      dup.setWritable(requestStream);
    }

    // Replay the Request events back to the stream.
    requestStream.on('error', dup.destroy.bind(dup))
        .on('response', dup.emit.bind(dup, 'response'))
        .on('complete', dup.emit.bind(dup, 'complete'));

    dup.abort = requestStream.abort;
    return dup;
  }

  /**
   * Decorate the options about to be made in a request.
   *
   * @param {object} reqOpts - The options to be passed to `request`.
   * @param {string} projectId - The project ID.
   * @return {object} reqOpts - The decorated reqOpts.
   */
  decorateRequest(reqOpts: DecorateRequestOptions, projectId: string) {
    delete reqOpts.autoPaginate;
    delete reqOpts.autoPaginateVal;
    delete reqOpts.objectMode;

    if (is.object(reqOpts.qs)) {
      delete reqOpts.qs.autoPaginate;
      delete reqOpts.qs.autoPaginateVal;
      reqOpts.qs = replaceProjectIdToken(reqOpts.qs, projectId);
    }

    if (is.array(reqOpts.multipart)) {
      reqOpts.multipart = (reqOpts.multipart as []).map(part => {
        return replaceProjectIdToken(part, projectId);
      });
    }

    if (is.object(reqOpts.json)) {
      delete reqOpts.json.autoPaginate;
      delete reqOpts.json.autoPaginateVal;
      reqOpts.json = replaceProjectIdToken(reqOpts.json, projectId);
    }

    reqOpts.uri = replaceProjectIdToken(reqOpts.uri, projectId);

    return reqOpts;
  }

  // tslint:disable-next-line:no-any
  isCustomType(unknown: any, module: string) {
    function getConstructorName(obj: Function) {
      return obj.constructor && obj.constructor.name.toLowerCase();
    }

    const moduleNameParts = module.split('/');

    const parentModuleName =
        moduleNameParts[0] && moduleNameParts[0].toLowerCase();
    const subModuleName =
        moduleNameParts[1] && moduleNameParts[1].toLowerCase();

    if (subModuleName && getConstructorName(unknown) !== subModuleName) {
      return false;
    }

    let walkingModule = unknown;
    while (true) {
      if (getConstructorName(walkingModule) === parentModuleName) {
        return true;
      }
      walkingModule = walkingModule.parent;
      if (!walkingModule) {
        return false;
      }
    }
  }

  /**
   * Create a properly-formatted User-Agent string from a package.json file.
   *
   * @param {object} packageJson - A module's package.json file.
   * @return {string} userAgent - The formatted User-Agent string.
   */
  getUserAgentFromPackageJson(packageJson: PackageJson) {
    const hyphenatedPackageName =
        packageJson.name
            .replace('@google-cloud', 'gcloud-node')  // For legacy purposes.
            .replace('/', '-');  // For UA spec-compliance purposes.

    return hyphenatedPackageName + '/' + packageJson.version;
  }
}

const util = new Util();
export {util};
