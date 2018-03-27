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
import * as proxyquire from 'proxyquire';

const LEVELS = ['silent', 'error', 'warn', 'info', 'debug', 'silly'];

function fakeLogDriver(config) {
  return config;
}

describe('logger base-functionality', function() {
  let logger;

  before(function() {
    logger = proxyquire('../src/logger.js', {
      'log-driver': fakeLogDriver,
    });
  });

  it('should expose the default list of levels', function() {
    assert.deepEqual(logger.LEVELS, LEVELS);
  });

  it('should create a logger with the correct levels', function() {
    assert.deepEqual(logger().levels, LEVELS);
  });

  it('should create a logger with custom levels', function() {
    const customLevels = ['level-1', 'level-2', 'level-3'];
    assert.deepEqual(logger({levels: customLevels}).levels, customLevels);
  });

  it('should use a specified level', function() {
    const level = 'level';
    assert.strictEqual(logger({level}).level, level);
  });

  it('should treat a single arguments as the level', function() {
    const level = 'level';
    assert.strictEqual(logger(level).level, level);
  });

  it('should default level to error', function() {
    assert.strictEqual(logger().level, 'error');
  });

  describe('formatting', function() {
    const LEVEL = 'level-name';
    const TAG = 'tag-name';
    const MESSAGES = ['message-1', 'message-2'];

    it('should correctly format without a tag', function() {
      const formatted = logger().format(LEVEL, MESSAGES[0], MESSAGES[1]);

      assert.strictEqual(formatted, 'LEVEL-NAME message-1 message-2');
    });

    it('should correctly format with a tag', function() {
      const formatted = logger({
        tag: TAG,
      }).format(LEVEL, MESSAGES[0], MESSAGES[1]);

      assert.strictEqual(formatted, 'LEVEL-NAME:tag-name: message-1 message-2');
    });
  });
});
