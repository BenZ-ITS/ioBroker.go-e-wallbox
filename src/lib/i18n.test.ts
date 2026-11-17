import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHANNELS, DATAPOINTS } from './datapoints';
import { LANGUAGES, translatedName } from './i18n';

/** Every key the adapter asks for */
const USED_KEYS = [
    ...CHANNELS,
    ...DATAPOINTS.map(datapoint => datapoint.id),
    'info.online',
    'instance.info',
    'instance.info.connection',
];

describe('i18n', () => {
    it('has a name for every channel and state in all languages', () => {
        for (const key of USED_KEYS) {
            const name = translatedName(key);
            for (const language of Object.keys(LANGUAGES)) {
                const text = name[language as ioBroker.Languages];
                assert.ok(typeof text === 'string' && text.trim(), `${key} in ${language}`);
            }
        }
    });

    it('has the same keys in all language files and no unused keys', () => {
        const english = Object.keys(LANGUAGES.en).sort();
        assert.deepEqual(english, [...new Set(USED_KEYS)].sort());
        for (const [language, words] of Object.entries(LANGUAGES)) {
            assert.deepEqual(Object.keys(words).sort(), english, language);
        }
    });

    it('rejects unknown keys', () => {
        assert.throws(() => translatedName('no.such.state'), /No name defined/);
    });

    it('matches the names of the instance objects in io-package.json', () => {
        // tests run from build/lib, io-package.json is in the project root
        const ioPackage = JSON.parse(readFileSync(join(__dirname, '..', '..', 'io-package.json'), 'utf8')) as {
            instanceObjects: { _id: string; common: { name: ioBroker.Translated } }[];
        };
        for (const object of ioPackage.instanceObjects) {
            assert.deepEqual(object.common.name, translatedName(`instance.${object._id}`), object._id);
        }
    });
});
