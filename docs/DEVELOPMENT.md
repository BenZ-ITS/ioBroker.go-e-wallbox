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

## Building a package and releasing

```bash
npm run build
npm pack
```

For a release:

1. Raise the version in `package.json` and `io-package.json` (`common.version`) and add an entry to `common.news`
   and to the changelog in `README.md`.
2. Run all checks including the integration test.
3. Commit, tag `v<version>`, push both: `git push origin main v<version>`.

The workflow then runs all tests for the tag and creates the GitHub release itself: it checks that the tag,
`package.json` and `io-package.json` carry the same version, attaches the `.tgz` from `npm pack` and takes the
release notes from `common.news` (English and German). For a tag that was pushed without a release, start the
workflow by hand under **Actions → Test → Run workflow** and enter the tag.

Publishing to npm and an entry in the ioBroker adapter repository are not set up yet. Both require the repository to
be public; see the ioBroker developer documentation for the current requirements (adapter checker, test matrix,
translations).

## Continuous integration

`.github/workflows/test-and-release.yml` runs type check, lint, unit and package tests, then the integration test on
Node.js 22 and 24. For version tags it then creates the GitHub release (see above); this job uses the token that
GitHub Actions provides and needs no secret. While the repository is private only Linux runners are used; the comment in the workflow explains
how to switch the other systems back on before publishing.

## Known gaps

- Only the local HTTP API v2 is implemented. API v1 (older hardware) is planned as a second transport.
- Writing has been verified on a real wallbox only for a single key and an unchanged value. Changed values and the
  answer of the wallbox to a rejected value are covered by unit tests with a fake only.
- Not exposed yet: feeding PV data into the wallbox (`ids`), the temporary current limit (`tcl`), RFID cards,
  scheduler, load balancing, MQTT and OCPP settings. They can be read through "Additional API keys".
- State names are available in English and German only.
- The icon is a placeholder.
