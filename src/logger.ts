/*!
 * Copyright 2016 Google Inc. All Rights Reserved.
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
 * @module common/logger
 */

import * as is from 'is';
const logDriver = require('log-driver');

/**
 * The default list of log levels.
 * @type {string[]}
 */
const LEVELS = ['silent', 'error', 'warn', 'info', 'debug', 'silly'];

/**
 * Create a logger to print output to the console.
 *
 * @param {string=|object=} options - Configuration object. If a string, it is
 *     treated as `options.level`.
 * @param {string=} options.level - The minimum log level that will print to the
 *     console. (Default: `error`)
 * @param {Array.<string>=} options.levels - The list of levels to use. (Default:
 *     logger.LEVELS)
 * @param {string=} options.tag - A tag to use in log messages.
 */
function logger(options) {
  if (is.string(options)) {
    options = {
      level: options,
    };
  }

  options = options || {};

  return logDriver({
    levels: options.levels || LEVELS,

    level: options.level || 'error',

    format() {
      const args = [].slice.call(arguments);
      const level = args.shift().toUpperCase();
      const tag = options.tag ? ':' + options.tag + ':' : '';
      const message = args.join(' ');
      return `${level}${tag} ${message}`;
    },
  });
}

module.exports = logger;
module.exports.LEVELS = LEVELS;
