import { Pulsar } from '../src/pulsar.js';
import { beforeEach, expect, jest } from '@jest/globals';


describe('getPicklist', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar._send = jest.fn();
  });

  it('sends basic request with objectName and fieldName', async () => {
    const mockResponse = { itemIds: ['A', 'B'], itemLabels: ['Label A', 'Label B'] };
    pulsar._send.mockResolvedValue(mockResponse);

    const result = await pulsar.getPicklist('Account', 'Type');

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getPicklist',
      object: 'Account',
      fieldName: 'Type',
      data: {}
    });

    expect(result).toEqual(mockResponse);
  });

  it('includes RecordTypeId if provided', async () => {
    const mockResponse = { itemIds: ['A'], itemLabels: ['Label A'] };
    pulsar._send.mockResolvedValue(mockResponse);

    const result = await pulsar.getPicklist('Contact', 'LeadSource', '012345');

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getPicklist',
      object: 'Contact',
      fieldName: 'LeadSource',
      data: { RecordTypeId: '012345' }
    });

    expect(result).toEqual(mockResponse);
  });

  it('includes controlling field and value if provided', async () => {
    const mockResponse = { itemIds: ['Red'], itemLabels: ['Red'] };
    pulsar._send.mockResolvedValue(mockResponse);

    const result = await pulsar.getPicklist('Product2', 'Color__c', undefined, 'Category__c', 'Paint');

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getPicklist',
      object: 'Product2',
      fieldName: 'Color__c',
      data: { Category__c: 'Paint' }
    });

    expect(result).toEqual(mockResponse);
  });

  it('includes both RecordTypeId and controlling field if both provided', async () => {
    const mockResponse = { itemIds: ['Opt1'], itemLabels: ['Option 1'] };
    pulsar._send.mockResolvedValue(mockResponse);

    const result = await pulsar.getPicklist('Case', 'Status', '012345', 'Origin', 'Email');

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getPicklist',
      object: 'Case',
      fieldName: 'Status',
      data: {
        RecordTypeId: '012345',
        Origin: 'Email'
      }
    });

    expect(result).toEqual(mockResponse);
  });

  it('omits controlling field if value is missing', async () => {
    const mockResponse = { itemIds: [], itemLabels: [] };
    pulsar._send.mockResolvedValue(mockResponse);

    const result = await pulsar.getPicklist('Opportunity', 'StageName', '012999', 'Type');

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getPicklist',
      object: 'Opportunity',
      fieldName: 'StageName',
      data: {
        RecordTypeId: '012999'
      }
    });

    expect(result).toEqual(mockResponse);
  });
});


describe('getUnfilteredPicklist', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar._send = jest.fn();
  });

  it('sends correct payload without recordTypeId', async () => {
    const expected = {
      itemIds: ['Option1', 'Option2'],
      itemLabels: ['Label 1', 'Label 2']
    };

    pulsar._send.mockResolvedValue(expected);

    const result = await pulsar.getUnfilteredPicklist('Account', 'Type');

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getUnfilteredPicklist',
      object: 'Account',
      fieldName: 'Type',
      data: {}
    });

    expect(result).toBe(expected);
  });

  it('sends correct payload with recordTypeId', async () => {
    const expected = {
      itemIds: ['a', 'b'],
      itemLabels: ['A', 'B']
    };

    pulsar._send.mockResolvedValue(expected);

    const result = await pulsar.getUnfilteredPicklist('Contact', 'Status', '012345');

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getUnfilteredPicklist',
      object: 'Contact',
      fieldName: 'Status',
      data: { RecordTypeId: '012345' }
    });

    expect(result).toBe(expected);
  });

  it('throws if objectName is missing', async () => {
    await expect(() =>
      pulsar.getUnfilteredPicklist(null, 'Type')
    ).rejects.toThrow('getUnfilteredPicklist requires a valid objectName string.');
  });

  it('throws if objectName is not a string', async () => {
    await expect(() =>
      pulsar.getUnfilteredPicklist({ bad: true }, 'Type')
    ).rejects.toThrow('getUnfilteredPicklist requires a valid objectName string.');
  });

  it('throws if fieldName is missing', async () => {
    await expect(() =>
      pulsar.getUnfilteredPicklist('Account')
    ).rejects.toThrow('getUnfilteredPicklist requires a valid fieldName string.');
  });

  it('throws if fieldName is not a string', async () => {
    await expect(() =>
      pulsar.getUnfilteredPicklist('Account', 123)
    ).rejects.toThrow('getUnfilteredPicklist requires a valid fieldName string.');
  });
});
