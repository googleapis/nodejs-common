# Changelog

[npm history][1]

[1]: https://www.npmjs.com/package/nodejs-common?activeTab=versions

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

