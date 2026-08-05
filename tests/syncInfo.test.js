import { Pulsar } from '../src/pulsar';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

describe('Pulsar.syncInfo()', () => {
  let pulsar;
  let sendSpy;

  beforeEach(() => {
    pulsar = new Pulsar();
    sendSpy = jest.spyOn(pulsar, '_send');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends a syncinfo request', async () => {
    sendSpy.mockResolvedValue({});

    await pulsar.syncInfo();

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith({
      type: 'syncinfo'
    });
  });

  it('returns the sync information returned by _send()', async () => {
    const syncInfo = {
      lastfailedsync: '1970-01-01T00:00:00.000Z',
      lastsuccessfulsync: '2023-06-01T04:10:55.020Z',
      previoussynctime: '1970-01-01T00:00:00.000Z',
      lastsyncdownloadspeed: '0.0',
      lastsyncduration: '44.9',
      lastsyncsuccess: 'YES',
      lastsyncuploadspeed: '0.0',
      localchangespendingcount: '0',
      localcreatedcount: '0',
      localdeletedcount: '0',
      localupdatedcount: '0',
      localupdateduniquecount: '0',
      metadatasyncduration: '9.4',
      metadatasyncperformed: 'YES',
      reachabilitysyncduration: '0.0',
      reachabilitysyncperformed: 'NO',
      refreshduration: '0.0',
      refreshperformed: 'NO',
      schemachanged: 'NO',
      serverintegratedcount: '4304',
      serverprocessedcount: '4485',
      serverprocessedobjectcountmap:
        'Account: 4000,Contact: 400,Case: 85',
      syncdomaintype: 'all',
      syncgeneration: '1',
      syncpasscount: '1',
      syncresumed: 'NO',
      syncwindowtype: 'initial'
    };

    sendSpy.mockResolvedValue(syncInfo);

    await expect(pulsar.syncInfo()).resolves.toBe(syncInfo);
  });

  it('does not convert string-valued sync information', async () => {
    const syncInfo = {
      lastsyncduration: '44.9',
      lastsyncsuccess: 'NO',
      localchangespendingcount: '3',
      metadatasyncperformed: 'YES',
      serverprocessedcount: '4485',
      syncresumed: 'NO'
    };

    sendSpy.mockResolvedValue(syncInfo);

    const result = await pulsar.syncInfo();

    expect(result).toEqual(syncInfo);
    expect(result.lastsyncduration).toBe('44.9');
    expect(result.lastsyncsuccess).toBe('NO');
    expect(result.localchangespendingcount).toBe('3');
    expect(result.serverprocessedcount).toBe('4485');
  });

  it('returns an empty response unchanged', async () => {
    const response = {};

    sendSpy.mockResolvedValue(response);

    await expect(pulsar.syncInfo()).resolves.toBe(response);
  });

  it('propagates errors rejected by _send()', async () => {
    const error = new Error('Unable to retrieve sync information');

    sendSpy.mockRejectedValue(error);

    await expect(pulsar.syncInfo()).rejects.toBe(error);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith({
      type: 'syncinfo'
    });
  });
});