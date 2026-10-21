'use strict';
const { dayStart, nextDay, cairoDate } = require('../shared/time.cjs');
const { requireValue } = require('./errors.cjs');

function cairoHour(iso) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: 'numeric', hour12: false }).format(new Date(iso)));
}

function tallySoldiers(rows) {
  const snapshot = { total: 0, inside: 0, outside: 0, archived: 0, byCompany: [] };
  const companies = new Map();
  for (const s of rows) {
    if (s.archived) {
      snapshot.archived++;
      continue;
    }
    snapshot.total++;
    if (s.status === 'in') snapshot.inside++;
    else snapshot.outside++;
    const c = (s.company || '').trim() || '—';
    companies.set(c, (companies.get(c) || 0) + 1);
  }
  snapshot.byCompany = [...companies.entries()].map(([company, count]) => ({ company, count })).sort((a, b) => b.count - a.count);
  return snapshot;
}

function bucketGate(events) {
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, entries: 0, exits: 0 }));
  const byReason = new Map();
  for (const e of events) {
    const h = cairoHour(e.at);
    if (e.kind === 'entry') byHour[h].entries++;
    else byHour[h].exits++;
    const reason = e.reason || '—';
    byReason.set(reason, (byReason.get(reason) || 0) + 1);
  }
  return {
    entries: events.filter(e => e.kind === 'entry').length,
    exits: events.filter(e => e.kind === 'exit').length,
    total: events.length,
    byHour,
    byReason: [...byReason.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 12),
    recent: events.slice(0, 30).map(e => ({
      at: e.at,
      kind: e.kind,
      name: e.name,
      military_no: e.military_no,
      reason: e.reason,
    })),
  };
}

function tallyFood(rows, kind) {
  const outlets = new Map();
  let totalCents = 0;
  let transactions = 0;
  let reversals = 0;
  for (const r of rows) {
    if (r.kind !== kind) continue;
    transactions++;
    totalCents += r.amount_cents;
    if (r.reversal_of || r.amount_cents < 0) reversals++;
    const name = r.outlet_name || '—';
    const o = outlets.get(name) || { name, count: 0, totalCents: 0 };
    o.count++;
    o.totalCents += r.amount_cents;
    outlets.set(name, o);
  }
  return {
    transactions,
    totalCents,
    reversals,
    outlets: [...outlets.values()].sort((a, b) => b.totalCents - a.totalCents),
    recent: rows.filter(r => r.kind === kind).slice(0, 25).map(r => ({
      at: r.at,
      outlet_name: r.outlet_name,
      name: r.name,
      military_no: r.military_no,
      amount_cents: r.amount_cents,
      notes: r.notes,
    })),
  };
}

function tallyVisitors(rows) {
  const byCategory = new Map();
  let checkIns = rows.length;
  let checkOuts = 0;
  let stillInside = 0;
  for (const v of rows) {
    if (v.check_out) checkOuts++;
    else stillInside++;
    const cat = v.category_name || '—';
    byCategory.set(cat, (byCategory.get(cat) || 0) + 1);
  }
  return {
    checkIns,
    checkOuts,
    stillInside,
    byCategory: [...byCategory.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
    recent: rows.slice(0, 25).map(v => ({
      at: v.check_in,
      check_out: v.check_out,
      name: v.name,
      badge_no: v.badge_no,
      category_name: v.category_name,
      purpose: v.purpose,
    })),
  };
}

function tallyFitness(rows) {
  const byType = new Map();
  for (const r of rows) byType.set(r.type, (byType.get(r.type) || 0) + 1);
  return {
    records: rows.length,
    byType: [...byType.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    recent: rows.slice(0, 20).map(r => ({
      date: r.date,
      type: r.type,
      value: r.value,
      unit: r.unit,
      name: r.name,
      military_no: r.military_no,
    })),
  };
}

async function buildDailyReport(store, date) {
  requireValue(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date), 'تاريخ غير صالح');
  const start = dayStart(date);
  const end = dayStart(nextDay(date));
  const pool = store.pool;

  const settingsRow = (await pool.query('SELECT data FROM settings WHERE id=1')).rows[0];
  const settings = settingsRow?.data || {};

  const [soldierRows, permitRow, gateRows, foodRows, visitorRows, fitnessRows, outletRows, auditRows] = await Promise.all([
    pool.query('SELECT status, archived, company FROM soldiers'),
    pool.query(`SELECT COUNT(*)::int AS active_outside,
      COUNT(*) FILTER (WHERE expected_return < now())::int AS late
      FROM permits WHERE returned_at IS NULL AND voided=false`),
    pool.query(`SELECT e.kind, e.at, p.reason, s.name, s.military_no
      FROM gate_events e
      JOIN permits p ON p.id=e.permit_id
      JOIN soldiers s ON s.id=e.soldier_id
      WHERE e.at >= $1 AND e.at < $2
      ORDER BY e.at DESC`, [start, end]),
    pool.query(`SELECT t.at, t.amount_cents, t.reversal_of, t.notes, o.name AS outlet_name, o.kind,
      s.name, s.military_no
      FROM canteen_transactions t
      JOIN food_outlets o ON o.id=t.outlet_id
      JOIN soldiers s ON s.id=t.soldier_id
      WHERE t.at >= $1 AND t.at < $2
      ORDER BY t.at DESC`, [start, end]),
    pool.query(`SELECT vv.check_in, vv.check_out, vv.purpose, v.name, v.badge_no, c.name AS category_name
      FROM visitor_visits vv
      JOIN visitors v ON v.id=vv.visitor_id
      JOIN visitor_categories c ON c.id=v.category_id
      WHERE vv.check_in >= $1 AND vv.check_in < $2 AND NOT vv.voided
      ORDER BY vv.check_in DESC`, [start, end]),
    pool.query(`SELECT f.date, f.type, f.value, f.unit, s.name, s.military_no
      FROM fitness_records f
      JOIN soldiers s ON s.id=f.soldier_id
      WHERE f.date = $1
      ORDER BY f.date DESC`, [date]),
    pool.query(`SELECT kind, COUNT(*)::int AS count FROM food_outlets WHERE NOT disabled GROUP BY kind`),
    pool.query(`SELECT a.at, a.action, u.name AS username
      FROM audit_log a JOIN users u ON u.id=a.user_id
      WHERE a.at >= $1 AND a.at < $2
      ORDER BY a.at DESC LIMIT 15`, [start, end]),
  ]);

  const outlets = { canteen: 0, buffet: 0 };
  for (const r of outletRows.rows) outlets[r.kind] = r.count;

  const gate = bucketGate(gateRows.rows);
  const food = foodRows.rows;
  const canteen = tallyFood(food, 'canteen');
  const buffet = tallyFood(food, 'buffet');

  const out = {
    date,
    generatedAt: new Date().toISOString(),
    unit: {
      name: settings.unitName || 'الوحدة',
      parentFormation: settings.parentFormation || '',
    },
    snapshot: {
      soldiers: tallySoldiers(soldierRows.rows),
      permits: {
        activeOutside: permitRow.rows[0]?.active_outside || 0,
        late: permitRow.rows[0]?.late || 0,
      },
      outlets,
    },
    activity: {
      gate,
      visitors: tallyVisitors(visitorRows.rows),
      canteen,
      buffet,
      fitness: tallyFitness(fitnessRows.rows),
    },
    audit: auditRows.rows.map(r => ({ at: r.at, action: r.action, username: r.username })),
  };
  return out;
}

module.exports = { buildDailyReport, cairoDate };
