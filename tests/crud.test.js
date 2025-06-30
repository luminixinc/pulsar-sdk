import { Pulsar } from '../src/pulsar.js';
import { beforeEach, expect, jest } from '@jest/globals';

describe('pulsar.create', () => {
  let pulsar;
  let mockSend;

  beforeEach(() => {
    mockSend = jest.fn();
    pulsar = new Pulsar();
    pulsar.bridge = { send: mockSend };
    pulsar.isInitialized = true; // simulate post-init state
  });

  test('sends a create request and resolves with response data', async () => {
    const mockResponse = {
      type: 'createResponse',
      data: { Id: '001ABC', Name: 'Test Account' }
    };

    mockSend.mockImplementation((req, cb) => cb(mockResponse));

    const result = await pulsar.create('Account', { Name: 'Test Account' });

    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      type: 'create',
      object: 'Account',
      data: { Name: 'Test Account' }
    }), expect.any(Function));

    expect(result).toEqual({ Id: '001ABC', Name: 'Test Account' });
  });

  test('sends a create request even when no fields are included', async () => {
    const mockResponse = {
      type: 'createResponse',
      data: { Id: '001ABC', }
    };

    mockSend.mockImplementation((req, cb) => cb(mockResponse));

    const result = await pulsar.create('Account');

    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      type: 'create',
      object: 'Account',
      data: { }
    }), expect.any(Function));

    expect(result).toEqual({ Id: '001ABC' });
  });

  test('rejects if Pulsar bridge returns an error', async () => {
    mockSend.mockImplementation((req, cb) => {
      cb({ type: 'error', data: 'Something went wrong' });
    });

    await expect(pulsar.create('Account', { Name: 'Bad' }))
      .rejects
      .toThrow('Something went wrong');
  });

  test('rejects if bridge is not initialized', async () => {
    pulsar = new Pulsar(); // new instance with no init
    await expect(pulsar.create('Account', { Name: 'Test' }))
      .rejects
      .toThrow('Pulsar bridge not initialized');
  });

  test('passes args when provided', async () => {
    const mockResponse = {
      type: 'createResponse',
      data: { Id: '001XYZ', Name: 'Arg Test' }
    };

    mockSend.mockImplementation((req, cb) => cb(mockResponse));

    const args = { allowEditOnFailure: "FALSE" };

    await pulsar.create('Account', { Name: 'Arg Test' }, args);

    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      args: { allowEditOnFailure: "FALSE" }
    }), expect.any(Function));
  });

  test('includes an empty object for args when not provided', async () => {
    const mockResponse = {
      type: 'createResponse',
      data: { Id: '001XYZ', Name: 'No Args' }
    };

    mockSend.mockImplementation((req, cb) => cb(mockResponse));

    await pulsar.create('Account', { Name: 'No Args' });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ args: {} }),
      expect.any(Function)
    );
  });

});

describe('pulsar.read', () => {
  let pulsar;
  let mockSend;

  beforeEach(() => {
    mockSend = jest.fn();
    pulsar = new Pulsar();
    pulsar.bridge = { send: mockSend };
    pulsar.isInitialized = true;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('sends a read request and resolves with response data', async () => {
    const mockResponse = {
      type: 'readResponse',
      data: [
        { Id: '001ABC', Name: 'Acme' },
        { Id: '001DEF', Name: 'Beta' }
      ]
    };

    mockSend.mockImplementation((req, cb) => cb(mockResponse));

    const result = await pulsar.read('Account', { Industry: 'Technology' });

    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      type: 'read',
      object: 'Account',
      data: { Industry: 'Technology' }
    }), expect.any(Function));

    expect(result).toHaveLength(2);
    expect(result[0].Name).toBe('Acme');
  });

  test('rejects if Pulsar bridge returns an error', async () => {
    mockSend.mockImplementation((req, cb) => {
      cb({ type: 'error', data: 'Read failed' });
    });

    await expect(pulsar.read('Account', { Name: 'ErrorTest' }))
      .rejects
      .toThrow('Read failed');
  });

  test('rejects if bridge is not initialized', async () => {
    pulsar = new Pulsar(); // no init
    await expect(pulsar.read('Account', { Name: 'NoBridge' }))
      .rejects
      .toThrow('Pulsar bridge not initialized');
  });

  test('sends an empty filter when no data is passed', async () => {
    const mockResponse = {
      type: 'readResponse',
      data: []
    };

    mockSend.mockImplementation((req, cb) => cb(mockResponse));

    await pulsar.read('Account');

    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      type: 'read',
      object: 'Account',
      data: {}
    }), expect.any(Function));
  });
});

describe('pulsar.update', () => {
  let pulsar;
  let mockSend;

  beforeEach(() => {
    mockSend = jest.fn();
    pulsar = new Pulsar();
    pulsar.bridge = { send: mockSend };
    pulsar.isInitialized = true;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('sends an update request and resolves with response data', async () => {
    const mockResponse = {
      type: 'updateResponse',
      data: { Id: '001XYZ', Name: 'Updated Name' }
    };

    mockSend.mockImplementation((req, cb) => cb(mockResponse));

    const result = await pulsar.update('Account', { Id: '001XYZ', Name: 'Updated Name' });

    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      type: 'update',
      object: 'Account',
      data: { Id: '001XYZ', Name: 'Updated Name' }
    }), expect.any(Function));

    expect(result.Id).toBe('001XYZ');
  });

  test('rejects if Id field is missing', async () => {
    await expect(pulsar.update('Account', { Name: 'Missing ID' }))
      .rejects
      .toThrow("Update requires 'Id' field.");
  });

  test('rejects if Pulsar bridge returns an error', async () => {
    mockSend.mockImplementation((req, cb) => {
      cb({ type: 'error', data: 'Update failed' });
    });

    await expect(pulsar.update('Account', { Id: '001XYZ', Name: 'Bad Update' }))
      .rejects
      .toThrow('Update failed');
  });

  test('rejects if bridge is not initialized', async () => {
    pulsar = new Pulsar(); // not initialized
    await expect(pulsar.update('Account', { Id: '001XYZ' }))
      .rejects
      .toThrow('Pulsar bridge not initialized');
  });
});

describe('pulsar.delete', () => {
  let pulsar;
  let mockSend;

  beforeEach(() => {
    mockSend = jest.fn();
    pulsar = new Pulsar();
    pulsar.bridge = { send: mockSend };
    pulsar.isInitialized = true;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('sends a delete request and resolves with response data', async () => {
    const mockResponse = {
      type: 'deleteResponse',
      data: { success: true }
    };

    mockSend.mockImplementation((req, cb) => cb(mockResponse));

    const result = await pulsar.delete('Account', '001DELETE');

    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      type: 'delete',
      object: 'Account',
      data: { Id: '001DELETE' }
    }), expect.any(Function));

    expect(result.success).toBe(true);
  });

  test('rejects if no Id is provided', async () => {
    await expect(pulsar.delete('Account'))
      .rejects
      .toThrow("Delete requires an 'id' value.");
  });

  test('rejects if Pulsar bridge returns an error', async () => {
    mockSend.mockImplementation((req, cb) => {
      cb({ type: 'error', data: 'Delete failed' });
    });

    await expect(pulsar.delete('Account', '001XYZ'))
      .rejects
      .toThrow('Delete failed');
  });

  test('rejects if bridge is not initialized', async () => {
    pulsar = new Pulsar(); // uninitialized
    await expect(pulsar.delete('Account', '001XYZ'))
      .rejects
      .toThrow('Pulsar bridge not initialized');
  });
});
