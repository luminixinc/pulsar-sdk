import { Pulsar } from '../src/pulsar.js';
import {
  beforeEach,
  describe,
  expect,
  it,
  jest
} from '@jest/globals';

describe('Pulsar.getSearchLayoutFields', () => {
  let pulsar;
  let mockSend;

  beforeEach(() => {
    mockSend = jest.fn();

    pulsar = new Pulsar();
    pulsar.bridge = {
      send: mockSend
    };

    pulsar.isInitialized = true;
  });

  it('should send the correct getSearchLayoutFields request', async () => {
    const mockFields = [
      {
        label: 'Account Name',
        targetObject: 'Account',
        name: 'Name',
        field: 'Name'
      }
    ];

    mockSend.mockImplementation((request, callback) => {
      callback({
        type: 'searchLayoutFieldsResponse',
        object: 'Account',
        data: {
          searchLayoutFields: mockFields
        }
      });
    });

    await pulsar.getSearchLayoutFields('Account');

    expect(mockSend).toHaveBeenCalledWith(
      {
        type: 'getSearchLayoutFields',
        object: 'Account'
      },
      expect.any(Function)
    );
  });

  it('should return the searchLayoutFields array directly', async () => {
    const mockFields = [
      {
        label: 'Account Name',
        targetObject: 'Account',
        name: 'Name',
        field: 'Name'
      },
      {
        label: 'Phone',
        targetObject: 'Account',
        name: 'Phone',
        field: 'Phone'
      }
    ];

    mockSend.mockImplementation((_request, callback) => {
      callback({
        type: 'searchLayoutFieldsResponse',
        object: 'Account',
        data: {
          searchLayoutFields: mockFields
        }
      });
    });

    const result =
      await pulsar.getSearchLayoutFields('Account');

    expect(result).toBe(mockFields);

    expect(result).toEqual([
      {
        label: 'Account Name',
        targetObject: 'Account',
        name: 'Name',
        field: 'Name'
      },
      {
        label: 'Phone',
        targetObject: 'Account',
        name: 'Phone',
        field: 'Phone'
      }
    ]);
  });

  it('should preserve the order of search layout fields', async () => {
    const mockFields = [
      {
        label: 'Account Name',
        targetObject: 'Account',
        name: 'Name',
        field: 'Name'
      },
      {
        label: 'Phone',
        targetObject: 'Account',
        name: 'Phone',
        field: 'Phone'
      },
      {
        label: 'Industry',
        targetObject: 'Account',
        name: 'Industry',
        field: 'Industry'
      }
    ];

    mockSend.mockImplementation((_request, callback) => {
      callback({
        type: 'searchLayoutFieldsResponse',
        object: 'Account',
        data: {
          searchLayoutFields: mockFields
        }
      });
    });

    const result =
      await pulsar.getSearchLayoutFields('Account');

    expect(result.map(field => field.field)).toEqual([
      'Name',
      'Phone',
      'Industry'
    ]);
  });

  it('should return an empty array when searchLayoutFields is missing', async () => {
    mockSend.mockImplementation((_request, callback) => {
      callback({
        type: 'searchLayoutFieldsResponse',
        object: 'Account',
        data: {}
      });
    });

    const result =
      await pulsar.getSearchLayoutFields('Account');

    expect(result).toEqual([]);
  });

  it('should return an empty array when response data is null', async () => {
    mockSend.mockImplementation((_request, callback) => {
      callback({
        type: 'searchLayoutFieldsResponse',
        object: 'Account',
        data: null
      });
    });

    const result =
      await pulsar.getSearchLayoutFields('Account');

    expect(result).toEqual([]);
  });

  it.each([
    undefined,
    null,
    '',
    123,
    {},
    []
  ])(
    'should throw for invalid objectName: %p',
    async objectName => {
      await expect(
        pulsar.getSearchLayoutFields(objectName)
      ).rejects.toThrow(
        'getSearchLayoutFields requires a valid objectName string.'
      );

      expect(mockSend).not.toHaveBeenCalled();
    }
  );

  it('should throw if bridge is not initialized', async () => {
    pulsar.bridge = null;

    await expect(
      pulsar.getSearchLayoutFields('Account')
    ).rejects.toThrow(
      'Pulsar bridge not initialized. Call init() first.'
    );
  });

  it('should propagate an error returned by Pulsar', async () => {
    mockSend.mockImplementation((_request, callback) => {
      callback({
        type: 'error',
        data: 'Unable to retrieve search layout fields'
      });
    });

    await expect(
      pulsar.getSearchLayoutFields('Account')
    ).rejects.toThrow(
      'Unable to retrieve search layout fields'
    );
  });

  it('should use the default error message when Pulsar returns an error without data', async () => {
    mockSend.mockImplementation((_request, callback) => {
      callback({
        type: 'error'
      });
    });

    await expect(
      pulsar.getSearchLayoutFields('Account')
    ).rejects.toThrow(
      'Unknown Pulsar JSAPI error'
    );
  });
});