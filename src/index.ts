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

export {GoogleAuthOptions} from 'google-auth-library';

/**
 * @type {module:common/operation}
 * @private
 */
export {Operation} from './operation';
/**
 * @type {module:common/service}
 * @private
 */
export {Service, ServiceConfig, ServiceOptions, StreamRequestOptions} from './service';
/**
 * @type {module:common/serviceObject}
 * @private
 */
export {CreateOptions, DeleteCallback, ExistsCallback, GetConfig, GetMetadataCallback, InstanceResponseCallback, Interceptor, Metadata, Methods, ServiceObject, ServiceObjectConfig} from './service-object';
/**
 * @type {module:common/util}
 * @private
 */
export {Abortable, AbortableDuplex, ApiError, util} from './util';
