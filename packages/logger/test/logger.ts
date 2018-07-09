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

import {Logger} from '../src/logger';

const LEVELS: Array<'silent'|'error'|'warn'|'info'|'debug'|'silly'> =
    ['silent', 'error', 'warn', 'info', 'debug', 'silly'];

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
