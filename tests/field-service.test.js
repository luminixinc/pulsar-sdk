import { Pulsar } from '../src/pulsar.js';
import { beforeEach, expect, jest } from '@jest/globals';

describe('getFSLTemplate', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar._send = jest.fn();
  });

  it('returns template map when called with no arguments', async () => {
    const mockResponse = {
      'Report A': '0TTxx0000000001',
      'Report B': '0TTxx0000000002'
    };
    pulsar._send.mockResolvedValue(mockResponse);

    const result = await pulsar.getFSLTemplate();
    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getfsltemplate',
      data: {}
    });
    expect(result).toEqual(mockResponse);
  });

  it('returns template metadata when called with TemplateId only', async () => {
    const mockResponse = { Id: '0TTxx0000000001', Name: 'Template A' };
    pulsar._send.mockResolvedValue(mockResponse);

    const result = await pulsar.getFSLTemplate('0TTxx0000000001');
    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getfsltemplate',
      data: { TemplateId: '0TTxx0000000001' }
    });
    expect(result).toEqual(mockResponse);
  });

  it('returns template metadata when called with TemplateName only', async () => {
    const mockResponse = { Id: '0TTxx0000000001', Name: 'Template A' };
    pulsar._send.mockResolvedValue(mockResponse);

    const result = await pulsar.getFSLTemplate(undefined, 'Template A');
    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getfsltemplate',
      data: { TemplateName: 'Template A' }
    });
    expect(result).toEqual(mockResponse);
  });

  it('gives precedence to TemplateId when both parameters are passed', async () => {
    const mockResponse = { Id: '0TTxx0000000001', Name: 'Template A' };
    pulsar._send.mockResolvedValue(mockResponse);

    const result = await pulsar.getFSLTemplate('0TTxx0000000001', 'Template A');
    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getfsltemplate',
      data: { TemplateId: '0TTxx0000000001' }
    });
    expect(result).toEqual(mockResponse);
  });
});


describe('executeFSLFlow', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar._send = jest.fn();
  });

  it('should throw if neither flowName nor flowId is provided', async () => {
    await expect(pulsar.executeFSLFlow(undefined, undefined)).rejects.toThrow(
      'executeFSLFlow requires either flowName or flowId.'
    );
  });

  it('should send request with flowName only', async () => {
    const mockResponse = { executed: true };
    pulsar._send.mockResolvedValue(mockResponse);

    const result = await pulsar.executeFSLFlow('MyFlow');
    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'executeFSLFlow',
      data: {
        FlowName: 'MyFlow'
      }
    });
    expect(result).toEqual(mockResponse);
  });

  it('should send request with flowId only', async () => {
    const mockResponse = { executed: true };
    pulsar._send.mockResolvedValue(mockResponse);

    const result = await pulsar.executeFSLFlow(undefined, '301ABC');
    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'executeFSLFlow',
      data: {
        FlowId: '301ABC'
      }
    });
    expect(result).toEqual(mockResponse);
  });

  it('should include all optional parameters if provided', async () => {
    const mockResponse = { executed: false };
    pulsar._send.mockResolvedValue(mockResponse);

    const result = await pulsar.executeFSLFlow(
      'MyFlow',
      '301ABC',
      'Launch Label',
      '08pXYZ',
      '005USER',
      '0WOParent'
    );

    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'executeFSLFlow',
      data: {
        FlowName: 'MyFlow',
        FlowId: '301ABC',
        ActionLabel: 'Launch Label',
        Id: '08pXYZ',
        UserId: '005USER',
        ParentId: '0WOParent'
      }
    });
    expect(result).toEqual(mockResponse);
  });
});

describe('createServiceReportFromFilePath', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar._send = jest.fn().mockResolvedValue('a07xx0000000001'); // mock ServiceReport Id
  });

  const validArgs = [
    '001xx000003NGsZAAW',                // ParentId
    '/storage/report.pdf',               // FilePath
    '0TTxx000000abcd',                   // TemplateId
    'report.pdf',                        // DocumentName
    'application/pdf'                    // ContentType
  ];

  it('sends the correct request with valid arguments', async () => {
    const result = await pulsar.createServiceReportFromFilePath(...validArgs);
    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'createservicereportfromfilepath',
      data: {
        ParentId: validArgs[0],
        FilePath: validArgs[1],
        TemplateId: validArgs[2],
        DocumentName: validArgs[3],
        ContentType: validArgs[4]
      }
    });
    expect(result).toBe('a07xx0000000001');
  });

  it('throws if parentId is missing or invalid', async () => {
    await expect(
      pulsar.createServiceReportFromFilePath(undefined, ...validArgs.slice(1))
    ).rejects.toThrow('createServiceReportFromFilePath requires a valid parentId string.');
  });

  it('throws if filePath is missing or invalid', async () => {
    await expect(
      pulsar.createServiceReportFromFilePath(validArgs[0], '', ...validArgs.slice(2))
    ).rejects.toThrow('createServiceReportFromFilePath requires a valid filePath string.');
  });

  it('throws if templateId is missing or invalid', async () => {
    await expect(
      pulsar.createServiceReportFromFilePath(validArgs[0], validArgs[1], null, ...validArgs.slice(3))
    ).rejects.toThrow('createServiceReportFromFilePath requires a valid templateId string.');
  });

  it('throws if documentName is missing or invalid', async () => {
    await expect(
      pulsar.createServiceReportFromFilePath(validArgs[0], validArgs[1], validArgs[2], 123, validArgs[4])
    ).rejects.toThrow('createServiceReportFromFilePath requires a valid documentName string.');
  });

  it('throws if contentType is missing or invalid', async () => {
    await expect(
      pulsar.createServiceReportFromFilePath(validArgs[0], validArgs[1], validArgs[2], validArgs[3], null)
    ).rejects.toThrow('createServiceReportFromFilePath requires a valid contentType string.');
  });
});