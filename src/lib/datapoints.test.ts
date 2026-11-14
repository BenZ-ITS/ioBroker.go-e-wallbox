import assert from 'node:assert/strict';
import { CHANNELS, DATAPOINTS, collectKeys, parseExtraKeys, toRawStateValue, type Datapoint } from './datapoints';

function datapoint(id: string): Datapoint {
    const found = DATAPOINTS.find(candidate => candidate.id === id);
    assert.ok(found, `datapoint ${id} exists`);
    return found;
}

/** Excerpt of a status answer of the tested device (go-eCharger V4, firmware 60.5); serial number replaced */
const STATUS = {
    sse: '000001',
    typ: 'go-eCharger_V4',
    fwv: '60.5',
    car: 4,
    alw: false,
    frc: 1,
    amp: 6,
    psm: 1,
    dwo: 15000,
    wh: 5625.602206,
    lmo: 3,
    modelStatus: 4,
    acu: null,
    nrg: [230.33, 231.57, 229.71, 2.48, 0.04, 6.12, 0, 0, 1380.4, 0, 0, 1380.4, 0, 0, 0, 0],
    tma: [26, 20.5],
    rbt: 13388586947,
};

describe('datapoints', () => {
    it('have unique ids in known channels', () => {
        const ids = DATAPOINTS.map(candidate => candidate.id);
        assert.equal(new Set(ids).size, ids.length);
        for (const id of ids) {
            assert.ok(id.split('.')[0] in CHANNELS, `${id} is in a known channel`);
        }
    });

    it('read plain values', () => {
        assert.equal(datapoint('charging.forceState').read(STATUS), 1);
        assert.equal(datapoint('charging.allowed').read(STATUS), false);
        assert.equal(datapoint('info.firmware').read(STATUS), '60.5');
        assert.equal(datapoint('car.chargedEnergy').read(STATUS), 5626);
        assert.equal(datapoint('info.uptime').read(STATUS), 223143);
    });

    it('report null for values the wallbox sends as null', () => {
        assert.equal(datapoint('charging.allowedCurrent').read(STATUS), null);
    });

    it('skip keys the firmware does not deliver', () => {
        assert.equal(datapoint('energy.frequency').read(STATUS), undefined);
        assert.equal(datapoint('energy.power').read({}), undefined);
        assert.equal(datapoint('car.connected').read({}), undefined);
    });

    it('split the nrg array', () => {
        assert.equal(datapoint('energy.voltageL1').read(STATUS), 230);
        assert.equal(datapoint('energy.currentL2').read(STATUS), 6.1);
        assert.equal(datapoint('energy.powerL2').read(STATUS), 1380);
        assert.equal(datapoint('energy.power').read(STATUS), 1380);
        assert.equal(datapoint('temperature.sensor2').read(STATUS), 21);
    });

    it('derive "connected" from the car state', () => {
        const connected = datapoint('car.connected');
        assert.equal(connected.read({ car: 1 }), false);
        assert.equal(connected.read({ car: 2 }), true);
        assert.equal(connected.read({ car: 3 }), true);
        assert.equal(connected.read({ car: 4 }), true);
        assert.equal(connected.read({ car: 5 }), false);
        assert.equal(connected.read({ car: null }), null);
    });

    it('map the energy limit: null <-> 0', () => {
        const limit = datapoint('charging.energyLimit');
        assert.equal(limit.read({ dwo: null }), 0);
        assert.equal(limit.read(STATUS), 15000);
        assert.equal(limit.write?.toApi(0), null);
        assert.equal(limit.write?.toApi(20000), 20000);
        assert.throws(() => limit.write?.toApi(-1), RangeError);
    });

    it('validate values before writing', () => {
        const force = datapoint('charging.forceState').write!;
        assert.equal(force.key, 'frc');
        assert.equal(force.toApi(2), 2);
        assert.equal(force.toApi('1'), 1);
        assert.throws(() => force.toApi(3), RangeError);
        assert.throws(() => force.toApi(0.5), RangeError);
        assert.throws(() => force.toApi(null), RangeError);
        assert.throws(() => force.toApi(''), RangeError);

        const current = datapoint('charging.current').write!;
        assert.equal(current.toApi(12), 12);
        assert.throws(() => current.toApi(5), RangeError);
        assert.throws(() => current.toApi(33), RangeError);

        // values outside the documented list must not slip through
        assert.throws(() => datapoint('charging.logicMode').write!.toApi(2), RangeError);
        assert.equal(datapoint('pv.useSurplus').write!.toApi('true'), true);
        assert.throws(() => datapoint('pv.useSurplus').write!.toApi('yes'), RangeError);
        assert.equal(datapoint('info.friendlyName').write!.toApi('  Garage '), 'Garage');
    });

    it('count the phases switched to the car', () => {
        const phases = datapoint('energy.phases');
        assert.deepEqual(phases.keys, ['pha']);
        assert.equal(phases.read({ pha: [true, true, true, true, true, true], pnp: 0 }), 3);
        assert.equal(phases.read({ pha: [true, false, false, true, true, true], pnp: 0 }), 1);
        assert.equal(phases.read({ pha: [false, false, false, true, true, true], pnp: 0 }), 0);
        assert.equal(phases.read({ pha: null }), null);
        assert.equal(phases.read({ pha: [true, true] }), null);
        assert.equal(phases.read({ pha: [1, 1, 1, 1, 1, 1] }), null);
        assert.equal(phases.read({ pnp: 3 }), undefined);
    });

    it('offer no write access for measurements', () => {
        for (const id of ['charging.allowed', 'charging.reason', 'energy.total', 'car.state']) {
            assert.equal(datapoint(id).write, undefined);
        }
    });
});

describe('helpers', () => {
    it('collect each API key once', () => {
        const keys = collectKeys(DATAPOINTS, ['tpa', 'frc']);
        assert.equal(new Set(keys).size, keys.length);
        assert.ok(keys.includes('sse') && keys.includes('nrg') && keys.includes('tpa'));
    });

    it('parse the list of additional keys', () => {
        assert.deepEqual(parseExtraKeys(' tpa, cdi;modelStatus  tpa'), ['tpa', 'cdi', 'modelStatus']);
        assert.deepEqual(parseExtraKeys('a&b=1, ../x, ok_1'), ['ok_1']);
        assert.deepEqual(parseExtraKeys(undefined), []);
    });

    it('turn structured values into JSON text', () => {
        assert.equal(toRawStateValue({ type: 1, value: 5 }), '{"type":1,"value":5}');
        assert.equal(toRawStateValue([1, 2]), '[1,2]');
        assert.equal(toRawStateValue(null), null);
        assert.equal(toRawStateValue(7), 7);
    });
});
