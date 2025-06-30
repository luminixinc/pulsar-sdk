import { Pulsar } from '../src/pulsar.js';
import { jest } from '@jest/globals';

describe('Pulsar._send', () => {
  let pulsar;
  let mockSend;

  beforeEach(() => {
    mockSend = jest.fn();
    pulsar = new Pulsar();
    pulsar.bridge = { send: mockSend };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('resolves with data when response is successful', async () => {
    const mockResponse = {
      type: 'readResponse',
      data: [{ Id: '001XYZ' }]
    };

    mockSend.mockImplementation((req, cb) => cb(mockResponse));

    const result = await pulsar._send({ type: 'read', object: 'Account', data: {} });

    expect(result).toEqual(mockResponse.data);
  });

  test('rejects with error when response type is "error"', async () => {
    mockSend.mockImplementation((req, cb) => {
      cb({ type: 'error', data: 'Something went wrong' });
    });

    await expect(pulsar._send({ type: 'read', object: 'Account', data: {} }))
      .rejects
      .toThrow('Something went wrong');
  });

  test('rejects with generic message if response type is "error" but has no data', async () => {
    mockSend.mockImplementation((req, cb) => {
      cb({ type: 'error' }); // no data field
    });

    await expect(pulsar._send({ type: 'read', object: 'Account', data: {} }))
      .rejects
      .toThrow('Unknown Pulsar JSAPI error');
  });


  test('rejects when bridge is not initialized', async () => {
    pulsar.bridge = null;

    await expect(pulsar._send({ type: 'read', object: 'Account', data: {} }))
      .rejects
      .toThrow('Pulsar bridge not initialized');
  });
});
