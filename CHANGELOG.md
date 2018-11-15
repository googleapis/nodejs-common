# Changelog

[npm history][1]

[1]: https://www.npmjs.com/package/@google-cloud/common?activeTab=versions

## v0.26.2

This patch release also brings in a patch dependency update of @google-cloud/projectify which contains a fix for OOM issue.

### Implementation Changes
- ts: genericize CreateOptions in ServiceObject ([#275](https://github.com/googleapis/nodejs-common/pull/275))

### Dependencies
- chore(deps): upgrade @google-cloud/projectify to v0.3.2 ([#301](https://github.com/googleapis/nodejs-common/pull/301))
- chore(deps): update dependency gts to ^0.9.0 ([#300](https://github.com/googleapis/nodejs-common/pull/300))
- chore(deps): update dependency @google-cloud/nodejs-repo-tools to v3 ([#298](https://github.com/googleapis/nodejs-common/pull/298))
- fix(deps): update dependency through2 to v3 ([#295](https://github.com/googleapis/nodejs-common/pull/295))

### Internal / Testing Changes
- chore: update eslintignore config ([#299](https://github.com/googleapis/nodejs-common/pull/299))
- chore: drop contributors from multiple places ([#297](https://github.com/googleapis/nodejs-common/pull/297))
- chore: use latest npm on Windows ([#296](https://github.com/googleapis/nodejs-common/pull/296))
- chore: update CircleCI config ([#294](https://github.com/googleapis/nodejs-common/pull/294))

## v0.26.1

### Dependencies
- chore(deps): upgrade @google-cloud/projectify to ^0.3.1 ([#289](https://github.com/googleapis/nodejs-common/pull/289))

### Internal / Testing Changes
- chore: include build in eslintignore ([#288](https://github.com/googleapis/nodejs-common/pull/288))
- chore: update issue templates ([#284](https://github.com/googleapis/nodejs-common/pull/284))
- chore: remove old issue template ([#282](https://github.com/googleapis/nodejs-common/pull/282))
- build: run tests on node11 ([#280](https://github.com/googleapis/nodejs-common/pull/280))

## v0.26.0

### Implementation Changes
- fix(typescript): Make ResponseCallback match subtype ([#271](https://github.com/googleapis/nodejs-common/pull/271))
- fix: Do not retry streaming POST requests. ([#268](https://github.com/googleapis/nodejs-common/pull/268))
- Don't publish sourcemaps ([#256](https://github.com/googleapis/nodejs-common/pull/256))

### Dependencies
- chore: Remove 'is' dependency ([#270](https://github.com/googleapis/nodejs-common/pull/270))
- chore(deps): update dependency sinon to v7 ([#267](https://github.com/googleapis/nodejs-common/pull/267))
- chore(deps): update dependency typescript to ~3.1.0 ([#259](https://github.com/googleapis/nodejs-common/pull/259))

### Internal / Testing Changes
- chores(build): run codecov on continuous builds ([#276](https://github.com/googleapis/nodejs-common/pull/276))
- chore: update new issue template ([#274](https://github.com/googleapis/nodejs-common/pull/274))
- chore: re-enable codecov ([#266](https://github.com/googleapis/nodejs-common/pull/266))
- test: move install to system tests, and other tsconfig cleanup ([#269](https://github.com/googleapis/nodejs-common/pull/269))
- Update kokoro config ([#264](https://github.com/googleapis/nodejs-common/pull/264))
- docs: Remove appveyor badge from readme ([#262](https://github.com/googleapis/nodejs-common/pull/262))
- Update CI config ([#258](https://github.com/googleapis/nodejs-common/pull/258))
- build: prevent system/sample-test from leaking credentials
- Update the kokoro config ([#254](https://github.com/googleapis/nodejs-common/pull/254))
- test: remove appveyor config ([#253](https://github.com/googleapis/nodejs-common/pull/253))
- Update CI config ([#252](https://github.com/googleapis/nodejs-common/pull/252))

## v0.25.3

### Bug fixes
- fix(types): improve TypeScript types ([#248](https://github.com/googleapis/nodejs-common/pull/248))

## v0.25.2

### Bug fixes
- fix(service): Use getProjectId instead of getDefaultProjectId ([#246](https://github.com/googleapis/nodejs-common/pull/246))

## v0.25.1

### Implementation Changes
- Improve TypeScript types for async operations ([#241](https://github.com/googleapis/nodejs-common/pull/241))
- Enhance typing of ServiceObject.prototype.get ([#239](https://github.com/googleapis/nodejs-common/pull/239))
- Fix TypeScript setMetadata return type ([#240](https://github.com/googleapis/nodejs-common/pull/240))
- Enable no-var in eslint ([#238](https://github.com/googleapis/nodejs-common/pull/238))

## v0.25.0

### Implementation Changes
Some types improvements.
- Improve types for SO.getMetadata, setMetadata ([#235](https://github.com/googleapis/nodejs-common/pull/235))
- Expose the parent property on service-object ([#233](https://github.com/googleapis/nodejs-common/pull/233))

### Internal / Testing Changes
- Update CI config ([#232](https://github.com/googleapis/nodejs-common/pull/232))

## v0.24.0

**BREAKING CHANGES**: This release includes an update to `google-auth-library` [2.0](https://github.com/google/google-auth-library-nodejs/releases/tag/v2.0.0), which has a variety of breaking changes.

### Bug fixes
- fix: set default once (#226)
- fix: export DecorateRequestOptions and BodyResponseCallback (#225)
- fix: fix the types (#221)

### Dependencies
- fix(deps): update dependency google-auth-library to v2 (#224)
- chore(deps): update dependency nyc to v13 (#223)

## v0.23.0

### Fixes
- fix: move repo-tools to dev dependencies (#218)

### Features
- feat: make HTTP dependency configurable (#210)

### Keepin the lights on
- chore: run repo-tools (#219)

## v0.22.0

### Commits

- fix: Remove old code & replace project ID token in multipart arrays. (#215)
- allow ServiceObject`s parent to be an ServiceObject (#212)
- fix: increase timeout for install test (#214)
- chore: remove dead code and packages (#209)
- fix(deps): update dependency pify to v4 (#208)

## v0.21.1

### Bug fixes
- fix: method metadata can be a boolean (#206)

### Build and Test
- test: throw on deprecation (#198)
- chore(deps): update dependency typescript to v3 (#197)
- chore: ignore package-lock.json (#205)

## v0.21.0

**This release has breaking changes**.

#### Node.js support
Versions 4.x and 9.x of node.js are no longer supported.  Please upgrade to node.js 8.x or 10.x.

#### New npm modules
The support for pagination, promisification, and project Id replacement have been moved into their own npm modules.  You can find them at:
- [@google-cloud/projectify](https://github.com/googleapis/nodejs-projectify)
- [@google-cloud/promisify](https://github.com/googleapis/nodejs-promisify)
- [@google-cloud/paginator](https://github.com/googleapis/nodejs-paginator)

These methods have been removed from `@google-cloud/common`.

### Breaking Changes
- fix: drop support for node.js 4.x and 9.x (#190)
- chore: cut out code split into other modules (#194)

### Implementation Changes
- fix: make ServiceObject#id protected to allow subclass access (#200)

### Internal / Testing Changes
- chore(deps): update dependency gts to ^0.8.0 (#192)
- chore: update renovate config (#202)
- refactor: remove circular imports (#201)
- fix: special JSON.stringify for for strictEqual test (#199)
- chore: assert.deelEqual => assert.deepStrictEqual (#196)
- chore: move mocha options to mocha.opts (#195)
- Update config.yml (#191)

