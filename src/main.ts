import * as utils from '@iobroker/adapter-core';
import {
    CHANNELS,
    DATAPOINTS,
    collectKeys,
    parseExtraKeys,
    toRawStateValue,
    type Datapoint,
    type Translated,
} from './lib/datapoints';
import { HttpV2Transport } from './lib/httpV2Transport';
import type { ChargerStatus, ChargerTransport } from './lib/transport';

/** Delay before re-reading after a write; the wallbox evaluates its logic once per second */
const REFRESH_AFTER_WRITE_MS = 1000;

/** Everything the adapter knows about one configured wallbox */
interface Charger {
    /** label for log messages */
    label: string;
    /** name from the configuration, may be empty */
    configuredName: string;
    transport: ChargerTransport;
    /** object id of the device (serial number); unknown until the first answer */
    deviceId?: string;
    /** `undefined` until the first attempt, so the first failure is logged, too */
    online?: boolean;
    /** last value written to each state, to update states only on change */
    values: Map<string, ioBroker.StateValue>;
    /** ids (below the device) whose objects exist */
    objects: Set<string>;
    timer?: ioBroker.Timeout;
    polling: boolean;
    refreshSoon: boolean;
    /** serialises writes to the wallbox */
    writeQueue: Promise<void>;
}

const WRITABLE = new Map<string, Datapoint>(
    DATAPOINTS.filter(datapoint => datapoint.write).map(datapoint => [datapoint.id, datapoint]),
);

class GoeWallbox extends utils.Adapter {
    private chargers: Charger[] = [];
    private keys: string[] = [];
    private extraKeys: string[] = [];
    private pollIntervalMs = 5000;
    private unloaded = false;
    private anyReachable: boolean | undefined;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({ ...options, name: 'goe-wallbox' });
        this.on('ready', () => this.onReady());
        this.on('stateChange', (id, state) => this.onStateChange(id, state));
        this.on('unload', callback => this.onUnload(callback));
    }

    private async onReady(): Promise<void> {
        await this.updateConnection(false);

        this.pollIntervalMs = clamp(Number(this.config.pollInterval) || 5, 1, 3600) * 1000;
        const timeoutMs = clamp(Number(this.config.requestTimeout) || 4, 1, 30) * 1000;
        this.extraKeys = parseExtraKeys(this.config.extraKeys);
        this.keys = collectKeys(DATAPOINTS, this.extraKeys);

        const configured = Array.isArray(this.config.chargers) ? this.config.chargers : [];
        for (const entry of configured) {
            const host = typeof entry?.host === 'string' ? entry.host.trim() : '';
            if (!host || entry.enabled === false) {
                continue;
            }
            const configuredName = typeof entry.name === 'string' ? entry.name.trim() : '';
            try {
                this.chargers.push({
                    label: configuredName ? `${configuredName} (${host})` : host,
                    configuredName,
                    transport: new HttpV2Transport(host, timeoutMs),
                    values: new Map(),
                    objects: new Set(),
                    polling: false,
                    refreshSoon: false,
                    writeQueue: Promise.resolve(),
                });
            } catch (error) {
                this.log.error(`Wallbox skipped: ${errorText(error)}`);
            }
        }

        if (!this.chargers.length) {
            this.log.warn('No wallbox configured. Please add at least one in the instance settings.');
            return;
        }
        if (this.config.readOnly) {
            this.log.info('Read-only mode is active: nothing will be sent to the wallboxes.');
        }

        await this.subscribeStatesAsync('*');
        for (const charger of this.chargers) {
            void this.poll(charger);
        }
    }

    private onUnload(callback: () => void): void {
        this.unloaded = true;
        for (const charger of this.chargers) {
            this.clearTimeout(charger.timer);
        }
        callback();
    }

    // --- reading -----------------------------------------------------------------------------------

    private async poll(charger: Charger): Promise<void> {
        if (this.unloaded || charger.polling) {
            return;
        }
        charger.polling = true;
        charger.timer = undefined;
        try {
            const status = await charger.transport.read(this.keys);
            if (this.unloaded) {
                return;
            }
            if (!charger.deviceId) {
                await this.registerDevice(charger, status);
            }
            await this.applyStatus(charger, status);
            await this.setOnline(charger, true);
        } catch (error) {
            if (!this.unloaded) {
                await this.setOnline(charger, false, error);
            }
        } finally {
            charger.polling = false;
            if (!this.unloaded) {
                const delay = charger.refreshSoon ? REFRESH_AFTER_WRITE_MS : this.pollIntervalMs;
                charger.refreshSoon = false;
                charger.timer = this.setTimeout(() => void this.poll(charger), delay);
            }
        }
    }

    /**
     * Re-reads the wallbox shortly, e.g. after a write.
     *
     * @param charger wallbox to refresh
     */
    private requestRefresh(charger: Charger): void {
        if (charger.polling) {
            charger.refreshSoon = true;
            return;
        }
        this.clearTimeout(charger.timer);
        charger.timer = this.setTimeout(() => void this.poll(charger), REFRESH_AFTER_WRITE_MS);
    }

    private async registerDevice(charger: Charger, status: ChargerStatus): Promise<void> {
        const serial =
            typeof status.sse === 'string' || typeof status.sse === 'number' ? String(status.sse).trim() : '';
        const deviceId = serial.replace(this.FORBIDDEN_CHARS, '_').replace(/[.\s]/g, '_');
        if (!deviceId) {
            throw new Error('The wallbox did not report a serial number (key "sse")');
        }
        if (this.chargers.some(other => other !== charger && other.deviceId === deviceId)) {
            throw new Error(`Serial number ${deviceId} is already used by another configured wallbox`);
        }
        const friendlyName = typeof status.fna === 'string' ? status.fna : '';
        await this.extendObject(deviceId, {
            type: 'device',
            common: {
                name: charger.configuredName || friendlyName || `go-e Charger ${deviceId}`,
                statusStates: { onlineId: `${this.namespace}.${deviceId}.info.online` },
            },
            native: { serial },
        });
        await this.ensureChannel(deviceId, 'info');
        await this.extendObject(`${deviceId}.info.online`, {
            type: 'state',
            common: {
                name: { en: 'Wallbox is reachable', de: 'Wallbox ist erreichbar' },
                type: 'boolean',
                role: 'indicator.reachable',
                read: true,
                write: false,
            },
            native: {},
        });
        charger.deviceId = deviceId;
        charger.label = `${charger.label} [${deviceId}]`;
    }

    private async ensureChannel(deviceId: string, channel: string): Promise<void> {
        const name: Translated = CHANNELS[channel] ?? { en: channel, de: channel };
        await this.extendObject(`${deviceId}.${channel}`, { type: 'channel', common: { name }, native: {} });
    }

    private async applyStatus(charger: Charger, status: ChargerStatus): Promise<void> {
        for (const datapoint of DATAPOINTS) {
            const value = datapoint.read(status);
            if (value === undefined) {
                // not delivered by this firmware or model
                continue;
            }
            await this.updateState(charger, datapoint.id, value, () => ({
                name: datapoint.name,
                type: datapoint.type,
                role: datapoint.role,
                read: true,
                write: !!datapoint.write,
                ...(datapoint.unit !== undefined && { unit: datapoint.unit }),
                ...(datapoint.min !== undefined && { min: datapoint.min }),
                ...(datapoint.max !== undefined && { max: datapoint.max }),
                ...(datapoint.states && { states: datapoint.states }),
            }));
        }
        for (const key of this.extraKeys) {
            if (!(key in status)) {
                continue;
            }
            await this.updateState(charger, `raw.${key}`, toRawStateValue(status[key]), () => ({
                name: `API key ${key}`,
                type: 'mixed',
                role: 'state',
                read: true,
                write: false,
            }));
        }
    }

    /**
     * Creates the object on first use and writes the value if it changed.
     *
     * @param charger wallbox the state belongs to
     * @param id state id below the device
     * @param value new value
     * @param common builds the object description; only called when the object has to be created
     */
    private async updateState(
        charger: Charger,
        id: string,
        value: ioBroker.StateValue,
        common: () => ioBroker.StateCommon,
    ): Promise<void> {
        const deviceId = charger.deviceId!;
        if (!charger.objects.has(id)) {
            const channel = id.split('.')[0];
            if (!charger.objects.has(channel)) {
                await this.ensureChannel(deviceId, channel);
                charger.objects.add(channel);
            }
            await this.extendObject(`${deviceId}.${id}`, { type: 'state', common: common(), native: {} });
            charger.objects.add(id);
        }
        if (!charger.values.has(id) || charger.values.get(id) !== value) {
            charger.values.set(id, value);
            await this.setState(`${deviceId}.${id}`, { val: value, ack: true });
        }
    }

    private async setOnline(charger: Charger, online: boolean, error?: unknown): Promise<void> {
        if (charger.online !== online) {
            if (online) {
                this.log.info(`${charger.label}: connected`);
            } else {
                this.log.warn(`${charger.label}: not reachable – ${errorText(error)}`);
            }
            charger.online = online;
            if (charger.deviceId) {
                await this.setState(`${charger.deviceId}.info.online`, { val: online, ack: true });
            }
            await this.updateConnection(this.chargers.some(other => other.online));
        } else if (!online) {
            this.log.debug(`${charger.label}: still not reachable – ${errorText(error)}`);
        }
    }

    private async updateConnection(connected: boolean): Promise<void> {
        if (this.anyReachable !== connected) {
            this.anyReachable = connected;
            await this.setState('info.connection', { val: connected, ack: true });
        }
    }

    // --- writing -----------------------------------------------------------------------------------

    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        if (!state || state.ack || this.unloaded) {
            return;
        }
        const relative = id.startsWith(`${this.namespace}.`) ? id.slice(this.namespace.length + 1) : '';
        const separator = relative.indexOf('.');
        const charger = this.chargers.find(c => c.deviceId && c.deviceId === relative.slice(0, separator));
        if (separator < 0 || !charger) {
            return;
        }
        const stateId = relative.slice(separator + 1);
        const datapoint = WRITABLE.get(stateId);
        if (!datapoint?.write) {
            this.log.warn(`${charger.label}: ${stateId} cannot be written`);
            void this.restoreState(charger, stateId);
            return;
        }
        if (this.config.readOnly) {
            this.log.warn(`${charger.label}: ${stateId} not sent, the adapter is in read-only mode`);
            void this.restoreState(charger, stateId);
            return;
        }
        let apiValue: unknown;
        try {
            apiValue = datapoint.write.toApi(state.val);
        } catch (error) {
            this.log.warn(`${charger.label}: ${stateId} rejected – ${errorText(error)}`);
            void this.restoreState(charger, stateId);
            return;
        }
        const { key } = datapoint.write;
        charger.writeQueue = charger.writeQueue.then(async () => {
            if (this.unloaded) {
                return;
            }
            try {
                await charger.transport.write(key, apiValue);
                this.log.debug(`${charger.label}: ${key} = ${JSON.stringify(apiValue)} sent`);
                // forget the cached value, so the next status acknowledges the state even if the
                // wallbox reports the same value as before
                charger.values.delete(stateId);
                this.requestRefresh(charger);
            } catch (error) {
                this.log.warn(
                    `${charger.label}: writing ${stateId} (${key} = ${JSON.stringify(apiValue)}) failed – ${errorText(error)}`,
                );
                await this.restoreState(charger, stateId);
            }
        });
    }

    /**
     * Puts the last value reported by the wallbox back into a state after a refused command.
     *
     * @param charger wallbox the state belongs to
     * @param stateId state id below the device
     */
    private async restoreState(charger: Charger, stateId: string): Promise<void> {
        if (charger.deviceId && charger.values.has(stateId)) {
            await this.setState(`${charger.deviceId}.${stateId}`, { val: charger.values.get(stateId)!, ack: true });
        }
    }
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function errorText(error: unknown): string {
    if (error instanceof Error) {
        const cause = error.cause instanceof Error ? ` (${error.cause.message})` : '';
        return error.name === 'TimeoutError' ? 'no answer in time' : `${error.message}${cause}`;
    }
    return String(error);
}

if (require.main !== module) {
    // started in compact mode: export the constructor
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new GoeWallbox(options);
} else {
    // started directly
    (() => new GoeWallbox())();
}
