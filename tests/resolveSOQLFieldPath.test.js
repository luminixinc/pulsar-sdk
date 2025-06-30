import { Pulsar } from '../src/pulsar';
import { beforeEach, expect, jest } from '@jest/globals';

describe('Pulsar.resolveSOQLFieldPath', () => {

  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    pulsar.bridge = {}; // simulate bridge init
    // Only mock dependencies, not the method
    pulsar.getSObjectSchema = jest.fn();
    pulsar.read = jest.fn();
  });

  test('resolves direct field', async () => {
    const result = await pulsar.resolveSOQLFieldPath({ Name: 'Test' }, 'Name', 'Contact');
    expect(result).toBe('Test');
  });

  test('returns direct field value', async () => {
    const contact = { Name: 'Alice' };
    const result = await pulsar.resolveSOQLFieldPath(contact, 'Name', 'Contact');
    expect(result).toBe('Alice');
  });

  test('strips root-qualified path (e.g., "Contact.Name")', async () => {
    const contact = { Name: 'Bob' };
    const result = await pulsar.resolveSOQLFieldPath(contact, 'Contact.Name', 'Contact');
    expect(result).toBe('Bob');
  });

  test('resolves one-level relationship (e.g., "Owner.Name")', async () => {
    const contact = { OwnerId: '005ABC' };

    pulsar.getSObjectSchema.mockResolvedValueOnce({
      fields: {
        OwnerId: {
          name: 'OwnerId',
          relationshipName: 'Owner',
          referenceTo: ['User'],
        },
      }
    });

    pulsar.read.mockResolvedValueOnce([{ Id: '005ABC', Name: 'Carol' }]);

    const result = await pulsar.resolveSOQLFieldPath(contact, 'Owner.Name', 'Contact');
    expect(result).toBe('Carol');
  });

  test('resolves multi-level relationship (e.g., "Owner.Manager.Name")', async () => {
    const contact = { OwnerId: '005ABC' };

    pulsar.getSObjectSchema
      .mockResolvedValueOnce({ // Owner relationship
        fields: {
          OwnerId: {
            name: 'OwnerId',
            relationshipName: 'Owner',
            referenceTo: ['User']
          }
        }
      })
      .mockResolvedValueOnce({ // Manager relationship
        fields: {
          ManagerId: {
            name: 'ManagerId',
            relationshipName: 'Manager',
            referenceTo: ['User']
          }
        }
      });

    pulsar.read
      .mockResolvedValueOnce([{ Id: '005ABC', ManagerId: '005XYZ' }]) // Owner
      .mockResolvedValueOnce([{ Id: '005XYZ', Name: 'Dana' }]);       // Manager

    const result = await pulsar.resolveSOQLFieldPath(contact, 'Owner.Manager.Name', 'Contact');
    expect(result).toBe('Dana');
  });

  test('returns null if relationship field not found in schema', async () => {
    pulsar.getSObjectSchema.mockResolvedValueOnce({
      fields: {}
    });

    const result = await pulsar.resolveSOQLFieldPath({ OwnerId: '005ABC' }, 'Owner.Name', 'Contact');
    expect(result).toBeNull();
  });

  test('returns null if related record is missing', async () => {
    pulsar.getSObjectSchema.mockResolvedValueOnce({
      fields: {
        OwnerId: {
          name: 'OwnerId',
          relationshipName: 'Owner',
          referenceTo: ['User']
        }
      }
    });

    pulsar.read.mockResolvedValueOnce([]); // no record

    const result = await pulsar.resolveSOQLFieldPath({ OwnerId: '005ABC' }, 'Owner.Name', 'Contact');
    expect(result).toBeNull();
  });

  test('returns null if refId is missing on current record', async () => {
    pulsar.getSObjectSchema.mockResolvedValueOnce({
      fields: {
        AccountId: {
          name: 'AccountId',
          relationshipName: 'Account',
          referenceTo: ['Account']
        }
      }
    });

    const result = await pulsar.resolveSOQLFieldPath({}, 'Account.Name', 'Contact');
    expect(result).toBeNull();
  });

  test('returns null if relationshipField.referenceTo is undefined', async () => {
    pulsar.getSObjectSchema.mockResolvedValueOnce({
      fields: {
        ManagerId: {
          name: 'ManagerId',
          relationshipName: 'Manager'
          // referenceTo missing
        }
      }
    });

    const result = await pulsar.resolveSOQLFieldPath({ ManagerId: '005XYZ' }, 'Manager.Name', 'User');
    expect(result).toBeNull();
  });

  test('returns null when final field does not exist on currentRecord', async () => {
    const contact = {}; // no "Name" field
    const result = await pulsar.resolveSOQLFieldPath(contact, 'Name', 'Contact');
    expect(result).toBeNull();
  });

  test('returns null if path is empty after stripping root-qualified type', async () => {
    const contact = { Name: 'Anything' };
    const result = await pulsar.resolveSOQLFieldPath(contact, 'Contact', 'Contact');
    expect(result).toBeNull();
  });

  test('resolves polymorphic field using __r.attributes.type hint', async () => {
    const record = {
      WhoId: '003XYZ',
      WhoId__r: {
        attributes: { type: 'Contact' }
      }
    };

    pulsar.getSObjectSchema.mockResolvedValueOnce({
      fields: {
        WhoId: {
          name: 'WhoId',
          relationshipName: 'Who',
          referenceTo: ['Contact', 'Lead']
        }
      }
    });

    pulsar.read.mockResolvedValueOnce([{ Id: '003XYZ', Name: 'Polymorphic Contact' }]);

    const result = await pulsar.resolveSOQLFieldPath(record, 'Who.Name', 'Task');
    expect(result).toBe('Polymorphic Contact');
  });

  test('falls back to first referenceTo when no type hint is available', async () => {
    const record = {
      WhatId: '500ABC' // Assume Case ID
    };

    pulsar.getSObjectSchema.mockResolvedValueOnce({
      fields: {
        WhatId: {
          name: 'WhatId',
          relationshipName: 'What',
          referenceTo: ['Case', 'Opportunity']
        }
      }
    });

    pulsar.read.mockResolvedValueOnce([{ Id: '500ABC', Subject: 'Default Case' }]);

    const result = await pulsar.resolveSOQLFieldPath(record, 'What.Subject', 'Task');
    expect(result).toBe('Default Case');
  });

  test('returns null if type hint points to unknown type', async () => {
    const record = {
      WhoId: '999XYZ',
      WhoId__r: {
        attributes: { type: 'UnknownType' }
      }
    };

    pulsar.getSObjectSchema.mockResolvedValueOnce({
      fields: {
        WhoId: {
          name: 'WhoId',
          relationshipName: 'Who',
          referenceTo: ['Contact', 'Lead']
        }
      }
    });

    // No read call should be made due to invalid type
    const result = await pulsar.resolveSOQLFieldPath(record, 'Who.Name', 'Task');
    expect(result).toBeNull();
  });



});
