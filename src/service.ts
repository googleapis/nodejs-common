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

import * as extend from 'extend';
import * as r from 'request';
import * as arrify from 'arrify';
import * as pify from 'pify';
import {PackageJson} from './types';

/**
 * @type {module:common/util}
 * @private
 */
const util = require('./util');

const PROJECT_ID_TOKEN = '{{projectId}}';

export type ExtendedRequestOptions = r.Options & {
  interceptors_?: any;
  uri: string;
};

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
  interceptors_?: any;
  projectId?: string;
  promise?: any;
  credentials?: any;
  keyFilename?: string;
  email?: string;
  token?: string;
}

export class Service {

  private baseUrl: string;
  private globalInterceptors;
  private interceptors: Array<{ request(opts: r.Options): r.Options}>;
  private packageJson: PackageJson;
  private projectId: string;
  private projectIdRequired: boolean;
  private Promise: Promise<{}>;
  // TODO: make this private
  makeAuthenticatedRequest;
  // TODO: make this private
  authClient;
  private getCredentials;

  /**
   * Service is a base class, meant to be inherited from by a "service," like
   * BigQuery or Storage.
   *
   * This handles making authenticated requests by exposing a `makeReq_` function.
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

    this.makeAuthenticatedRequest = util.makeAuthenticatedRequestFactory(reqCfg);
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
  getProjectId(callback?: (err: Error|null, projectId?: string) => void): Promise<string>|void {
    if (!callback) {
      return this.getProjectIdAsync();
    }
    this.getProjectIdAsync()
        .then(p => callback(null, p), e => callback(e))
        .catch(e => callback(e));
  }

  protected async getProjectIdAsync(): Promise<string> {
    const projectId = await pify(this.authClient.getProjectId)();
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
  request_(reqOpts: r.Options & ExtendedRequestOptions, callback?: (err: Error|null) => void) {
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
    const combinedInterceptors = [].slice
      .call(this.globalInterceptors)
      .concat(this.interceptors)
      .concat(arrify(reqOpts.interceptors_));

    let interceptor;

    while ((interceptor = combinedInterceptors.shift()) && interceptor.request) {
      reqOpts = interceptor.request(reqOpts);
    }

    delete reqOpts.interceptors_;

    const pkg = this.packageJson;
    reqOpts.headers = extend({}, reqOpts.headers, {
      'User-Agent': util.getUserAgentFromPackageJson(pkg),
      'x-goog-api-client': `gl-node/${process.versions.node} gccl/${pkg.version}`,
    });

    return this.makeAuthenticatedRequest(reqOpts, callback);
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
  protected request(reqOpts: ExtendedRequestOptions, callback: (err: Error|null) => void) {
    this.request_(reqOpts, callback);
  }

  /**
   * Make an authenticated API request.
   *
   * @private
   *
   * @param {object} reqOpts - Request options that are passed to `request`.
   * @param {string} reqOpts.uri - A URI relative to the baseUrl.
   */
  protected requestStream(reqOpts: ExtendedRequestOptions) {
    return this.request_(reqOpts);
  }

}
