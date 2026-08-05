import { Pulsar } from "../src/pulsar";
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

describe('Pulsar.syncRunning()', () => {
  let pulsar;
  let syncStatusMock;

  beforeEach(() => {
    pulsar = new Pulsar();
    syncStatusMock = jest.spyOn(pulsar, 'syncStatus');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns true when syncrunning is TRUE', async () => {
    syncStatusMock.mockResolvedValue({
      syncrunning: 'TRUE'
    });

    await expect(pulsar.syncRunning()).resolves.toBe(true);

    expect(syncStatusMock).toHaveBeenCalledTimes(1);
    expect(syncStatusMock).toHaveBeenCalledWith();
  });

  it('returns false when syncrunning is FALSE', async () => {
    syncStatusMock.mockResolvedValue({
      syncrunning: 'FALSE'
    });

    await expect(pulsar.syncRunning()).resolves.toBe(false);
  });

  it('uses the standard Pulsar boolean conversion behavior', async () => {
    syncStatusMock.mockResolvedValue({
      syncrunning: ' true '
    });

    await expect(pulsar.syncRunning()).resolves.toBe(true);
  });

  it('throws when the response is missing syncrunning', async () => {
    syncStatusMock.mockResolvedValue({});

    await expect(pulsar.syncRunning()).rejects.toThrow(
      'Unexpected response format from syncStatus. Expected a syncrunning field.'
    );
  });

  test.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'TRUE'],
    ['an array', []]
  ])('throws when the response is %s', async (_description, response) => {
    syncStatusMock.mockResolvedValue(response);

    await expect(pulsar.syncRunning()).rejects.toThrow(
      'Unexpected response format from syncStatus. Expected a syncrunning field.'
    );
  });

  it('propagates errors from syncStatus()', async () => {
    const error = new Error('Unable to retrieve sync status');

    syncStatusMock.mockRejectedValue(error);

    await expect(pulsar.syncRunning()).rejects.toBe(error);
  });
});