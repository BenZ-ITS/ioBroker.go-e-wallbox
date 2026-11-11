import assert from 'node:assert/strict';
import { HttpV2Transport, buildBaseUrl, type FetchLike } from './httpV2Transport';
import { ChargerApiError } from './transport';

/**
 * Fake fetch that records the requested URLs.
 *
 * @param status HTTP status to answer with
 * @param body JSON body to answer with
 */
function fakeFetch(status: number, body: unknown): { fetch: FetchLike; urls: string[] } {
    const urls: string[] = [];
    return {
        urls,
        fetch: url => {
            urls.push(url);
            return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
        },
    };
}

describe('buildBaseUrl', () => {
    it('accepts addresses in the usual spellings', () => {
        assert.equal(buildBaseUrl('192.168.0.10'), 'http://192.168.0.10');
        assert.equal(buildBaseUrl(' http://charger.lan:8080/ '), 'http://charger.lan:8080');
        assert.equal(buildBaseUrl('[fe80::1]'), 'http://[fe80::1]');
    });

    it('rejects anything that is not a plain host', () => {
        for (const host of ['', 'host/path', 'user@host', 'a b', 'host?x=1', 'https://host']) {
            assert.throws(() => buildBaseUrl(host), /not a valid/);
        }
    });
});

describe('HttpV2Transport', () => {
    it('reads with a filter', async () => {
        const { fetch, urls } = fakeFetch(200, { frc: 0, alw: true });
        const status = await new HttpV2Transport('10.0.0.5', 1000, fetch).read(['frc', 'alw']);
        assert.deepEqual(status, { frc: 0, alw: true });
        assert.deepEqual(urls, ['http://10.0.0.5/api/status?filter=frc,alw']);
    });

    it('reads everything without keys', async () => {
        const { fetch, urls } = fakeFetch(200, {});
        await new HttpV2Transport('10.0.0.5', 1000, fetch).read([]);
        assert.deepEqual(urls, ['http://10.0.0.5/api/status']);
    });

    it('writes JSON-encoded values', async () => {
        const { fetch, urls } = fakeFetch(200, { fna: true });
        await new HttpV2Transport('10.0.0.5', 1000, fetch).write('fna', 'my charger');
        assert.deepEqual(urls, ['http://10.0.0.5/api/set?fna=%22my%20charger%22']);
    });

    it('writes null to clear a value', async () => {
        const { fetch, urls } = fakeFetch(200, { dwo: true });
        await new HttpV2Transport('10.0.0.5', 1000, fetch).write('dwo', null);
        assert.deepEqual(urls, ['http://10.0.0.5/api/set?dwo=null']);
    });

    it('fails if the wallbox refuses a value', async () => {
        const { fetch } = fakeFetch(200, { amp: 'value out of range' });
        await assert.rejects(new HttpV2Transport('10.0.0.5', 1000, fetch).write('amp', 99), {
            name: 'ChargerApiError',
            message: 'value out of range',
        });
    });

    it('hints at the disabled API on 404', async () => {
        const { fetch } = fakeFetch(404, {});
        await assert.rejects(new HttpV2Transport('10.0.0.5', 1000, fetch).read(['frc']), (error: unknown) => {
            assert.ok(error instanceof ChargerApiError);
            assert.match(error.message, /HTTP API v2/);
            return true;
        });
    });

    it('fails on other HTTP errors and on unexpected bodies', async () => {
        await assert.rejects(new HttpV2Transport('10.0.0.5', 1000, fakeFetch(500, {}).fetch).read(['frc']), /HTTP 500/);
        await assert.rejects(
            new HttpV2Transport('10.0.0.5', 1000, fakeFetch(200, []).fetch).read(['frc']),
            /Unexpected/,
        );
    });
});
