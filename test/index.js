/**
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

'use strict';

const assert = require('assert');
const proxyquire = require('proxyquire');

const fakeLogger = {};
const fakeOperation = {};
const fakePaginator = {};
const fakeService = {};
const fakeServiceObject = {};
const fakeUtil = {};

describe('common', function() {
  let common;

  before(function() {
    common = proxyquire('../src/index.js', {
      './logger.js': fakeLogger,
      './operation.js': fakeOperation,
      './paginator.js': fakePaginator,
      './service.js': fakeService,
      './service-object.js': fakeServiceObject,
      './util.js': fakeUtil,
    });
  });

  it('should correctly export the common modules', function() {
    assert.deepEqual(common, {
      logger: fakeLogger,
      Operation: fakeOperation,
      paginator: fakePaginator,
      Service: fakeService,
      ServiceObject: fakeServiceObject,
      util: fakeUtil,
    });
  });
});
