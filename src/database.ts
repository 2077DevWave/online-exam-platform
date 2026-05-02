// src/database.ts
import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', 'data', 'exam.db');

let db: Database;

export async function getDb(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();

  // Try to load existing database file
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    // Create a new database
    db = new SQL.Database();
    // Create core tables
    db.run(`
      CREATE TABLE IF NOT EXISTS exams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        require_name BOOLEAN DEFAULT 1,
        require_student_id BOOLEAN DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER NOT NULL,
        text TEXT NOT NULL,
        option_a TEXT NOT NULL,
        option_b TEXT NOT NULL,
        option_c TEXT NOT NULL,
        option_d TEXT NOT NULL,
        correct_option TEXT CHECK(correct_option IN ('A','B','C','D')) NOT NULL,
        FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER NOT NULL,
        student_name TEXT,
        student_id TEXT,
        score REAL,
        total_questions INTEGER,
        started_at TEXT,
        finished_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (exam_id) REFERENCES exams(id)
      );

      CREATE TABLE IF NOT EXISTS answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        submission_id INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        selected_option TEXT,
        is_correct BOOLEAN,
        FOREIGN KEY (submission_id) REFERENCES submissions(id),
        FOREIGN KEY (question_id) REFERENCES questions(id)
      );
    `);
  }

  return db;
}

// Add this function inside database.ts (before saveDb)
export async function insertRow(sql: string, params: any[]): Promise<number> {
  const db = await getDb();
  db.run(sql, params);
  // retrieve last inserted id
  const result = db.exec('SELECT last_insert_rowid() as id');
  if (result.length && result[0].values.length) {
    return result[0].values[0][0] as number;
  }
  throw new Error('Insert failed');
}

// Save the database to disk
export function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, buffer);
  }
}

// Periodic save (every 30 seconds) and on exit
setInterval(saveDb, 30_000);
process.on('exit', saveDb);
process.on('SIGINT', () => { saveDb(); process.exit(); });
process.on('SIGTERM', () => { saveDb(); process.exit(); });