import { Pulsar } from '../src/pulsar.js';
import { beforeEach, expect, jest } from '@jest/globals';

describe('Pulsar.chatterGetFeed', () => {
  let pulsar;

  beforeEach(async () => {
    pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn((request, callback) => {
        if (request.type === 'chattergetfeed') {
          callback({
            type: 'chatterGetFeedResponse',
            data: [
              { Id: '0D5xx0000001', Body: 'First feed item' },
              { Id: '0D5xx0000002', Body: 'Second feed item' }
            ]
          });
        }
      })
    };
  });

  it('should return an array of FeedItem objects', async () => {
    const result = await pulsar.chatterGetFeed('001xx000003DGX5AAO');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    expect(result[0].Body).toBe('First feed item');
  });

  it('should include afterDate, beforeDate and orderBy in request when provided', async () => {
    const mockSend = jest.fn((req, cb) => {
      cb({ type: 'chatterGetFeedResponse', data: [] });
    });
    pulsar.bridge.send = mockSend;

    const options = {
      afterDate: '2023-01-01T00:00:00.000+0000',
      beforeDate: '2023-01-10T00:00:00.000+0000',
      orderBy: 'CreatedDate ASC'
    };

    await pulsar.chatterGetFeed('001xx000003DGX5AAO', options);

    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      type: 'chattergetfeed',
      data: expect.objectContaining({
        ParentId: '001xx000003DGX5AAO',
        '@@after_date': options.afterDate,
        '@@before_date': options.beforeDate,
        orderBy: options.orderBy
      })
    }), expect.any(Function));
  });

  it('should throw if no parentId is provided', async () => {
    await expect(pulsar.chatterGetFeed()).rejects.toThrow('chatterGetFeed requires a valid parentId string.');
  });

  it('should throw if bridge is uninitialized', async () => {
    pulsar.bridge = null;
    await expect(pulsar.chatterGetFeed('001xx000003DGX5AAO')).rejects.toThrow('Pulsar bridge not initialized. Call init() first.');
  });

  it('should throw if response is not an array', async () => {
    pulsar.bridge.send = (_req, cb) => {
      cb({ type: 'chatterGetFeedResponse', data: 'not an array' });
    };

    await expect(pulsar.chatterGetFeed('001xx000003DGX5AAO')).rejects.toThrow('Unexpected response from chatterGetFeed. Expected an array of FeedItem objects.');
  });

  it('should throw if response type is "error"', async () => {
    pulsar.bridge.send = (_req, cb) => {
      cb({ type: 'error', data: 'Something went wrong' });
    };

    await expect(pulsar.chatterGetFeed('001xx000003DGX5AAO')).rejects.toThrow('Something went wrong');
  });
});

describe('Pulsar.chatterPostFeed', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn((request, callback) => {
        if (request.type === 'chatterpostfeed') {
          callback({ type: 'chatterPostFeedResponse', data: null });
        }
      })
    };
  });

  it('should send a new chatter post with message and parentId', async () => {
    const spy = jest.spyOn(pulsar, '_send');
    await pulsar.chatterPostFeed('Hello world', '001xx000003DGX5AAO');
    expect(spy).toHaveBeenCalledWith({
      type: 'chatterpostfeed',
      data: {
        Message: 'Hello world',
        Parent: '001xx000003DGX5AAO'
      }
    });
  });

  it('should include ParentFeedItem when posting a comment', async () => {
    const spy = jest.spyOn(pulsar, '_send');
    await pulsar.chatterPostFeed('Reply to post', '001xx000003DGX5AAO', '0D5xx0000001XYZ');
    expect(spy).toHaveBeenCalledWith({
      type: 'chatterpostfeed',
      data: {
        Message: 'Reply to post',
        Parent: '001xx000003DGX5AAO',
        ParentFeedItem: '0D5xx0000001XYZ'
      }
    });
  });

  it('should throw if message is missing or not a string', async () => {
    await expect(pulsar.chatterPostFeed(null, '001xx000003DGX5AAO')).rejects.toThrow(
      'chatterPostFeed requires a message and parentId.'
    );
    await expect(pulsar.chatterPostFeed(123, '001xx000003DGX5AAO')).rejects.toThrow(
      'chatterPostFeed requires a message and parentId.'
    );
  });

  it('should throw if parentId is missing or not a string', async () => {
    await expect(pulsar.chatterPostFeed('Message only')).rejects.toThrow(
      'chatterPostFeed requires a message and parentId.'
    );
    await expect(pulsar.chatterPostFeed('Message', 123)).rejects.toThrow(
      'chatterPostFeed requires a message and parentId.'
    );
  });

  it('should throw if bridge is not initialized', async () => {
    pulsar.bridge = null;
    await expect(pulsar.chatterPostFeed('Hello', '001xx000003DGX5AAO')).rejects.toThrow(
      'Pulsar bridge not initialized. Call init() first.'
    );
  });

  it('should resolve with no value on success', async () => {
    const result = await pulsar.chatterPostFeed('Just a post', '001xx000003DGX5AAO');
    expect(result).toBeUndefined();
  });

  it('should pass through the response !== null && typeof !== undefined branch', async () => {
    pulsar._send = jest.fn().mockResolvedValue({ unexpected: 'value' });

    // Should not throw, just silently return
    await expect(pulsar.chatterPostFeed('Hello!', '001xx000003DGX5AAO')).resolves.toBeUndefined();

    expect(pulsar._send).toHaveBeenCalled();
  });

  it('should skip the optional validation block when response is null', async () => {
    pulsar._send = jest.fn().mockResolvedValue(null);
    await expect(pulsar.chatterPostFeed('Hi!', '001xx000003DGX5AAO')).resolves.toBeUndefined();
  });

  it('should skip the optional validation block when response is undefined', async () => {
    pulsar._send = jest.fn().mockResolvedValue(undefined);
    await expect(pulsar.chatterPostFeed('Hi again!', '001xx000003DGX5AAO')).resolves.toBeUndefined();
  });

});
