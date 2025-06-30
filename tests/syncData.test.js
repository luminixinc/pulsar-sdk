import { Pulsar } from '../src/pulsar';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

describe('Pulsar.syncData', () => {
  let pulsar;
  let mockSend;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn()
    };
    pulsar.isInitialized = true;

    // Simplify mocking _send
    mockSend = jest.fn((request, cb) => cb({ type: 'syncDataResponse', data: 'ok' }));
    pulsar.bridge.send = mockSend;
  });

  test('initiates a basic sync with empty options', async () => {
    await expect(pulsar.syncData()).resolves.toBe('ok');

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'syncdata',
        data: {}
      }),
      expect.any(Function)
    );
  });

  test('initiates a push changes sync', async () => {
    await expect(pulsar.syncData({
      pushChangesSyncEnabled: true,
      useCompositeGraph: true
    })).resolves.toBe('ok');

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'syncdata',
        data: {
          pushChangesSyncEnabled: true,
          useCompositeGraph: true
        }
      }),
      expect.any(Function)
    );
  });

  test('initiates a single object sync with all params', async () => {
    await expect(pulsar.syncData({
      singleObjectSyncEnabled: true,
      rootObjectId: '003d0000032lc1ZAAQ',
      parentIdFieldList: ['AccountId'],
      childRelationshipList: ['Cases'],
    })).resolves.toBe('ok');

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'syncdata',
        data: {
          singleObjectSyncEnabled: true,
          rootObjectId: '003d0000032lc1ZAAQ',
          parentIdFieldList: ['AccountId'],
          childRelationshipList: ['Cases'],
        }
      }),
      expect.any(Function)
    );
  });

  test('ignores unsupported options', async () => {
    await expect(pulsar.syncData({ unsupportedOption: 123 })).resolves.toBe('ok');

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'syncdata',
        data: {}
      }),
      expect.any(Function)
    );
  });

  test('throws if bridge is not initialized', async () => {
    const uninitialized = new Pulsar();
    await expect(uninitialized.syncData()).rejects.toThrow("Pulsar bridge not initialized");
  });

  test('throws if bridge returns an error', async () => {
    pulsar.bridge.send = (req, cb) => cb({ type: 'error', data: 'Something went wrong' });

    await expect(pulsar.syncData()).rejects.toThrow('Something went wrong');
  });
});

describe('Pulsar Autosync Status Methods', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn()
    };
  });

  describe('getAutosyncStatus', () => {
    it('should return "TRUE" when auto-sync is enabled', async () => {
      pulsar.bridge.send.mockImplementation((req, cb) => {
        cb({ type: 'getAutosyncStatusResponse', data: 'TRUE' });
      });

      const result = await pulsar.getAutosyncStatus();
      expect(result).toBe('TRUE');
      expect(pulsar.bridge.send).toHaveBeenCalledWith(
        { type: 'getAutosyncStatus', data: {} },
        expect.any(Function)
      );
    });

    it('should return "FALSE" when auto-sync is disabled', async () => {
      pulsar.bridge.send.mockImplementation((req, cb) => {
        cb({ type: 'getAutosyncStatusResponse', data: 'FALSE' });
      });

      const result = await pulsar.getAutosyncStatus();
      expect(result).toBe('FALSE');
    });

    it('should throw an error if bridge is not initialized', async () => {
      pulsar.bridge = null;
      await expect(pulsar.getAutosyncStatus()).rejects.toThrow('Pulsar bridge not initialized');
    });
  });

  describe('setAutosyncStatus', () => {
    it('should send "TRUE" and return "TRUE" when enabling auto-sync', async () => {
      pulsar.bridge.send.mockImplementation((req, cb) => {
        cb({ type: 'setAutosyncStatusResponse', data: 'TRUE' });
      });

      const result = await pulsar.setAutosyncStatus(true);
      expect(result).toBe('TRUE');
      expect(pulsar.bridge.send).toHaveBeenCalledWith(
        { type: 'setAutosyncStatus', data: 'TRUE' },
        expect.any(Function)
      );
    });

    it('should send "FALSE" and return "FALSE" when disabling auto-sync', async () => {
      pulsar.bridge.send.mockImplementation((req, cb) => {
        cb({ type: 'setAutosyncStatusResponse', data: 'FALSE' });
      });

      const result = await pulsar.setAutosyncStatus(false);
      expect(result).toBe('FALSE');
      expect(pulsar.bridge.send).toHaveBeenCalledWith(
        { type: 'setAutosyncStatus', data: 'FALSE' },
        expect.any(Function)
      );
    });

    it('should throw an error if bridge is not initialized', async () => {
      pulsar.bridge = null;
      await expect(pulsar.setAutosyncStatus(true)).rejects.toThrow('Pulsar bridge not initialized');
    });
  });
});