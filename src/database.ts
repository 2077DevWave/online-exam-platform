// src/database.ts
import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { env } from './config/env';
import { SAFE_MIGRATIONS, SCHEMA_SQL } from './database/schema';

const DB_PATH = env.dbPath;

let db: Database | undefined;
let autosaveTimer: NodeJS.Timeout | null = null;

export async function getDb(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);

    for (const sql of SAFE_MIGRATIONS) {
      try {
        db.run(sql);
      } catch (_e) {
        // Column/table may already exist in upgraded databases.
      }
    }
  } else {
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    saveDb();
  }

  return db;
}

export function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_PATH, buffer);
  }
}

export function resetDbForTests() {
  if (db) {
    db.close();
  }
  db = undefined;
}

export async function insertRow(sql: string, params: any[]): Promise<number> {
  const db = await getDb();
  db.run(sql, params);
  const result = db.exec('SELECT last_insert_rowid() as id');
  if (result.length && result[0].values.length) {
    return result[0].values[0][0] as number;
  }
  throw new Error('Insert failed');
}

autosaveTimer = setInterval(saveDb, 30_000);
autosaveTimer.unref();
process.on('exit', saveDb);
process.on('SIGINT', () => { saveDb(); process.exit(); });
process.on('SIGTERM', () => { saveDb(); process.exit(); });