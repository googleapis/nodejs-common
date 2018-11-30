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
 * @module common/service-object
 */

import {promisifyAll} from '@google-cloud/promisify';
import * as arrify from 'arrify';
import {EventEmitter} from 'events';
import * as extend from 'extend';
import * as r from 'request';  // Only needed for type declarations.

import {StreamRequestOptions} from '.';
import {ApiError, BodyResponseCallback, DecorateRequestOptions, util} from './util';

export type CreateOptions = {};

export interface ServiceObjectParent {
  // tslint:disable-next-line:variable-name
  Promise?: PromiseConstructor;
  requestStream(reqOpts: DecorateRequestOptions): r.Request;
  request(reqOpts: DecorateRequestOptions): Promise<r.Response>;
  request(reqOpts: DecorateRequestOptions, callback: BodyResponseCallback):
      void;
}

export interface Interceptor {
  request(opts: r.Options): DecorateRequestOptions;
}

// tslint:disable-next-line:no-any
export type Metadata = any;

export type GetMetadataCallback =
    (err: Error|null, metadata?: Metadata|null, apiResponse?: r.Response) =>
        void;

export interface ExistsCallback {
  (err: Error|null, exists?: boolean): void;
}

export interface ServiceObjectConfig {
  /**
   * The base URL to make API requests to.
   */
  baseUrl?: string;

  /**
   * The method which creates this object.
   */
  createMethod?: Function;

  /**
   * The identifier of the object. For example, the name of a Storage bucket or
   * Pub/Sub topic.
   */
  id?: string;

  /**
   * A map of each method name that should be inherited.
   */
  methods?: Methods;

  /**
   * The parent service instance. For example, an instance of Storage if the
   * object is Bucket.
   */
  parent: ServiceObjectParent;

  /**
   * Dependency for HTTP calls.
   */
  requestModule: typeof r;
}

export interface Methods {
  [methodName: string]: {reqOpts?: r.CoreOptions}|boolean;
}

export interface InstanceResponseCallback<T> {
  (err: ApiError|null, instance?: T|null, apiResponse?: r.Response): void;
}

// tslint:disable-next-line no-any
export type CreateResponse<T> = [T, ...any[]];
export interface CreateCallback<T> {
  // tslint:disable-next-line no-any
  (err: ApiError|null, instance?: T|null, ...args: any[]): void;
}

export interface DeleteCallback {
  (err: Error|null, apiResponse?: r.Response): void;
}

export interface GetConfig {
  /**
   * Create the object if it doesn't already exist.
   */
  autoCreate?: boolean;
}

export interface ResponseCallback {
  (err?: Error|null, apiResponse?: r.Response): void;
}

export type SetMetadataResponse = [r.Response];
export type GetResponse<T> = [T, r.Response];

/**
 * ServiceObject is a base class, meant to be inherited from by a "service
 * object," like a BigQuery dataset or Storage bucket.
 *
 * Most of the time, these objects share common functionality; they can be
 * created or deleted, and you can get or set their metadata.
 *
 * By inheriting from this class, a service object will be extended with these
 * shared behaviors. Note that any method can be overridden when the service
 * object requires specific behavior.
 */
// tslint:disable-next-line no-any
class ServiceObject<T = any> extends EventEmitter {
  metadata: Metadata;
  baseUrl?: string;
  parent: ServiceObjectParent;
  id?: string;
  private createMethod?: Function;
  protected methods: Methods;
  protected interceptors: Interceptor[];
  // tslint:disable-next-line:variable-name
  Promise?: PromiseConstructor;
  requestModule: typeof r;

  /*
   * @constructor
   * @alias module:common/service-object
   *
   * @private
   *
   * @param {object} config - Configuration object.
   * @param {string} config.baseUrl - The base URL to make API requests to.
   * @param {string} config.createMethod - The method which creates this object.
   * @param {string=} config.id - The identifier of the object. For example, the
   *     name of a Storage bucket or Pub/Sub topic.
   * @param {object=} config.methods - A map of each method name that should be inherited.
   * @param {object} config.methods[].reqOpts - Default request options for this
   *     particular method. A common use case is when `setMetadata` requires a
   *     `PUT` method to override the default `PATCH`.
   * @param {object} config.parent - The parent service instance. For example, an
   *     instance of Storage if the object is Bucket.
   */
  constructor(config: ServiceObjectConfig) {
    super();
    this.metadata = {};
    this.baseUrl = config.baseUrl;
    this.parent = config.parent;  // Parent class.
    this.id = config.id;  // Name or ID (e.g. dataset ID, bucket name, etc).
    this.createMethod = config.createMethod;
    this.methods = config.methods || {};
    this.interceptors = [];
    this.Promise = this.parent ? this.parent.Promise : undefined;
    this.requestModule = config.requestModule;

    if (config.methods) {
      Object.getOwnPropertyNames(ServiceObject.prototype)
          .filter(methodName => {
            return (
                // All ServiceObjects need `request`.
                // clang-format off
                !/^request/.test(methodName) &&
                // clang-format on
                // The ServiceObject didn't redefine the method.
                // tslint:disable-next-line no-any
                (this as any)[methodName] ===
                    // tslint:disable-next-line no-any
                    (ServiceObject.prototype as any)[methodName] &&
                // This method isn't wanted.
                !config.methods![methodName]);
          })
          .forEach(methodName => {
            // tslint:disable-next-line no-any
            (this as any)[methodName] = undefined;
          });
    }
  }

  /**
   * Create the object.
   *
   * @param {object=} options - Configuration object.
   * @param {function} callback - The callback function.
   * @param {?error} callback.err - An error returned while making this request.
   * @param {object} callback.instance - The instance.
   * @param {object} callback.apiResponse - The full API response.
   */
  create(options?: CreateOptions): Promise<CreateResponse<T>>;
  create(options: CreateOptions, callback: CreateCallback<T>): void;
  create(callback: CreateCallback<T>): void;
  create(
      optionsOrCallback?: CreateOptions|CreateCallback<T>,
      callback?: CreateCallback<T>): void|Promise<CreateResponse<T>> {
    const self = this;
    const args = [this.id] as Array<{}>;

    if (typeof optionsOrCallback === 'function') {
      callback = optionsOrCallback as CreateCallback<T>;
    }

    if (typeof optionsOrCallback === 'object') {
      args.push(optionsOrCallback);
    }

    // Wrap the callback to return *this* instance of the object, not the
    // newly-created one.
    // tslint: disable-next-line no-any
    function onCreate(...args: [Error, ServiceObject<T>]) {
      const [err, instance] = args;
      if (!err) {
        self.metadata = instance.metadata;
        args[1] = self;  // replace the created `instance` with this one.
      }
      callback!(...args as {} as [Error, T]);
    }
    args.push(onCreate);
    this.createMethod!.apply(null, args);
  }


  /**
   * Delete the object.
   *
   * @param {function=} callback - The callback function.
   * @param {?error} callback.err - An error returned while making this request.
   * @param {object} callback.apiResponse - The full API response.
   */
  delete(): Promise<[r.Response]>;
  delete(callback: DeleteCallback): void;
  delete(callback?: DeleteCallback): Promise<[r.Response]>|void {
    const methodConfig =
        (typeof this.methods.delete === 'object' && this.methods.delete) || {};
    callback = callback || util.noop;

    const reqOpts = extend(
        {
          method: 'DELETE',
          uri: '',
        },
        methodConfig.reqOpts);

    // The `request` method may have been overridden to hold any special
    // behavior. Ensure we call the original `request` method.
    this.request(reqOpts).then(res => callback!(null, res), callback);
  }

  /**
   * Check if the object exists.
   *
   * @param {function} callback - The callback function.
   * @param {?error} callback.err - An error returned while making this request.
   * @param {boolean} callback.exists - Whether the object exists or not.
   */
  exists(): Promise<[boolean]>;
  exists(callback: ExistsCallback): void;
  exists(callback?: ExistsCallback): void|Promise<[boolean]> {
    this.get(err => {
      if (err) {
        if (err.code === 404) {
          callback!(null, false);
        } else {
          callback!(err);
        }
        return;
      }
      callback!(null, true);
    });
  }

  /**
   * Get the object if it exists. Optionally have the object created if an
   * options object is provided with `autoCreate: true`.
   *
   * @param {object=} config - The configuration object that will be used to
   *     create the object if necessary.
   * @param {boolean} config.autoCreate - Create the object if it doesn't already exist.
   * @param {function} callback - The callback function.
   * @param {?error} callback.err - An error returned while making this request.
   * @param {object} callback.instance - The instance.
   * @param {object} callback.apiResponse - The full API response.
   */
  get(config?: GetConfig&CreateOptions): Promise<GetResponse<T>>;
  get(callback: InstanceResponseCallback<T>): void;
  get(config: GetConfig&CreateOptions,
      callback: InstanceResponseCallback<T>): void;
  get(arg0?: (GetConfig&CreateOptions)|InstanceResponseCallback<T>,
      arg1?: InstanceResponseCallback<T>): void|Promise<GetResponse<T>> {
    const self = this;

    let callback = arg1;
    if (typeof arg0 === 'function') {
      callback = arg0;
    }

    let config: GetConfig&CreateOptions = {} as GetConfig & CreateOptions;
    if (typeof arg0 === 'object') {
      config = arg0;
    }

    const autoCreate = config.autoCreate && typeof this.create === 'function';
    delete config.autoCreate;

    function onCreate(
        err: ApiError|null, instance: T, apiResponse: r.Response) {
      if (err) {
        if (err.code === 409) {
          self.get(config, callback!);
          return;
        }
        callback!(err, null, apiResponse);
        return;
      }
      callback!(null, instance, apiResponse);
    }

    this.getMetadata((e, metadata) => {
      const err = e as ApiError;
      if (err) {
        if (err.code === 404 && autoCreate) {
          const args: Array<Function|GetConfig&CreateOptions> = [];
          if (Object.keys(config).length > 0) {
            args.push(config);
          }
          args.push(onCreate);
          self.create(...args);
          return;
        }
        callback!(err, null, metadata as r.Response);
        return;
      }
      callback!(null, self as {} as T, metadata as r.Response);
    });
  }

  /**
   * Get the metadata of this object.
   *
   * @param {function} callback - The callback function.
   * @param {?error} callback.err - An error returned while making this request.
   * @param {object} callback.metadata - The metadata for this object.
   * @param {object} callback.apiResponse - The full API response.
   */
  getMetadata(): Promise<Metadata>;
  getMetadata(callback: GetMetadataCallback): void;
  getMetadata(callback?: GetMetadataCallback): Promise<Metadata>|void {
    const methodConfig = (typeof this.methods.getMetadata === 'object' &&
                          this.methods.getMetadata) ||
        {};
    const reqOpts = extend(
        {
          uri: '',
        },
        methodConfig.reqOpts);

    // The `request` method may have been overridden to hold any special
    // behavior. Ensure we call the original `request` method.
    this.request(reqOpts).then(resp => {
      this.metadata = resp.body;
      callback!(null, this.metadata, resp);
    }, callback);
  }

  /**
   * Set the metadata for this object.
   *
   * @param {object} metadata - The metadata to set on this object.
   * @param {function=} callback - The callback function.
   * @param {?error} callback.err - An error returned while making this request.
   * @param {object} callback.apiResponse - The full API response.
   */
  setMetadata(metadata: Metadata): Promise<SetMetadataResponse>;
  setMetadata(metadata: Metadata, callback: ResponseCallback): void;
  setMetadata(metadata: Metadata, callback?: ResponseCallback):
      Promise<SetMetadataResponse>|void {
    const self = this;
    callback = callback || util.noop;
    const methodConfig = (typeof this.methods.setMetadata === 'object' &&
                          this.methods.setMetadata) ||
        {};

    const reqOpts = extend(
        true, {
          method: 'PATCH',
          uri: '',
          json: metadata,
        },
        methodConfig.reqOpts);

    // The `request` method may have been overridden to hold any special
    // behavior. Ensure we call the original `request` method.
    this.request(reqOpts).then((resp: r.Response) => {
      self.metadata = resp;
      callback!(null, resp);
    }, callback);
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
    reqOpts = extend(true, {}, reqOpts);

    const isAbsoluteUrl = reqOpts.uri.indexOf('http') === 0;

    const uriComponents = [this.baseUrl, this.id || '', reqOpts.uri];

    if (isAbsoluteUrl) {
      uriComponents.splice(0, uriComponents.indexOf(reqOpts.uri));
    }

    reqOpts.uri = uriComponents
                      .filter(x => x!.trim())  // Limit to non-empty strings.
                      .map(uriComponent => {
                        const trimSlashesRegex = /^\/*|\/*$/g;
                        return uriComponent!.replace(trimSlashesRegex, '');
                      })
                      .join('/');

    const childInterceptors = arrify(reqOpts.interceptors_);
    const localInterceptors = [].slice.call(this.interceptors);

    reqOpts.interceptors_ = childInterceptors.concat(localInterceptors);

    if (reqOpts.shouldReturnStream) {
      return this.parent.requestStream(reqOpts);
    }

    return this.parent.request(reqOpts);
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
            err, err.response ? err.response.body : null, err.response));
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

promisifyAll(
    ServiceObject, {exclude: ['requestStream', 'request', 'request_']});

export {ServiceObject};
