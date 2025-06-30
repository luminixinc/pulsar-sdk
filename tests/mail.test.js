import { Pulsar } from '../src/pulsar';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

describe('Pulsar.mail', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar._send = jest.fn().mockResolvedValue(undefined);
  });

  it('sends email with only "to" recipients', async () => {
    await pulsar.mail(['to@example.com'], null, null, null, null);
    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'mail',
      data: {
        to: ['to@example.com']
      }
    });
  });

  it('sends email with all parameters filled', async () => {
    await pulsar.mail(
      ['to@example.com'],
      ['cc@example.com'],
      ['/path/to/file.pdf'],
      'Test Subject',
      'Test Body'
    );
    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'mail',
      data: {
        to: ['to@example.com'],
        cc: ['cc@example.com'],
        attach: ['/path/to/file.pdf'],
        subject: 'Test Subject',
        body: 'Test Body'
      }
    });
  });

  it('handles empty arrays and blank strings gracefully', async () => {
    await pulsar.mail([], [], [], '', '');
    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'mail',
      data: {}
    });
  });

  it('handles undefined inputs safely', async () => {
    await pulsar.mail(undefined, undefined, undefined, undefined, undefined);
    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'mail',
      data: {}
    });
  });

  it('handles mixed defined and undefined inputs correctly', async () => {
    await pulsar.mail(['user@example.com'], undefined, ['/tmp/file.pdf'], undefined, 'Hello!');
    expect(pulsar._send).toHaveBeenCalledWith({
      type: 'mail',
      data: {
        to: ['user@example.com'],
        attach: ['/tmp/file.pdf'],
        body: 'Hello!'
      }
    });
  });
});
