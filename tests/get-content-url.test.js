import { Pulsar } from '../src/pulsar.js';
import { beforeEach, expect, jest } from '@jest/globals';

describe('getContentUrl', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn((req, cb) => {
        cb({ type: 'contentURLResponse', data: { url: 'http://local/url', title: 'MyDoc' } });
      }),
    };
  });

  it('should retrieve content URL using Id', async () => {
    const result = await pulsar.getContentUrl({ Id: '069ABC' });
    expect(result).toEqual({ url: 'http://local/url', title: 'MyDoc' });

    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'getContentUrl',
        data: { Id: '069ABC' }
      }),
      expect.any(Function)
    );
  });

  it('should retrieve content URL using Title', async () => {
    const result = await pulsar.getContentUrl({ Title: 'DocTitle' });
    expect(result).toEqual({ url: 'http://local/url', title: 'MyDoc' });

    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'getContentUrl',
        data: { Title: 'DocTitle' }
      }),
      expect.any(Function)
    );
  });

  it('should throw if neither Id nor Title is provided', async () => {
    await expect(pulsar.getContentUrl({})).rejects.toThrow(
      'getContentUrl requires at least one of Id or Title.'
    );
  });

  it('should throw if bridge is not initialized', async () => {
    pulsar.bridge = null;
    await expect(pulsar.getContentUrl({ Id: '069ABC' })).rejects.toThrow(
      'Pulsar bridge not initialized. Call init() first.'
    );
  });

  it('should propagate errors from _send', async () => {
    pulsar._send = jest.fn().mockRejectedValue(new Error('Bridge failure'));
    await expect(pulsar.getContentUrl({ Id: '069ABC' })).rejects.toThrow('Bridge failure');
  });
});
