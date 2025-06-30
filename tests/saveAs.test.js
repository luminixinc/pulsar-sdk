import { Pulsar } from '../src//pulsar';
import { beforeEach, expect, jest } from '@jest/globals';

describe('Pulsar.saveAs', () => {
  let pulsar;

  beforeEach(async () => {
    pulsar = new Pulsar();
    pulsar.bridge = {
      send: jest.fn((req, cb) => {
        if (req.type === 'saveAs' && req.data.filename === 'valid.pdf') {
          cb({ type: 'saveasResponse', data: { FilePath: '/files/valid.pdf' } });
        } else if (req.type === 'saveAs' && req.data.filename === 'fail.pdf') {
          cb({ type: 'error', data: 'Failed to save' });
        } else {
          cb({ type: 'saveasResponse', data: {} });
        }
      })
    };
  });

  it('should throw if bridge is not initialized', async () => {
    pulsar.bridge = null;
    await expect(pulsar.saveAs({ filename: 'x.pdf' })).rejects.toThrow('Pulsar bridge not initialized. Call init() first.');
  });

  it('should throw if filename is missing', async () => {
    await expect(pulsar.saveAs({})).rejects.toThrow('saveAs requires a filename.');
  });

  it('should resolve with file path when successful', async () => {
    const path = await pulsar.saveAs({ filename: 'valid.pdf' });
    expect(path).toBe('/files/valid.pdf');
    expect(pulsar.bridge.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'saveAs',
      data: expect.objectContaining({ filename: 'valid.pdf' })
    }), expect.any(Function));
  });

  it('should throw an error if bridge responds with type error', async () => {
    await expect(pulsar.saveAs({ filename: 'fail.pdf' })).rejects.toThrow('Failed to save');
  });

  it('should throw if response is missing FilePath', async () => {
    await expect(pulsar.saveAs({ filename: 'noPath.pdf' })).rejects.toThrow('Unexpected response from saveAs.');
  });

  it('should pass printoptions when provided', async () => {
    const printoptions = {
      topmargin: 10,
      leftmargin: 10,
      bottommargin: 10,
      rightmargin: 10,
      papersize: 'a4',
      headerheight: 50,
      footerheight: 50,
      useEdge: true
    };

    await pulsar.saveAs({
      filename: 'valid.pdf',
      printoptions
    });

    expect(pulsar.bridge.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'saveAs',
      data: expect.objectContaining({
        filename: 'valid.pdf',
        printoptions: expect.objectContaining({ useEdge: true })
      })
    }), expect.any(Function));
  });
});
