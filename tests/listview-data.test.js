import { Pulsar } from '../src/pulsar';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

describe('listviewInfo', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn((req, cb) => {
        cb({ type: 'response', data: { '00B123': 'All Accounts', '00B456': 'My Accounts' } });
      })
    };
  });

  it('should return listview dictionary on success', async () => {
    const result = await pulsar.listviewInfo('Account');
    expect(result).toEqual({
      '00B123': 'All Accounts',
      '00B456': 'My Accounts'
    });
  });

  const invalidValues = [undefined, null, 123, {}, [], true, false];

  it.each(invalidValues)('should throw if objectName is invalid: %p', async (value) => {
    await expect(pulsar.listviewInfo(value)).rejects.toThrow('listviewInfo requires a valid objectName string.');
  });
});


describe('listviewMetadata', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn((req, cb) => {
        cb({
          type: 'response',
          data: {
            fields: ['Name', 'Industry'],
            labels: { Name: 'Account Name', Industry: 'Industry' },
            where: "Industry = 'Energy'"
          }
        });
      })
    };
  });

  it('should return listview metadata on success', async () => {
    const result = await pulsar.listviewMetadata('Account', '00B123456789ABCDEF');

    expect(result).toEqual({
      fields: ['Name', 'Industry'],
      labels: { Name: 'Account Name', Industry: 'Industry' },
      where: "Industry = 'Energy'"
    });
  });

  const invalidValues = [undefined, null, 123, {}, [], true, false];

  it.each(invalidValues)('should throw if objectName is invalid: %p', async (value) => {
    await expect(pulsar.listviewMetadata(value, '00B123')).rejects.toThrow('listviewMetadata requires a valid objectName string.');
  });

  it.each(invalidValues)('should throw if listviewId is invalid: %p', async (value) => {
    await expect(pulsar.listviewMetadata('Account', value)).rejects.toThrow('listviewMetadata requires a valid listviewId string.');
  });
});
