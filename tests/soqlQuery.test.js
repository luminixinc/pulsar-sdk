import { jest } from '@jest/globals';
import { Pulsar } from '../src/pulsar.js';

describe('Pulsar.soqlQuery()', () => {
  let pulsar;
  let sendMock;

  beforeEach(() => {
    pulsar = new Pulsar();
    sendMock = jest.spyOn(pulsar, '_send');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends the expected soqlquery request', async () => {
    const query =
      "SELECT Id, Name FROM Account WHERE Industry = 'Technology'";

    const response = {
      response: {
        totalSize: 1,
        done: true,
        records: [
          {
            Id: '001000000000001AAA',
            Name: 'Acme',
          },
        ],
      },
    };

    sendMock.mockResolvedValue(response);

    await pulsar.soqlQuery(query);

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith({
      type: 'soqlquery',
      data: {
        query,
      },
    });
  });

  it('returns the SOQLQueryResult from the response wrapper', async () => {
    const soqlQueryResult = {
      totalSize: 2,
      done: true,
      records: [
        {
          Id: '001000000000001AAA',
          Name: 'Acme',
        },
        {
          Id: '001000000000002AAA',
          Name: 'Globex',
        },
      ],
    };

    sendMock.mockResolvedValue({
      response: soqlQueryResult,
    });

    await expect(
      pulsar.soqlQuery('SELECT Id, Name FROM Account')
    ).resolves.toBe(soqlQueryResult);
  });

  it('returns an empty SOQLQueryResult when the query has no records', async () => {
    const soqlQueryResult = {
      totalSize: 0,
      done: true,
      records: [],
    };

    sendMock.mockResolvedValue({
      response: soqlQueryResult,
    });

    await expect(
      pulsar.soqlQuery(
        "SELECT Id FROM Account WHERE Name = 'Does Not Exist'"
      )
    ).resolves.toBe(soqlQueryResult);
  });

  it('returns totalSize, done, and records from the SOQL result', async () => {
    sendMock.mockResolvedValue({
      response: {
        totalSize: 1,
        done: true,
        records: [
          {
            Id: '001000000000001AAA',
            Name: 'Acme',
          },
        ],
      },
    });

    const result = await pulsar.soqlQuery(
      'SELECT Id, Name FROM Account'
    );

    expect(result.totalSize).toBe(1);
    expect(result.done).toBe(true);
    expect(result.records).toEqual([
      {
        Id: '001000000000001AAA',
        Name: 'Acme',
      },
    ]);
  });

  it('passes multiline and relationship queries through unchanged', async () => {
    const query = `
      SELECT
        Id,
        Name,
        Account.Name
      FROM Contact
      WHERE AccountId != null
      ORDER BY Name
      LIMIT 100
    `;

    sendMock.mockResolvedValue({
      response: {
        totalSize: 0,
        done: true,
        records: [],
      },
    });

    await pulsar.soqlQuery(query);

    expect(sendMock).toHaveBeenCalledWith({
      type: 'soqlquery',
      data: {
        query,
      },
    });
  });

  it('does not attempt to parse or modify aggregate queries', async () => {
    const query =
      'SELECT Industry, COUNT(Id) total FROM Account GROUP BY Industry';

    const soqlQueryResult = {
      totalSize: 1,
      done: true,
      records: [
        {
          Industry: 'Technology',
          total: 12,
        },
      ],
    };

    sendMock.mockResolvedValue({
      response: soqlQueryResult,
    });

    await expect(
      pulsar.soqlQuery(query)
    ).resolves.toBe(soqlQueryResult);

    expect(sendMock).toHaveBeenCalledWith({
      type: 'soqlquery',
      data: {
        query,
      },
    });
  });

  test.each([
    ['undefined', undefined],
    ['null', null],
    ['an empty string', ''],
    ['a number', 123],
    ['a boolean', true],
    ['an object', { query: 'SELECT Id FROM Account' }],
    ['an array', ['SELECT Id FROM Account']],
    ['a function', () => 'SELECT Id FROM Account'],
    ['a whitespace-only string', '   '],
    ['a string containing only newlines', '\n\t'],
  ])('rejects when query is %s', async (_description, query) => {
    await expect(
      pulsar.soqlQuery(query)
    ).rejects.toThrow(
      'SOQL query must be a valid string.'
    );

    expect(sendMock).not.toHaveBeenCalled();
  });

  it('propagates errors rejected by _send()', async () => {
    const error = new Error(
      'Invalid field Name__c for Account'
    );

    sendMock.mockRejectedValue(error);

    await expect(
      pulsar.soqlQuery('SELECT Name__c FROM Account')
    ).rejects.toBe(error);

    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});