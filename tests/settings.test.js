import { Pulsar } from '../src/pulsar.js';
import { beforeEach, expect, jest } from '@jest/globals';

describe('getSetting', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn((req, cb) => {
        if (req.data.key === 'MySetting') {
          cb({
            type: 'getSettingResponse',
            data: {
              Exists: 'TRUE',
              MySetting: 'my-value'
            }
          });
        } else if (req.data.key === 'MissingSetting') {
          cb({
            type: 'getSettingResponse',
            data: {
              Exists: 'FALSE'
            }
          });
        } else {
          cb({
            type: 'error',
            data: 'Unknown key'
          });
        }
      })
    };
  });

  it('should retrieve an existing setting', async () => {
    const result = await pulsar.getSetting('MySetting');
    expect(result).toEqual({
      Exists: 'TRUE',
      MySetting: 'my-value'
    });
  });

  it('should return Exists: FALSE for a missing setting', async () => {
    const result = await pulsar.getSetting('MissingSetting');
    expect(result).toEqual({
      Exists: 'FALSE'
    });
  });

  it('should throw for missing key argument', async () => {
    await expect(pulsar.getSetting()).rejects.toThrow('getSetting requires a valid key string.');
    await expect(pulsar.getSetting(123)).rejects.toThrow('getSetting requires a valid key string.');
  });

  it('should throw if bridge returns an error', async () => {
    await expect(pulsar.getSetting('InvalidKey')).rejects.toThrow('Unknown key');
  });
});


describe('getSettingAttachment', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn((req, cb) => {
        const key = req.data.key;
        if (key === 'LogoImage') {
          cb({
            type: 'getSettingAttachmentResponse',
            data: {
              FileName: 'logo.png',
              FilePath: '/files/logo.png',
              LogoImage: 'some-value'
            }
          });
        } else if (key === 'MissingAttachment') {
          cb({
            type: 'error',
            data: 'Attachment not found'
          });
        } else {
          cb({
            type: 'error',
            data: 'Unknown key'
          });
        }
      })
    };
  });

  it('should retrieve an existing setting attachment', async () => {
    const result = await pulsar.getSettingAttachment('LogoImage');
    expect(result).toEqual({
      FileName: 'logo.png',
      FilePath: '/files/logo.png',
      LogoImage: 'some-value'
    });
  });

  it('should throw for missing key argument', async () => {
    await expect(pulsar.getSettingAttachment()).rejects.toThrow('getSettingAttachment requires a valid key string.');
    await expect(pulsar.getSettingAttachment(123)).rejects.toThrow('getSettingAttachment requires a valid key string.');
  });

  it('should throw if the attachment is not found', async () => {
    await expect(pulsar.getSettingAttachment('MissingAttachment')).rejects.toThrow('Attachment not found');
  });

  it('should throw if the bridge returns an error', async () => {
    await expect(pulsar.getSettingAttachment('InvalidKey')).rejects.toThrow('Unknown key');
  });
});
