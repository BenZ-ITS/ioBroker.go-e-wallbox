// Checks that a version is ready for release:
// package.json and io-package.json agree (and match the tag, if one is given), common.news has an
// English and a German entry, and docs/release-notes/<version>.md has an English and a German part.
//
// Usage: node scripts/check-release.mjs [v<version>]
import { existsSync, readFileSync } from 'node:fs';

const readJson = file => JSON.parse(readFileSync(file, 'utf8'));

const version = readJson('package.json').version;
const ioPackage = readJson('io-package.json');
const tag = process.argv[2];
const problems = [];

if (tag !== undefined && tag !== `v${version}`) {
    problems.push(`tag ${tag} does not match package.json version ${version}`);
}
if (ioPackage.common.version !== version) {
    problems.push(`io-package.json version ${ioPackage.common.version} does not match package.json version ${version}`);
}
const news = ioPackage.common.news?.[version];
if (!news?.en || !news?.de) {
    problems.push(`io-package.json common.news has no English and German entry for ${version}`);
}
const notes = `docs/release-notes/${version}.md`;
if (!existsSync(notes)) {
    problems.push(`${notes} is missing`);
} else {
    const text = readFileSync(notes, 'utf8');
    for (const heading of ['## English', '## Deutsch']) {
        if (!new RegExp(`^${heading}$`, 'm').test(text)) {
            problems.push(`${notes} has no section "${heading}"`);
        }
    }
}

if (problems.length > 0) {
    for (const problem of problems) {
        console.error(`::error::${problem}`);
    }
    process.exit(1);
}
console.log(`Release ${version} is complete`);
