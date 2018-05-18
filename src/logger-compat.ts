/*!
 * Copyright 2018 Google LLC
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

/**
 * This file exports the logger function with the surface present in <=0.17.0.
 */

import * as is from 'is';

import {kFormat, Logger, LoggerConfig} from './logger';

// tslint:disable-next-line:no-any
function isString(obj: any): obj is string {
  return is.string(obj);
}

function createLogger(optionsOrLevel?: Partial<LoggerConfig>|string) {
  // Canonicalize input.
  if (isString(optionsOrLevel)) {
    optionsOrLevel = {
      level: optionsOrLevel,
    };
  }
  const options: LoggerConfig =
      Object.assign({}, Logger.DEFAULT_OPTIONS, optionsOrLevel);
  const result = new Logger(options);
  Object.defineProperty(result, 'format', {
    get() {
      return result[kFormat];
    },
    // tslint:disable-next-line:no-any
    set(value: (...args: any[]) => string) {
      result[kFormat] = value.bind(result);
    }
  });
  return Object.assign(
      // tslint:disable-next-line:no-any
      result as Logger & {format: (...args: any[]) => string},
      {levels: options.levels, level: options.level});
}

const LEVELS = Logger.DEFAULT_OPTIONS.levels;

/**
 * Create a logger to print output to the console.
 * Omitted options will default to values provided in defaultLoggerOptions.
 */
export const logger = Object.assign(createLogger, {LEVELS});
