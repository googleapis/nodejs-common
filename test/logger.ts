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

import * as assert from 'assert';
import * as shimmer from 'shimmer';

import * as loggerModule from '../src/logger';
import {kFormat, kTag, Logger, LoggerOptions} from '../src/logger';
import {logger} from '../src/logger-compat';

const LEVELS = ['silent', 'error', 'warn', 'info', 'debug', 'silly'];

describe('Logger', () => {
  function getHighestLogLevel(lines: string[], levels: string[]) {
    const index = lines.reduce((highestLogLevel, line) => {
      return Math.max(
          highestLogLevel,
          levels.findIndex(level => line.startsWith(level.toUpperCase())));
    }, -1);
    if (index !== -1) {
      return levels[index];
    }
    throw new Error('No logs with expected format was found');
  }

  const customLevels = ['level-1', 'level-2', 'level-3'];
  const lines: string[] = [];

  before(() => {
    shimmer.wrap(console, 'log', () => {
      return (arg) => lines.push(`${arg}`);
    });
  });

  beforeEach(() => {
    lines.length = 0;
  });

  after(() => {
    shimmer.unwrap(console, 'log');
  });

  it('should create a logger based on default config parameters', () => {
    const logger = new Logger();
    for (const level of LEVELS) {
      assert.strictEqual(typeof logger[level], 'function');
    }
    logger.error('an error!');
    logger.warn('a warning?');
    assert.strictEqual(getHighestLogLevel(lines, LEVELS), 'error');
  });

  it('should create a logger with custom levels', () => {
    const logger = new Logger({level: false, levels: customLevels});
    for (const customLevel of customLevels) {
      assert.strictEqual(typeof logger[customLevel], 'function');
    }
    for (const level of LEVELS) {
      assert.strictEqual(typeof logger[level], 'undefined');
    }
  });

  it('can chain log calls', () => {
    const logger = new Logger({level: 'info'});
    logger.error('hi').warn('bye');
    assert.strictEqual(getHighestLogLevel(lines, LEVELS), 'warn');
  });

  it('should use a specified level', () => {
    const level = 'level-2';
    const logger = new Logger({level, levels: customLevels});
    for (const customLevel of customLevels) {
      logger[customLevel]('foo');
    }
    assert.strictEqual(getHighestLogLevel(lines, customLevels), level);
  });

  it('should not log if level is false', () => {
    const logger = new Logger({level: false, levels: customLevels});
    for (const customLevel of customLevels) {
      logger[customLevel]('foo');
    }
    assert.throws(() => getHighestLogLevel(lines, customLevels));
  });

  it('should throw when specified opts.level is not in opts.levels', () => {
    const level = 'not-a-level';
    assert.throws(() => new Logger({level}));
  });

  describe('formatting', () => {
    const TAG = 'tag-name';
    const MESSAGES = ['message-1', 'message-2'];

    it('should correctly format without a tag', () => {
      new Logger().error(MESSAGES[0], MESSAGES[1]);
      assert.strictEqual(lines.length, 1);
      assert.strictEqual(lines[0], 'ERROR message-1 message-2');
    });

    it('should correctly format with a tag', () => {
      new Logger({
        tag: TAG,
      }).error(MESSAGES[0], MESSAGES[1]);
      assert.strictEqual(lines.length, 1);
      assert.strictEqual(lines[0], 'ERROR:tag-name: message-1 message-2');
    });
  });
});

describe('logger', () => {
  class FakeLogger implements Logger {
    static DEFAULT_OPTIONS = Logger.DEFAULT_OPTIONS;
    // tslint:disable-next-line:no-any
    [logLevel: string]: (...args: any[]) => this;
    [kTag] = '';
    // tslint:disable-next-line:no-any
    [kFormat](level: string, ...args: any[]): string {
      return 'foo';
    }
    constructor(options: Partial<LoggerOptions>) {
      capturedOptions = options;
    }
  }

  let capturedOptions: Partial<LoggerOptions>|null = null;

  before(() => {
    shimmer.wrap(loggerModule, 'Logger', () => FakeLogger);
  });

  beforeEach(() => {
    capturedOptions = null;
  });

  after(() => {
    shimmer.unwrap(loggerModule, 'Logger');
  });

  it('should expose the default list of levels', () => {
    assert.deepStrictEqual(logger.LEVELS, LEVELS);
  });

  it('should create a Logger with the correct defaults', () => {
    assert.ok(logger() instanceof FakeLogger);
    assert.deepStrictEqual(capturedOptions, Logger.DEFAULT_OPTIONS);
  });

  it('should expose a predictable interface', () => {
    const loggerInstance = logger();
    assert.strictEqual(loggerInstance.levels, capturedOptions!.levels);
    assert.strictEqual(loggerInstance.level, capturedOptions!.level);
    assert.strictEqual(loggerInstance.format('hello'), 'foo');
    loggerInstance.format = function(arg) {
      return arg + ' ' + typeof this.format;
    };
    assert.strictEqual(loggerInstance.format('hello'), 'hello function');
  });

  it('should create a Logger with custom levels', () => {
    const customLevels = ['level-1', 'level-2', 'level-3'];
    logger({levels: customLevels});
    assert.deepStrictEqual(capturedOptions!.levels, customLevels);
  });

  it('should use a specified level', () => {
    const level = 'level';
    logger({level});
    assert.deepStrictEqual(capturedOptions!.level, level);
  });

  it('should treat a single arguments as the level', () => {
    const level = 'level';
    logger(level);
    assert.deepStrictEqual(capturedOptions!.level, level);
  });
});
