/**
 * Copyright 2014 Google Inc. All Rights Reserved.
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

/**
 * Populate the `{{projectId}}` placeholder.
 *
 * @throws {Error} If a projectId is required, but one is not provided.
 *
 * @param {*} - Any input value that may contain a placeholder. Arrays and objects will be looped.
 * @param {string} projectId - A projectId. If not provided
 * @return {*} - The original argument with all placeholders populated.
 */
// tslint:disable-next-line:no-any
export function replaceProjectIdToken(value: any, projectId: string): any {
  if (Array.isArray(value)) {
    value = (value as string[]).map(v => replaceProjectIdToken(v, projectId));
  }

  if (value !== null && typeof value === 'object' &&
      typeof value.hasOwnProperty === 'function') {
    for (const opt in value) {
      if (value.hasOwnProperty(opt)) {
        value[opt] = replaceProjectIdToken(value[opt], projectId);
      }
    }
  }

  if (typeof value === 'string' &&
      (value as string).indexOf('{{projectId}}') > -1) {
    if (!projectId || projectId === '{{projectId}}') {
      throw new MissingProjectIdError();
    }
    value = (value as string).replace(/{{projectId}}/g, projectId);
  }

  return value;
}

/**
 * Custom error type for missing project ID errors.
 */
export class MissingProjectIdError extends Error {
  message = `Sorry, we cannot connect to Cloud Services without a project
    ID. You may specify one with an environment variable named
    "GOOGLE_CLOUD_PROJECT".`.replace(/ +/g, ' ');
}
