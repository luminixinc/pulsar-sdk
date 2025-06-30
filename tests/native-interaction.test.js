import { Pulsar } from '../src/pulsar';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

describe('setLeavePageMessage', () => {
  it('should send the correct message', async () => {
    const pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn((req, cb) => cb({ type: 'setLeavePageMessageResponse', data: 'success' }))
    };

    const result = await pulsar.setLeavePageMessage('Are you sure?');
    expect(result).toBe('success');
    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      { type: 'setLeavePageMessage', object: '', data: 'Are you sure?' },
      expect.any(Function)
    );
  });

  it('should send an empty string to disable the message', async () => {
    const pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn((req, cb) => cb({ type: 'setLeavePageMessageResponse', data: 'disabled' }))
    };

    const result = await pulsar.setLeavePageMessage('');
    expect(result).toBe('disabled');
    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      { type: 'setLeavePageMessage', object: '', data: '' },
      expect.any(Function)
    );
  });

  it('should default to empty string when input is undefined', async () => {
    const pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn((req, cb) => cb({ type: 'setLeavePageMessageResponse', data: 'defaulted' }))
    };

    const result = await pulsar.setLeavePageMessage();
    expect(result).toBe('defaulted');
    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      { type: 'setLeavePageMessage', object: '', data: '' },
      expect.any(Function)
    );
  });
});

describe('exit', () => {
  it('should send the correct exit request and return the result', async () => {
    const pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn((req, cb) => cb({ type: 'exitResponse', data: 'closed' }))
    };

    const result = await pulsar.exit();
    expect(result).toBe('closed');
    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      { type: 'exit', data: {} },
      expect.any(Function)
    );
  });
});

describe('showCreate', () => {
  it('should send correct payload with object name and fields', async () => {
    const pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn((req, cb) =>
        cb({
          type: 'showCreateResponse',
          data: { createResult: 'TRUE', createId: '001ABC' }
        })
      )
    };

    const result = await pulsar.showCreate('Account', { Name: 'Test Account' });
    expect(result).toEqual({ createResult: 'TRUE', createId: '001ABC' });

    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      {
        type: 'showCreate',
        object: 'Account',
        data: { Name: 'Test Account' }
      },
      expect.any(Function)
    );
  });

  it('should default to empty fields object if none provided', async () => {
    const pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn((req, cb) =>
        cb({
          type: 'showCreateResponse',
          data: { createResult: 'TRUE', createId: '001XYZ' }
        })
      )
    };

    const result = await pulsar.showCreate('Contact');
    expect(result).toEqual({ createResult: 'TRUE', createId: '001XYZ' });

    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      {
        type: 'showCreate',
        object: 'Contact',
        data: {}
      },
      expect.any(Function)
    );
  });
});

describe('viewObject', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar._send = jest.fn().mockResolvedValue({ success: true });
  });

  it('calls _send with correct parameters (default view mode)', async () => {
    await pulsar.viewObject('Account', '001xx000000123');

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'viewObject',
      object: 'Account',
      data: {
        Id: '001xx000000123',
        editmode: 'FALSE'
      }
    });
  });

  it('calls _send with editmode = TRUE when explicitly provided', async () => {
    await pulsar.viewObject('Account', '001xx000000123', 'TRUE');

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'viewObject',
      object: 'Account',
      data: {
        Id: '001xx000000123',
        editmode: 'TRUE'
      }
    });
  });

  it('throws if objectName is missing', async () => {
    await expect(() =>
      pulsar.viewObject(undefined, '001xx000000123')
    ).rejects.toThrow('viewObject requires a valid objectName string.');
  });

  it('throws if objectName is not a string', async () => {
    await expect(() =>
      pulsar.viewObject(123, '001xx000000123')
    ).rejects.toThrow('viewObject requires a valid objectName string.');
  });

  it('throws if Id is missing', async () => {
    await expect(() =>
      pulsar.viewObject('Account')
    ).rejects.toThrow('viewObject requires a valid Id string.');
  });

  it('throws if Id is not a string', async () => {
    await expect(() =>
      pulsar.viewObject('Account', { id: 'bad' })
    ).rejects.toThrow('viewObject requires a valid Id string.');
  });

  it('resolves the result from _send', async () => {
    pulsar._send.mockResolvedValue({ result: 'ok' });

    const result = await pulsar.viewObject('Account', '001xx000000123');
    expect(result).toEqual({ result: 'ok' });
  });
});


describe('viewRelated', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar._send = jest.fn().mockResolvedValue({ success: true });
  });

  it('calls _send with correct parameters', async () => {
    await pulsar.viewRelated('Account', '001xx000000123', 'Contacts');

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'viewRelated',
      object: 'Account',
      data: {
        parentId: '001xx000000123',
        relationshipName: 'Contacts'
      }
    });
  });

  it('throws if objectName is missing', async () => {
    await expect(() =>
      pulsar.viewRelated(undefined, '001xx000000123', 'Contacts')
    ).rejects.toThrow('viewRelated requires a valid objectName string.');
  });

  it('throws if objectName is not a string', async () => {
    await expect(() =>
      pulsar.viewRelated(42, '001xx000000123', 'Contacts')
    ).rejects.toThrow('viewRelated requires a valid objectName string.');
  });

  it('throws if parentId is missing', async () => {
    await expect(() =>
      pulsar.viewRelated('Account', undefined, 'Contacts')
    ).rejects.toThrow('viewRelated requires a valid parentId string.');
  });

  it('throws if parentId is not a string', async () => {
    await expect(() =>
      pulsar.viewRelated('Account', 9999, 'Contacts')
    ).rejects.toThrow('viewRelated requires a valid parentId string.');
  });

  it('throws if relationshipName is missing', async () => {
    await expect(() =>
      pulsar.viewRelated('Account', '001xx000000123')
    ).rejects.toThrow('viewRelated requires a valid relationshipName string.');
  });

  it('throws if relationshipName is not a string', async () => {
    await expect(() =>
      pulsar.viewRelated('Account', '001xx000000123', { rel: 'Contacts' })
    ).rejects.toThrow('viewRelated requires a valid relationshipName string.');
  });

  it('resolves the result from _send', async () => {
    pulsar._send.mockResolvedValue({ result: 'ok' });

    const result = await pulsar.viewRelated('Account', '001xx000000123', 'Contacts');
    expect(result).toEqual({ result: 'ok' });
  });
});


describe('viewList', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar._send = jest.fn().mockResolvedValue({ success: true });
  });

  it('calls _send with correct parameters', async () => {
    await pulsar.viewList('Account', '00Bxx0000018XZTUA2');

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'viewList',
      object: 'Account',
      data: {
        listViewId: '00Bxx0000018XZTUA2'
      }
    });
  });

  it('throws if objectName is missing', async () => {
    await expect(() =>
      pulsar.viewList(undefined, '00Bxx0000018XZTUA2')
    ).rejects.toThrow('viewList requires a valid objectName string.');
  });

  it('throws if objectName is not a string', async () => {
    await expect(() =>
      pulsar.viewList(123, '00Bxx0000018XZTUA2')
    ).rejects.toThrow('viewList requires a valid objectName string.');
  });

  it('throws if listViewId is missing', async () => {
    await expect(() =>
      pulsar.viewList('Account')
    ).rejects.toThrow('viewList requires a valid listViewId string.');
  });

  it('throws if listViewId is not a string', async () => {
    await expect(() =>
      pulsar.viewList('Account', { id: 'bad' })
    ).rejects.toThrow('viewList requires a valid listViewId string.');
  });

  it('resolves the result from _send', async () => {
    pulsar._send.mockResolvedValue({ result: 'ok' });

    const result = await pulsar.viewList('Account', '00Bxx0000018XZTUA2');
    expect(result).toEqual({ result: 'ok' });
  });
});


describe('lookupObject', () => {
  it('should send the correct object and filter criteria', async () => {
    const pulsar = new Pulsar();
    const mockData = [{ Id: '001XYZ', Name: 'Test Account' }];
    pulsar.bridge = {
      send: jest.fn((req, cb) =>
        cb({
          type: 'lookupObjectResponse',
          data: mockData
        })
      )
    };

    const result = await pulsar.lookupObject('Account', { Type: 'Prospect' });
    expect(result).toEqual(mockData);

    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      {
        type: 'lookupObject',
        object: 'Account',
        data: { Type: 'Prospect' }
      },
      expect.any(Function)
    );
  });

  it('should default to empty data object if not provided', async () => {
    const pulsar = new Pulsar();
    const mockData = [{ Id: '001XYZ', Name: 'Default Result' }];
    pulsar.bridge = {
      send: jest.fn((req, cb) =>
        cb({
          type: 'lookupObjectResponse',
          data: mockData
        })
      )
    };

    const result = await pulsar.lookupObject('Contact');
    expect(result).toEqual(mockData);

    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      {
        type: 'lookupObject',
        object: 'Contact',
        data: {}
      },
      expect.any(Function)
    );
  });
});

describe('scanBarcode', () => {
  it('should send the correct request and return scanned barcode', async () => {
    const pulsar = new Pulsar();
    const mockBarcode = { barcode: '1234567890' };
    pulsar.bridge = {
      send: jest.fn((req, cb) =>
        cb({
          type: 'scanBarcodeResponse',
          data: mockBarcode
        })
      )
    };

    const result = await pulsar.scanBarcode();
    expect(result).toEqual('1234567890');

    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      {
        type: 'scanBarcode',
        data: {}
      },
      expect.any(Function)
    );
  });
});

describe('executeQuickAction', () => {
  it('should send ActionName only when no contextId or fields are provided', async () => {
    const pulsar = new Pulsar();
    const mockResponse = {
      executed: true,
      quickActionResult: true
    };
    pulsar.bridge = {
      send: jest.fn((req, cb) =>
        cb({
          type: 'executeQuickActionResponse',
          data: mockResponse
        })
      )
    };

    const result = await pulsar.executeQuickAction('MyAction');
    expect(result).toEqual(mockResponse);

    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      {
        type: 'executeQuickAction',
        data: {
          ActionName: 'MyAction'
        }
      },
      expect.any(Function)
    );
  });

  it('should include ContextId and additional fields in request', async () => {
    const pulsar = new Pulsar();
    const mockResponse = {
      executed: true,
      quickActionResult: false
    };
    pulsar.bridge = {
      send: jest.fn((req, cb) =>
        cb({
          type: 'executeQuickActionResponse',
          data: mockResponse
        })
      )
    };

    const result = await pulsar.executeQuickAction('MyAction', '001ABC', {
      Status__c: 'Active',
      Priority__c: 'High'
    });

    expect(result).toEqual(mockResponse);

    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      {
        type: 'executeQuickAction',
        data: {
          ActionName: 'MyAction',
          ContextId: '001ABC',
          Status__c: 'Active',
          Priority__c: 'High'
        }
      },
      expect.any(Function)
    );
  });
});

describe('cameraPhoto', () => {
  it('should send the correct request with default quality', async () => {
    const pulsar = new Pulsar();
    const mockData = {
      FilePath: '/path/to/photo.jpg',
      ContentType: 'image/jpeg'
    };
    pulsar.bridge = {
      send: jest.fn((req, cb) =>
        cb({
          type: 'cameraPhotoResponse',
          data: mockData
        })
      )
    };

    const result = await pulsar.cameraPhoto();
    expect(result).toEqual(mockData);

    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      {
        type: 'cameraPhoto',
        data: { quality: 'medium' }
      },
      expect.any(Function)
    );
  });

  it('should allow overriding quality parameter', async () => {
    const pulsar = new Pulsar();
    const mockData = {
      FilePath: '/path/to/high-res.jpg',
      ContentType: 'image/jpeg'
    };
    pulsar.bridge = {
      send: jest.fn((req, cb) =>
        cb({
          type: 'cameraPhotoResponse',
          data: mockData
        })
      )
    };

    const result = await pulsar.cameraPhoto('high');
    expect(result).toEqual(mockData);

    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      {
        type: 'cameraPhoto',
        data: { quality: 'high' }
      },
      expect.any(Function)
    );
  });
});

describe('cameraPhotoPicker', () => {
  it('should send the correct request and return an array of photo metadata', async () => {
    const pulsar = new Pulsar();
    const mockData = [
      {
        FilePath: '/path/to/photo1.jpg',
        FileURL: 'file:///photo1.jpg',
        RelativeFilePath: 'photo1.jpg',
        ContentType: 'image/jpeg'
      },
      {
        FilePath: '/path/to/photo2.jpg',
        FileURL: 'file:///photo2.jpg',
        RelativeFilePath: 'photo2.jpg',
        ContentType: 'image/jpeg'
      }
    ];

    pulsar.bridge = {
      send: jest.fn((req, cb) =>
        cb({
          type: 'cameraPhotoPickerResponse',
          data: mockData
        })
      )
    };

    const result = await pulsar.cameraPhotoPicker();
    expect(result).toEqual(mockData);

    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      {
        type: 'cameraPhotoPicker',
        data: {}
      },
      expect.any(Function)
    );
  });
});

describe('filePicker', () => {
  it('should send the correct request and return an array of file metadata', async () => {
    const pulsar = new Pulsar();
    const mockData = [
      {
        FilePath: '/path/to/file1.pdf',
        FileURL: 'file:///file1.pdf',
        RelativeFilePath: 'file1.pdf',
        ContentType: 'application/pdf'
      },
      {
        FilePath: '/path/to/file2.docx',
        FileURL: 'file:///file2.docx',
        RelativeFilePath: 'file2.docx',
        ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }
    ];

    pulsar.bridge = {
      send: jest.fn((req, cb) =>
        cb({
          type: 'filePickerResponse',
          data: mockData
        })
      )
    };

    const result = await pulsar.filePicker();
    expect(result).toEqual(mockData);

    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      {
        type: 'filePicker',
        data: {}
      },
      expect.any(Function)
    );
  });
});

describe('displayUrl', () => {
  it('should send the correct request with all options provided', async () => {
    const pulsar = new Pulsar();
    const mockData = { opened: true };

    pulsar.bridge = {
      send: jest.fn((req, cb) =>
        cb({
          type: 'displayUrlResponse',
          data: mockData
        })
      )
    };

    const result = await pulsar.displayUrl({
      fullUrl: 'https://example.com/page',
      externalBrowser: true,
      scheme: 'https://',
      path: 'example.com/page',
      queryParams: { q: 'search', lang: 'en' }
    });

    expect(result).toEqual(mockData);

    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      {
        type: 'displayUrl',
        data: {
          fullUrl: 'https://example.com/page',
          externalBrowser: true,
          scheme: 'https://',
          path: 'example.com/page',
          queryParams: { q: 'search', lang: 'en' }
        }
      },
      expect.any(Function)
    );
  });

  it('should omit optional parameters when not provided', async () => {
    const pulsar = new Pulsar();
    const mockData = { opened: true };

    pulsar.bridge = {
      send: jest.fn((req, cb) =>
        cb({
          type: 'displayUrlResponse',
          data: mockData
        })
      )
    };

    const result = await pulsar.displayUrl();
    expect(result).toEqual(mockData);

    expect(pulsar.bridge.send).toHaveBeenCalledWith(
      {
        type: 'displayUrl',
        data: {}
      },
      expect.any(Function)
    );
  });
});
