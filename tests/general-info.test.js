import { Pulsar } from '../src/pulsar.js';
import { beforeEach, expect, jest } from '@jest/globals';

describe('Pulsar General Info Methods', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar._send = jest.fn();
  });

  test('userPhoto should send correct request', async () => {
    await pulsar.userPhoto();
    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'userPhoto',
      data: {}
    });
  });

  test('getDevServerEnabled should send request with and without docId', async () => {
    await pulsar.getDevServerEnabled('doc123');
    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getDevServerEnabled',
      args: { docId: 'doc123' },
      data: {}
    });

    await pulsar.getDevServerEnabled();
    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getDevServerEnabled',
      args: {},
      data: {}
    });
  });

  test('getPlatform should send correct request', async () => {
    await pulsar.getPlatform();
    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getPlatform',
      data: {}
    });
  });

  test('getLocation should send default and custom accuracy', async () => {
    await pulsar.getLocation();
    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getLocation',
      data: { locationAccuracy: 'Medium' }
    });

    await pulsar.getLocation('Fine');
    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getLocation',
      data: { locationAccuracy: 'Fine' }
    });
  });

  test('getCustomLabels should send request with labelNames and optional locale', async () => {
    await pulsar.getCustomLabels(['Label1', 'Label2']);
    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getCustomLabels',
      data: { labelNames: ['Label1', 'Label2'] }
    });

    await pulsar.getCustomLabels(['Label1', 'Label2'], 'fr_FR');
    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'getCustomLabels',
      data: { labelNames: ['Label1', 'Label2'], locale: 'fr_FR' }
    });
  });

  test('getCustomLabels should throw if labelNames is invalid', async () => {
    await expect(pulsar.getCustomLabels([])).rejects.toThrow();
    await expect(pulsar.getCustomLabels('Label1')).rejects.toThrow();
  });

  test('logMessage should send correct message and default level', async () => {
    await pulsar.logMessage('Test log');
    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'logMessage',
      data: { message: 'Test log', level: 'info' }
    });
  });

  test('logMessage should send correct message with custom level', async () => {
    await pulsar.logMessage('Test log', 'debug');
    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'logMessage',
      data: { message: 'Test log', level: 'debug' }
    });
  });

  test('logMessage should throw if message is invalid', async () => {
    await expect(pulsar.logMessage()).rejects.toThrow();
    await expect(pulsar.logMessage(123)).rejects.toThrow();
  });
});