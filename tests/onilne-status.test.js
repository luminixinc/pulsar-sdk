import { Pulsar } from '../src/pulsar.js';
import { beforeEach, expect, jest } from '@jest/globals';

describe('Pulsar Online Status Methods', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar._send = jest.fn(); // Mock internal _send method
  });

  describe('getOnlineStatus', () => {
    it('should resolve to true when result is "TRUE"', async () => {
      pulsar._send.mockResolvedValue('TRUE');
      const result = await pulsar.getOnlineStatus();
      expect(result).toBe(true);
    });

    it('should resolve to false when result is not "TRUE"', async () => {
      pulsar._send.mockResolvedValue('FALSE');
      const result = await pulsar.getOnlineStatus();
      expect(result).toBe(false);
    });

    it('should call _send with correct payload', async () => {
      pulsar._send.mockResolvedValue('TRUE');
      await pulsar.getOnlineStatus();
      expect(pulsar._send).toHaveBeenCalledWith({ type: 'getOnlineStatus' });
    });
  });

  describe('setOnlineStatus', () => {
    it('should resolve to true when result is "TRUE" and input is true', async () => {
      pulsar._send.mockResolvedValue('TRUE');
      const result = await pulsar.setOnlineStatus(true);
      expect(result).toBe(true);
    });

    it('should resolve to false when result is not "TRUE" and input is false', async () => {
      pulsar._send.mockResolvedValue('FALSE');
      const result = await pulsar.setOnlineStatus(false);
      expect(result).toBe(false);
    });

    it('should call _send with correct payload for true', async () => {
      pulsar._send.mockResolvedValue('TRUE');
      await pulsar.setOnlineStatus(true);
      expect(pulsar._send).toHaveBeenCalledWith({
        type: 'setOnlineStatus',
        data: 'TRUE'
      });
    });

    it('should call _send with correct payload for false', async () => {
      pulsar._send.mockResolvedValue('FALSE');
      await pulsar.setOnlineStatus(false);
      expect(pulsar._send).toHaveBeenCalledWith({
        type: 'setOnlineStatus',
        data: 'FALSE'
      });
    });

    it('should throw an error if non-boolean value is passed', async () => {
      await expect(pulsar.setOnlineStatus('yes')).rejects.toThrow('setOnlineStatus requires a boolean parameter.');
    });
  });
});


describe('getNetworkStatus', () => {
  it('sends the correct request type', async () => {
    const sdk = new Pulsar();
    sdk._send = jest.fn().mockResolvedValue({
      isConnected: 'TRUE',
      connectionType: 'wifi'
    });

    const result = await sdk.getNetworkStatus();

    expect(sdk._send).toHaveBeenCalledWith({ type: 'getNetworkStatus' });
    expect(result).toEqual({
      isConnected: 'TRUE',
      connectionType: 'wifi'
    });
  });

  it('handles a disconnected state', async () => {
    const sdk = new Pulsar();
    sdk._send = jest.fn().mockResolvedValue({
      isConnected: 'FALSE',
      connectionType: 'none'
    });

    const result = await sdk.getNetworkStatus();
    expect(result.isConnected).toBe('FALSE');
    expect(result.connectionType).toBe('none');
  });

  it('works even if connectionType is missing', async () => {
    const sdk = new Pulsar();
    sdk._send = jest.fn().mockResolvedValue({
      isConnected: 'TRUE'
    });

    const result = await sdk.getNetworkStatus();
    expect(result).toEqual({
      isConnected: 'TRUE'
    });
  });
});
