import { Pulsar } from '../src/pulsar';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

describe('Pulsar.interruptSync', () => {
  let pulsar;
  let mockSend;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn()
    };
    pulsar.isInitialized = true;

    // Mock the internal _send method directly for simplicity
    mockSend = jest.spyOn(pulsar, '_send');
  });

  test('returns true when sync is successfully interrupted', async () => {
    mockSend.mockResolvedValue({ success: true });

    const result = await pulsar.interruptSync();
    expect(result).toBe(true);
    expect(mockSend).toHaveBeenCalledWith({
      type: 'interruptsync',
      data: {}
    });
  });

  test('returns false when no active sync is found', async () => {
    mockSend.mockResolvedValue({ success: false });

    const result = await pulsar.interruptSync();
    expect(result).toBe(false);
  });

  test('throws on unexpected response format', async () => {
    mockSend.mockResolvedValue({ message: 'invalid' });

    await expect(pulsar.interruptSync()).rejects.toThrow('Unexpected response format from interruptSync.');
  });

  test('throws if bridge is not initialized', async () => {
    const uninitialized = new Pulsar();
    await expect(uninitialized.interruptSync()).rejects.toThrow("Pulsar bridge not initialized");
  });

  test('throws if bridge responds with error type', async () => {
    mockSend.mockRejectedValue(new Error("Bridge failed"));
    await expect(pulsar.interruptSync()).rejects.toThrow("Bridge failed");
  });
});
