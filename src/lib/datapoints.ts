import type { ChargerStatus } from './transport';

/** Name in the languages the adapter ships */
export interface Translated {
    /** English */
    en: string;
    /** German */
    de: string;
}

/** Description of one ioBroker state and how it maps to the wallbox API */
export interface Datapoint {
    /** id below the device, e.g. `charging.forceState` */
    id: string;
    /** API keys this state is derived from */
    keys: readonly string[];
    /** display name */
    name: Translated;
    /** ioBroker value type */
    type: 'number' | 'string' | 'boolean';
    /** ioBroker role */
    role: string;
    /** unit of the value */
    unit?: string;
    /** smallest allowed value */
    min?: number;
    /** largest allowed value */
    max?: number;
    /** meaning of the numeric values */
    states?: Record<number, string>;
    /**
     * Extracts the state value from a status.
     * Returns `undefined` if the firmware did not deliver the key – the state is then not created.
     */
    read(status: ChargerStatus): ioBroker.StateValue | undefined;
    /** present if the state can be written */
    write?: {
        /** API key to set */
        key: string;
        /** Converts and validates the state value; throws a `RangeError` if it is not acceptable */
        toApi(value: ioBroker.StateValue): unknown;
    };
}

/** Channels the datapoints are grouped in */
export const CHANNELS: Record<string, Translated> = {
    info: { en: 'Device information', de: 'Geräteinformation' },
    car: { en: 'Vehicle and cable', de: 'Fahrzeug und Kabel' },
    charging: { en: 'Charging control', de: 'Ladesteuerung' },
    energy: { en: 'Electrical measurements', de: 'Elektrische Messwerte' },
    temperature: { en: 'Temperatures', de: 'Temperaturen' },
    pv: { en: 'PV surplus function of the wallbox', de: 'PV-Überschussfunktion der Wallbox' },
    settings: { en: 'Device settings', de: 'Geräteeinstellungen' },
    raw: { en: 'Additional API keys (unprocessed)', de: 'Zusätzliche API-Schlüssel (unverarbeitet)' },
};

// --- value lists from the official API key documentation ---------------------------------------

const CAR_STATES = {
    0: 'Unknown/Error',
    1: 'Idle (no car)',
    2: 'Charging',
    3: 'Waiting for car',
    4: 'Complete',
    5: 'Error',
};
const FORCE_STATES = { 0: 'Neutral', 1: 'Off', 2: 'On' };
const PHASE_SWITCH_MODES = { 0: 'Auto', 1: 'Force 1-phase', 2: 'Force 3-phase' };
const LOGIC_MODES = { 3: 'Default (Basic)', 4: 'Awattar (Eco)', 5: 'Automatic stop (Daily Trip)' };
const CABLE_LOCK_STATES = {
    0: 'Unknown',
    1: 'Unlocked',
    2: 'Unlock failed',
    3: 'Locked',
    4: 'Lock failed',
    5: 'Lock/unlock power outage',
};
const UNLOCK_SETTINGS = { 0: 'Normal', 1: 'Auto unlock', 2: 'Always lock' };
const ACCESS_CONTROL = { 0: 'Open', 1: 'Wait' };
const ERRORS = {
    0: 'None',
    1: 'FI AC',
    2: 'FI DC',
    3: 'Phase',
    4: 'Overvoltage',
    5: 'Overcurrent',
    6: 'Diode',
    7: 'PP invalid',
    8: 'Ground invalid',
    9: 'Contactor stuck',
    10: 'Contactor missing',
    11: 'FI unknown',
    12: 'Unknown',
    13: 'Overtemperature',
    14: 'No communication',
    15: 'Lock stuck open',
    16: 'Lock stuck locked',
};
const REASONS = {
    0: 'Not charging: no charge controller data',
    1: 'Not charging: overtemperature',
    2: 'Not charging: access control wait',
    3: 'Charging: force state on',
    4: 'Not charging: force state off',
    5: 'Not charging: scheduler',
    6: 'Not charging: energy limit',
    7: 'Charging: Awattar price low',
    8: 'Charging: automatic stop test charge',
    9: 'Charging: automatic stop, not enough time',
    10: 'Charging: automatic stop',
    11: 'Charging: automatic stop, no clock',
    12: 'Charging: PV surplus',
    13: 'Charging: fallback go-e default',
    14: 'Charging: fallback go-e scheduler',
    15: 'Charging: fallback default',
    16: 'Not charging: fallback go-e Awattar',
    17: 'Not charging: fallback Awattar',
    18: 'Not charging: fallback automatic stop',
    19: 'Charging: car compatibility keep-alive',
    20: 'Charging: charge pause not allowed',
    22: 'Not charging: simulate unplugging',
    23: 'Not charging: phase switch',
    24: 'Not charging: minimum pause duration',
    26: 'Not charging: error',
    27: 'Not charging: load management',
    28: 'Not charging: OCPP',
    29: 'Not charging: reconnect delay',
    30: 'Not charging: adapter blocking',
    31: 'Not charging: underfrequency control',
    32: 'Not charging: unbalanced load',
    33: 'Charging: discharging PV battery',
    34: 'Not charging: grid monitoring',
    35: 'Not charging: OCPP fallback',
};

// --- helpers -------------------------------------------------------------------------------------

function round(value: number, digits: number): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

/**
 * Reads a number.
 *
 * @param key API key
 * @param digits decimals to keep (limits state updates caused by measurement noise)
 * @param scale factor applied before rounding
 */
function numberOf(key: string, digits = 0, scale = 1): Datapoint['read'] {
    return status => {
        if (!(key in status)) {
            return undefined;
        }
        const value = status[key];
        return typeof value === 'number' && Number.isFinite(value) ? round(value * scale, digits) : null;
    };
}

function booleanOf(key: string): Datapoint['read'] {
    return status => {
        if (!(key in status)) {
            return undefined;
        }
        const value = status[key];
        return typeof value === 'boolean' ? value : null;
    };
}

function stringOf(key: string): Datapoint['read'] {
    return status => {
        if (!(key in status)) {
            return undefined;
        }
        const value = status[key];
        return typeof value === 'string' ? value : null;
    };
}

/**
 * Reads one element of an array value such as `nrg` or `tma`.
 *
 * @param key API key
 * @param index position in the array
 * @param digits decimals to keep
 */
function elementOf(key: string, index: number, digits: number): Datapoint['read'] {
    return status => {
        const list = status[key];
        if (!Array.isArray(list) || index >= list.length) {
            return undefined;
        }
        const value: unknown = list[index];
        return typeof value === 'number' && Number.isFinite(value) ? round(value, digits) : null;
    };
}

/**
 * Counts the phases switched to the car.
 *
 * `pha` holds six booleans: L1–L3 towards the car (behind the contactor), then L1–L3 at the supply.
 * The key `pnp` is not used: on the tested device (go-eCharger V4, firmware 60.5) it stays 0 while charging on one
 * or three phases.
 */
function switchedPhases(): Datapoint['read'] {
    return status => {
        if (!('pha' in status)) {
            return undefined;
        }
        const list = status.pha;
        if (!Array.isArray(list) || list.length < 3) {
            return null;
        }
        const towardsCar: unknown[] = list.slice(0, 3);
        if (!towardsCar.every(value => typeof value === 'boolean')) {
            return null;
        }
        return towardsCar.filter(Boolean).length;
    };
}

interface NumberRule {
    min?: number;
    max?: number;
    integer?: boolean;
}

/**
 * Builds the write part for a numeric key.
 *
 * @param key API key
 * @param rule accepted range
 */
function numberTo(key: string, rule: NumberRule = {}): NonNullable<Datapoint['write']> {
    return {
        key,
        toApi: value => {
            const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
            if (typeof number !== 'number' || !Number.isFinite(number)) {
                throw new RangeError(`${JSON.stringify(value)} is not a number`);
            }
            if (rule.integer && !Number.isInteger(number)) {
                throw new RangeError(`${number} is not a whole number`);
            }
            if (rule.min !== undefined && number < rule.min) {
                throw new RangeError(`${number} is below the minimum of ${rule.min}`);
            }
            if (rule.max !== undefined && number > rule.max) {
                throw new RangeError(`${number} is above the maximum of ${rule.max}`);
            }
            return number;
        },
    };
}

function enumTo(key: string, states: Record<number, string>): NonNullable<Datapoint['write']> {
    const numeric = numberTo(key, { integer: true });
    return {
        key,
        toApi: value => {
            const number = numeric.toApi(value) as number;
            if (!(number in states)) {
                throw new RangeError(`${number} is not one of ${Object.keys(states).join(', ')}`);
            }
            return number;
        },
    };
}

function booleanTo(key: string): NonNullable<Datapoint['write']> {
    return {
        key,
        toApi: value => {
            if (typeof value === 'boolean') {
                return value;
            }
            if (value === 1 || value === 'true') {
                return true;
            }
            if (value === 0 || value === 'false') {
                return false;
            }
            throw new RangeError(`${JSON.stringify(value)} is not a boolean`);
        },
    };
}

const PHASES = ['L1', 'L2', 'L3'] as const;

/**
 * One state per phase from the `nrg` array.
 *
 * @param idPrefix state id without the phase suffix
 * @param offset position of L1 in `nrg`
 * @param name display name without the phase
 * @param role ioBroker role
 * @param unit unit of the value
 * @param digits decimals to keep
 */
function perPhase(
    idPrefix: string,
    offset: number,
    name: Translated,
    role: string,
    unit: string | undefined,
    digits: number,
): Datapoint[] {
    return PHASES.map((phase, index) => ({
        id: `${idPrefix}${phase}`,
        keys: ['nrg'],
        name: { en: `${name.en} ${phase}`, de: `${name.de} ${phase}` },
        type: 'number',
        role,
        unit,
        read: elementOf('nrg', offset + index, digits),
    }));
}

// --- the datapoints --------------------------------------------------------------------------------

/**
 * All states the adapter offers per wallbox.
 *
 * Layout of `nrg` (16 values): U L1, L2, L3, N · I L1, L2, L3 · P L1, L2, L3, N, total · power factor L1, L2, L3, N.
 */
export const DATAPOINTS: readonly Datapoint[] = [
    // info
    {
        id: 'info.serial',
        keys: ['sse'],
        name: { en: 'Serial number', de: 'Seriennummer' },
        type: 'string',
        role: 'info.serial',
        read: stringOf('sse'),
    },
    {
        id: 'info.model',
        keys: ['typ'],
        name: { en: 'Device type', de: 'Gerätetyp' },
        type: 'string',
        role: 'info.model',
        read: stringOf('typ'),
    },
    {
        id: 'info.firmware',
        keys: ['fwv'],
        name: { en: 'Firmware version', de: 'Firmware-Version' },
        type: 'string',
        role: 'info.firmware',
        read: stringOf('fwv'),
    },
    {
        id: 'info.variant',
        keys: ['var'],
        name: { en: 'Variant (11 = 11 kW/16 A, 22 = 22 kW/32 A)', de: 'Variante (11 = 11 kW/16 A, 22 = 22 kW/32 A)' },
        type: 'number',
        role: 'value',
        unit: 'kW',
        read: numberOf('var'),
    },
    {
        id: 'info.friendlyName',
        keys: ['fna'],
        name: { en: 'Device name', de: 'Gerätename' },
        type: 'string',
        role: 'info.name',
        read: stringOf('fna'),
        write: {
            key: 'fna',
            toApi: (value: ioBroker.StateValue): unknown => {
                if (typeof value !== 'string' || !value.trim()) {
                    throw new RangeError('The device name must be a non-empty text');
                }
                return value.trim();
            },
        },
    },
    {
        id: 'info.rssi',
        keys: ['rssi'],
        name: { en: 'WiFi signal strength', de: 'WLAN-Signalstärke' },
        type: 'number',
        role: 'value',
        unit: 'dBm',
        read: numberOf('rssi'),
    },
    {
        id: 'info.uptime',
        keys: ['rbt'],
        name: { en: 'Time since boot', de: 'Laufzeit seit dem Start' },
        type: 'number',
        role: 'value',
        unit: 'min',
        // minutes: a value in seconds would be written on every poll
        read: numberOf('rbt', 0, 1 / 60000),
    },

    // car
    {
        id: 'car.state',
        keys: ['car'],
        name: { en: 'Car state', de: 'Fahrzeugstatus' },
        type: 'number',
        role: 'value',
        states: CAR_STATES,
        read: numberOf('car'),
    },
    {
        id: 'car.connected',
        keys: ['car'],
        name: { en: 'Car is plugged in', de: 'Fahrzeug ist angesteckt' },
        type: 'boolean',
        role: 'indicator',
        read: (status: ChargerStatus): ioBroker.StateValue | undefined => {
            if (!('car' in status)) {
                return undefined;
            }
            const car = status.car;
            return typeof car === 'number' ? car >= 2 && car <= 4 : null;
        },
    },
    {
        id: 'car.chargedEnergy',
        keys: ['wh'],
        name: { en: 'Energy since the car was plugged in', de: 'Geladene Energie seit dem Anstecken' },
        type: 'number',
        role: 'value.energy',
        unit: 'Wh',
        read: numberOf('wh'),
    },
    {
        id: 'car.cableCurrentLimit',
        keys: ['cbl'],
        name: { en: 'Current limit of the cable', de: 'Strombegrenzung des Kabels' },
        type: 'number',
        role: 'value.current',
        unit: 'A',
        read: numberOf('cbl'),
    },
    {
        id: 'car.cableLock',
        keys: ['cus'],
        name: { en: 'Cable lock state', de: 'Zustand der Kabelverriegelung' },
        type: 'number',
        role: 'value',
        states: CABLE_LOCK_STATES,
        read: numberOf('cus'),
    },

    // charging
    {
        id: 'charging.allowed',
        keys: ['alw'],
        name: { en: 'Car may charge right now', de: 'Fahrzeug darf gerade laden' },
        type: 'boolean',
        role: 'indicator',
        read: booleanOf('alw'),
    },
    {
        id: 'charging.reason',
        keys: ['modelStatus'],
        name: { en: 'Reason why charging is allowed or not', de: 'Grund, warum geladen wird oder nicht' },
        type: 'number',
        role: 'value',
        states: REASONS,
        read: numberOf('modelStatus'),
    },
    {
        id: 'charging.forceState',
        keys: ['frc'],
        name: { en: 'Force state', de: 'Erzwungener Zustand' },
        type: 'number',
        role: 'level',
        states: FORCE_STATES,
        read: numberOf('frc'),
        write: enumTo('frc', FORCE_STATES),
    },
    {
        id: 'charging.current',
        keys: ['amp'],
        name: { en: 'Requested charging current', de: 'Angeforderter Ladestrom' },
        type: 'number',
        role: 'level.current',
        unit: 'A',
        min: 6,
        max: 32,
        read: numberOf('amp'),
        write: numberTo('amp', { min: 6, max: 32, integer: true }),
    },
    {
        id: 'charging.currentLimit',
        keys: ['ama'],
        name: { en: 'Upper limit for the charging current', de: 'Obergrenze für den Ladestrom' },
        type: 'number',
        role: 'level.current',
        unit: 'A',
        min: 6,
        max: 32,
        read: numberOf('ama'),
        write: numberTo('ama', { min: 6, max: 32, integer: true }),
    },
    {
        id: 'charging.allowedCurrent',
        keys: ['acu'],
        name: { en: 'Current the car may draw right now', de: 'Strom, den das Fahrzeug gerade ziehen darf' },
        type: 'number',
        role: 'value.current',
        unit: 'A',
        read: numberOf('acu'),
    },
    {
        id: 'charging.phaseSwitchMode',
        keys: ['psm'],
        name: { en: 'Phase switch mode', de: 'Phasenumschaltung' },
        type: 'number',
        role: 'level',
        states: PHASE_SWITCH_MODES,
        read: numberOf('psm'),
        write: enumTo('psm', PHASE_SWITCH_MODES),
    },
    {
        id: 'charging.energyLimit',
        keys: ['dwo'],
        name: {
            en: 'Energy limit per charging session (0 = none)',
            de: 'Energielimit je Ladevorgang (0 = keines)',
        },
        type: 'number',
        role: 'level',
        unit: 'Wh',
        min: 0,
        // the API reports "no limit" as null
        read: status => (!('dwo' in status) ? undefined : typeof status.dwo === 'number' ? round(status.dwo, 0) : 0),
        write: {
            key: 'dwo',
            toApi: (value: ioBroker.StateValue): unknown => {
                const number = numberTo('dwo', { min: 0 }).toApi(value) as number;
                return number > 0 ? number : null;
            },
        },
    },
    {
        id: 'charging.logicMode',
        keys: ['lmo'],
        name: { en: 'Charging mode', de: 'Lademodus' },
        type: 'number',
        role: 'level',
        states: LOGIC_MODES,
        read: numberOf('lmo'),
        write: enumTo('lmo', LOGIC_MODES),
    },
    {
        id: 'charging.error',
        keys: ['err'],
        name: { en: 'Error', de: 'Fehler' },
        type: 'number',
        role: 'value',
        states: ERRORS,
        read: numberOf('err'),
    },

    // energy
    {
        id: 'energy.power',
        keys: ['nrg'],
        name: { en: 'Charging power', de: 'Ladeleistung' },
        type: 'number',
        role: 'value.power',
        unit: 'W',
        read: elementOf('nrg', 11, 0),
    },
    ...perPhase('energy.power', 7, { en: 'Power', de: 'Leistung' }, 'value.power', 'W', 0),
    ...perPhase('energy.voltage', 0, { en: 'Voltage', de: 'Spannung' }, 'value.voltage', 'V', 0),
    ...perPhase('energy.current', 4, { en: 'Current', de: 'Strom' }, 'value.current', 'A', 1),
    {
        id: 'energy.total',
        keys: ['eto'],
        name: { en: 'Total energy charged', de: 'Insgesamt geladene Energie' },
        type: 'number',
        role: 'value.energy',
        unit: 'Wh',
        read: numberOf('eto'),
    },
    {
        id: 'energy.frequency',
        keys: ['fhz'],
        name: { en: 'Grid frequency', de: 'Netzfrequenz' },
        type: 'number',
        role: 'value.frequency',
        unit: 'Hz',
        read: numberOf('fhz', 1),
    },
    {
        id: 'energy.phases',
        keys: ['pha'],
        name: { en: 'Number of phases switched to the car', de: 'Anzahl zum Fahrzeug geschalteter Phasen' },
        type: 'number',
        role: 'value',
        min: 0,
        max: 3,
        read: switchedPhases(),
    },

    // temperature
    {
        id: 'temperature.sensor1',
        keys: ['tma'],
        name: { en: 'Temperature sensor 1', de: 'Temperatursensor 1' },
        type: 'number',
        role: 'value.temperature',
        unit: '°C',
        read: elementOf('tma', 0, 0),
    },
    {
        id: 'temperature.sensor2',
        keys: ['tma'],
        name: { en: 'Temperature sensor 2', de: 'Temperatursensor 2' },
        type: 'number',
        role: 'value.temperature',
        unit: '°C',
        read: elementOf('tma', 1, 0),
    },

    // pv
    {
        id: 'pv.useSurplus',
        keys: ['fup'],
        name: { en: 'Use PV surplus (function of the wallbox)', de: 'PV-Überschuss nutzen (Funktion der Wallbox)' },
        type: 'boolean',
        role: 'switch',
        read: booleanOf('fup'),
        write: booleanTo('fup'),
    },
    {
        id: 'pv.startingPower',
        keys: ['fst'],
        name: { en: 'Starting power for surplus charging', de: 'Startleistung für das Überschussladen' },
        type: 'number',
        role: 'level',
        unit: 'W',
        min: 0,
        read: numberOf('fst'),
        write: numberTo('fst', { min: 0 }),
    },
    {
        id: 'pv.gridPower',
        keys: ['pgrid'],
        name: { en: 'Grid power known to the wallbox', de: 'Der Wallbox bekannte Netzleistung' },
        type: 'number',
        role: 'value.power',
        unit: 'W',
        read: numberOf('pgrid'),
    },
    {
        id: 'pv.pvPower',
        keys: ['ppv'],
        name: { en: 'PV power known to the wallbox', de: 'Der Wallbox bekannte PV-Leistung' },
        type: 'number',
        role: 'value.power',
        unit: 'W',
        read: numberOf('ppv'),
    },
    {
        id: 'pv.batteryPower',
        keys: ['pakku'],
        name: { en: 'Battery power known to the wallbox', de: 'Der Wallbox bekannte Batterieleistung' },
        type: 'number',
        role: 'value.power',
        unit: 'W',
        read: numberOf('pakku'),
    },

    // settings
    {
        id: 'settings.accessControl',
        keys: ['acs'],
        name: { en: 'Access control', de: 'Zugangskontrolle' },
        type: 'number',
        role: 'level',
        states: ACCESS_CONTROL,
        read: numberOf('acs'),
        write: enumTo('acs', ACCESS_CONTROL),
    },
    {
        id: 'settings.cableUnlock',
        keys: ['ust'],
        name: { en: 'Cable unlock behaviour', de: 'Verhalten der Kabelentriegelung' },
        type: 'number',
        role: 'level',
        states: UNLOCK_SETTINGS,
        read: numberOf('ust'),
        write: enumTo('ust', UNLOCK_SETTINGS),
    },
    {
        id: 'settings.ledBrightness',
        keys: ['lbr'],
        name: { en: 'LED brightness', de: 'LED-Helligkeit' },
        type: 'number',
        role: 'level.dimmer',
        min: 0,
        max: 255,
        read: numberOf('lbr'),
        write: numberTo('lbr', { min: 0, max: 255, integer: true }),
    },
    {
        id: 'settings.minChargingCurrent',
        keys: ['mca'],
        name: { en: 'Minimum charging current', de: 'Minimaler Ladestrom' },
        type: 'number',
        role: 'level.current',
        unit: 'A',
        min: 6,
        max: 32,
        read: numberOf('mca'),
        write: numberTo('mca', { min: 6, max: 32, integer: true }),
    },
    {
        id: 'settings.awattarMaxPrice',
        keys: ['awp'],
        name: { en: 'Maximum price in Eco mode', de: 'Höchstpreis im Eco-Modus' },
        type: 'number',
        role: 'level',
        unit: 'ct',
        read: numberOf('awp', 2),
        write: numberTo('awp'),
    },
    {
        id: 'settings.automaticStopEnergy',
        keys: ['ate'],
        name: { en: 'Daily Trip: energy to charge', de: 'Daily Trip: zu ladende Energie' },
        type: 'number',
        role: 'level',
        unit: 'Wh',
        min: 0,
        read: numberOf('ate'),
        write: numberTo('ate', { min: 0 }),
    },
    {
        id: 'settings.automaticStopTime',
        keys: ['att'],
        name: {
            en: 'Daily Trip: ready at (seconds since midnight)',
            de: 'Daily Trip: fertig um (Sekunden seit Mitternacht)',
        },
        type: 'number',
        role: 'level',
        unit: 's',
        min: 0,
        max: 86399,
        read: numberOf('att'),
        write: numberTo('att', { min: 0, max: 86399, integer: true }),
    },
];

/**
 * API keys needed to fill the given datapoints, without duplicates.
 *
 * @param datapoints datapoints to collect the keys for
 * @param extraKeys additional keys requested by the user
 */
export function collectKeys(datapoints: readonly Datapoint[], extraKeys: readonly string[] = []): string[] {
    return [...new Set([...datapoints.flatMap(datapoint => datapoint.keys), ...extraKeys])];
}

/**
 * Splits the user's list of additional API keys and drops everything that is not a plausible key.
 *
 * @param input comma- or space-separated keys
 */
export function parseExtraKeys(input: unknown): string[] {
    if (typeof input !== 'string') {
        return [];
    }
    const keys = input.split(/[\s,;]+/).filter(key => /^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(key));
    return [...new Set(keys)];
}

/**
 * Converts any API value into something a state can hold: objects and arrays become JSON text.
 *
 * @param value value as delivered by the API
 */
export function toRawStateValue(value: unknown): ioBroker.StateValue {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
        return value;
    }
    return JSON.stringify(value);
}
