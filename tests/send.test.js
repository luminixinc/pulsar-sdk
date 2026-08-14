import { Pulsar } from '../src/pulsar.js';
import {
  beforeEach,
  describe,
  expect,
  jest,
  test
} from '@jest/globals';

describe('Pulsar._send', () => {
  let pulsar;
  let mockBridgeSend;

  beforeEach(() => {
    pulsar = new Pulsar();

    mockBridgeSend = jest.fn();

    pulsar.bridge = {
      send: mockBridgeSend
    };

    pulsar.isInitialized = true;
  });

  test('sends the supplied request through the bridge', async () => {
    const request = {
      type: 'testRequest',
      object: 'Account',
      data: {
        Id: '001XYZ'
      }
    };

    mockBridgeSend.mockImplementation((_request, callback) => {
      callback({
        type: 'testResponse',
        data: 'success'
      });
    });

    await pulsar._send(request);

    expect(mockBridgeSend).toHaveBeenCalledTimes(1);
    expect(mockBridgeSend).toHaveBeenCalledWith(
      request,
      expect.any(Function)
    );
  });

  test('returns response.data by default', async () => {
    const data = {
      Id: '001XYZ',
      Name: 'Test Account'
    };

    mockBridgeSend.mockImplementation((_request, callback) => {
      callback({
        type: 'readResponse',
        object: 'Account',
        data,
        args: {
          somethingExtra: 'value'
        }
      });
    });

    const result = await pulsar._send({
      type: 'read',
      object: 'Account'
    });

    expect(result).toBe(data);
  });

  test('returns the full response when sendFullResponse is true', async () => {
    const response = {
      type: 'getOnlineStatusResponse',
      object: '',
      data: 'TRUE',
      args: {
        canSync: 'TRUE',
        hasConnectivity: 'TRUE',
        isOnline: 'TRUE',
        numUnpushedChanges: '0',
        onlineEnabled: 'TRUE',
        offlineWithSync: 'FALSE',
        autosyncEnabled: 'TRUE',
        syncUserInteractionNeeded: 'FALSE'
      }
    };

    mockBridgeSend.mockImplementation((_request, callback) => {
      callback(response);
    });

    const result = await pulsar._send(
      {
        type: 'getOnlineStatus'
      },
      true
    );

    expect(result).toBe(response);
  });

  test('does not return the full response when sendFullResponse is false', async () => {
    const response = {
      type: 'testResponse',
      data: 'response data',
      args: {
        extra: 'information'
      }
    };

    mockBridgeSend.mockImplementation((_request, callback) => {
      callback(response);
    });

    const result = await pulsar._send(
      {
        type: 'testRequest'
      },
      false
    );

    expect(result).toBe('response data');
  });

  test('rejects when the bridge is not initialized', async () => {
    pulsar.bridge = null;

    await expect(
      pulsar._send({
        type: 'testRequest'
      })
    ).rejects.toThrow(
      'Pulsar bridge not initialized. Call init() first.'
    );
  });

  test('rejects when Pulsar returns an error response', async () => {
    mockBridgeSend.mockImplementation((_request, callback) => {
      callback({
        type: 'error',
        data: 'Something went wrong'
      });
    });

    await expect(
      pulsar._send({
        type: 'testRequest'
      })
    ).rejects.toThrow(
      'Something went wrong'
    );
  });

  test('uses the default error message when an error response has no data', async () => {
    mockBridgeSend.mockImplementation((_request, callback) => {
      callback({
        type: 'error'
      });
    });

    await expect(
      pulsar._send({
        type: 'testRequest'
      })
    ).rejects.toThrow(
      'Unknown Pulsar JSAPI error'
    );
  });

  test('still rejects errors when sendFullResponse is true', async () => {
    mockBridgeSend.mockImplementation((_request, callback) => {
      callback({
        type: 'error',
        data: 'Full response request failed',
        args: {
          extra: 'information'
        }
      });
    });

    await expect(
      pulsar._send(
        {
          type: 'testRequest'
        },
        true
      )
    ).rejects.toThrow(
      'Full response request failed'
    );
  });
});