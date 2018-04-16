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

import * as duplexify from 'duplexify';
import * as ent  from 'ent';
import * as extend from 'extend';
import * as is from 'is';
import * as r from 'request';
import * as retryRequest from 'retry-request';
import { Duplex, Transform, Stream } from 'stream';
const streamEvents = require('stream-events');
const googleAuth = require('google-auto-auth');

const request = r.defaults({
  timeout: 60000,
  gzip: true,
  forever: true,
  pool: {
    maxSockets: Infinity,
  },
});

export interface MakeAuthenticatedRequest {
  (reqOpts: DecorateRequestOptions, optionsOrCallback?: MakeAuthenticatedRequestOptions|OnAuthenticatedCallback): void|Abortable|duplexify.Duplexify;
  getCredentials: Function;
  authClient: any;
}

export type Abortable = { abort(): void };
export type AbortableDuplex = duplexify.Duplexify & Abortable;

export interface PromisifyAllOptions extends PromisifyOptions {
  /**
   * Array of methods to ignore when promisifying.
   */
  exclude?: string[];
}

export interface PackageJson {
  name: string;
  version: string;
}

export interface PromiseMethod extends Function {
  promisified_?: boolean;
}

export interface PromisifyOptions {
  /**
   * Resolve the promise with single arg instead of an array.
   */
  singular?: boolean;
}

export interface CreateLimiterOptions {
  /**
   * The maximum number of API calls to make.
   */
  maxApiCalls?: number;

  /**
   * Options to pass to the Stream constructor.
   */
  streamOptions?: any;
}

export interface GlobalContext {
  config_: {};
}

export interface GlobalConfig {
  credentials?: {};
  keyFilename?: string;
  interceptors_?: {};
}

export interface MakeAuthenticatedRequestFactoryConfig {
  /**
   * Automatically retry requests if the response is related to rate limits or certain
   * intermittent server errors. We will exponentially backoff subsequent requests by
   * default. (default: true)
   */
  autoRetry?: boolean;

  /**
   * Credentials object.
   */
  credentials?: any;

  /**
   * If true, just return the provided request options. Default: false.
   */
  customEndpoint?: boolean;

  /**
   * Account email address, required for PEM/P12 usage.
   */
  email?: string;

  /**
   * Maximum number of automatic retries attempted before returning the error. (default: 3)
   */
  maxRetries?: number;

  /**
   * Path to a .json, .pem, or .p12 keyfile.
   */
  keyFile?: string;

  /**
   * Array of scopes required for the API.
   */
  scopes?: string[];

  projectId?: string;

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
   * A connection instance used to get a token with and send the request through.
   */
  connection?: any;

  /**
   * Metadata to send at the head of the request.
   */
  metadata?: { contentType?: string };

  /**
   * Request object, in the format of a standard Node.js http.request() object.
   */
  request?: r.Options;

  makeAuthenticatedRequest(reqOpts: r.OptionsWithUri, fnobj: { onAuthenticated(err: Error|null, authenticatedReqOpts?: r.Options): void}): void;
}

export interface DecorateRequestOptions extends r.OptionsWithUri {
  autoPaginate?: any;
  autoPaginateVal?: any;
  objectMode?: any;
  uri: string;
}


export interface ParsedHttpResponseBody {
  body: any;
  err?: Error;
}

/**
 * Custom error type for missing project ID errors.
 */
export class MissingProjectIdError extends Error {
  message = `Sorry, we cannot connect to Cloud Services without a project
    ID. You may specify one with an environment variable named
    "GOOGLE_CLOUD_PROJECT".`.replace(/ +/g, ' ');
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
    this.response = errorObject.response;

    const defaultErrorMessage = 'A failure occurred during this request.';
    this.message = errorObject.message || defaultErrorMessage;
  }
}

export interface BodyResponseCallback {
  (err: Error|null, body: any, res: r.Response): void;
}

export interface MakeRequestConfig {
  /**
   * Automatically retry requests if the response is related to rate limits or certain intermittent server errors.
   * We will exponentially backoff subsequent requests by default. (default: true)
   */
  autoRetry?: boolean;

  /**
   * Maximum number of automatic retries attempted before returning the error. (default: 3)
   */
  maxRetries?: number;

  retries?: number;

  stream?: duplexify.Duplexify;

  request?: any;

  shouldRetryFn?: (response?: r.Response) => boolean;

}

export class Util {

  MissingProjectIdError = MissingProjectIdError;
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
  handleResp(err: Error|null, resp?: r.Response|null, body?: any, callback?: BodyResponseCallback) {
    callback = callback || util.noop;

    const parsedResp = extend(
      true,
      {err: err || null},
      resp && util.parseHttpRespMessage(resp),
      body && util.parseHttpRespBody(body)
    );

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
    const parsedHttpRespMessage: any = {
      resp: httpRespMessage,
    };

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
   *     will try to be JSON.parse'd. If it's successful, the parsed value will be
   *     returned here, otherwise the original value.
   */
  parseHttpRespBody(body: any) {
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
   * Take a Duplexify stream, fetch an authenticated connection header, and create
   * an outgoing writable stream.
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
  makeWritableStream(dup: duplexify.Duplexify, options: MakeWritableStreamOptions, onComplete?: Function) {
    onComplete = onComplete || util.noop;

    const writeStream = new Transform();
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
          'Content-Type': metadata.contentType || 'application/octet-stream',
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
          util.handleResp(err, resp, body, (err: Error|null, data: any) => {
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
        for (const i in err.errors) {
          const reason = err.errors[i].reason;
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
   * @throws {Error} If a projectId is requested, but not able to be detected.
   *
   * @param {object} config - Configuration object.
   * @param {boolean=} config.autoRetry - Automatically retry requests if the
   *     response is related to rate limits or certain intermittent server errors.
   *     We will exponentially backoff subsequent requests by default. (default:
   *     true)
   * @param {object=} config.credentials - Credentials object.
   * @param {boolean=} config.customEndpoint - If true, just return the provided request options. Default: false.
   * @param {string=} config.email - Account email address, required for PEM/P12 usage.
   * @param {number=} config.maxRetries - Maximum number of automatic retries attempted before returning the error. (default: 3)
   * @param {string=} config.keyFile - Path to a .json, .pem, or .p12 keyfile.
   * @param {array} config.scopes - Array of scopes required for the API.
   */
  makeAuthenticatedRequestFactory(config: MakeAuthenticatedRequestFactoryConfig = {}): MakeAuthenticatedRequest {
    const googleAutoAuthConfig = extend({}, config);

    if (googleAutoAuthConfig.projectId === '{{projectId}}') {
      delete googleAutoAuthConfig.projectId;
    }

    const authClient = googleAuth(googleAutoAuthConfig);

    /**
     * The returned function that will make an authenticated request.
     *
     * @param {type} reqOpts - Request options in the format `request` expects.
     * @param {object|function} options - Configuration object or callback function.
     * @param {function=} options.onAuthenticated - If provided, a request will
     *     not be made. Instead, this function is passed the error & authenticated
     *     request options.
     */
    function makeAuthenticatedRequest(reqOpts: DecorateRequestOptions): duplexify.Duplexify;
    function makeAuthenticatedRequest(reqOpts: DecorateRequestOptions, options?: MakeAuthenticatedRequestOptions|OnAuthenticatedCallback): void|Abortable;
    function makeAuthenticatedRequest(reqOpts: DecorateRequestOptions, callback?: OnAuthenticatedCallback): void|Abortable;
    function makeAuthenticatedRequest(reqOpts: DecorateRequestOptions, optionsOrCallback?: MakeAuthenticatedRequestOptions|OnAuthenticatedCallback): void|Abortable|duplexify.Duplexify {
      let stream: duplexify.Duplexify;
      const reqConfig = extend({}, config);
      let activeRequest_: any;

      if (!optionsOrCallback) {
        stream = duplexify();
        reqConfig.stream = stream;
      }

      const onAuthenticated = (err: Error|null, authenticatedReqOpts: DecorateRequestOptions) => {
        const autoAuthFailed =
          err &&
          err.message.indexOf('Could not load the default credentials') > -1;

        if (autoAuthFailed) {
          // Even though authentication failed, the API might not actually care.
          authenticatedReqOpts = reqOpts;
        }

        if (!err || autoAuthFailed) {
          let projectId = authClient.projectId;

          if (config.projectId && config.projectId !== '{{projectId}}') {
            projectId = config.projectId;
          }

          try {
            authenticatedReqOpts = util.decorateRequest(
              authenticatedReqOpts,
              projectId
            );
            err = null;
          } catch (e) {
            // A projectId was required, but we don't have one.
            // Re-use the "Could not load the default credentials error" if auto
            // auth failed.
            err = err || e;
          }
        }

        let options!: MakeAuthenticatedRequestOptions;
        let callback!: OnAuthenticatedCallback;
        switch (typeof optionsOrCallback) {
          case 'object':
            options = optionsOrCallback as MakeAuthenticatedRequestOptions;
            callback = options.onAuthenticated;
            break;
          case 'function':
            callback = optionsOrCallback as OnAuthenticatedCallback;
            break;
        }

        if (err) {
          if (stream) {
            stream.destroy(err);
          } else {
            callback(err);
          }

          return;
        }

        if (options && options.onAuthenticated) {
          callback(null, authenticatedReqOpts);
        } else {
          activeRequest_ = util.makeRequest(
            authenticatedReqOpts,
            reqConfig,
            callback
          );
        }
      };

      if (reqConfig.customEndpoint) {
        // Using a custom API override. Do not use `google-auto-auth` for
        // authentication. (ex: connecting to a local Datastore server)
        onAuthenticated(null, reqOpts);
      } else {
        authClient.authorizeRequest(reqOpts, onAuthenticated);
      }

      if (stream!) {
        return stream!;
      }

      return {
        abort() {
          if (activeRequest_) {
            activeRequest_.abort();
            activeRequest_ = null;
          }
        },
      };
    }
    const mar = makeAuthenticatedRequest as MakeAuthenticatedRequest;
    mar.getCredentials = authClient.getCredentials.bind(authClient);
    mar.authClient = authClient;
    return mar;
  }

  /**
   * Make a request through the `retryRequest` module with built-in error handling
   * and exponential back off.
   *
   * @param {object} reqOpts - Request options in the format `request` expects.
   * @param {object=} config - Configuration object.
   * @param {boolean=} config.autoRetry - Automatically retry requests if the
   *     response is related to rate limits or certain intermittent server errors.
   *     We will exponentially backoff subsequent requests by default. (default:
   *     true)
   * @param {number=} config.maxRetries - Maximum number of automatic retries
   *     attempted before returning the error. (default: 3)
   * @param {function} callback - The callback function.
   */
  makeRequest(reqOpts: r.Options, callback: BodyResponseCallback): Abortable;
  makeRequest(reqOpts: r.Options, config: MakeRequestConfig, callback: BodyResponseCallback): void|Abortable;
  makeRequest(reqOpts: r.Options, configOrCallback: MakeRequestConfig|BodyResponseCallback, callback?: BodyResponseCallback): void|Abortable {
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
    };

    if (!config.stream) {
      return retryRequest(reqOpts, options, (err, response, body) => {
        util.handleResp(err, response, body, callback!);
      });
    }
    const dup = config.stream as AbortableDuplex;
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
    requestStream
      .on('error', dup.destroy.bind(dup))
      .on('response', dup.emit.bind(dup, 'response'))
      .on('complete', dup.emit.bind(dup, 'complete'));

    dup.abort = requestStream.abort;
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
      reqOpts.qs = util.replaceProjectIdToken(reqOpts.qs, projectId);
    }

    if (is.object(reqOpts.json)) {
      delete reqOpts.json.autoPaginate;
      delete reqOpts.json.autoPaginateVal;
      reqOpts.json = util.replaceProjectIdToken(reqOpts.json, projectId);
    }

    reqOpts.uri = util.replaceProjectIdToken(reqOpts.uri, projectId);

    return reqOpts;
  }

  /**
   * Populate the `{{projectId}}` placeholder.
   *
   * @throws {Error} If a projectId is required, but one is not provided.
   *
   * @param {*} - Any input value that may contain a placeholder. Arrays and objects will be looped.
   * @param {string} projectId - A projectId. If not provided
   * @return {*} - The original argument with all placeholders populated.
   */
  replaceProjectIdToken(value: any, projectId: string) {
    if (is.array(value)) {
      value = (value as string[]).map(v => util.replaceProjectIdToken(v, projectId));
    }

    if (is.object(value) && is.fn(value.hasOwnProperty)) {
      for (const opt in value) {
        if (value.hasOwnProperty(opt)) {
          value[opt] = util.replaceProjectIdToken(value[opt], projectId);
        }
      }
    }

    if (is.string(value) && value.indexOf('{{projectId}}') > -1) {
      if (!projectId || projectId === '{{projectId}}') {
        throw new MissingProjectIdError();
      }
      value = value.replace(/{{projectId}}/g, projectId);
    }

    return value;
  }

  /**
   * Extend a global configuration object with user options provided at the time
   * of sub-module instantiation.
   *
   * Connection details currently come in two ways: `credentials` or
   * `keyFilename`. Because of this, we have a special exception when overriding a
   * global configuration object. If a user provides either to the global
   * configuration, then provides another at submodule instantiation-time, the
   * latter is preferred.
   *
   * @param  {object} globalConfig - The global configuration object.
   * @param  {object=} overrides - The instantiation-time configuration object.
   * @return {object}
   */
  extendGlobalConfig(globalConfig: GlobalConfig, overrides: GlobalConfig) {
    globalConfig = globalConfig || {};
    overrides = overrides || {};

    const defaultConfig: any = {};

    if (process.env.GCLOUD_PROJECT) {
      defaultConfig.projectId = process.env.GCLOUD_PROJECT;
    }

    const options = extend({}, globalConfig);

    const hasGlobalConnection = options.credentials || options.keyFilename;
    const isOverridingConnection = overrides.credentials || overrides.keyFilename;

    if (hasGlobalConnection && isOverridingConnection) {
      delete options.credentials;
      delete options.keyFilename;
    }

    const extendedConfig = extend(true, defaultConfig, options, overrides);

    // Preserve the original (not cloned) interceptors.
    extendedConfig.interceptors_ = globalConfig.interceptors_;

    return extendedConfig;
  }

  /**
   * Merge and validate API configurations.
   *
   * @param {object} globalContext - gcloud-level context.
   * @param {object} globalContext.config_ - gcloud-level configuration.
   * @param {object} localConfig - Service-level configurations.
   * @return {object} config - Merged and validated configuration.
   */
  normalizeArguments(globalContext: GlobalContext, localConfig: GlobalConfig) {
    const globalConfig = globalContext && globalContext.config_ as GlobalConfig;
    return util.extendGlobalConfig(globalConfig, localConfig);
  }

  /**
   * Limit requests according to a `maxApiCalls` limit.
   *
   * @param {function} makeRequestFn - The function that will be called.
   * @param {object=} options - Configuration object.
   * @param {number} options.maxApiCalls - The maximum number of API calls to make.
   * @param {object} options.streamOptions - Options to pass to the Stream constructor.
   */
  createLimiter(makeRequestFn: Function, options?: CreateLimiterOptions) {
    options = options || {};

    const streamOptions = options.streamOptions || {};
    streamOptions.objectMode = true;
    const stream = streamEvents(new Transform(streamOptions)) as Transform;

    let requestsMade = 0;
    let requestsToMake = -1;

    if (is.number(options.maxApiCalls)) {
      requestsToMake = options.maxApiCalls!;
    }

    return {
      makeRequest(...args: any[]) {
        requestsMade++;
        if (requestsToMake >= 0 && requestsMade > requestsToMake) {
          stream.push(null);
          return;
        }
        makeRequestFn.apply(null, args);
        return stream;
      },
      stream,
    };
  }

  isCustomType(unknown: any, module: string) {
    function getConstructorName(obj: Function) {
      return obj.constructor && obj.constructor.name.toLowerCase();
    }

    const moduleNameParts = module.split('/');

    const parentModuleName =
      moduleNameParts[0] && moduleNameParts[0].toLowerCase();
    const subModuleName = moduleNameParts[1] && moduleNameParts[1].toLowerCase();

    if (subModuleName && getConstructorName(unknown) !== subModuleName) {
      return false;
    }

    let walkingModule = unknown;
    do {
      if (getConstructorName(walkingModule) === parentModuleName) {
        return true;
      }
    } while ((walkingModule = walkingModule.parent));

    return false;
  }

  /**
   * Create a properly-formatted User-Agent string from a package.json file.
   *
   * @param {object} packageJson - A module's package.json file.
   * @return {string} userAgent - The formatted User-Agent string.
   */
  getUserAgentFromPackageJson(packageJson: PackageJson) {
    const hyphenatedPackageName = packageJson.name
      .replace('@google-cloud', 'gcloud-node') // For legacy purposes.
      .replace('/', '-'); // For UA spec-compliance purposes.

    return hyphenatedPackageName + '/' + packageJson.version;
  }

  /**
   * Wraps a callback style function to conditionally return a promise.
   *
   * @param {function} originalMethod - The method to promisify.
   * @param {object=} options - Promise options.
   * @param {boolean} options.singular - Resolve the promise with single arg instead of an array.
   * @return {function} wrapped
   */
  promisify(originalMethod: PromiseMethod, options?: PromisifyOptions) {
    if (originalMethod.promisified_) {
      return originalMethod;
    }

    options = options || {};

    const slice = Array.prototype.slice;

    const wrapper: any = function() {
      const context = this;
      let last;

      for (last = arguments.length - 1; last >= 0; last--) {
        const arg = arguments[last];

        if (is.undefined(arg)) {
          continue; // skip trailing undefined.
        }

        if (!is.fn(arg)) {
          break; // non-callback last argument found.
        }

        return originalMethod.apply(context, arguments);
      }

      // peel trailing undefined.
      const args = slice.call(arguments, 0, last + 1);

      let PromiseCtor = Promise;

      // Because dedupe will likely create a single install of
      // @google-cloud/common to be shared amongst all modules, we need to
      // localize it at the Service level.
      if (context && context.Promise) {
        PromiseCtor = context.Promise;
      }

      return new PromiseCtor(function(resolve, reject) {
        args.push(function() {
          const callbackArgs = slice.call(arguments);
          const err = callbackArgs.shift();

          if (err) {
            return reject(err);
          }

          if (options!.singular && callbackArgs.length === 1) {
            resolve(callbackArgs[0]);
          } else {
            resolve(callbackArgs);
          }
        });

        originalMethod.apply(context, args);
      });
    };

    wrapper.promisified_ = true;
    return wrapper;
  }

  /**
   * Promisifies certain Class methods. This will not promisify private or
   * streaming methods.
   *
   * @param {module:common/service} Class - Service class.
   * @param {object=} options - Configuration object.
   */
  promisifyAll(Class: Function, options?: PromisifyAllOptions) {
    const exclude = (options && options.exclude) || [];

    const methods = Object.keys(Class.prototype).filter((methodName) => {
      return (
        is.fn(Class.prototype[methodName]) && // is it a function?
        !/(^_|(Stream|_)|promise$)/.test(methodName) && // is it promisable?
        exclude.indexOf(methodName) === -1
      ); // is it blacklisted?
    });

    methods.forEach((methodName) => {
      const originalMethod = Class.prototype[methodName];
      if (!originalMethod.promisified_) {
        Class.prototype[methodName] = util.promisify(originalMethod, options);
      }
    });
  }

  /**
   * This will mask properties of an object from console.log.
   *
   * @param {object} object - The object to assign the property to.
   * @param {string} propName - Property name.
   * @param {*} value - Value.
   */
  privatize(object: {}, propName: string, value: any) {
    Object.defineProperty(object, propName, {value, writable: true});
  }
}

const util = new Util();
export { util };
