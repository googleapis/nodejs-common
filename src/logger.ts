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

/**
 * Configuration options to be passed to the Logger constructor.
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

  private[kTag]: string;

  // ts: The compiler can't statically detect that these will be definitely
  // assigned. They will be if default log levels are used, so we use non-null
  // annotations here.
  // tslint:disable:no-any
  silent!: (...args: any[]) => this;
  error!: (...args: any[]) => this;
  warn!: (...args: any[]) => this;
  info!: (...args: any[]) => this;
  debug!: (...args: any[]) => this;
  silly!: (...args: any[]) => this;
  // tslint:enable:no-any

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
        // ts: This doesn't have an index signature, but we want to set
        // properties anyway.
        // tslint:disable-next-line:no-any
        (this as any)[level] = (...args: any[]) => {
          args.unshift(level);
          console.log(this[kFormat].apply(this, args));
          return this;
        };
      } else {
        // tslint:disable-next-line:no-any
        (this as any)[level] = () => this;
      }
    }
  }

  // tslint:disable-next-line:no-any
  private[kFormat](level: string, ...args: any[]): string {
    level = level.toUpperCase();
    const message = args.join(' ');
    return `${level}${this[kTag]} ${message}`;
  }
}

/**
 * A type to which a Logger instance can be casted, which defines additional
 * custom log levels on the Logger instance.
 * Ex: `const l = new Logger() as CustomLevelsLogger;`
 */
export interface CustomLevelsLogger extends Logger {
  // tslint:disable-next-line:no-any
  [logLevel: string]: (...args: any[]) => this;
}
