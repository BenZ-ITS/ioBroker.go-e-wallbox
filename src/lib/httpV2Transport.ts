import { ChargerApiError, type ChargerStatus, type ChargerTransport } from './transport';

/** Minimal part of a fetch response used by the transport */
export interface FetchResponseLike {
    /** true for HTTP 2xx */
    ok: boolean;
    /** HTTP status code */
    status: number;
    /** parsed JSON body */
    json(): Promise<unknown>;
}

/** Minimal fetch signature, so tests can inject a fake */
export type FetchLike = (url: string, init: { signal: AbortSignal }) => Promise<FetchResponseLike>;

const HOST_PATTERN = /^(\[[0-9a-f:]+\]|[a-z0-9]([a-z0-9.-]*[a-z0-9])?)(:\d{1,5})?$/i;

/**
 * Turns the configured address into a base URL.
 *
 * Accepts `192.168.0.10`, `charger.lan:8080` or `http://192.168.0.10/`.
 *
 * @param host address as entered by the user
 */
export function buildBaseUrl(host: string): string {
    const trimmed = host
        .trim()
        .replace(/^http:\/\//i, '')
        .replace(/\/+$/, '');
    if (!HOST_PATTERN.test(trimmed)) {
        throw new Error(`"${host}" is not a valid IP address or host name`);
    }
    return `http://${trimmed}`;
}

/**
 * Local HTTP API v2 of the go-e Charger (`/api/status`, `/api/set`).
 *
 * The API has to be enabled in the go-e app ("Local HTTP API v2").
 */
export class HttpV2Transport implements ChargerTransport {
    /** API generation spoken by this transport */
    public readonly apiVersion = 2;
    private readonly baseUrl: string;

    /**
     * @param host IP address or host name of the wallbox
     * @param timeoutMs time after which a request is aborted
     * @param fetchImpl fetch implementation, replaceable for tests
     */
    constructor(
        host: string,
        private readonly timeoutMs: number,
        private readonly fetchImpl: FetchLike = fetch,
    ) {
        this.baseUrl = buildBaseUrl(host);
    }

    /**
     * Reads the given keys with one filtered status request.
     *
     * @param keys API keys to read; an empty list reads everything
     */
    public async read(keys: readonly string[]): Promise<ChargerStatus> {
        const query = keys.length ? `?filter=${keys.map(encodeURIComponent).join(',')}` : '';
        const body = await this.request(`/api/status${query}`);
        if (!isRecord(body)) {
            throw new ChargerApiError('Unexpected answer to the status request');
        }
        return body;
    }

    /**
     * Writes one value.
     *
     * @param key API key
     * @param value value, sent JSON-encoded as the API demands
     */
    public async write(key: string, value: unknown): Promise<void> {
        const body = await this.request(
            `/api/set?${encodeURIComponent(key)}=${encodeURIComponent(JSON.stringify(value))}`,
        );
        const result = isRecord(body) ? body[key] : undefined;
        if (result !== true) {
            throw new ChargerApiError(
                typeof result === 'string' ? result : `Wallbox did not confirm "${key}": ${JSON.stringify(body)}`,
            );
        }
    }

    private async request(path: string): Promise<unknown> {
        const response = await this.fetchImpl(this.baseUrl + path, { signal: AbortSignal.timeout(this.timeoutMs) });
        if (response.status === 404) {
            throw new ChargerApiError('HTTP 404 – is the local HTTP API v2 enabled in the go-e app?');
        }
        if (!response.ok) {
            // pass on whatever explanation the wallbox gives, if any
            const detail = await response.json().catch(() => undefined);
            throw new ChargerApiError(`HTTP ${response.status}${detail ? `: ${JSON.stringify(detail)}` : ''}`);
        }
        return response.json();
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
