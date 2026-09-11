/*!
 * pulsar-browser-mock.js — DEV-ONLY mock of the Pulsar JS bridge.
 *
 * Lets a real, unmodified .pulsarapp (using the official pulsar.js SDK) render in an
 * ordinary browser by answering JSAPI requests from fixture data.
 *
 * ⚠️ NEVER ship this file inside a .pulsarapp bundle. It belongs in the app repo's
 *    mockups/ directory, which is excluded from the zip (see the pulsar-preview skill).
 *
 * Response envelopes and value typing verified against pulsar-sdk src/pulsar.js
 * @ commit eddf62d (init 15-56, handlers 66-120, _send 2514-2526, schema JSON-string
 * requirement 730-738). Coverage table: references/mock-bridge-reference.md.
 *
 * Usage (see assets/preview.html for the standard wiring):
 *   <script src="pulsar-browser-mock.js"></script>
 *   <script type="module">
 *     import fixtures from './fixtures.js';
 *     window.__pulsarMock.install({ fixtures, mode: 'embedded-parent' }); // or 'native'
 *   </script>
 */
(function () {
  'use strict';

  var TAG = '[pulsar-mock]';
  var log = [];               // ring buffer of { type, request, response }
  var LOG_MAX = 200;

  function warn() { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); }
  function info() { console.info.apply(console, [TAG].concat([].slice.call(arguments))); }

  // ------------------------------------------------------------------ state

  var state = {
    online: true,
    syncRunning: false,
    autosync: true,
    installed: false,
    mode: null,
  };

  var fixtures = {};          // merged at install()

  var FIXTURE_DEFAULTS = {
    userInfo: {},
    platform: 'ios',
    online: true,
    settings: {},             // key -> string value (getSetting)
    settingAttachments: {},   // key -> { FileName, FilePath, content }
    customLabels: {},         // name -> value (fallback: the name itself)
    location: { latitude: '37.7749', longitude: '-122.4194', locationAccuracy: 'Medium' },
    barcode: '0123456789012',
    objects: {},              // { Account: { rows: [ {Id, Name, ...} ] } }
    schemas: {},              // { Account: DescribeSObjectResult-shaped object }
    layouts: {},              // { 'Account' | 'Account:012...': DescribeLayout-shaped }
    compactLayouts: {},       // { 'Account' | 'Account:012...': ['Name', ...] }
    relatedLists: {},         // { Account: [ { sobject, field, label, columns } ] }
    picklists: {},            // { 'Case.Status': { itemIds: [], itemLabels: [] } }
    listviews: {},            // { Account: { '00B...': { label, fields, labels, whereClause, orderBy } } }
    files: [],                // [{ Id(068 ContentVersion), ContentDocumentId(069), Title, FileURL?, ThumbURL?, LinkedEntityIds: [] }]
    contentUrls: {},          // { '<Id or Title>': { url, title } }
    chatter: {},              // { '<parentId>': [feed items] }
    queryOverrides: [],       // [{ match: substring|RegExp, rows | fn(request) }]
    responses: {},            // { '<request type>': fn(request) -> data | throws string }
    autoSimulateSync: true,   // syncdata request triggers startSync()
  };

  var KEY_PREFIXES = {
    Account: '001', Contact: '003', Case: '500', Lead: '00Q', Opportunity: '006',
    User: '005', WorkOrder: '0WO', WorkOrderLineItem: '1WL', ServiceAppointment: '08p',
    ServiceResource: '0Hn', AssignedResource: '03r', Asset: '02i', Product2: '01t',
    ContentDocument: '069', ContentVersion: '068',
  };

  // ------------------------------------------------------------------ small utils

  var idCounter = 1000;
  function makeId(objectName) {
    var prefix = (fixtures.schemas[objectName] && fixtures.schemas[objectName].keyPrefix)
      || KEY_PREFIXES[objectName] || 'a00';
    var body = 'MOCK' + String(idCounter++);
    while ((prefix + body).length < 18) body += '0';
    return (prefix + body).slice(0, 18);
  }

  function humanize(name) {
    return name.replace(/__c$/, '').replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
  }

  function rowsFor(objectName) {
    var o = fixtures.objects[objectName];
    return (o && o.rows) || null;
  }

  function placeholderSvg(label, w, h) {
    w = w || 320; h = h || 200;
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
      '<rect width="100%" height="100%" fill="#dbe4f0"/>' +
      '<rect x="4" y="4" width="' + (w - 8) + '" height="' + (h - 8) + '" fill="none" stroke="#8aa0c0" stroke-width="2" stroke-dasharray="6 4"/>' +
      '<text x="50%" y="50%" font-family="sans-serif" font-size="16" fill="#44536b" text-anchor="middle" dominant-baseline="middle">' +
      String(label || 'mock image').replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</text></svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  // ------------------------------------------------------------------ handler registry (Pulsar events)

  var handlers = {};          // eventName -> fn (one per name, like the bridge)

  function fireHandler(name, payload) {
    var fn = handlers[name];
    if (!fn) { info('event "' + name + '" fired with no registered handler'); return; }
    try { fn(payload); } catch (e) { warn('handler for "' + name + '" threw:', e); }
  }

  // ------------------------------------------------------------------ sync simulation

  function fireSyncUpdate(pass, pct) {
    // Real payload: STRING values (kit ground truth, wiki "Data Sync API").
    fireHandler('syncDataUpdate', { syncpass: String(pass), syncpercent: Number(pct).toFixed(2) });
  }

  function finishSync(success) {
    state.syncRunning = false;
    // Real payload: REAL boolean (the documented exception to string-typing).
    fireHandler('syncDataFinished', { success: success !== false });
  }

  function startSync(opts) {
    opts = opts || {};
    var ticks = opts.ticks || 5;
    var tickMs = opts.tickMs == null ? 300 : opts.tickMs;
    var passes = opts.passes || 1;
    var success = opts.success !== false;
    state.syncRunning = true;
    var pass = 1, tick = 0;
    (function step() {
      if (!state.syncRunning) return;             // interrupted
      tick++;
      fireSyncUpdate(pass, (tick / ticks) * 100);
      if (tick >= ticks) {
        if (pass >= passes) { finishSync(success); return; }
        pass++; tick = 0;
      }
      setTimeout(step, tickMs);
    })();
  }

  // ------------------------------------------------------------------ mini SQL interpreter (documented subset)
  // Subset: SELECT <proj> FROM <table> [alias] [WHERE <AND-only predicates>]
  //         [ORDER BY f [COLLATE NOCASE] [ASC|DESC], ...] [LIMIT n [OFFSET m]]
  // proj: * | t.* | field[, field...] | COUNT(*) [AS alias] | COUNT(field) [AS alias]
  // predicates: f = 'x' | f != 'x' | f <> 'x' | f IN ('a','b') | f LIKE 'p' [ESCAPE 'e']
  //             | f IS NULL | f IS NOT NULL
  // Anything else -> null (caller warns + error envelope). Full spec: mock-bridge-reference.md.

  function runSelect(sql, requestObject) {
    // 1. Extract string literals -> placeholders, so keywords/commas in strings can't confuse us.
    var lits = [];
    var text = String(sql).replace(/'((?:[^']|'')*)'/g, function (_, body) {
      lits.push(body.replace(/''/g, "'"));
      return '' + (lits.length - 1) + '';
    });
    function lit(tok) {
      var m = /^(\d+)$/.exec(tok);
      return m ? lits[Number(m[1])] : null;
    }
    function val(tok) {
      var s = lit(tok);
      return s !== null ? s : tok;   // bare numbers/identifiers used as literal values
    }

    var m = /^\s*SELECT\s+([\s\S]+?)\s+FROM\s+([A-Za-z0-9_]+)(?:\s+(?:AS\s+)?([A-Za-z0-9_]+))?\s*([\s\S]*)$/i.exec(text);
    if (!m) return null;
    var proj = m[1].trim(), table = m[2], alias = m[3] || null, rest = m[4] || '';
    if (alias && /^(WHERE|ORDER|LIMIT)$/i.test(alias)) { rest = alias + ' ' + rest; alias = null; }

    var rows = rowsFor(table);
    // Unknown table is a FIXTURE gap, not a SQL-subset gap — distinct message.
    if (!rows) throw 'no fixture rows for object "' + table + '" — add fixtures.objects.' + table;
    if (requestObject && requestObject !== table) {
      info('select: request.object "' + requestObject + '" != FROM table "' + table + '" (using the table)');
    }

    function stripAlias(f) {
      f = f.trim();
      if (alias && f.toLowerCase().indexOf((alias + '.').toLowerCase()) === 0) return f.slice(alias.length + 1);
      return f;
    }

    // 2. Split the tail into WHERE / ORDER BY / LIMIT.
    var whereSrc = null, orderSrc = null, limitN = null, offsetN = 0;
    var tail = rest;
    var lim = /\bLIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+)|\s*,\s*(\d+))?\s*;?\s*$/i.exec(tail);
    if (lim) {
      if (lim[3] != null) { offsetN = Number(lim[1]); limitN = Number(lim[3]); } // LIMIT off, n
      else { limitN = Number(lim[1]); offsetN = Number(lim[2] || 0); }
      tail = tail.slice(0, lim.index);
    } else {
      tail = tail.replace(/;\s*$/, '');
    }
    var ord = /\bORDER\s+BY\s+([\s\S]+)$/i.exec(tail);
    if (ord) { orderSrc = ord[1]; tail = tail.slice(0, ord.index); }
    var wh = /\bWHERE\s+([\s\S]+)$/i.exec(tail);
    if (wh) { whereSrc = wh[1]; tail = tail.slice(0, wh.index); }
    if (tail.trim() !== '') return null;           // something we don't understand (GROUP BY, JOIN...)

    // 3. Predicate filter (AND-only).
    var out = rows.slice();
    if (whereSrc) {
      if (/\(|\bOR\b/i.test(whereSrc.replace(/\d+/g, ''))
          && !/\bIN\s*\(/i.test(whereSrc)) return null;
      var parts = whereSrc.split(/\bAND\b/i);
      var preds = [];
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i].trim();
        var mm;
        if ((mm = /^([A-Za-z0-9_.]+)\s*(=|!=|<>)\s*(\S+)$/.exec(p))) {
          preds.push({ f: stripAlias(mm[1]), op: mm[2] === '=' ? 'eq' : 'ne', v: val(mm[3]) });
        } else if ((mm = /^([A-Za-z0-9_.]+)\s+IN\s*\(([^)]*)\)$/i.exec(p))) {
          var items = mm[2].split(',').map(function (t) { return val(t.trim()); });
          preds.push({ f: stripAlias(mm[1]), op: 'in', v: items });
        } else if ((mm = /^([A-Za-z0-9_.]+)\s+LIKE\s+(\S+)(?:\s+ESCAPE\s+(\S+))?$/i.exec(p))) {
          var pat = lit(mm[2]); if (pat === null) return null;
          var esc = mm[3] ? lit(mm[3]) : null;
          preds.push({ f: stripAlias(mm[1]), op: 'like', v: likeToRegExp(pat, esc) });
        } else if ((mm = /^([A-Za-z0-9_.]+)\s+IS\s+(NOT\s+)?NULL$/i.exec(p))) {
          preds.push({ f: stripAlias(mm[1]), op: mm[2] ? 'notnull' : 'null' });
        } else {
          return null;                             // unsupported predicate
        }
      }
      out = out.filter(function (row) {
        for (var j = 0; j < preds.length; j++) {
          var pr = preds[j], cell = row[pr.f];
          var isNull = cell == null || cell === '';
          if (pr.op === 'null' && !isNull) return false;
          else if (pr.op === 'notnull' && isNull) return false;
          else if (pr.op === 'eq' && String(cell) !== String(pr.v)) return false;
          else if (pr.op === 'ne' && String(cell) === String(pr.v)) return false;
          else if (pr.op === 'in' && pr.v.map(String).indexOf(String(cell)) === -1) return false;
          else if (pr.op === 'like' && !pr.v.test(String(cell == null ? '' : cell))) return false;
        }
        return true;
      });
    }

    // 4. ORDER BY.
    if (orderSrc) {
      var keys = orderSrc.split(',').map(function (k) {
        var km = /^\s*([A-Za-z0-9_.]+)(?:\s+COLLATE\s+NOCASE)?(?:\s+(ASC|DESC))?\s*$/i.exec(k);
        if (!km) return null;
        return { f: stripAlias(km[1]), nocase: /COLLATE\s+NOCASE/i.test(k), desc: /DESC/i.test(km[2] || '') };
      });
      if (keys.indexOf(null) !== -1) return null;
      out = out.slice().sort(function (a, b) {
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          var av = a[k.f] == null ? '' : String(a[k.f]);
          var bv = b[k.f] == null ? '' : String(b[k.f]);
          var an = Number(av), bn = Number(bv), cmp;
          if (av !== '' && bv !== '' && !isNaN(an) && !isNaN(bn)) cmp = an - bn;
          else {
            if (k.nocase) { av = av.toLowerCase(); bv = bv.toLowerCase(); }
            cmp = av < bv ? -1 : av > bv ? 1 : 0;
          }
          if (cmp !== 0) return k.desc ? -cmp : cmp;
        }
        return 0;
      });
    }

    // 5. LIMIT / OFFSET.
    if (limitN != null) out = out.slice(offsetN, offsetN + limitN);
    else if (offsetN) out = out.slice(offsetN);

    // 6. Projection.
    var cm = /^COUNT\s*\(\s*(\*|[A-Za-z0-9_.]+)\s*\)(?:\s+AS\s+([A-Za-z0-9_]+))?$/i.exec(proj);
    if (cm) {
      var aliasName = cm[2] || ('COUNT(' + cm[1] + ')');
      var row = {}; row[aliasName] = String(out.length);   // counts are STRINGS on-platform
      return [row];
    }
    if (proj === '*' || (alias && proj.toLowerCase() === (alias + '.*').toLowerCase())) {
      return out.map(function (r) { return Object.assign({}, r); });
    }
    var fields = proj.split(',').map(function (f) {
      var fm = /^\s*([A-Za-z0-9_.]+)(?:\s+AS\s+([A-Za-z0-9_]+))?\s*$/i.exec(f);
      return fm ? { src: stripAlias(fm[1]), out: fm[2] || stripAlias(fm[1]) } : null;
    });
    if (fields.indexOf(null) !== -1) return null;
    return out.map(function (r) {
      var o = {};
      fields.forEach(function (f) { o[f.out] = r[f.src] == null ? '' : r[f.src]; });
      return o;
    });
  }

  function likeToRegExp(pattern, escapeChar) {
    var rx = '', i, c;
    for (i = 0; i < pattern.length; i++) {
      c = pattern[i];
      if (escapeChar && c === escapeChar && i + 1 < pattern.length) {
        rx += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      } else if (c === '%') rx += '[\\s\\S]*';
      else if (c === '_') rx += '[\\s\\S]';
      else rx += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp('^' + rx + '$', 'i');        // SQLite LIKE: ASCII case-insensitive
  }

  // ------------------------------------------------------------------ schema / layout synthesis

  function schemaFor(objectName) {
    if (fixtures.schemas[objectName]) return fixtures.schemas[objectName];
    var rows = rowsFor(objectName) || [];
    var names = {};
    rows.slice(0, 25).forEach(function (r) { Object.keys(r).forEach(function (k) { names[k] = true; }); });
    if (!names.Id) names.Id = true;
    var firstId = rows[0] && rows[0].Id;
    return {
      name: objectName,
      label: humanize(objectName),
      labelPlural: humanize(objectName) + 's',
      keyPrefix: (firstId && String(firstId).slice(0, 3)) || KEY_PREFIXES[objectName] || 'a00',
      custom: /__c$/.test(objectName),
      createable: true, updateable: true, deletable: true, queryable: true,
      fields: Object.keys(names).map(function (n) {
        return {
          name: n, label: humanize(n), type: n === 'Id' ? 'id' : 'string',
          length: 255, nillable: n !== 'Id', createable: n !== 'Id', updateable: n !== 'Id',
          defaultedOnCreate: false, nameField: n === 'Name',
          picklistValues: [], referenceTo: [], relationshipName: null,
          dependentPicklist: false, controllerName: null, inlineHelpText: null,
        };
      }),
      childRelationships: [], recordTypeInfos: [],
    };
  }

  function layoutKey(map, objectName, recordTypeId) {
    if (recordTypeId && map[objectName + ':' + recordTypeId]) return map[objectName + ':' + recordTypeId];
    return map[objectName];
  }

  function synthLayout(objectName) {
    var schema = schemaFor(objectName);
    var fields = schema.fields.filter(function (f) { return f.name !== 'Id'; });
    var rowsOut = [];
    for (var i = 0; i < fields.length; i += 2) {
      var items = fields.slice(i, i + 2).map(function (f) {
        return {
          label: f.label, required: 'FALSE', placeholder: 'FALSE',
          layoutComponents: [{ type: 'Field', value: f.name, components: [], details: f }],
        };
      });
      while (items.length < 2) items.push({ label: '', required: 'FALSE', placeholder: 'TRUE', layoutComponents: [] });
      rowsOut.push({ numItems: 2, layoutItems: items });
    }
    var section = {
      heading: schema.label + ' Details', useHeading: true,
      useCollapsibleSection: false, collapsed: false,
      columns: 2, layoutRows: rowsOut,
    };
    return {
      detailLayoutSections: [section],
      editLayoutSections: [section],
      relatedLists: fixtures.relatedLists[objectName] || [],
    };
  }

  // ------------------------------------------------------------------ built-in request handlers
  // Each returns the DATA payload (what _send resolves), or throws a string -> error envelope.

  var builtins = {

    // ---- data
    read: function (req) {
      var obj = req.object, filters = req.data || {};
      var rows = rowsFor(obj);
      if (!rows) throw 'no fixture rows for object "' + obj + '" — add fixtures.objects.' + obj;
      var keys = Object.keys(filters);
      if (keys.length === 0) info('unfiltered read of ' + obj + ' (kit rule: always filter reads)');
      return rows.filter(function (r) {
        return keys.every(function (k) { return String(r[k]) === String(filters[k]); });
      }).map(function (r) { return Object.assign({}, r); });
    },

    create: function (req) {
      var obj = req.object, fields = req.data || {};
      if (!fixtures.objects[obj]) fixtures.objects[obj] = { rows: [] };
      var row = Object.assign({}, fields, { Id: makeId(obj) });
      fixtures.objects[obj].rows.push(row);
      return row.Id;                              // createResponse data = new Id string
    },

    update: function (req) {
      var obj = req.object, fields = req.data || {};
      var rows = rowsFor(obj) || [];
      var row = rows.filter(function (r) { return r.Id === fields.Id; })[0];
      if (!row) throw 'update: no ' + obj + ' row with Id ' + fields.Id;
      Object.assign(row, fields);
      return fields.Id;
    },

    'delete': function (req) {
      var obj = req.object, id = (req.data || {}).Id;
      var o = fixtures.objects[obj];
      if (!o) throw 'delete: no fixture rows for ' + obj;
      var before = o.rows.length;
      o.rows = o.rows.filter(function (r) { return r.Id !== id; });
      if (o.rows.length === before) throw 'delete: no ' + obj + ' row with Id ' + id;
      return id;
    },

    deletebatch: function (req) {
      var obj = req.object, ids = (req.data || {}).objectIdList || [];
      var results = {}, all = true;
      ids.forEach(function (id) {
        try { builtins['delete']({ object: obj, data: { Id: id } }); results[id] = { objectId: id, success: 'TRUE', error: '' }; }
        catch (e) { all = false; results[id] = { objectId: id, success: 'FALSE', error: String(e) }; }
      });
      return { summary: { success: all ? 'TRUE' : 'FALSE' }, results: results };
    },

    select: function (req) {
      var sql = (req.data || {}).query;
      var res = runSelect(sql, req.object);
      if (res === null) {
        warn('select outside the mock SQL subset — add a fixtures.queryOverrides entry for:\n' + sql);
        throw 'mock: unsupported SQL (see console) — add fixtures.queryOverrides';
      }
      return res;
    },

    updateQuery: function () { throw 'updateQuery is not supported by the browser mock (raw local SQL write) — use fixtures.responses.updateQuery if you must'; },
    soqlquery: function () { throw 'soqlquery (online SOQL) is not supported by the browser mock — use fixtures.responses.soqlquery'; },

    // ---- metadata
    getSObjectSchema: function (req) {
      // The SDK REQUIRES a JSON string here (src/pulsar.js:730-738).
      return JSON.stringify(schemaFor(req.object));
    },

    getLayout: function (req) {
      var d = req.data || {};
      return layoutKey(fixtures.layouts, req.object, d.RecordTypeId) || synthLayout(req.object);
    },

    // Both derive from getLayout(), so fixtures.layouts and LayoutMode are honored.
    getLayoutSections: function (req) {
      var lay = builtins.getLayout(req);
      var mode = ((req.data || {}).LayoutMode === 'edit') ? 'editLayoutSections' : 'detailLayoutSections';
      return (lay[mode] || lay.detailLayoutSections || []).map(function (s, i) {
        return { display: s.useHeading === false ? 'FALSE' : 'TRUE', heading: s.heading || '', section: String(i) };
      });
    },

    getLayoutFields: function (req) {
      var lay = builtins.getLayout(req);
      var mode = ((req.data || {}).LayoutMode === 'edit') ? 'editLayoutSections' : 'detailLayoutSections';
      var out = [], tab = 1;
      (lay[mode] || lay.detailLayoutSections || []).forEach(function (s) {
        (s.layoutRows || []).forEach(function (r) {
          (r.layoutItems || []).forEach(function (item) {
            var isPh = item.placeholder === true || item.placeholder === 'TRUE';
            var comp = (item.layoutComponents || [])[0];
            if (!comp || comp.type !== 'Field') {
              if (isPh) out.push({ displayLines: '1', tabOrder: String(tab++), type: 'string', name: '', label: '', placeHolder: 'TRUE', required: 'FALSE', editableForNew: 'FALSE', editableForUpdate: 'FALSE' });
              return;
            }
            var d = comp.details || {};
            out.push({
              displayLines: '1', tabOrder: String(tab++),
              type: d.type || 'string', name: comp.value || d.name || '',
              label: item.label || d.label || comp.value || '',
              placeHolder: isPh ? 'TRUE' : 'FALSE',
              required: (item.required === true || item.required === 'TRUE') ? 'TRUE' : 'FALSE',
              editableForNew: 'TRUE', editableForUpdate: 'TRUE',
            });
          });
        });
      });
      return out;
    },

    getCompactLayoutFields: function (req) {
      var d = req.data || {};
      var fixed = layoutKey(fixtures.compactLayouts, req.object, d.RecordTypeId);
      if (fixed) return fixed;
      return schemaFor(req.object).fields
        .filter(function (f) { return f.name !== 'Id'; })   // real compact layouts never show raw Id
        .slice(0, 4).map(function (f) { return f.name; });
    },

    getPicklist: function (req) {
      var key = req.object + '.' + req.fieldName;   // fieldName is a TOP-LEVEL request key
      var pk = fixtures.picklists[key];
      if (!pk) throw 'no fixture picklist for "' + key + '" — add fixtures.picklists["' + key + '"]';
      return { itemIds: pk.itemIds.slice(), itemLabels: pk.itemLabels.slice() };
    },
    getUnfilteredPicklist: function (req) { return builtins.getPicklist(req); },

    listviewInfo: function (req) {
      var views = fixtures.listviews[req.object];
      if (!views) throw 'no fixture listviews for "' + req.object + '"';
      var out = {};
      Object.keys(views).forEach(function (id) { out[id] = views[id].label; });
      return out;
    },

    listviewmetadata: function (req) {
      var d = req.data || {};
      var views = fixtures.listviews[req.object] || {};
      var v = views[d.listviewid];
      if (!v) throw 'no fixture listview "' + d.listviewid + '" for "' + req.object + '"';
      return {
        fields: v.fields || [], labels: v.labels || v.fields || [],
        filters: v.filters || '', whereClause: v.whereClause || '',
        orderBy: v.orderBy || '', listId: d.listviewid,
      };
    },

    getFieldSets: function () {
      // A function fixtures.responses.getFieldSets is handled by dispatch step 1.
      throw 'no fieldset fixtures — add fixtures.responses.getFieldSets';
    },

    // ---- environment / info
    userInfo: function () {
      return Object.assign({
        userid: '005MOCK00000000000', username: 'dev@example.mock',
        userfullname: 'Mock Developer', userlanguage: 'en_US', devicelanguage: 'en-US',
        locale: 'en_US', organizationid: '00DMOCK00000000000', version: '99.0.0 (mock)',
        instanceurl: 'https://example.mock', sessionid: 'MOCK-SESSION',
        lastsuccessfulsync: new Date(Date.now() - 3600e3).toISOString(),
        lastfailedsync: '1970-01-01T00:00:00.000Z',
        orgDefaultCurrencyIsoCode: 'USD',
      }, fixtures.userInfo);
    },
    userPhoto: function () {
      return { smallphoto: placeholderSvg('photo', 64, 64), fullphoto: placeholderSvg('photo', 200, 200) };
    },
    getPlatform: function () { return fixtures.platform; },
    getPlatformFeatures: function () {
      return [{ featureName: 'fieldservice', isAvailable: 'FALSE' }];
    },
    getDevServerEnabled: function () { return 'FALSE'; },
    getSetting: function (req) {
      var key = (req.data || {}).key;
      if (Object.prototype.hasOwnProperty.call(fixtures.settings, key)) {
        var out = { Exists: 'TRUE' }; out[key] = fixtures.settings[key]; return out;
      }
      return { Exists: 'FALSE' };
    },
    getSettingAttachment: function (req) {
      var key = (req.data || {}).key;
      var att = fixtures.settingAttachments[key];
      if (!att) throw 'no setting attachment fixture for "' + key + '"';
      var out = { FileName: att.FileName || key, FilePath: att.FilePath || '/mock/' + key };
      out[key] = att.content || ''; return out;
    },
    getCustomLabels: function (req) {
      var names = (req.data || {}).labelNames || [];
      var out = {};
      names.forEach(function (n) { out[n] = fixtures.customLabels[n] != null ? fixtures.customLabels[n] : n; });
      return out;
    },
    getLocation: function () { return Object.assign({}, fixtures.location); },
    logMessage: function (req) {
      var d = req.data || {};
      info('logMessage [' + (d.level || 'info') + ']', d.message);
      return null;
    },

    // ---- online / sync
    getOnlineStatus: function () { return state.online ? 'TRUE' : 'FALSE'; },
    setOnlineStatus: function (req) { state.online = req.data === 'TRUE'; return state.online ? 'TRUE' : 'FALSE'; },
    getNetworkStatus: function () {
      return { isConnected: state.online ? 'TRUE' : 'FALSE', connectionType: state.online ? 'wifi' : 'none' };
    },
    syncstatus: function () { return { syncrunning: state.syncRunning ? 'TRUE' : 'FALSE' }; },
    syncinfo: function () {
      // Override wholesale via fixtures.responses.syncinfo when specific fields matter.
      return {
        lastsuccessfulsync: new Date(Date.now() - 3600e3).toISOString(),
        lastfailedsync: '1970-01-01T00:00:00.000Z', lastsyncsuccess: 'YES',
        localchangespendingcount: '0', syncdomaintype: 'all', syncwindowtype: 'catchup',
        lastfailedsyncerrorcode: '0',
      };
    },
    syncdata: function () {
      if (fixtures.autoSimulateSync !== false) startSync({});
      else state.syncRunning = true;
      return 'successfully requested sync (mock)';
    },
    interruptsync: function () {
      var was = state.syncRunning;
      state.syncRunning = false;
      return { success: was };                    // REAL boolean, per SDK contract
    },
    getAutosyncStatus: function () { return state.autosync ? 'TRUE' : 'FALSE'; },
    setAutosyncStatus: function (req) { state.autosync = req.data === 'TRUE'; return state.autosync ? 'TRUE' : 'FALSE'; },

    // ---- files & content
    queryContent: function (req) {
      var filter = String((req.data || {}).filter || '');
      // Only QUOTED tokens count as ids — bare identifiers like ContentDocumentId must not match.
      var ids = (filter.match(/'([a-zA-Z0-9]{15,18})'/g) || []).map(function (s) { return s.slice(1, -1); });
      var files = fixtures.files.filter(function (f) {
        var linked = (f.LinkedEntityIds || []).concat([f.Id, f.ContentDocumentId]).filter(Boolean);
        return ids.length === 0 || linked.some(function (id) { return ids.indexOf(id) !== -1; });
      });
      if (files.length === 0 && ids.length > 0) info('queryContent matched no fixture files for filter:', filter);
      return files.map(fileToContentVersion);
    },
    readSFFile: function (req) {
      var id = (req.data || {}).Id;
      var f = fixtures.files.filter(function (x) { return x.Id === id || x.ContentDocumentId === id; })[0];
      if (!f) throw 'no fixture file with Id ' + id;
      return [fileToContentVersion(f)];
    },
    createSFFile: function (req) { return addMockFile(req.data || {}).ContentDocumentId; },
    createSFFileFromFilePath: function (req) { return sfFileResult(addMockFile(req.data || {})); },
    createSFFileFromCamera: function (req) { return sfFileResult(addMockFile(Object.assign({ Name: 'camera.jpg' }, req.data || {}))); },
    createSFFileBatch: function (req) { return batchCreate(req.data || []); },
    createSFFileFromFilePathBatch: function (req) { return batchCreate(req.data || []); },
    deleteSFFile: function (req) {
      var ids = (req.data || {}).documentIdList || [];
      fixtures.files = fixtures.files.filter(function (f) {
        return ids.indexOf(f.Id) === -1 && ids.indexOf(f.ContentDocumentId) === -1;
      });
      return { success: true };                   // SDK accepts boolean true
    },
    getContentUrl: function (req) {
      var d = req.data || {};
      var hit = fixtures.contentUrls[d.Id] || fixtures.contentUrls[d.Title];
      if (hit) return hit;
      return { url: placeholderSvg(d.Title || d.Id || 'content'), title: d.Title || String(d.Id || 'content') };
    },
    chattergetfeed: function (req) {
      var pid = (req.data || {}).ParentId;
      return (fixtures.chatter[pid] || []).slice();
    },
    chatterpostfeed: function (req) {
      var d = req.data || {};
      var pid = d.Parent;
      if (!fixtures.chatter[pid]) fixtures.chatter[pid] = [];
      fixtures.chatter[pid].unshift({ Body: d.Message, ParentId: pid, CommentCount: '0', LikeCount: '0' });
      return null;
    },

    // ---- native UI & device (ack-log no-ops; benign but SHAPE-correct resolves)
    saveAs: function (req) {
      info('saveAs (no real PDF in the mock)', req.data);
      return { FilePath: '/mock/documents/' + ((req.data || {}).filename || 'mock.pdf') };
    },
    scanBarcode: function () { return { barcode: fixtures.barcode }; }, // SDK unwraps data['barcode']
    cameraPhoto: function () { return photoMeta('camera.jpg'); },
    cameraPhotoPicker: function () { return [photoMeta('gallery-1.jpg'), photoMeta('gallery-2.jpg')]; },
    filePicker: function () { return [photoMeta('picked-file.pdf')]; },
    viewObject: function (req) { return ackUi('viewObject', req); },
    showCreate: function (req) { info('showCreate', req); return { createResult: 'FALSE', createId: '' }; },
    viewRelated: function (req) { return ackUi('viewRelated', req); },
    viewList: function (req) { return ackUi('viewList', req); },
    lookupObject: function (req) {
      var rows = rowsFor(req.object) || [];
      info('lookupObject: auto-selecting first fixture ' + req.object + ' row');
      return rows.length ? [Object.assign({}, rows[0])] : [];
    },
    executeQuickAction: function (req) { info('executeQuickAction', req); return { executed: true, quickActionResult: true }; }, // BOTH real booleans (documented exception)
    displayUrl: function (req) { return ackUi('displayUrl', req); },
    mail: function (req) { return ackUi('mail', req); },
    setLeavePageMessage: function (req) { return ackUi('setLeavePageMessage', req); },
    exit: function (req) { return ackUi('exit', req); },
  };

  function ackUi(name, req) { info(name + ' (no-op in browser mock)', req && req.data); return {}; }

  function photoMeta(name) {
    var url = placeholderSvg(name);
    return { ContentType: 'image/svg+xml', FileName: name, FilePath: '/mock/' + name, FileURL: url, RelativeFilePath: 'mock/' + name };
  }

  function fileToContentVersion(f) {
    var url = f.FileURL || placeholderSvg(f.Title || 'file');
    return Object.assign({
      Id: f.Id, ContentDocumentId: f.ContentDocumentId || f.Id, Title: f.Title || 'Mock file',
      FileURL: url, ThumbURL: f.ThumbURL != null ? f.ThumbURL : url,
      FilePath: f.FilePath || '/mock/' + (f.Title || 'file'), ThumbPath: f.ThumbPath || '',
      FileExtension: f.FileExtension || 'svg', ContentSize: f.ContentSize || '1024',
    }, f.extra || {});
  }

  function addMockFile(data) {
    var docId = makeId('ContentDocument');
    var f = {
      Id: makeId('ContentVersion'), ContentDocumentId: docId,
      Title: data.Name || 'upload', LinkedEntityIds: data.ParentId ? [data.ParentId] : [],
      FileURL: placeholderSvg(data.Name || 'upload'),
    };
    fixtures.files.push(f);
    return f;
  }

  function sfFileResult(f) {
    return { AttachmentId: f.Id, ContentDocumentId: f.ContentDocumentId, ContentVersionId: f.Id, FileURL: f.FileURL };
  }

  function batchCreate(list) {
    var results = {}, all = true;
    list.forEach(function (entry, i) {
      try {
        var f = addMockFile(entry || {});
        results[String(i)] = { objectId: f.ContentDocumentId, success: 'TRUE', FileURL: f.FileURL };
      } catch (e) { all = false; results[String(i)] = { success: 'FALSE', error: String(e) }; }
    });
    return { summary: { success: all ? 'TRUE' : 'FALSE' }, results: results };
  }

  // ------------------------------------------------------------------ the bridge

  function respond(cb, type, data) {
    queueMicrotask(function () { cb({ type: type, data: data }); });
  }

  var mockBridge = {
    version: 'pulsar-browser-mock/1 (13.0)',      // defined -> SDK skips legacy bridge.init()
    init: function () { /* legacy no-op */ },

    send: function (request, cb) {
      var type = request && request.type;
      var entry = { type: type, request: request, response: null };
      log.push(entry); if (log.length > LOG_MAX) log.shift();

      function ok(data) { entry.response = data; respond(cb, String(type) + 'Response', data); }
      function fail(msg) { entry.response = { error: msg }; respond(cb, 'error', String(msg)); }

      try {
        // 1. per-app full override
        var override = fixtures.responses[type];
        if (typeof override === 'function') return ok(override(request));

        // 2. query overrides for select / queryContent / read
        if ((type === 'select' || type === 'queryContent' || type === 'read') && fixtures.queryOverrides.length) {
          var probe = type === 'select' ? String((request.data || {}).query || '')
            : type === 'queryContent' ? String((request.data || {}).filter || '')
            : JSON.stringify(request.data || {});
          var norm = probe.replace(/\s+/g, ' ').trim();
          for (var i = 0; i < fixtures.queryOverrides.length; i++) {
            var qo = fixtures.queryOverrides[i];
            if (qo.type && qo.type !== type) continue;   // optional scoping: 'select' | 'read' | 'queryContent'
            var hit = qo.match instanceof RegExp ? qo.match.test(norm)
              : norm.indexOf(String(qo.match).replace(/\s+/g, ' ').trim()) !== -1;
            if (hit) return ok(typeof qo.fn === 'function' ? qo.fn(request) : (qo.rows || []).slice());
          }
        }

        // 3. built-ins
        var handler = builtins[type];
        if (handler) return ok(handler(request));

        // 4. surface the gap loudly
        warn('unhandled request type "' + type + '" — add fixtures.responses["' + type + '"]', request);
        return fail('mock: unhandled request type "' + type + '"');
      } catch (e) {
        return fail(typeof e === 'string' ? e : (e && e.message) || 'mock error');
      }
    },

    registerHandler: function (name, fn) { handlers[name] = fn; },
    deregisterHandler: function (name) { delete handlers[name]; },
  };

  // ------------------------------------------------------------------ install

  function mergeFixtures(user) {
    var out = {};
    Object.keys(FIXTURE_DEFAULTS).forEach(function (k) {
      var d = FIXTURE_DEFAULTS[k], u = user && user[k];
      if (u === undefined) out[k] = Array.isArray(d) ? d.slice() : (d && typeof d === 'object' ? Object.assign({}, d) : d);
      else if (d && typeof d === 'object' && !Array.isArray(d) && u && typeof u === 'object' && !Array.isArray(u)) out[k] = Object.assign({}, d, u);
      else out[k] = u;
    });
    return out;
  }

  function install(opts) {
    opts = opts || {};
    if (state.installed) { warn('install() called twice — ignoring'); return api; }
    fixtures = mergeFixtures(opts.fixtures);
    state.online = fixtures.online !== false;
    state.mode = opts.mode || 'embedded-parent';
    state.installed = true;

    if (state.mode === 'embedded-parent') {
      // The SFS-embedded contract the SDK checks FIRST (src/pulsar.js:23):
      // an iframed app finds window.parent.pulsar.bridge. Sync handlers are the
      // four embedded-safe delegates the SDK routes to (66-120).
      window.pulsar = {
        bridge: mockBridge,
        addSyncDataUpdateHandler: function (fn) { handlers.syncDataUpdate = fn; },
        removeSyncDataUpdateHandler: function () { delete handlers.syncDataUpdate; },
        addSyncFinishedHandler: function (fn) { handlers.syncDataFinished = fn; },
        removeSyncFinishedHandler: function () { delete handlers.syncDataFinished; },
      };
      info('installed (embedded-parent): load the app in an iframe of THIS page');
    } else if (state.mode === 'native') {
      if (window.pulsar) warn('window.pulsar already exists — the SDK will misdetect embedded context (window.parent === window at top level)');
      var mkEvent = function () { return Object.assign(new Event('WebViewJavascriptBridgeReady'), { bridge: mockBridge }); };
      // Late registrations: the SDK adds its listener whenever init() runs, possibly
      // after this dispatch — intercept and fire on a microtask.
      var origAdd = document.addEventListener.bind(document);
      document.addEventListener = function (name, fn, opts2) {
        if (name === 'WebViewJavascriptBridgeReady') {
          queueMicrotask(function () { fn(mkEvent()); });
          return;
        }
        return origAdd(name, fn, opts2);
      };
      document.dispatchEvent(mkEvent());          // anyone already listening
      info('installed (native): WebViewJavascriptBridgeReady will fire for the SDK');
    } else {
      throw new Error(TAG + ' unknown mode "' + state.mode + '"');
    }
    return api;
  }

  // ------------------------------------------------------------------ public API

  var api = {
    install: install,
    get fixtures() { return fixtures; },
    state: state,
    bridge: mockBridge,
    log: log,
    setOnline: function (b) { state.online = !!b; },
    startSync: startSync,
    fireSyncUpdate: fireSyncUpdate,
    finishSync: finishSync,
    fireHandler: fireHandler,
    placeholderSvg: placeholderSvg,
  };

  window.__pulsarMock = api;
})();
