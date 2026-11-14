# Development notes

## Goal and scope

`goe-wallbox` mirrors a go-e Charger into ioBroker states. It contains no charging logic and is meant to stay that
way: no surplus control, no schedules, no assumptions about what the user wants the wallbox to do.

The only source for the behaviour of the wallbox is the
[official go-e API documentation](https://github.com/goecharger/go-eCharger-API-v2) and measurements on real devices.
The adapter is written from scratch; code of other adapters is not used as a template.

## Layout

| Path                         | Content                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `src/main.ts`                | Adapter class: configuration, poll loop, object creation, write handling             |
| `src/lib/transport.ts`       | `ChargerTransport` interface: `read(keys)` and `write(key, value)`                   |
| `src/lib/httpV2Transport.ts` | Local HTTP API v2 (`/api/status?filter=…`, `/api/set?key=<json>`)                    |
| `src/lib/datapoints.ts`      | Table of all states: id, API keys, type, role, unit, value list, read/write mapping  |
| `src/lib/*.test.ts`          | Unit tests, compiled to `build/` and run from there (not part of the npm package)    |
| `admin/jsonConfig.json`      | Instance settings; texts in `admin/i18n/<lang>/translations.json`                    |
| `test/package.js`            | Validation of `package.json` and `io-package.json`                                   |
| `test/integration.js`        | Starts the adapter in a real js-controller                                           |
| `scripts/check-release.mjs`  | Checks versions, news and release notes before a release                             |
| `docs/de/README.md`          | German readme; keep it in step with `README.md`                                      |

## How it works

- One poll loop per wallbox. Each cycle is a single filtered status request for exactly the keys the datapoints need,
  plus the user's additional keys.
- The serial number (`sse`) becomes the device id. Nothing is created before the first answer.
- A state object is created the first time the firmware delivers its key. Keys a firmware does not know simply stay
  away.
- States are written only when the value changed; measurements are rounded in `datapoints.ts` to keep the noise down.
- A write (`ack = false`) is validated by the datapoint, sent, and followed by a re-read after one second. The state
  is acknowledged with the value the wallbox reports. On any failure the last reported value is restored.
- In read-only mode nothing is ever sent.

## Conventions

- Values are reported under the key names of API v2 on the transport level, whatever API delivered them. A transport
  for the legacy API v1 has to translate its fields to these names; the datapoints must not change.
- State ids are part of the public interface. Do not rename or re-scale an existing state; add a new one instead.
- Code, log messages and commit messages are in English. User-facing texts exist in English and German.
- Member names of the adapter class must not collide with members of the ioBroker base class (for example
  `connected` or `createDevice`); the type check reports such collisions.
- No example in code, tests or documentation may contain real addresses, serial numbers or other data of an actual
  installation. Use obviously generic values.

## Adding a datapoint

1. Look up the key in the API documentation (type, read/write, value list).
2. Add an entry to `DATAPOINTS` in `src/lib/datapoints.ts`. Use the helpers (`numberOf`, `enumTo`, …); a `read`
   function returns `undefined` if the key is missing and `null` if the wallbox reports no value.
3. Add or extend a unit test.
4. Document the state in both readmes.

## Checks before every commit

```bash
npm run check
npm run lint
npm test
```

`npm run test:integration` downloads a js-controller and takes about a minute; run it before a release and after
changes to `main.ts` or `io-package.json`.

## Installing a package file

Before the adapter is listed in the ioBroker repository, and for test versions, it is installed from a package file
(`.tgz`). Installing directly from the GitHub repository URL does **not** work: the repository contains only the
TypeScript sources, the compiled code is part of the package file.

1. Download `iobroker.goe-wallbox-<version>.tgz` from the releases of this repository, or build it on any computer
   with Node.js 22 or newer:

    ```bash
    git clone https://github.com/BenZ-ITS/ioBroker.goe-wallbox.git
    cd ioBroker.goe-wallbox
    npm ci
    npm run build
    npm pack
    ```

    Do not rename the file: ioBroker derives the adapter name from the file name.

2. In the admin interface open **Adapters** and switch on the **expert mode** (head icon at the bottom of the side
   menu; it only applies to the current browser session).
3. Click the **GitHub icon** in the toolbar and choose one of these tabs:
    - **From file**: select the `.tgz` on your computer.
    - **Custom**: enter a URL of the `.tgz` that the ioBroker host can reach, or the path of the file on the ioBroker
      host.
4. Leave "Create instance if it does not exist yet" checked and click **Install**. The red warning in the dialog is
   shown for every installation from outside the official repository.

On the command line of the ioBroker host:

```bash
iobroker url /path/to/iobroker.goe-wallbox-<version>.tgz
iobroker add goe-wallbox
```

A newer package file is installed the same way; instance and settings are kept.

## Releasing

Releases are made with the [release script](https://github.com/AlCalzone/release-script) (`.releaseconfig.json`,
plugins `iobroker`, `license` and `manual-review`). The GitHub workflow then tests the tag, publishes the package to
npm and creates the GitHub release.

1. Below the placeholder `### **WORK IN PROGRESS**` in the changelog of `README.md` add one line per change
   (`- …`). The release script turns these lines into the changelog entry and into `common.news` of
   `io-package.json`, translated into all ioBroker languages.
2. Write the release notes in `docs/release-notes/<new version>.md` (see below).
3. Commit both. The working tree must be clean; run all checks including the integration test.
4. Run `npm run release patch` (or `minor`, `major`). The script raises the version in `package.json` and
   `io-package.json`, updates changelog and news, and pauses for a review: check the German news text and correct
   it if needed. Before committing it builds the adapter and runs `scripts/check-release.mjs` (same version
   everywhere, English and German news, release notes present). It then commits, tags `v<version>` and pushes both.
   `npm run release patch -- --dry` shows what would happen without changing anything.
5. The workflow runs all tests for the tag, checks the release metadata again, publishes to npm (`deploy` job) and
   creates the GitHub release. The job `release-notes` attaches the `.tgz` from `npm pack` and replaces the text of
   the release with the release notes.

If a release step fails after the tag was pushed, fix the cause, delete the tag (`git push origin :refs/tags/v<version>`
and `git tag -d v<version>`) and release a new patch version rather than moving the tag.

### Release notes

Every version gets a file `docs/release-notes/<version>.md` with an English and a German part. Each part answers
three questions: what changed, what it means for users (states, settings, scripts, anything to do after the update)
and why the change was made. The short entry in `common.news` is what the admin interface shows; the release notes
are the full description.

```markdown
## English

### What changed

### Impact

### Why

## Deutsch

### Was sich geändert hat

### Auswirkungen

### Hintergrund
```

## Publishing in the ioBroker repository

The requirements are listed in [ioBroker.repositories](https://github.com/ioBroker/ioBroker.repositories#readme);
the [adapter checker](https://adapter-check.iobroker.in/) tests them. Check both again before each step, they change.

1. The repository is public, has a description and topics (GitHub: settings button beside "About"), and the test
   matrix in the workflow covers Linux, Windows and macOS.
2. First publication on npm, by hand, because trusted publishing can only be configured for an existing package:
   `npm login`, then `npm publish` from a clean checkout of the latest release tag after `npm ci && npm run build`.
   The `deploy` job of that tag fails until then; this is expected.
3. On npmjs.com: package → **Settings → Trusted publishers → GitHub Actions**, owner `BenZ-ITS`, repository
   `ioBroker.goe-wallbox`, workflow `test-and-release.yml`, no environment. From then on the `deploy` job publishes
   without a token.
4. Add the ioBroker organisation as owner: `npm owner add bluefox iobroker.goe-wallbox`. The invitation has to be
   accepted, which can take a day or two.
5. Run the adapter checker and fix all errors.
6. Add the adapter to the **latest** (beta) repository: on [iobroker.dev](https://www.iobroker.dev) log in with
   GitHub, open the adapter, **manage → ADD TO LATEST**; or fork `ioBroker/ioBroker.repositories` and run
   `npm run addToLatest -- --name goe-wallbox --type energy`, then open a pull request.
7. For **stable**: open a test thread in the ioBroker forum, collect feedback, then
   `npm run addToStable -- --name goe-wallbox --version <version>` in the fork and open a pull request.

## Continuous integration

`.github/workflows/test-and-release.yml` uses the shared ioBroker actions. `check-and-lint` runs type check, lint and
package tests; `adapter-tests` runs unit and integration tests on Node.js 22, 24 and 26. For version tags `deploy`
publishes to npm with trusted publishing (no npm token) and creates the GitHub release; `release-notes` completes it.
Both use the token GitHub Actions provides and need no secret. While the repository is private only Linux runners
are used; the comment in the workflow explains how to switch the other systems back on before publishing.

Dependabot (`.github/dependabot.yml`) proposes updates once a month, at the earliest seven days after a version was
published. Major updates of `@types/node` and `typescript` are ignored on purpose.

## Known gaps

- Only the local HTTP API v2 is implemented. API v1 (older hardware) is planned as a second transport.
- Writing has been verified on a real wallbox only for a single key and an unchanged value. Changed values and the
  answer of the wallbox to a rejected value are covered by unit tests with a fake only.
- Not exposed yet: feeding PV data into the wallbox (`ids`), the temporary current limit (`tcl`), RFID cards,
  scheduler, load balancing, MQTT and OCPP settings. They can be read through "Additional API keys".
- State names are available in English and German only.
- The icon is a placeholder.
