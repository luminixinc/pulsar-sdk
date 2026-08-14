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

    mockSend = jest.fn((request, cb) =>
      cb({
        type: 'syncDataResponse',
        data: 'ok'
      })
    );

    pulsar.bridge.send = mockSend;
  });

  test('initiates a basic sync with empty options', async () => {
    await expect(pulsar.syncData()).resolves.toBe('ok');

    expect(mockSend).toHaveBeenCalledWith(
      {
        type: 'syncdata',
        data: {}
      },
      expect.any(Function)
    );
  });

  test('initiates a mini sync', async () => {
    await expect(
      pulsar.syncData({
        miniSyncEnabled: true,
        miniSyncObjectList: ['Account', 'Contact']
      })
    ).resolves.toBe('ok');

    expect(mockSend).toHaveBeenCalledWith(
      {
        type: 'syncdata',
        data: {
          miniSyncEnabled: true,
          miniSyncObjectList: ['Account', 'Contact']
        }
      },
      expect.any(Function)
    );
  });

  test('initiates a push changes sync', async () => {
    await expect(
      pulsar.syncData({
        pushChangesSyncEnabled: true
      })
    ).resolves.toBe('ok');

    expect(mockSend).toHaveBeenCalledWith(
      {
        type: 'syncdata',
        data: {
          pushChangesSyncEnabled: true
        }
      },
      expect.any(Function)
    );
  });

  test('initiates a push changes sync using Composite API', async () => {
    await expect(
      pulsar.syncData({
        pushChangesSyncEnabled: true,
        useComposite: true
      })
    ).resolves.toBe('ok');

    expect(mockSend).toHaveBeenCalledWith(
      {
        type: 'syncdata',
        data: {
          pushChangesSyncEnabled: true,
          useComposite: true
        }
      },
      expect.any(Function)
    );
  });

  test('initiates a push changes sync using Composite Graph API', async () => {
    await expect(
      pulsar.syncData({
        pushChangesSyncEnabled: true,
        useCompositeGraph: true
      })
    ).resolves.toBe('ok');

    expect(mockSend).toHaveBeenCalledWith(
      {
        type: 'syncdata',
        data: {
          pushChangesSyncEnabled: true,
          useCompositeGraph: true
        }
      },
      expect.any(Function)
    );
  });

  test('initiates a single object sync with all supported relationship options', async () => {
    await expect(
      pulsar.syncData({
        singleObjectSyncEnabled: true,
        rootObjectId: '003d0000032lc1ZAAQ',
        parentIdFieldList: [
          'AccountId',
          'ReportsToId'
        ],
        childRelationshipList: [
          'Cases',
          'Tasks',
          'Custom_Objects__r'
        ],
        childStartDatetime: '2026-08-01T00:00:00.000Z'
      })
    ).resolves.toBe('ok');

    expect(mockSend).toHaveBeenCalledWith(
      {
        type: 'syncdata',
        data: {
          singleObjectSyncEnabled: true,
          rootObjectId: '003d0000032lc1ZAAQ',
          parentIdFieldList: [
            'AccountId',
            'ReportsToId'
          ],
          childRelationshipList: [
            'Cases',
            'Tasks',
            'Custom_Objects__r'
          ],
          childStartDatetime: '2026-08-01T00:00:00.000Z'
        }
      },
      expect.any(Function)
    );
  });

  test('can initiate a single object sync for the root object only', async () => {
    await expect(
      pulsar.syncData({
        singleObjectSyncEnabled: true,
        rootObjectId: '001234567890123AAA',
        parentIdFieldList: ['NONE'],
        childRelationshipList: ['NONE']
      })
    ).resolves.toBe('ok');

    expect(mockSend).toHaveBeenCalledWith(
      {
        type: 'syncdata',
        data: {
          singleObjectSyncEnabled: true,
          rootObjectId: '001234567890123AAA',
          parentIdFieldList: ['NONE'],
          childRelationshipList: ['NONE']
        }
      },
      expect.any(Function)
    );
  });

  test('passes childStartDatetime through unchanged', async () => {
    const childStartDatetime = '2020-01-01T00:00:00.000Z';

    await pulsar.syncData({
      singleObjectSyncEnabled: true,
      rootObjectId: '001234567890123AAA',
      childRelationshipList: ['Cases'],
      childStartDatetime
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          childStartDatetime
        })
      }),
      expect.any(Function)
    );
  });

  test('passes every supported sync option through to the request', async () => {
    const options = {
      miniSyncEnabled: true,
      miniSyncObjectList: ['Account', 'Contact'],
      singleObjectSyncEnabled: true,
      rootObjectId: '001XYZ',
      parentIdFieldList: ['ParentId__c'],
      childRelationshipList: ['Children__r'],
      childStartDatetime: '2026-08-01T00:00:00.000Z',
      pushChangesSyncEnabled: true,
      useComposite: true,
      useCompositeGraph: true
    };

    await pulsar.syncData(options);

    expect(mockSend).toHaveBeenCalledWith(
      {
        type: 'syncdata',
        data: options
      },
      expect.any(Function)
    );
  });

  test('preserves explicitly supplied false values', async () => {
    await pulsar.syncData({
      miniSyncEnabled: false,
      singleObjectSyncEnabled: false,
      pushChangesSyncEnabled: false,
      useComposite: false,
      useCompositeGraph: false
    });

    expect(mockSend).toHaveBeenCalledWith(
      {
        type: 'syncdata',
        data: {
          miniSyncEnabled: false,
          singleObjectSyncEnabled: false,
          pushChangesSyncEnabled: false,
          useComposite: false,
          useCompositeGraph: false
        }
      },
      expect.any(Function)
    );
  });

  test('ignores unsupported options', async () => {
    await expect(
      pulsar.syncData({
        miniSyncEnabled: true,
        miniSyncObjectList: ['Account'],
        unsupportedOption: 123,
        anotherUnsupportedOption: 'blerg'
      })
    ).resolves.toBe('ok');

    expect(mockSend).toHaveBeenCalledWith(
      {
        type: 'syncdata',
        data: {
          miniSyncEnabled: true,
          miniSyncObjectList: ['Account']
        }
      },
      expect.any(Function)
    );
  });

  test('does not mutate the supplied options object', async () => {
    const options = {
      miniSyncEnabled: true,
      miniSyncObjectList: ['Account'],
      unsupportedOption: 123
    };

    await pulsar.syncData(options);

    expect(options).toEqual({
      miniSyncEnabled: true,
      miniSyncObjectList: ['Account'],
      unsupportedOption: 123
    });
  });

  test('throws if bridge is not initialized', async () => {
    const uninitialized = new Pulsar();

    await expect(
      uninitialized.syncData()
    ).rejects.toThrow(
      'Pulsar bridge not initialized'
    );
  });

  test('throws if bridge returns an error', async () => {
    pulsar.bridge.send = (req, cb) =>
      cb({
        type: 'error',
        data: 'Something went wrong'
      });

    await expect(
      pulsar.syncData()
    ).rejects.toThrow(
      'Something went wrong'
    );
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

    it ('should send "TRUE" and return "TRUE" when enabling auto-sync with "true"', async () => {
      pulsar.bridge.send.mockImplementation((req, cb) => {
        cb({ type: 'setAutosyncStatusResponse', data: 'TRUE' });
      });

      const result = await pulsar.setAutosyncStatus('true');
      expect(result).toBe('TRUE');
      expect(pulsar.bridge.send).toHaveBeenCalledWith(
        { type: 'setAutosyncStatus', data: 'TRUE' },
        expect.any(Function)
      );
    });

    it ('should send "TRUE" and return "TRUE" when enabling auto-sync with 1', async () => {
      pulsar.bridge.send.mockImplementation((req, cb) => {
        cb({ type: 'setAutosyncStatusResponse', data: 'TRUE' });
      });

      const result = await pulsar.setAutosyncStatus(1);
      expect(result).toBe('TRUE');
      expect(pulsar.bridge.send).toHaveBeenCalledWith(
        { type: 'setAutosyncStatus', data: 'TRUE' },
        expect.any(Function)
      );
    });

    it ('should send "TRUE" and return "TRUE" when enabling auto-sync with 1', async () => {
      pulsar.bridge.send.mockImplementation((req, cb) => {
        cb({ type: 'setAutosyncStatusResponse', data: 'TRUE' });
      });

      const result = await pulsar.setAutosyncStatus("1");
      expect(result).toBe('TRUE');
      expect(pulsar.bridge.send).toHaveBeenCalledWith(
        { type: 'setAutosyncStatus', data: 'TRUE' },
        expect.any(Function)
      );
    });

    it ('should send "TRUE" and return "TRUE" when enabling auto-sync with "tRuE"', async () => {
      pulsar.bridge.send.mockImplementation((req, cb) => {
        cb({ type: 'setAutosyncStatusResponse', data: 'TRUE' });
      });

      const result = await pulsar.setAutosyncStatus('tRuE');
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

    it('should send "FALSE" and return "FALSE" when disabling auto-sync with any non-truthy arg', async () => {
      pulsar.bridge.send.mockImplementation((req, cb) => {
        cb({ type: 'setAutosyncStatusResponse', data: 'FALSE' });
      });

      const result = await pulsar.setAutosyncStatus('blerg');
      expect(result).toBe('FALSE');
      expect(pulsar.bridge.send).toHaveBeenCalledWith(
        { type: 'setAutosyncStatus', data: 'FALSE' },
        expect.any(Function)
      );
    });

    it('should send "FALSE" and return "FALSE" when disabling auto-sync with 0', async () => {
      pulsar.bridge.send.mockImplementation((req, cb) => {
        cb({ type: 'setAutosyncStatusResponse', data: 'FALSE' });
      });

      const result = await pulsar.setAutosyncStatus(0);
      expect(result).toBe('FALSE');
      expect(pulsar.bridge.send).toHaveBeenCalledWith(
        { type: 'setAutosyncStatus', data: 'FALSE' },
        expect.any(Function)
      );
    });

    it('should send "FALSE" and return "FALSE" when disabling auto-sync with "0"', async () => {
      pulsar.bridge.send.mockImplementation((req, cb) => {
        cb({ type: 'setAutosyncStatusResponse', data: 'FALSE' });
      });

      const result = await pulsar.setAutosyncStatus("0");
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