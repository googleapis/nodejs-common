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

import {kFormat, LEVELS, Logger, LoggerConfig} from './logger';

export interface CustomLevelsLoggerConfig extends LoggerConfig {
  /**
   * The list of levels to use.
   */
  levels: string[];
}

// tslint:disable:no-any
export type CustomLevelsLogger = {
  [kFormat]: (...args: any[]) => string;
  [logLevel: string]: (...args: any[]) => CustomLevelsLogger;
}&{
  format: (...args: any[]) => string;
  levels: string[];
  level: string|false;
};
// tslint:enable:no-any

// tslint:disable-next-line:no-any
function isString(obj: any): obj is string {
  return is.string(obj);
}

function createLogger(optionsOrLevel?: Partial<CustomLevelsLoggerConfig>|
                      string): CustomLevelsLogger {
  // Canonicalize input.
  if (isString(optionsOrLevel)) {
    optionsOrLevel = {
      level: optionsOrLevel,
    };
  }
  const options: CustomLevelsLoggerConfig =
      Object.assign({levels: LEVELS}, Logger.DEFAULT_OPTIONS, optionsOrLevel);
  // ts: We construct other fields on result after its declaration.
  // tslint:disable-next-line:no-any
  const result: CustomLevelsLogger = new Logger(options) as any;
  Object.defineProperty(result, 'format', {
    get() {
      return result[kFormat];
    },
    // tslint:disable-next-line:no-any
    set(value: (...args: any[]) => string) {
      result[kFormat] = value.bind(result);
    }
  });
  return Object.assign(result, {levels: options.levels, level: options.level});
}

/**
 * Create a logger to print output to the console.
 * Omitted options will default to values provided in defaultLoggerOptions.
 */
export const logger = Object.assign(createLogger, {LEVELS});
