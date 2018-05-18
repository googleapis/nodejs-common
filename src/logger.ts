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

export interface LoggerConfig {
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

/**
 * A class representing a basic logger that emits logs to stdout.
 */
export class Logger {
  /**
   * Default logger options.
   */
  static DEFAULT_OPTIONS:
      Readonly<LoggerConfig> = {level: 'error', levels: LEVELS, tag: ''};

  // TODO: Mark this private when TypeScript 2.9 comes out.
  // See https://github.com/Microsoft/TypeScript/issues/20080 for more
  // information.
  [kTag]: string;

  /**
   * Emits a log at this log level.
   */
  // tslint:disable-next-line:no-any
  [logLevel: string]: (...args: any[]) => this;

  /**
   * Create a logger to print output to the console.
   */
  constructor(opts?: Partial<LoggerConfig>) {
    const options: LoggerConfig =
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
        this[level] = (...args) => {
          args.unshift(level);
          console.log(this[kFormat].apply(this, args));
          return this;
        };
      } else {
        this[level] = () => this;
      }
    }
  }

  // TODO: Mark this as protected when TypeScript 2.9 comes out.
  // tslint:disable-next-line:no-any
  [kFormat](level: string, ...args: any[]): string {
    level = level.toUpperCase();
    const message = args.join(' ');
    return `${level}${this[kTag]} ${message}`;
  }
}
