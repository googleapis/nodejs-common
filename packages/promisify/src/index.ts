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

export interface PromisifyAllOptions extends PromisifyOptions {
  /**
   * Array of methods to ignore when promisifying.
   */
  exclude?: string[];
}

export interface PromisifyOptions {
  /**
   * Resolve the promise with single arg instead of an array.
   */
  singular?: boolean;
}

export interface PromiseMethod extends Function {
  promisified_?: boolean;
}

export interface WithPromise {
  Promise?: PromiseConstructor;
}

/**
 * Wraps a callback style function to conditionally return a promise.
 *
 * @param {function} originalMethod - The method to promisify.
 * @param {object=} options - Promise options.
 * @param {boolean} options.singular - Resolve the promise with single arg instead of an array.
 * @return {function} wrapped
 */
export function promisify(
    originalMethod: PromiseMethod, options?: PromisifyOptions) {
  if (originalMethod.promisified_) {
    return originalMethod;
  }

  options = options || {};

  const slice = Array.prototype.slice;

  // tslint:disable-next-line:no-any
  const wrapper: any = function(this: WithPromise) {
    const context = this;
    let last;

    for (last = arguments.length - 1; last >= 0; last--) {
      const arg = arguments[last];

      if (typeof arg === 'undefined') {
        continue;  // skip trailing undefined.
      }

      if (typeof arg !== 'function') {
        break;  // non-callback last argument found.
      }

      return originalMethod.apply(context, arguments);
    }

    // peel trailing undefined.
    const args = slice.call(arguments, 0, last + 1);

    // tslint:disable-next-line:variable-name
    let PromiseCtor = Promise;

    // Because dedupe will likely create a single install of
    // @google-cloud/common to be shared amongst all modules, we need to
    // localize it at the Service level.
    if (context && context.Promise) {
      PromiseCtor = context.Promise;
    }

    return new PromiseCtor((resolve, reject) => {
      // tslint:disable-next-line:no-any
      args.push((...args: any[]) => {
        const callbackArgs = slice.call(args);
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
// tslint:disable-next-line:variable-name
export function promisifyAll(Class: Function, options?: PromisifyAllOptions) {
  const exclude = (options && options.exclude) || [];
  const ownPropertyNames = Object.getOwnPropertyNames(Class.prototype);
  const methods = ownPropertyNames.filter((methodName) => {
    // clang-format off
    return (
      typeof Class.prototype[methodName] === 'function' && // is it a function?
      !/(^_|(Stream|_)|promise$)|^constructor$/.test(methodName) && // is it promisable?
      exclude.indexOf(methodName) === -1
    ); // is it blacklisted?
    // clang-format on
  });

  methods.forEach((methodName) => {
    const originalMethod = Class.prototype[methodName];
    if (!originalMethod.promisified_) {
      Class.prototype[methodName] = exports.promisify(originalMethod, options);
    }
  });
}
