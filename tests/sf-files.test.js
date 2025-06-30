import { Pulsar } from '../src/pulsar';
import { beforeEach, expect, jest } from '@jest/globals';

describe('Pulsar readSFFile', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn()
    };
  });

  it('should send correct request with all parameters', async () => {
    const mockResponse = [{ FileURL: 'file://example', VersionData: 'data' }];
    pulsar.bridge.send.mockImplementation((req, cb) => {
      expect(req).toEqual({
        type: 'readSFFile',
        data: {
          Id: '069ABC',
          ReturnBase64Data: true,
          DownloadVersionData: false
        }
      });
      cb({ type: 'response', data: mockResponse });
    });

    const result = await pulsar.readSFFile('069ABC', true, false);
    expect(result).toBe(mockResponse);
  });

  it('should send request with default parameter values', async () => {
    const mockResponse = [{ FileURL: 'file://default' }];
    pulsar.bridge.send.mockImplementation((_req, cb) => {
      cb({ type: 'response', data: mockResponse });
    });

    const result = await pulsar.readSFFile('069XYZ');
    expect(result).toBe(mockResponse);
  });

  it('should throw if bridge is not initialized', async () => {
    pulsar.bridge = null;
    await expect(pulsar.readSFFile('069ABC'))
      .rejects
      .toThrow('Pulsar bridge not initialized. Call init() first.');
  });

  it('should throw if fileId is not a string', async () => {
    await expect(pulsar.readSFFile())
      .rejects
      .toThrow('readSFFile requires a valid fileId string.');

    await expect(pulsar.readSFFile(123))
      .rejects
      .toThrow('readSFFile requires a valid fileId string.');
  });

  it('should throw if bridge returns type error', async () => {
    pulsar.bridge.send.mockImplementation((_req, cb) => {
      cb({ type: 'error', data: 'Bridge error' });
    });

    await expect(pulsar.readSFFile('069BAD'))
      .rejects
      .toThrow('Bridge error');
  });

  it('should resolve to response data if bridge returns successful response', async () => {
    const mockResponse = [{ FileURL: 'file://goodfile' }];
    pulsar.bridge.send.mockImplementation((_req, cb) => {
      cb({ type: 'response', data: mockResponse });
    });

    const result = await pulsar.readSFFile('069GOOD');
    expect(result).toEqual(mockResponse);
  });
});


describe('Pulsar queryContent', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn()
    };
  });

  it('should throw if bridge is not initialized', async () => {
    pulsar.bridge = null;
    await expect(pulsar.queryContent("ContentDocumentId = '123'"))
      .rejects.toThrow('Pulsar bridge not initialized. Call init() first.');
  });

  it('should throw if filter is not a string', async () => {
    await expect(pulsar.queryContent(null))
      .rejects.toThrow('queryContent requires a valid SQLite filter string.');

    await expect(pulsar.queryContent(12345))
      .rejects.toThrow('queryContent requires a valid SQLite filter string.');
  });

  it('should send correct request with default downloadVersionData', async () => {
    const mockResponse = [{ FileURL: 'file://local/path/file1.jpg' }];
    pulsar.bridge.send.mockImplementation((req, cb) => {
      cb({ type: 'response', data: mockResponse });
    });

    const result = await pulsar.queryContent("ContentDocumentId = '123'");
    expect(pulsar.bridge.send).toHaveBeenCalledWith({
      type: 'queryContent',
      data: {
        filter: "ContentDocumentId = '123'",
        DownloadVersionData: true
      }
    }, expect.any(Function));

    expect(result).toEqual(mockResponse);
  });

  it('should send correct request with custom downloadVersionData', async () => {
    const mockResponse = [{ FileURL: 'file://local/path/file2.jpg' }];
    pulsar.bridge.send.mockImplementation((req, cb) => {
      cb({ type: 'response', data: mockResponse });
    });

    const result = await pulsar.queryContent("ContentDocumentId = '123'", false);
    expect(pulsar.bridge.send).toHaveBeenCalledWith({
      type: 'queryContent',
      data: {
        filter: "ContentDocumentId = '123'",
        DownloadVersionData: false
      }
    }, expect.any(Function));

    expect(result).toEqual(mockResponse);
  });

  it('should reject if response is an error', async () => {
    pulsar.bridge.send.mockImplementation((req, cb) => {
      cb({ type: 'error', data: 'some error' });
    });

    await expect(pulsar.queryContent("ContentDocumentId = '123'"))
      .rejects.toThrow('some error');
  });

  it('should reject with default error if error response has no message', async () => {
    pulsar.bridge.send.mockImplementation((req, cb) => {
      cb({ type: 'error' });
    });

    await expect(pulsar.queryContent("ContentDocumentId = '123'"))
      .rejects.toThrow('Unknown Pulsar JSAPI error');
  });
});


describe('Pulsar createSFFileFromCamera', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn()
    };
  });

  it('should throw if bridge is not initialized', async () => {
    pulsar.bridge = null;
    await expect(pulsar.createSFFileFromCamera('001abc'))
      .rejects.toThrow('Pulsar bridge not initialized. Call init() first.');
  });

  it('should throw if parentId is missing or not a string', async () => {
    await expect(pulsar.createSFFileFromCamera())
      .rejects.toThrow('createSFFileFromCamera requires a valid parentId string.');

    await expect(pulsar.createSFFileFromCamera(123))
      .rejects.toThrow('createSFFileFromCamera requires a valid parentId string.');
  });

  it('should send minimal request with only parentId', async () => {
    pulsar.bridge.send.mockImplementation((req, cb) => {
      cb({ type: 'response', data: '069abc123' });
    });

    const result = await pulsar.createSFFileFromCamera('001abc');
    expect(pulsar.bridge.send).toHaveBeenCalledWith({
      type: 'createSFFileFromCamera',
      data: {
        ParentId: '001abc'
      }
    }, expect.any(Function));

    expect(result).toBe('069abc123');
  });

  it('should include name and networkId if provided', async () => {
    pulsar.bridge.send.mockImplementation((req, cb) => {
      cb({ type: 'response', data: '069xyz456' });
    });

    const result = await pulsar.createSFFileFromCamera('001xyz', {
      name: 'MyPhoto.jpg',
      networkId: '0DBabc'
    });

    expect(pulsar.bridge.send).toHaveBeenCalledWith({
      type: 'createSFFileFromCamera',
      data: {
        ParentId: '001xyz',
        Name: 'MyPhoto.jpg',
        NetworkId: '0DBabc'
      }
    }, expect.any(Function));

    expect(result).toBe('069xyz456');
  });

  it('should include custom fields if provided', async () => {
    pulsar.bridge.send.mockImplementation((req, cb) => {
      cb({ type: 'response', data: '069custom789' });
    });

    const result = await pulsar.createSFFileFromCamera('001custom', {
      name: 'Image.png',
      networkId: '0DBxyz',
      MyCustomField__c: 'SomeValue',
      Another_Field__c: 'AnotherValue'
    });

    expect(pulsar.bridge.send).toHaveBeenCalledWith({
      type: 'createSFFileFromCamera',
      data: {
        ParentId: '001custom',
        Name: 'Image.png',
        NetworkId: '0DBxyz',
        MyCustomField__c: 'SomeValue',
        Another_Field__c: 'AnotherValue'
      }
    }, expect.any(Function));

    expect(result).toBe('069custom789');
  });

  it('should reject if bridge returns error type with message', async () => {
    pulsar.bridge.send.mockImplementation((req, cb) => {
      cb({ type: 'error', data: 'File creation failed' });
    });

    await expect(pulsar.createSFFileFromCamera('001error'))
      .rejects.toThrow('File creation failed');
  });

  it('should reject if bridge returns error type without message', async () => {
    pulsar.bridge.send.mockImplementation((req, cb) => {
      cb({ type: 'error' });
    });

    await expect(pulsar.createSFFileFromCamera('001unknown'))
      .rejects.toThrow('Unknown Pulsar JSAPI error');
  });
});


describe('Pulsar deleteSFFile', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn()
    };
  });

  it('should throw if bridge is not initialized', async () => {
    pulsar.bridge = null;
    await expect(pulsar.deleteSFFile(['069abc']))
      .rejects.toThrow('Pulsar bridge not initialized. Call init() first.');
  });

  it('should throw if documentIdList is not an array', async () => {
    await expect(pulsar.deleteSFFile(null))
      .rejects.toThrow('deleteSFFile requires an array of valid ContentDocument Id strings.');

    await expect(pulsar.deleteSFFile('069abc'))
      .rejects.toThrow('deleteSFFile requires an array of valid ContentDocument Id strings.');
  });

  it('should throw if documentIdList is empty', async () => {
    await expect(pulsar.deleteSFFile([]))
      .rejects.toThrow('deleteSFFile requires an array of valid ContentDocument Id strings.');
  });

  it('should throw if documentIdList contains non-strings', async () => {
    await expect(pulsar.deleteSFFile(['069abc', 123]))
      .rejects.toThrow('deleteSFFile requires an array of valid ContentDocument Id strings.');
  });

  it('should resolve true if response is success: true', async () => {
    pulsar.bridge.send.mockImplementation((req, cb) => {
      cb({ type: 'response', data: { success: true } });
    });

    const result = await pulsar.deleteSFFile(['069abc']);
    expect(pulsar.bridge.send).toHaveBeenCalledWith({
      type: 'deleteSFFile',
      data: { documentIdList: ['069abc'] }
    }, expect.any(Function));
    expect(result).toBe(true);
  });

  it('should resolve true if response is "success" string', async () => {
    pulsar.bridge.send.mockImplementation((req, cb) => {
      cb({ type: 'response', data: 'success' });
    });

    const result = await pulsar.deleteSFFile(['069abc']);
    expect(result).toBe(true);
  });

  it('should reject if bridge returns an error type', async () => {
    pulsar.bridge.send.mockImplementation((req, cb) => {
      cb({ type: 'error', data: 'deletion failed' });
    });

    await expect(pulsar.deleteSFFile(['069abc']))
      .rejects.toThrow('deletion failed');
  });

  it('should reject if response is unexpected', async () => {
    pulsar.bridge.send.mockImplementation((req, cb) => {
      cb({ type: 'response', data: { unexpected: 'value' } });
    });

    await expect(pulsar.deleteSFFile(['069abc']))
      .rejects.toThrow('Unexpected response from deleteSFFile.');
  });
});

describe('createSFFile', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn((request, callback) => {
        callback({ type: 'createSFFileResponse', data: '069ABC123456789' });
      })
    };
  });

  it('should create a Salesforce File with required fields only', async () => {
    const result = await pulsar.createSFFile('001ABC', 'test.pdf', 'base64data');
    expect(result).toBe('069ABC123456789');
    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'createSFFile',
        data: {
          ParentId: '001ABC',
          Name: 'test.pdf',
          Body: 'base64data'
        }
      }),
      expect.any(Function)
    );
  });

  it('should include optional fields if provided', async () => {
    await pulsar.createSFFile('001ABC', 'test.pdf', 'base64data', {
      contentType: 'application/pdf',
      networkId: '0DBABC',
      Custom_Field__c: 'value'
    });

    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ContentType: 'application/pdf',
          NetworkId: '0DBABC',
          Custom_Field__c: 'value'
        })
      }),
      expect.any(Function)
    );
  });

  it('should throw if bridge is not initialized', async () => {
    pulsar.bridge = null;
    await expect(
      pulsar.createSFFile('001ABC', 'test.pdf', 'base64data')
    ).rejects.toThrow('Pulsar bridge not initialized. Call init() first.');
  });

  it('should throw if parentId is missing or invalid', async () => {
    await expect(pulsar.createSFFile(null, 'file', 'data')).rejects.toThrow(
      'createSFFile requires a valid parentId string.'
    );
    await expect(pulsar.createSFFile(123, 'file', 'data')).rejects.toThrow(
      'createSFFile requires a valid parentId string.'
    );
  });

  it('should throw if name is missing or invalid', async () => {
    await expect(pulsar.createSFFile('001ABC', null, 'data')).rejects.toThrow(
      'createSFFile requires a valid file name string.'
    );
    await expect(pulsar.createSFFile('001ABC', 123, 'data')).rejects.toThrow(
      'createSFFile requires a valid file name string.'
    );
  });

  it('should throw if body is missing or invalid', async () => {
    await expect(pulsar.createSFFile('001ABC', 'name', null)).rejects.toThrow(
      'createSFFile requires a valid base64-encoded body string.'
    );
    await expect(pulsar.createSFFile('001ABC', 'name', {})).rejects.toThrow(
      'createSFFile requires a valid base64-encoded body string.'
    );
  });

  it('should throw if bridge returns an error response', async () => {
    pulsar.bridge.send = jest.fn((request, callback) => {
      callback({ type: 'error', data: 'Failed to create file' });
    });

    await expect(
      pulsar.createSFFile('001ABC', 'test.pdf', 'base64data')
    ).rejects.toThrow('Failed to create file');
  });

  it('should throw generic error if error type has no data', async () => {
    pulsar.bridge.send = jest.fn((request, callback) => {
      callback({ type: 'error' });
    });

    await expect(
      pulsar.createSFFile('001ABC', 'test.pdf', 'base64data')
    ).rejects.toThrow('Unknown Pulsar JSAPI error');
  });
});


describe('createSFFileFromFilePath', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn((request, callback) => {
        callback({
          type: 'createSFFileFromFilePathResponse',
          data: {
            AttachmentId: '00P123',
            ContentDocumentId: '069ABC',
            ContentVersionId: '068XYZ',
            FileURL: '/local/path/to/file.pdf'
          }
        });
      })
    };
  });

  it('should create a Salesforce File from file path with required fields only', async () => {
    const result = await pulsar.createSFFileFromFilePath('001ABC', '/path/to/file.pdf');

    expect(result).toEqual({
      AttachmentId: '00P123',
      ContentDocumentId: '069ABC',
      ContentVersionId: '068XYZ',
      FileURL: '/local/path/to/file.pdf'
    });

    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'createSFFileFromFilePath',
        data: {
          ParentId: '001ABC',
          FilePath: '/path/to/file.pdf'
        }
      }),
      expect.any(Function)
    );
  });

  it('should include optional fields if provided', async () => {
    await pulsar.createSFFileFromFilePath('001ABC', '/path/to/file.pdf', {
      name: 'CustomName.pdf',
      contentType: 'application/pdf',
      networkId: '0DBNET',
      Custom_Field__c: 'value'
    });

    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          Name: 'CustomName.pdf',
          ContentType: 'application/pdf',
          NetworkId: '0DBNET',
          Custom_Field__c: 'value'
        })
      }),
      expect.any(Function)
    );
  });

  it('should throw if bridge is not initialized', async () => {
    pulsar.bridge = null;
    await expect(
      pulsar.createSFFileFromFilePath('001ABC', '/path/to/file.pdf')
    ).rejects.toThrow('Pulsar bridge not initialized. Call init() first.');
  });

  it('should throw if parentId is missing or invalid', async () => {
    await expect(pulsar.createSFFileFromFilePath(null, '/file')).rejects.toThrow(
      'createSFFileFromFilePath requires a valid parentId string.'
    );
    await expect(pulsar.createSFFileFromFilePath(123, '/file')).rejects.toThrow(
      'createSFFileFromFilePath requires a valid parentId string.'
    );
  });

  it('should throw if filePath is missing or invalid', async () => {
    await expect(pulsar.createSFFileFromFilePath('001ABC', null)).rejects.toThrow(
      'createSFFileFromFilePath requires a valid filePath string.'
    );
    await expect(pulsar.createSFFileFromFilePath('001ABC', {})).rejects.toThrow(
      'createSFFileFromFilePath requires a valid filePath string.'
    );
  });

  it('should throw if bridge returns an error', async () => {
    pulsar.bridge.send = jest.fn((request, callback) => {
      callback({ type: 'error', data: 'Upload failed' });
    });

    await expect(
      pulsar.createSFFileFromFilePath('001ABC', '/path/to/file.pdf')
    ).rejects.toThrow('Upload failed');
  });

  it('should throw generic error if error has no data', async () => {
    pulsar.bridge.send = jest.fn((request, callback) => {
      callback({ type: 'error' });
    });

    await expect(
      pulsar.createSFFileFromFilePath('001ABC', '/path/to/file.pdf')
    ).rejects.toThrow('Unknown Pulsar JSAPI error');
  });
});

describe('createSFFileBatch', () => {
  let pulsar;

  beforeEach(async () => {
    pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn()
    };
  });

  it('should throw if bridge is not initialized', async () => {
    const uninitialized = new Pulsar();
    await expect(uninitialized.createSFFileBatch([
      { ParentId: '001', Name: 'Test.jpg', Body: 'dGVzdA==' }
    ])).rejects.toThrow('Pulsar bridge not initialized');
  });

  it('should throw if input is not a non-empty array', async () => {
    await expect(pulsar.createSFFileBatch(null)).rejects.toThrow('createSFFileBatch requires an array of file objects.');
    await expect(pulsar.createSFFileBatch([])).rejects.toThrow('createSFFileBatch requires an array of file objects.');
    await expect(pulsar.createSFFileBatch([123])).rejects.toThrow('createSFFileBatch requires an array of file objects.');
  });

  it('should send createSFFileBatch request and resolve with parsed response', async () => {
    const mockResponse = {
      summary: { success: 'TRUE' },
      results: {
        '0': {
          objectId: '069A0000001',
          success: 'TRUE',
          FileURL: 'http://localhost/file1.jpg'
        },
        '1': {
          objectId: '069A0000002',
          success: 'TRUE',
          FileURL: 'http://localhost/file2.jpg'
        }
      }
    };

    pulsar.bridge.send.mockImplementation((req, cb) => {
      cb({ type: 'createbatchResponse', data: mockResponse });
    });

    const input = [
      { ParentId: '001A', Name: 'File1.jpg', Body: 'base64string1' },
      { ParentId: '001A', Name: 'File2.jpg', Body: 'base64string2' }
    ];

    const result = await pulsar.createSFFileBatch(input);
    expect(result).toEqual(mockResponse);
    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'createSFFileBatch', data: input }),
      expect.any(Function)
    );
  });

  it('should handle partial failures in batch response', async () => {
    const partialResponse = {
      summary: { success: 'FALSE' },
      results: {
        '0': {
          objectId: '069A0000001',
          success: 'TRUE',
          FileURL: 'http://localhost/file1.jpg'
        },
        '1': {
          success: 'FALSE',
          error: 'Invalid ParentId'
        }
      }
    };

    pulsar.bridge.send.mockImplementation((req, cb) => {
      cb({ type: 'createbatchResponse', data: partialResponse });
    });

    const result = await pulsar.createSFFileBatch([
      { ParentId: '001A', Name: 'Good.jpg', Body: 'goodData' },
      { ParentId: '', Name: 'Bad.jpg', Body: 'badData' }
    ]);

    expect(result.summary.success).toBe('FALSE');
    expect(result.results['1'].success).toBe('FALSE');
    expect(result.results['1'].error).toBe('Invalid ParentId');
  });

  it('should reject if the bridge returns an error type', async () => {
    pulsar.bridge.send.mockImplementation((req, cb) => {
      cb({ type: 'error', data: 'Some failure' });
    });

    await expect(pulsar.createSFFileBatch([
      { ParentId: '001', Name: 'Fail.jpg', Body: 'failData' }
    ])).rejects.toThrow('Some failure');
  });
});

describe('createSFFileFromFilePathBatch', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn()
    };
  });

  it('should throw if bridge is not initialized', async () => {
    const uninitialized = new Pulsar();
    await expect(uninitialized.createSFFileFromFilePathBatch([
      { ParentId: '001', FilePath: '/path/to/file.jpg' }
    ])).rejects.toThrow('Pulsar bridge not initialized');
  });

  it('should throw if input is not a non-empty array', async () => {
    await expect(pulsar.createSFFileFromFilePathBatch(null)).rejects.toThrow('createSFFileFromFilePathBatch requires an array of file objects.');
    await expect(pulsar.createSFFileFromFilePathBatch([])).rejects.toThrow('createSFFileFromFilePathBatch requires an array of file objects.');
    await expect(pulsar.createSFFileFromFilePathBatch([123])).rejects.toThrow('createSFFileFromFilePathBatch requires an array of file objects.');
  });

  it('should send createSFFileFromFilePathBatch request and resolve with parsed response', async () => {
    const mockResponse = {
      summary: { success: 'TRUE' },
      results: {
        '0': {
          objectId: '069A0000001',
          success: 'TRUE',
          FileURL: 'http://localhost/file1.jpg'
        },
        '1': {
          objectId: '069A0000002',
          success: 'TRUE',
          FileURL: 'http://localhost/file2.jpg'
        }
      }
    };

    pulsar.bridge.send.mockImplementation((req, cb) => {
      cb({ type: 'createbatchResponse', data: mockResponse });
    });

    const input = [
      { ParentId: '001A', FilePath: '/files/1.jpg' },
      { ParentId: '001A', FilePath: '/files/2.jpg' }
    ];

    const result = await pulsar.createSFFileFromFilePathBatch(input);
    expect(result).toEqual(mockResponse);
    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'createSFFileFromFilePathBatch', data: input }),
      expect.any(Function)
    );
  });

  it('should handle partial failures in batch response', async () => {
    const partialResponse = {
      summary: { success: 'FALSE' },
      results: {
        '0': {
          objectId: '069A0000001',
          success: 'TRUE',
          FileURL: 'http://localhost/file1.jpg'
        },
        '1': {
          success: 'FALSE',
          error: 'File not found'
        }
      }
    };

    pulsar.bridge.send.mockImplementation((req, cb) => {
      cb({ type: 'createbatchResponse', data: partialResponse });
    });

    const result = await pulsar.createSFFileFromFilePathBatch([
      { ParentId: '001A', FilePath: '/valid/file.jpg' },
      { ParentId: '001A', FilePath: '/missing/file.jpg' }
    ]);

    expect(result.summary.success).toBe('FALSE');
    expect(result.results['1'].success).toBe('FALSE');
    expect(result.results['1'].error).toBe('File not found');
  });

  it('should reject if the bridge returns an error type', async () => {
    pulsar.bridge.send.mockImplementation((req, cb) => {
      cb({ type: 'error', data: 'Filesystem inaccessible' });
    });

    await expect(pulsar.createSFFileFromFilePathBatch([
      { ParentId: '001', FilePath: '/fail.jpg' }
    ])).rejects.toThrow('Filesystem inaccessible');
  });
});

describe('deleteBatch', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar.bridge = {}; // mock bridge presence
    pulsar._send = jest.fn();
  });

  it('should throw if objectName is not a string', async () => {
    await expect(pulsar.deleteBatch(null, ['001abc'])).rejects.toThrow(
      'deleteBatch requires a valid objectName string.'
    );
  });

  it('should throw if idList is not an array', async () => {
    await expect(pulsar.deleteBatch('Account', '001abc')).rejects.toThrow(
      'deleteBatch requires a non-empty array of string Ids.'
    );
  });

  it('should throw if idList is empty', async () => {
    await expect(pulsar.deleteBatch('Account', [])).rejects.toThrow(
      'deleteBatch requires a non-empty array of string Ids.'
    );
  });

  it('should throw if idList contains non-string values', async () => {
    await expect(pulsar.deleteBatch('Account', ['001abc', 123])).rejects.toThrow(
      'deleteBatch requires a non-empty array of string Ids.'
    );
  });

  it('should call _send with correct parameters', async () => {
    const idList = ['001abc', '001def'];
    const mockResponse = {
      summary: { success: 'TRUE' },
      results: {
        '001abc': { objectId: '001abc', success: 'TRUE' },
        '001def': { objectId: '001def', success: 'TRUE' }
      }
    };

    pulsar._send.mockResolvedValue(mockResponse);

    const result = await pulsar.deleteBatch('Account', idList);

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'deletebatch',
      object: 'Account',
      data: {
        objectIdList: idList
      }
    });

    expect(result).toEqual(mockResponse);
  });
});

describe('updateQuery', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar.bridge = {}; // Simulate bridge being initialized
    pulsar._send = jest.fn();
  });

  it('should throw if objectName is not a string', async () => {
    await expect(pulsar.updateQuery(null, 'UPDATE Account SET Name = "Test"')).rejects.toThrow(
      'updateQuery requires a valid objectName string.'
    );
  });

  it('should throw if query is not a string', async () => {
    await expect(pulsar.updateQuery('Account', null)).rejects.toThrow(
      'updateQuery requires a valid SQLite query string.'
    );
  });

  it('should call _send with correct parameters', async () => {
    const objectName = 'Account';
    const query = "UPDATE Account SET Status__c = 'Active' WHERE Type = 'Customer'";
    const mockResponse = { data: 'success' };

    pulsar._send.mockResolvedValue(mockResponse);

    const result = await pulsar.updateQuery(objectName, query);

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'updateQuery',
      object: objectName,
      data: {
        query
      }
    });

    expect(result).toEqual(mockResponse);
  });
});
