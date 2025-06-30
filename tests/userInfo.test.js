import { Pulsar } from '../src/pulsar';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

describe('userInfo', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn()
    };
  });

  it('sends correct request type and data', async () => {
    const mockResponse = {
      username: 'johndoe@mycompany.demo',
      userid: '0056A000001bCD2ABC',
      locale: 'en_US',
      userfullname: 'John Doe',
      organizationid: '00D6A000001dc2eAAA',
      version: '9.0.0.0',
    };

    pulsar.bridge.send.mockImplementation((req, callback) => {
      callback({ type: 'userInfoResponse', data: mockResponse });
    });

    const result = await pulsar.userInfo();
    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      { type: 'userInfo', data: {} },
      expect.any(Function)
    );
    expect(result).toEqual(mockResponse);
  });

  it('throws error when response is of type error', async () => {
    pulsar.bridge.send.mockImplementation((req, callback) => {
      callback({ type: 'error', data: 'Something went wrong' });
    });

    await expect(pulsar.userInfo()).rejects.toThrow('Something went wrong');
  });

  it('throws error if bridge is not initialized', async () => {
    pulsar.bridge = null;
    await expect(pulsar.userInfo()).rejects.toThrow('Pulsar bridge not initialized. Call init() first.');
  });
});
