import { Pulsar } from '../src/pulsar.js';
import { beforeEach, expect, jest } from '@jest/globals';

describe('Pulsar.getPlatformFeatures', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar.bridge = {};      // Pretend initialized
    pulsar.isInitialized = true;

    // Mock the internal _send method
    pulsar._send = jest.fn();
  });

  it('calls _send with type getPlatformFeatures', async () => {
    pulsar._send.mockResolvedValueOnce([]);

    await pulsar.getPlatformFeatures();

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getPlatformFeatures'
    });
  });

  it('rejects if _send throws', async () => {
    pulsar._send.mockRejectedValueOnce(new Error('Bridge error'));

    await expect(pulsar.getPlatformFeatures()).rejects.toThrow('Bridge error');
  });
});
