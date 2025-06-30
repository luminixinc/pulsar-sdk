import { Pulsar } from '../src/pulsar.js';
import { beforeEach, expect, jest } from '@jest/globals';

describe('getCompactLayoutFields', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar._send = jest.fn();
  });

  it('throws an error if objectName is missing', async () => {
    await expect(pulsar.getCompactLayoutFields()).rejects.toThrow(
      'getCompactLayoutFields requires a valid objectName string.'
    );
  });

  it('throws an error if objectName is not a string', async () => {
    await expect(pulsar.getCompactLayoutFields(123)).rejects.toThrow(
      'getCompactLayoutFields requires a valid objectName string.'
    );
  });

  it('sends correct payload with only recordTypeId', async () => {
    pulsar._send.mockResolvedValue(['Name', 'Phone']);

    const result = await pulsar.getCompactLayoutFields('Contact', '0123456789', undefined);

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getCompactLayoutFields',
      object: 'Contact',
      data: {
        ObjectType: 'Contact',
        RecordTypeId: '0123456789'
      }
    });

    expect(result).toEqual(['Name', 'Phone']);
  });

  it('sends correct payload with only recordTypeName', async () => {
    pulsar._send.mockResolvedValue(['Email', 'Title']);

    const result = await pulsar.getCompactLayoutFields('Contact', undefined, 'Customer_Contact');

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getCompactLayoutFields',
      object: 'Contact',
      data: {
        ObjectType: 'Contact',
        RecordTypeName: 'Customer_Contact'
      }
    });

    expect(result).toEqual(['Email', 'Title']);
  });

  it('prefers recordTypeName over recordTypeId if both are provided', async () => {
    pulsar._send.mockResolvedValue(['Email']);

    const result = await pulsar.getCompactLayoutFields('Account', '012xx0000001XYZ', 'Business_Account');

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getCompactLayoutFields',
      object: 'Account',
      data: {
        ObjectType: 'Account',
        RecordTypeName: 'Business_Account'
      }
    });

    expect(result).toEqual(['Email']);
  });

  it('throws an error if response is not an array', async () => {
    pulsar._send.mockResolvedValue({ fields: ['Name'] });

    await expect(
      pulsar.getCompactLayoutFields('Lead', '012xx0000001ABC')
    ).rejects.toThrow(
      'Unexpected response format from getCompactLayoutFields. Expected array of field names.'
    );
  });
});
