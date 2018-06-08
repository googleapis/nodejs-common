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

import assert from 'assert';
import shimmer from 'shimmer';

import * as loggerModule from '../src/logger';
import {Logger, LoggerConfig} from '../src/logger';
import {CustomLevelsLoggerConfig, logger} from '../src/logger-compat';

const LEVELS: Array<'silent'|'error'|'warn'|'info'|'debug'|'silly'> =
    ['silent', 'error', 'warn', 'info', 'debug', 'silly'];

describe('logging', () => {
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

  const lines: string[] = [];

  before(() => {
    shimmer.wrap(console, 'log', () => {
      return (arg: string) => lines.push(`${arg}`);
    });
  });

  beforeEach(() => {
    lines.length = 0;
  });

  after(() => {
    shimmer.unwrap(console, 'log');
  });

  describe('Logger', () => {
    it('should create a logger based on default config parameters', () => {
      const logger = new Logger();
      for (const level of LEVELS) {
        assert.strictEqual(typeof logger[level], 'function');
      }
      logger.error('an error!');
      logger.warn('a warning?');
      assert.strictEqual(getHighestLogLevel(lines, LEVELS), 'error');
    });

    it('can chain log calls', () => {
      const logger = new Logger({level: 'info'});
      logger.error('hi').warn('bye');
      assert.strictEqual(getHighestLogLevel(lines, LEVELS), 'warn');
    });

    it('should not log if level is false', () => {
      const logger = new Logger({level: false});
      for (const level of LEVELS) {
        logger[level]('foo');
      }
      assert.throws(() => getHighestLogLevel(lines, LEVELS));
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
    const customLevels = ['level-1', 'level-2', 'level-3'];

    it('should expose the default list of levels', () => {
      assert.deepStrictEqual(logger.LEVELS, LEVELS);
    });

    it('should create a Logger with the correct defaults', () => {
      let capturedOptions: Partial<LoggerConfig>|null = null;
      class FakeLogger extends Logger {
        static DEFAULT_OPTIONS = Logger.DEFAULT_OPTIONS;
        constructor(options?: Partial<LoggerConfig>) {
          super(options);
          capturedOptions = options!;
        }
      }
      shimmer.wrap(loggerModule, 'Logger', () => FakeLogger);
      try {
        assert.ok(logger() instanceof FakeLogger);
        assert.deepStrictEqual(
            capturedOptions,
            Object.assign(Logger.DEFAULT_OPTIONS, {levels: LEVELS}));
      } finally {
        shimmer.unwrap(loggerModule, 'Logger');
      }
    });

    it('should expose a predictable interface', () => {
      const loggerInstance =
          logger({level: customLevels[0], levels: customLevels});
      assert.strictEqual(loggerInstance.levels, customLevels);
      assert.strictEqual(loggerInstance.level, customLevels[0]);
      assert.strictEqual(loggerInstance.format('hello'), 'HELLO ');
      loggerInstance.format = function(arg) {
        return arg + ' ' + typeof this.format;
      };
      assert.strictEqual(loggerInstance.format('hello'), 'hello function');
    });

    it('should create a logger with custom levels', () => {
      const loggerInstance = logger({level: false, levels: customLevels});
      for (const customLevel of customLevels) {
        assert.strictEqual(typeof loggerInstance[customLevel], 'function');
      }
    });

    it('should use a specified level', () => {
      const level = 'level-2';
      const loggerInstance = logger({level, levels: customLevels});
      for (const customLevel of customLevels) {
        loggerInstance[customLevel]('foo');
      }
      assert.strictEqual(getHighestLogLevel(lines, customLevels), level);
    });

    it('should treat a single arguments as the level', () => {
      const level = 'silly';
      const loggerInstance = logger(level);
      for (const level of LEVELS) {
        loggerInstance[level]('foo');
      }
      assert.strictEqual(getHighestLogLevel(lines, LEVELS), level);
    });
  });
});
