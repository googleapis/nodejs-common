/*!
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

/*!
 * @module common/service
 */

import arrify from 'arrify';
import {Duplexify} from 'duplexify';
import extend from 'extend';
import {GoogleAuth} from 'google-auth-library';
import is from 'is';
import pify from 'pify';
import r from 'request';

import {StreamRequestOptions} from './service-object';
import {BodyResponseCallback, DecorateRequestOptions, MakeAuthenticatedRequest, PackageJson, util} from './util';

const PROJECT_ID_TOKEN = '{{projectId}}';

export interface ServiceConfig {
  /**
   * The base URL to make API requests to.
   */
  baseUrl: string;

  /**
   * The scopes required for the request.
   */
  scopes: string[];

  projectIdRequired?: boolean;
  packageJson: PackageJson;
}

export interface ServiceOptions {
  interceptors_?: {};
  projectId?: string;
  promise?: PromiseConstructor;
  credentials?: {};
  keyFilename?: string;
  email?: string;
  token?: string;
}

export class Service {
  baseUrl: string;
  private globalInterceptors: {};
  private interceptors: Array<{request(opts: r.Options): r.Options}>;
  private packageJson: PackageJson;
  projectId: string;
  private projectIdRequired: boolean;
  // tslint:disable-next-line:variable-name
  Promise: PromiseConstructor;
  makeAuthenticatedRequest: MakeAuthenticatedRequest;
  authClient: GoogleAuth;
  private getCredentials: {};

  /**
   * Service is a base class, meant to be inherited from by a "service," like
   * BigQuery or Storage.
   *
   * This handles making authenticated requests by exposing a `makeReq_`
   * function.
   *
   * @constructor
   * @alias module:common/service
   *
   * @param {object} config - Configuration object.
   * @param {string} config.baseUrl - The base URL to make API requests to.
   * @param {string[]} config.scopes - The scopes required for the request.
   * @param {object=} options - [Configuration object](#/docs).
   */
  constructor(config: ServiceConfig, options?: ServiceOptions) {
    options = options || {};

    this.baseUrl = config.baseUrl;
    this.globalInterceptors = arrify(options.interceptors_);
    this.interceptors = [];
    this.packageJson = config.packageJson;
    this.projectId = options.projectId || PROJECT_ID_TOKEN;
    this.projectIdRequired = config.projectIdRequired !== false;
    this.Promise = options.promise || Promise;

    const reqCfg = extend({}, config, {
      projectIdRequired: this.projectIdRequired,
      projectId: this.projectId,
      credentials: options.credentials,
      keyFile: options.keyFilename,
      email: options.email,
      token: options.token,
    });

    this.makeAuthenticatedRequest =
        util.makeAuthenticatedRequestFactory(reqCfg);
    this.authClient = this.makeAuthenticatedRequest.authClient;
    this.getCredentials = this.makeAuthenticatedRequest.getCredentials;

    const isCloudFunctionEnv = !!process.env.FUNCTION_NAME;

    if (isCloudFunctionEnv) {
      this.interceptors.push({
        request(reqOpts: r.Options) {
          reqOpts.forever = false;
          return reqOpts;
        },
      });
    }
  }

  /**
   * Get and update the Service's project ID.
   *
   * @param {function} callback - The callback function.
   */
  getProjectId(): Promise<string>;
  getProjectId(callback: (err: Error|null, projectId?: string) => void): void;
  getProjectId(callback?: (err: Error|null, projectId?: string) => void):
      Promise<string>|void {
    if (!callback) {
      return this.getProjectIdAsync();
    }
    this.getProjectIdAsync().then(p => callback(null, p), callback);
  }

  protected async getProjectIdAsync(): Promise<string> {
    const projectId = await this.authClient.getDefaultProjectId();
    if (this.projectId === PROJECT_ID_TOKEN && projectId) {
      this.projectId = projectId;
    }
    return this.projectId;
  }

  /**
   * Make an authenticated API request.
   *
   * @private
   *
   * @param {object} reqOpts - Request options that are passed to `request`.
   * @param {string} reqOpts.uri - A URI relative to the baseUrl.
   * @param {function} callback - The callback function passed to `request`.
   */
  request_(reqOpts: StreamRequestOptions): r.Request;
  request_(reqOpts: DecorateRequestOptions): Promise<r.Response>;
  request_(reqOpts: DecorateRequestOptions|
           StreamRequestOptions): Promise<r.Response>|r.Request {
    // TODO: fix the tests so this can be private
    reqOpts = extend(true, {}, reqOpts);
    const isAbsoluteUrl = reqOpts.uri.indexOf('http') === 0;
    const uriComponents = [this.baseUrl];

    if (this.projectIdRequired) {
      uriComponents.push('projects');
      uriComponents.push(this.projectId);
    }

    uriComponents.push(reqOpts.uri);

    if (isAbsoluteUrl) {
      uriComponents.splice(0, uriComponents.indexOf(reqOpts.uri));
    }

    reqOpts.uri = uriComponents
                      .map((uriComponent) => {
                        const trimSlashesRegex = /^\/*|\/*$/g;
                        return uriComponent.replace(trimSlashesRegex, '');
                      })
                      .join('/')
                      // Some URIs have colon separators.
                      // Bad: https://.../projects/:list
                      // Good: https://.../projects:list
                      .replace(/\/:/g, ':');

    // Interceptors should be called in the order they were assigned.
    const combinedInterceptors = [].slice.call(this.globalInterceptors)
                                     .concat(this.interceptors)
                                     .concat(arrify(reqOpts.interceptors_));

    let interceptor;
    // tslint:disable-next-line:no-conditional-assignment
    while ((interceptor = combinedInterceptors.shift()) &&
           interceptor.request) {
      reqOpts = interceptor.request(reqOpts);
    }

    delete reqOpts.interceptors_;

    const pkg = this.packageJson;
    reqOpts.headers = extend({}, reqOpts.headers, {
      'User-Agent': util.getUserAgentFromPackageJson(pkg),
      'x-goog-api-client':
          `gl-node/${process.versions.node} gccl/${pkg.version}`,
    });

    if (reqOpts.shouldReturnStream) {
      // tslint:disable-next-line:no-any
      return this.makeAuthenticatedRequest(reqOpts) as any as r.Request;
    } else {
      return pify(this.makeAuthenticatedRequest, {multiArgs: true})(reqOpts)
          .then(
              args => {
                /**
                 * Note: this returns an array of results in the form of a
                 * BodyResponseCallback, which means: [body, response].  Return
                 * the response object in the promise result.
                 */
                return args.length > 1 ? args[1] : null;
              },
              e => {
                if (is.array(e) && e.length > 0) {
                  const [err, body, res] = e;
                  if (res) {
                    res.body = err;
                    err.response = res;
                  }
                  throw err;
                }
                throw e;
              });
    }
  }

  /**
   * Make an authenticated API request.
   *
   * @private
   *
   * @param {object} reqOpts - Request options that are passed to `request`.
   * @param {string} reqOpts.uri - A URI relative to the baseUrl.
   * @param {function} callback - The callback function passed to `request`.
   */
  request(reqOpts: DecorateRequestOptions): Promise<r.Response>;
  request(reqOpts: DecorateRequestOptions, callback: BodyResponseCallback):
      void;
  request(reqOpts: DecorateRequestOptions, callback?: BodyResponseCallback):
      void|Promise<r.Response> {
    if (!callback) {
      return this.request_(reqOpts) as Promise<r.Response>;
    }
    this.request_(reqOpts).then(
        res => callback(null, res.body, res as r.Response),
        err => callback(
            err, err.response ? err.response.body : undefined, err.response));
  }

  /**
   * Make an authenticated API request.
   *
   * @private
   *
   * @param {object} reqOpts - Request options that are passed to `request`.
   * @param {string} reqOpts.uri - A URI relative to the baseUrl.
   */
  requestStream(reqOpts: DecorateRequestOptions): r.Request {
    const opts = extend(true, reqOpts, {shouldReturnStream: true});
    return this.request_(opts as StreamRequestOptions);
  }
}
