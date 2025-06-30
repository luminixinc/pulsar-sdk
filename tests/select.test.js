import { Pulsar } from '../src/pulsar';
import { beforeEach, describe, expect, test, jest } from '@jest/globals';

describe('Pulsar.select', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn((req, cb) => {
        if (req.type === 'select') {
          // Simulate successful response
          cb({ type: 'selectResponse', data: [{ Id: '001XYZ' }] });
        }
      })
    };
  });

  test('should send a valid select request and return data', async () => {
    const result = await pulsar.select('Account', "SELECT Id FROM Account WHERE Name LIKE '%hello%'");
    expect(result).toEqual([{ Id: '001XYZ' }]);
    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      {
        type: 'select',
        object: 'Account',
        data: { query: "SELECT Id FROM Account WHERE Name LIKE '%hello%'" }
      },
      expect.any(Function)
    );
  });

  test('should throw if query is not a string', async () => {
    await expect(pulsar.select('Account', null)).rejects.toThrow('Select query must be a valid SQLite string.');
    await expect(pulsar.select('Account', {})).rejects.toThrow('Select query must be a valid SQLite string.');
  });

  test('should reject if Pulsar bridge is not initialized', async () => {
    pulsar.bridge = null;
    await expect(pulsar.select('Account', 'SELECT Id FROM Account')).rejects.toThrow('Pulsar bridge not initialized. Call init() first.');
  });

  test('should handle Pulsar error response', async () => {
    pulsar.bridge.send = jest.fn((req, cb) => {
      cb({ type: 'error', data: 'Bad select syntax' });
    });

    await expect(pulsar.select('Account', 'bad query')).rejects.toThrow('Bad select syntax');
  });
});
