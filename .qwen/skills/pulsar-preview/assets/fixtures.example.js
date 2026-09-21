/**
 * fixtures.example.js — worked example of every fixture key the mock understands.
 * Copy to the app repo as mockups/fixtures.js and replace with app-specific data.
 *
 * SAMPLE-DATA RULES (kit ground truth — the mock does NOT convert for you):
 *   - every field value is a STRING: booleans 'TRUE'/'FALSE', numbers '42.0'
 *   - 18-character Ids with realistic key prefixes (001 Account, 003 Contact, 500 Case…)
 *   - dates 'YYYY-MM-DD', datetimes 'YYYY-MM-DDThh:mm:ss.sssZ' (UTC)
 *   - realistic display values (no "Test 1"), enough rows to exercise pagination
 */
export default {
  // ---- environment -------------------------------------------------------
  userInfo: { userfullname: 'Dee Veloper', username: 'dee@example.dev' },
  platform: 'ios',                       // 'ios' | 'android' | 'windows'
  online: true,
  settings: { 'mycompany.myapp.mode': 'standard' },
  settingAttachments: { 'mycompany.myapp.config': { FileName: 'config.json', FilePath: '/mock/config.json', content: '{}' } },
  customLabels: { Welcome_Message: 'Welcome back!' },
  location: { latitude: '30.2672', longitude: '-97.7431', locationAccuracy: 'Medium' },
  barcode: '036000291452',

  // ---- data --------------------------------------------------------------
  objects: {
    Account: {
      rows: [
        { Id: '001MOCK00000000001', Name: 'Edge Communications', Industry: 'Electronics',
          Phone: '(512) 757-6000', AnnualRevenue: '139000000.0', IsActive__c: 'TRUE',
          CreatedDate: '2025-11-04T16:30:00.000Z' },
        { Id: '001MOCK00000000002', Name: 'Burlington Textiles', Industry: 'Apparel',
          Phone: '(336) 222-7000', AnnualRevenue: '350000000.0', IsActive__c: 'FALSE',
          CreatedDate: '2026-01-12T09:05:00.000Z' },
        // ... 25+ rows if the app paginates at 25
      ],
    },
    Contact: {
      rows: [
        { Id: '003MOCK00000000001', AccountId: '001MOCK00000000001',
          Name: 'Rose Gonzalez', Email: 'rose@edge.example', Title: 'SVP, Procurement' },
      ],
    },
  },

  // ---- metadata (all OPTIONAL — the mock synthesizes from rows when absent) ----
  schemas: {
    // Paste real getSObjectSchema JSON here for full fidelity (picklistValues,
    // referenceTo, nameField, controllerName...). Otherwise: synthesized, all-string fields.
  },
  layouts: {},                            // 'Account' or 'Account:012...' -> DescribeLayout
  compactLayouts: { Account: ['Name', 'Industry', 'Phone'] },
  relatedLists: {
    Account: [
      { sobject: 'Contact', field: 'AccountId', label: 'Contacts',
        columns: [{ fieldApiName: 'Name', label: 'Name' }] },
    ],
  },
  picklists: {
    'Account.Industry': {
      itemIds: ['Electronics', 'Apparel', 'Energy'],
      itemLabels: ['Electronics', 'Apparel', 'Energy'],
    },
  },
  listviews: {
    Account: {
      '00BMOCK0000000001AAA': {
        label: 'All Accounts', fields: ['Name', 'Industry', 'Phone'],
        labels: ['Account Name', 'Industry', 'Phone'],
        whereClause: '', orderBy: 'Name COLLATE NOCASE ASC',
      },
    },
  },

  // ---- files / content ----------------------------------------------------
  files: [
    { Id: '068MOCK00000000001', ContentDocumentId: '069MOCK00000000001',
      Title: 'Site survey.jpg', LinkedEntityIds: ['001MOCK00000000001'] },
      // FileURL omitted -> the mock serves a labeled placeholder SVG
  ],
  contentUrls: {},                        // '<Id or Title>' -> { url, title }
  chatter: { '001MOCK00000000001': [{ Body: 'Called the customer.', CommentCount: '0', LikeCount: '1' }] },

  // ---- escape hatches ------------------------------------------------------
  // Checked BEFORE the SQL interpreter; use for OR / JOIN / subselects.
  queryOverrides: [
    // { match: 'JOIN AssignedResource', rows: [ ... ] },
    // { match: /FROM\s+WorkOrder/i, fn: (request) => [...] },
  ],
  // Full per-type overrides; also the only way to fake types the mock rejects
  // (updateQuery, soqlquery, FSL) or doesn't know. Throw a string for an error envelope.
  responses: {
    // soqlquery: (request) => ({ totalSize: 0, done: true, records: [] }),
  },

  autoSimulateSync: true,                 // syncdata request runs a fake progress cycle
};
