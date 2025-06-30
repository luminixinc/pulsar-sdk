import { Pulsar } from '../src/pulsar';
import { beforeEach, expect, jest } from '@jest/globals';

describe('Pulsar.registerHandler and deregisterHandler', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar.bridge = {
      registerHandler: jest.fn(),
      deregisterHandler: jest.fn(),
    };
    pulsar.pulsar = null; // default to native context
  });

  test('registerHandler (native context) calls bridge.registerHandler', () => {
    const fn = jest.fn();
    pulsar.registerHandler('invalidateLayout', fn);

    expect(pulsar.bridge.registerHandler).toHaveBeenCalledWith('invalidateLayout', fn);
  });

  test('deregisterHandler (native context) calls bridge.deregisterHandler', () => {
    pulsar.deregisterHandler('invalidateLayout');

    expect(pulsar.bridge.deregisterHandler).toHaveBeenCalledWith('invalidateLayout');
  });

  test('registerHandler (embedded context) uses pulsar.addSyncDataUpdateHandler', () => {
    const fn = jest.fn();
    pulsar.pulsar = {
      addSyncDataUpdateHandler: jest.fn(),
    };

    pulsar.registerHandler('syncDataUpdate', fn);

    expect(pulsar.pulsar.addSyncDataUpdateHandler).toHaveBeenCalledWith(fn);
    expect(pulsar.bridge.registerHandler).not.toHaveBeenCalled();
  });

  test('registerHandler (embedded context) uses pulsar.addSyncFinishedHandler', () => {
    const fn = jest.fn();
    pulsar.pulsar = {
      addSyncFinishedHandler: jest.fn(),
    };

    pulsar.registerHandler('syncDataFinished', fn);

    expect(pulsar.pulsar.addSyncFinishedHandler).toHaveBeenCalledWith(fn);
    expect(pulsar.bridge.registerHandler).not.toHaveBeenCalled();
  });

  test('deregisterHandler (embedded context) uses pulsar.removeSync handlers', () => {
    pulsar.pulsar = {
      removeSyncDataUpdateHandler: jest.fn(),
      removeSyncFinishedHandler: jest.fn(),
    };

    pulsar.deregisterHandler('syncDataUpdate');
    pulsar.deregisterHandler('syncDataFinished');

    expect(pulsar.pulsar.removeSyncDataUpdateHandler).toHaveBeenCalled();
    expect(pulsar.pulsar.removeSyncFinishedHandler).toHaveBeenCalled();
    expect(pulsar.bridge.deregisterHandler).not.toHaveBeenCalled();
  });

  test('throws error if bridge is not initialized', () => {
    pulsar.bridge = null;

    expect(() => pulsar.registerHandler('foo', () => {})).toThrow('Pulsar bridge not initialized');
    expect(() => pulsar.deregisterHandler('foo')).toThrow('Pulsar bridge not initialized');
  });

  test('throws error on invalid parameters', () => {
    expect(() => pulsar.registerHandler(null, () => {})).toThrow();
    expect(() => pulsar.registerHandler('event', null)).toThrow();
    expect(() => pulsar.deregisterHandler(null)).toThrow();
  });
});
