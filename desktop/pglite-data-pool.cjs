'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

/** Persistent PGlite pool (offline DB under userData). */
async function createPool(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = await PGlite.create(dataDir);
  let tail = Promise.resolve();
  async function acquire() {
    const previous = tail;
    let release;
    tail = new Promise(resolve => { release = resolve; });
    await previous;
    return release;
  }
  async function runQuery(sql, params) {
    if (!params && sql.includes(';')) {
      const results = await db.exec(sql);
      return results.at(-1) || { rows: [] };
    }
    return db.query(sql, params);
  }
  return {
    async query(sql, params) {
      const release = await acquire();
      try { return await runQuery(sql, params); } finally { release(); }
    },
    async connect() {
      const release = await acquire();
      return { query: runQuery, release };
    },
    async end() {
      await tail;
      await db.close();
    },
  };
}

module.exports = { createPool };
