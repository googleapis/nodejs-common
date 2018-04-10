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

/*!
 * @module common/logger
 */

export interface LoggerOptions {
  /**
   * The minimum log level that will print to the console.
   */
  level: string|false;

  /**
   * The list of levels to use.
   */
  levels: string[];

  /**
   * A tag to use in log messages.
   */
  tag: string;
}

/**
 * The default list of log levels.
 */
const LEVELS = ['silent', 'error', 'warn', 'info', 'debug', 'silly'];

export const kFormat = Symbol('Logger formatter');
export const kTag = Symbol('Logger tag format');

export class Logger {
  /**
   * Default logger options.
   */
  static DEFAULT_OPTIONS:
      Readonly<LoggerOptions> = {level: 'error', levels: LEVELS, tag: ''};

  [kTag]: string;
  // tslint:disable-next-line:no-any
  [logLevel: string]: (...args: any[]) => void;

  /**
   * Create a logger to print output to the console.
   */
  constructor(opts?: Partial<LoggerOptions>) {
    const options: LoggerOptions =
        Object.assign({}, Logger.DEFAULT_OPTIONS, opts);
    this[kTag] = options.tag ? ':' + options.tag + ':' : '';

    // Determine lowest log level.
    // If the given level is set to false, don't log anything.
    let levelIndex = -1;
    if (options.level !== false) {
      levelIndex = options.level ? options.levels.indexOf(options.level) :
                                   options.levels.length - 1;
      if (levelIndex === -1) {
        throw new Error(`Logger: options.level [${
            options.level}] is not one of options.levels [${
            options.levels.join(', ')}]`);
      }
    }

    for (let i = 0; i < options.levels.length; i++) {
      const level = options.levels[i];
      if (i <= levelIndex) {
        this[level] = function() {
          const args = Array.prototype.slice.call(arguments);
          args.unshift(level);
          console.log(this[kFormat].apply(this, args));
        };
      } else {
        this[level] = () => {};
      }
    }
  }

  // tslint:disable-next-line:no-any
  [kFormat](...fnArgs: any[]): string {
    const args = Array.prototype.slice.call(arguments);
    const level = args[0].toUpperCase();
    const message = args.slice(1).join(' ');
    return `${level}${this[kTag]} ${message}`;
  }
}
