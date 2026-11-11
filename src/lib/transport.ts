/**
 * Status of a wallbox as a flat map of API keys.
 *
 * All transports report values under the key names of the go-e API v2 (`frc`, `alw`, `nrg`, …),
 * so the datapoint definitions do not need to know which API version delivered them.
 */
export type ChargerStatus = Record<string, unknown>;

/**
 * Connection to one wallbox.
 *
 * Implemented by {@link HttpV2Transport}. A transport for the legacy API v1 can be added
 * later by translating its fields to the v2 key names.
 */
export interface ChargerTransport {
    /** API generation spoken by this transport */
    readonly apiVersion: 1 | 2;

    /**
     * Reads the given keys. Keys the firmware does not know are simply missing in the result.
     *
     * @param keys API keys to read; an empty list reads everything
     */
    read(keys: readonly string[]): Promise<ChargerStatus>;

    /**
     * Writes one value. Rejects if the wallbox is unreachable or refuses the value.
     *
     * @param key API key
     * @param value value as expected by the API (will be JSON-encoded)
     */
    write(key: string, value: unknown): Promise<void>;
}

/** Error raised when the wallbox answers but rejects the request */
export class ChargerApiError extends Error {
    /**
     * @param message human-readable reason
     */
    constructor(message: string) {
        super(message);
        this.name = 'ChargerApiError';
    }
}
