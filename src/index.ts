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

// Logger is new in 0.18.0.
export {Logger} from './logger';
// logger is the interface exported prior to 0.18.0. The two logging-related
// interfaces are not mutually compatible, though the implementation
// of logger is currently a wrapper around Logger.
// TODO: logger should eventually be deprecated.
export {logger} from './logger-compat';

/**
 * @type {module:common/operation}
 * @private
 */
export {Operation} from './operation';

/**
 * @type {module:common/paginator}
 * @private
 */
export {paginator} from './paginator';

/**
 * @type {module:common/service}
 * @private
 */
export {Service} from './service';

/**
 * @type {module:common/serviceObject}
 * @private
 */
export {ServiceObject} from './service-object';

/**
 * @type {module:common/util}
 * @private
 */
exports.util = require('./util');
