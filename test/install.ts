/**
 * Copyright 2018 Google LLC. All Rights Reserved.
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

import cp from 'child_process';
import mv from 'mv';
import {ncp} from 'ncp';
import os from 'os';
import pify from 'pify';
import tmp from 'tmp';

const mvp = pify(mv);
const ncpp = pify(ncp);
const keep = !!process.env.KEEP_TEMPDIRS;
const stagingDir = tmp.dirSync({keep, unsafeCleanup: true});
const stagingPath = stagingDir.name;
const pkg = require('../../package.json');
const pkgName = 'google-cloud-common';
const npm = os.platform() === 'win32' ? 'npm.cmd' : 'npm';

const spawnp =
    (command: string, args: string[], options: cp.SpawnOptions = {}) => {
      return new Promise((resolve, reject) => {
        cp.spawn(command, args, Object.assign(options, {stdio: 'inherit'}))
            .on('close',
                code => {
                  if (code === 0) {
                    resolve();
                  } else {
                    reject(
                        new Error(`Spawn failed with an exit code of ${code}`));
                  }
                })
            .on('error', reject);
      });
    };

/**
 * Create a staging directory with temp fixtures used to test on a fresh
 * application.
 */
it('should be able to use the d.ts', async () => {
  console.log(`${__filename} staging area: ${stagingPath}`);
  await spawnp(npm, ['pack']);
  const tarball = `${pkgName}-${pkg.version}.tgz`;
  // stagingPath can be on another filesystem so fs.rename() will fail
  // with EXDEV, hence we use `mv` module here.
  await mvp(tarball, `${stagingPath}/${pkgName}.tgz`);
  await ncpp('test/fixtures/kitchen', `${stagingPath}/`);
  await spawnp(npm, ['install'], {cwd: `${stagingPath}/`});
}).timeout(40000);

/**
 * CLEAN UP - remove the staging directory when done.
 */
after('cleanup staging', async () => {
  if (!keep) {
    stagingDir.removeCallback();
  }
});
