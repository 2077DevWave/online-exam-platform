// src/database.ts
import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'exam.db');

let db: Database;

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

    // Migrations for new columns and tables
    const migrations = [
      `ALTER TABLE exams ADD COLUMN shuffle_questions INTEGER DEFAULT 1`,
      `ALTER TABLE exams ADD COLUMN shuffle_options INTEGER DEFAULT 1`,
      `ALTER TABLE exams ADD COLUMN status TEXT DEFAULT 'published'`,
      `ALTER TABLE exams ADD COLUMN password TEXT`,
      `CREATE TABLE IF NOT EXISTS exam_students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER NOT NULL,
        student_id TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
      )`
    ];
    for (const sql of migrations) {
      try { db.run(sql); } catch (e) { /* column/table may already exist */ }
    }
  } else {
    db = new SQL.Database();
    db.run(`
      CREATE TABLE IF NOT EXISTS teachers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS exams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teacher_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        require_name BOOLEAN DEFAULT 1,
        require_student_id BOOLEAN DEFAULT 0,
        allow_multiple_submissions BOOLEAN DEFAULT 1,
        shuffle_questions BOOLEAN DEFAULT 1,
        shuffle_options BOOLEAN DEFAULT 1,
        status TEXT DEFAULT 'published' CHECK(status IN ('draft','published')),
        password TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
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

      CREATE TABLE IF NOT EXISTS exam_students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER NOT NULL,
        student_id TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
      );
    `);
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

export async function insertRow(sql: string, params: any[]): Promise<number> {
  const db = await getDb();
  db.run(sql, params);
  const result = db.exec('SELECT last_insert_rowid() as id');
  if (result.length && result[0].values.length) {
    return result[0].values[0][0] as number;
  }
  throw new Error('Insert failed');
}

setInterval(saveDb, 30_000);
process.on('exit', saveDb);
process.on('SIGINT', () => { saveDb(); process.exit(); });
process.on('SIGTERM', () => { saveDb(); process.exit(); });