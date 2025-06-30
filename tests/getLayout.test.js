import { Pulsar } from '../src/pulsar.js';
import { beforeEach, expect, jest } from '@jest/globals';

describe('getLayout', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar._send = jest.fn();
  });

  it('sends correct request with RecordTypeId only', async () => {
    const mockLayout = { layoutSections: [], layoutMode: 'display' };
    pulsar._send.mockResolvedValue(mockLayout);

    const result = await pulsar.getLayout('Account', '012ABC');

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getLayout',
      object: 'Account',
      data: {
        RecordTypeId: '012ABC'
      }
    });
    expect(result).toEqual(mockLayout);
  });

  it('sends correct request with RecordTypeName only', async () => {
    const mockLayout = { layoutSections: [{ heading: 'Info' }] };
    pulsar._send.mockResolvedValue(mockLayout);

    const result = await pulsar.getLayout('Contact', null, 'Business_Contact');

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getLayout',
      object: 'Contact',
      data: {
        RecordTypeName: 'Business_Contact'
      }
    });
    expect(result).toEqual(mockLayout);
  });

  it('prefers RecordTypeId over RecordTypeName if both are provided', async () => {
    const mockLayout = { layoutSections: [], layoutMode: 'edit' };
    pulsar._send.mockResolvedValue(mockLayout);

    const result = await pulsar.getLayout('Lead', '012DEF', 'Retail_Lead');

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getLayout',
      object: 'Lead',
      data: {
        RecordTypeId: '012DEF'
      }
    });
    expect(result).toEqual(mockLayout);
  });

  it('handles legacy JSON string response (Pulsar < 12.0)', async () => {
    const legacyResponse = JSON.stringify({ layoutSections: ['legacy'] });
    pulsar._send.mockResolvedValue(legacyResponse);

    const result = await pulsar.getLayout('Opportunity');

    expect(result).toEqual({ layoutSections: ['legacy'] });
  });

  it('throws an error when legacy JSON string response is malformed', async () => {
    pulsar._send.mockResolvedValue('INVALID_JSON');

    await expect(pulsar.getLayout('Case')).rejects.toThrow('Failed to parse layout response');
  });

  it('throws an error if response is neither object nor string', async () => {
    pulsar._send.mockResolvedValue(42);

    await expect(pulsar.getLayout('WorkOrder')).rejects.toThrow(
      'Unexpected return type. Expected JSON object or string, but received number.'
    );
  });

  it('throws an error if response is null', async () => {
    pulsar._send.mockResolvedValue(null);

    await expect(pulsar.getLayout('Asset')).rejects.toThrow(
      'Unexpected return type. Expected JSON object or string, but received object.'
    );
  });

  it('handles missing optional recordTypeId and recordTypeName', async () => {
    const mockLayout = { layoutSections: ['default'] };
    pulsar._send.mockResolvedValue(mockLayout);

    const result = await pulsar.getLayout('Product2');

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getLayout',
      object: 'Product2',
      data: {}
    });
    expect(result).toEqual(mockLayout);
  });
});



describe('getLayoutSections', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar._send = jest.fn();
  });

  it('sends correct request with recordTypeId and layoutMode', async () => {
    const mockResult = [{ heading: 'Info', display: 'TRUE', section: '1' }];
    pulsar._send.mockResolvedValue(mockResult);

    const result = await pulsar.getLayoutSections('Account', '012XYZ', null, 'edit');

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getLayoutSections',
      object: 'Account',
      data: {
        RecordTypeId: '012XYZ',
        LayoutMode: 'edit',
      },
    });
    expect(result).toEqual(mockResult);
  });

  it('sends correct request with recordTypeName only', async () => {
    const mockResult = [{ heading: 'Details', display: 'TRUE', section: '2' }];
    pulsar._send.mockResolvedValue(mockResult);

    const result = await pulsar.getLayoutSections('Contact', null, 'Person_Contact');

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getLayoutSections',
      object: 'Contact',
      data: {
        RecordTypeName: 'Person_Contact',
        LayoutMode: 'display',
      },
    });
    expect(result).toEqual(mockResult);
  });

  it('defaults layoutMode to "display" if not specified', async () => {
    const mockResult = [{ heading: 'General', display: 'TRUE', section: '3' }];
    pulsar._send.mockResolvedValue(mockResult);

    const result = await pulsar.getLayoutSections('Lead', '012AAA');

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getLayoutSections',
      object: 'Lead',
      data: {
        RecordTypeId: '012AAA',
        LayoutMode: 'display',
      },
    });
    expect(result).toEqual(mockResult);
  });

  it('throws an error if objectName is missing or not a string', async () => {
    await expect(pulsar.getLayoutSections(null)).rejects.toThrow(
      'getLayoutSections requires a valid objectName string.'
    );

    await expect(pulsar.getLayoutSections(123)).rejects.toThrow(
      'getLayoutSections requires a valid objectName string.'
    );
  });

  it('parses legacy string response as JSON', async () => {
    const mockLegacy = JSON.stringify([{ heading: 'Legacy', display: 'TRUE', section: '0' }]);
    pulsar._send.mockResolvedValue(mockLegacy);

    const result = await pulsar.getLayoutSections('Case');
    expect(result).toEqual([{ heading: 'Legacy', display: 'TRUE', section: '0' }]);
  });

  it('throws if legacy string response is not valid JSON', async () => {
    pulsar._send.mockResolvedValue('INVALID_JSON');

    await expect(pulsar.getLayoutSections('Case')).rejects.toThrow(
      'Failed to parse layout sections response'
    );
  });

  it('throws if response is not an array or JSON string', async () => {
    pulsar._send.mockResolvedValue({ unexpected: true });

    await expect(pulsar.getLayoutSections('Opportunity')).rejects.toThrow(
      'Unexpected return type from getLayoutSections. Expected array or JSON string, but received object.'
    );
  });
});

describe('getLayoutFields', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar._send = jest.fn();
  });

  it('throws if objectName is not a string', async () => {
    await expect(pulsar.getLayoutFields(null)).rejects.toThrow('getLayoutFields requires a valid objectName string.');
    await expect(pulsar.getLayoutFields(123)).rejects.toThrow('getLayoutFields requires a valid objectName string.');
  });

  it('sends correct payload with recordTypeId only', async () => {
    const mockResponse = [{ field: 'Name' }];
    pulsar._send.mockResolvedValue(mockResponse);

    const result = await pulsar.getLayoutFields('Account', '012345', undefined, 'edit');

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getLayoutFields',
      object: 'Account',
      data: {
        RecordTypeId: '012345',
        LayoutMode: 'edit',
      }
    });
    expect(result).toEqual(mockResponse);
  });

  it('sends correct payload with recordTypeName (takes precedence over recordTypeId)', async () => {
    const mockResponse = [{ field: 'Email' }];
    pulsar._send.mockResolvedValue(mockResponse);

    const result = await pulsar.getLayoutFields('Contact', '012345', 'Support', 'edit');

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getLayoutFields',
      object: 'Contact',
      data: {
        RecordTypeName: 'Support',
        LayoutMode: 'edit',
      }
    });
    expect(result).toEqual(mockResponse);
  });

  it('defaults to layoutMode "display" if not specified', async () => {
    const mockResponse = [{ field: 'Phone' }];
    pulsar._send.mockResolvedValue(mockResponse);

    const result = await pulsar.getLayoutFields('Lead', undefined, 'Retail');

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getLayoutFields',
      object: 'Lead',
      data: {
        RecordTypeName: 'Retail',
        LayoutMode: 'display',
      }
    });
    expect(result).toEqual(mockResponse);
  });

  it('parses JSON string response from older Pulsar versions', async () => {
    const jsonString = JSON.stringify([{ field: 'Website' }]);
    pulsar._send.mockResolvedValue(jsonString);

    const result = await pulsar.getLayoutFields('Account', '012345');
    expect(result).toEqual([{ field: 'Website' }]);
  });

  it('throws if response is malformed JSON string', async () => {
    pulsar._send.mockResolvedValue('[{ field: invalid json }]');

    await expect(pulsar.getLayoutFields('Account', '012345')).rejects.toThrow('Failed to parse layout fields response');
  });

  it('throws if response is an unexpected type', async () => {
    pulsar._send.mockResolvedValue(12345);
    await expect(pulsar.getLayoutFields('Account', '012345')).rejects.toThrow(
      'Unexpected return type from getLayoutFields. Expected array or JSON string, but received number.'
    );
  });
});
