import { Pulsar } from '../src/pulsar.js';
import {
  beforeEach,
  describe,
  expect,
  it,
  jest
} from '@jest/globals';

describe('Pulsar Online Status Methods', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar._send = jest.fn();
  });

  describe('getOnlineStatus', () => {
    it('returns true when getOnlineStatusInfo reports isOnline true', async () => {
      pulsar.getOnlineStatusInfo = jest.fn().mockResolvedValue({
        isOnline: true
      });

      await expect(pulsar.getOnlineStatus()).resolves.toBe(true);

      expect(pulsar.getOnlineStatusInfo).toHaveBeenCalledTimes(1);
    });

    it('returns false when getOnlineStatusInfo reports isOnline false', async () => {
      pulsar.getOnlineStatusInfo = jest.fn().mockResolvedValue({
        isOnline: false
      });

      await expect(pulsar.getOnlineStatus()).resolves.toBe(false);

      expect(pulsar.getOnlineStatusInfo).toHaveBeenCalledTimes(1);
    });

    it('propagates errors from getOnlineStatusInfo', async () => {
      const error = new Error('Unable to retrieve online status');

      pulsar.getOnlineStatusInfo = jest.fn().mockRejectedValue(error);

      await expect(
        pulsar.getOnlineStatus()
      ).rejects.toBe(error);
    });
  });

  describe('getOnlineStatusInfo', () => {
    it('requests the full getOnlineStatus response', async () => {
      pulsar._send.mockResolvedValue({
        type: 'getOnlineStatusResponse',
        data: 'TRUE',
        args: {
          isOnline: 'TRUE'
        }
      });

      await pulsar.getOnlineStatusInfo();

      expect(pulsar._send).toHaveBeenCalledWith(
        {
          type: 'getOnlineStatus'
        },
        true
      );
    });

    it('converts the full Pulsar response into OnlineStatusResult', async () => {
      pulsar._send.mockResolvedValue({
        type: 'getOnlineStatusResponse',
        data: 'FALSE',
        args: {
          canSync: 'TRUE',
          hasConnectivity: 'TRUE',
          isOnline: 'FALSE',
          numUnpushedChanges: '3',
          onlineEnabled: 'TRUE',
          offlineWithSync: 'FALSE',
          autosyncEnabled: 'TRUE',
          syncUserInteractionNeeded: 'FALSE'
        }
      });

      const result = await pulsar.getOnlineStatusInfo();

      expect(result).toEqual({
        isOnline: false,
        canSync: true,
        hasConnectivity: true,
        numUnpushedChanges: 3,
        onlineEnabled: true,
        offlineWithSync: false,
        autosyncEnabled: true,
        syncUserInteractionNeeded: false
      });
    });

    it('converts FALSE boolean strings to false', async () => {
      pulsar._send.mockResolvedValue({
        type: 'getOnlineStatusResponse',
        data: 'FALSE',
        args: {
          canSync: 'FALSE',
          hasConnectivity: 'FALSE',
          isOnline: 'FALSE',
          numUnpushedChanges: '0',
          onlineEnabled: 'FALSE',
          offlineWithSync: 'FALSE',
          autosyncEnabled: 'FALSE',
          syncUserInteractionNeeded: 'FALSE'
        }
      });

      const result = await pulsar.getOnlineStatusInfo();

      expect(result).toEqual({
        isOnline: false,
        canSync: false,
        hasConnectivity: false,
        numUnpushedChanges: 0,
        onlineEnabled: false,
        offlineWithSync: false,
        autosyncEnabled: false,
        syncUserInteractionNeeded: false
      });
    });

    it('falls back to response.data when args.isOnline is missing', async () => {
      pulsar._send.mockResolvedValue({
        type: 'getOnlineStatusResponse',
        data: 'TRUE',
        args: {
          canSync: 'TRUE',
          hasConnectivity: 'TRUE',
          numUnpushedChanges: '0'
        }
      });

      const result = await pulsar.getOnlineStatusInfo();

      expect(result.isOnline).toBe(true);
    });

    it('defaults missing args values safely', async () => {
      pulsar._send.mockResolvedValue({
        type: 'getOnlineStatusResponse',
        data: 'TRUE'
      });

      const result = await pulsar.getOnlineStatusInfo();

      expect(result).toEqual({
        isOnline: true,
        canSync: false,
        hasConnectivity: false,
        numUnpushedChanges: 0,
        onlineEnabled: false,
        offlineWithSync: false,
        autosyncEnabled: false,
        syncUserInteractionNeeded: false
      });
    });

    it('propagates errors from _send', async () => {
      const error = new Error('Online status failed');

      pulsar._send.mockRejectedValue(error);

      await expect(
        pulsar.getOnlineStatusInfo()
      ).rejects.toBe(error);
    });
  });

  describe('setOnlineStatus', () => {
    it('returns true when setting online status succeeds', async () => {
      pulsar._send.mockResolvedValue('TRUE');

      const result = await pulsar.setOnlineStatus(true);

      expect(result).toBe(true);
    });

    it('returns false when setting offline status returns FALSE', async () => {
      pulsar._send.mockResolvedValue('FALSE');

      const result = await pulsar.setOnlineStatus(false);

      expect(result).toBe(false);
    });

    it('sends TRUE when enabling online mode', async () => {
      pulsar._send.mockResolvedValue('TRUE');

      await pulsar.setOnlineStatus(true);

      expect(pulsar._send).toHaveBeenCalledWith({
        type: 'setOnlineStatus',
        data: 'TRUE'
      });
    });

    it('sends FALSE when disabling online mode', async () => {
      pulsar._send.mockResolvedValue('FALSE');

      await pulsar.setOnlineStatus(false);

      expect(pulsar._send).toHaveBeenCalledWith({
        type: 'setOnlineStatus',
        data: 'FALSE'
      });
    });

    it('throws when a non-boolean value is passed', async () => {
      await expect(
        pulsar.setOnlineStatus('yes')
      ).rejects.toThrow(
        'setOnlineStatus requires a boolean parameter.'
      );

      expect(pulsar._send).not.toHaveBeenCalled();
    });

    it('propagates errors from _send', async () => {
      const error = new Error('Unable to change online status');

      pulsar._send.mockRejectedValue(error);

      await expect(
        pulsar.setOnlineStatus(true)
      ).rejects.toBe(error);
    });
  });
});

describe('getNetworkStatus', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar._send = jest.fn();
  });

  it('sends the correct request type', async () => {
    pulsar._send.mockResolvedValue({
      isConnected: 'TRUE',
      connectionType: 'wifi'
    });

    const result = await pulsar.getNetworkStatus();

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getNetworkStatus'
    });

    expect(result).toEqual({
      isConnected: 'TRUE',
      connectionType: 'wifi'
    });
  });

  it('handles a disconnected state', async () => {
    pulsar._send.mockResolvedValue({
      isConnected: 'FALSE',
      connectionType: 'none'
    });

    const result = await pulsar.getNetworkStatus();

    expect(result).toEqual({
      isConnected: 'FALSE',
      connectionType: 'none'
    });
  });

  it('allows connectionType to be missing', async () => {
    pulsar._send.mockResolvedValue({
      isConnected: 'TRUE'
    });

    const result = await pulsar.getNetworkStatus();

    expect(result).toEqual({
      isConnected: 'TRUE'
    });
  });

  it('propagates errors from _send', async () => {
    const error = new Error('Unable to determine network status');

    pulsar._send.mockRejectedValue(error);

    await expect(
      pulsar.getNetworkStatus()
    ).rejects.toBe(error);
  });
});