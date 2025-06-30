import { Pulsar } from '../src/pulsar';
import { beforeEach, expect, jest } from '@jest/globals';

describe('getSObjectSchema', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar.bridge = {}; // Simulate initialized bridge
  });

  test('parses string response as JSON (valid DescribeSObjectResult)', async () => {
    const mockSchema = {
      fields: [{ name: 'Name', type: 'string' }],
      childRelationships: [],
    };

    pulsar._send = jest.fn().mockResolvedValue(JSON.stringify(mockSchema));

    const result = await pulsar.getSObjectSchema('Account');
    expect(result).toEqual(mockSchema);
    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getSObjectSchema',
      object: 'Account',
      data: {},
    });
  });

  test('throws error if string response is not valid JSON', async () => {
    pulsar._send = jest.fn().mockResolvedValue('invalid-json');

    await expect(pulsar.getSObjectSchema('Contact')).rejects.toThrow('Failed to parse schema response');
  });

  test('throws error if response is not a string', async () => {
    pulsar._send = jest.fn().mockResolvedValue({ fields: [] });

    await expect(pulsar.getSObjectSchema('Lead')).rejects.toThrow(
      'Unexpected return type. Expected JSON string but received object.'
    );
  });

  test('handles empty schema string safely (should throw)', async () => {
    pulsar._send = jest.fn().mockResolvedValue('');

    await expect(pulsar.getSObjectSchema('Case')).rejects.toThrow('Failed to parse schema response');
  });
});
