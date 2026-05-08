// src/database.ts
import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { env } from './config/env';
import { BASE_SCHEMA_SQL, SCHEMA_VERSION } from './database/schema';

const DB_PATH = env.dbPath;

let db: Database | undefined;
let autosaveTimer: NodeJS.Timeout | null = null;

function tableExists(database: Database, tableName: string): boolean {
  const stmt = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?");
  stmt.bind([tableName]);
  const exists = stmt.step();
  stmt.free();
  return exists;
}

function columnExists(database: Database, tableName: string, columnName: string): boolean {
  const stmt = database.prepare(`PRAGMA table_info(${tableName})`);
  while (stmt.step()) {
    const row = stmt.getAsObject() as any;
    if (row.name === columnName) {
      stmt.free();
      return true;
    }
  }
  stmt.free();
  return false;
}

function applySchema(database: Database) {
  database.run('PRAGMA foreign_keys = ON');
  database.run(BASE_SCHEMA_SQL);
}

function insertLegacyQuestionItem(
  database: Database,
  text: string,
  correctOption: string,
  optionA: string,
  optionB: string,
  optionC: string,
  optionD: string
): number {
  database.run(
    'INSERT INTO question_items (text, correct_option) VALUES (?, ?)',
    [text, correctOption]
  );
  const itemIdResult = database.exec('SELECT last_insert_rowid() AS id');
  const questionItemId = itemIdResult[0].values[0][0] as number;

  database.run(
    `INSERT INTO question_item_options (question_item_id, option_key, option_text)
     VALUES
     (?, 'A', ?),
     (?, 'B', ?),
     (?, 'C', ?),
     (?, 'D', ?)`,
    [
      questionItemId, optionA,
      questionItemId, optionB,
      questionItemId, optionC,
      questionItemId, optionD
    ]
  );
  return questionItemId;
}

function migrateFromLegacySchema(database: Database) {
  const hasLegacyQuestions = tableExists(database, 'questions');
  const hasLegacyQuestionBank = tableExists(database, 'question_bank');
  const hasLegacyAnswers = tableExists(database, 'answers');

  if (!hasLegacyQuestions && !hasLegacyQuestionBank && !hasLegacyAnswers) {
    return;
  }

  database.run('BEGIN TRANSACTION');
  try {
    if (hasLegacyQuestionBank) {
      const stmt = database.prepare(
        'SELECT id, teacher_id, text, option_a, option_b, option_c, option_d, correct_option, tags, created_at FROM question_bank'
      );
      while (stmt.step()) {
        const row = stmt.getAsObject() as any;
        const questionItemId = insertLegacyQuestionItem(
          database,
          row.text,
          row.correct_option,
          row.option_a,
          row.option_b,
          row.option_c,
          row.option_d
        );
        database.run(
          'INSERT INTO question_bank_entries (id, teacher_id, question_item_id, tags, created_at) VALUES (?, ?, ?, ?, ?)',
          [row.id, row.teacher_id, questionItemId, row.tags || null, row.created_at || null]
        );
      }
      stmt.free();
    }

    if (hasLegacyQuestions) {
      const stmt = database.prepare(
        'SELECT id, exam_id, text, option_a, option_b, option_c, option_d, correct_option FROM questions ORDER BY id'
      );
      while (stmt.step()) {
        const row = stmt.getAsObject() as any;
        const questionItemId = insertLegacyQuestionItem(
          database,
          row.text,
          row.correct_option,
          row.option_a,
          row.option_b,
          row.option_c,
          row.option_d
        );
        database.run('INSERT INTO exam_questions (id, exam_id, question_item_id, position) VALUES (?, ?, ?, ?)', [
          row.id,
          row.exam_id,
          questionItemId,
          row.id
        ]);
      }
      stmt.free();
    }

    if (hasLegacyAnswers) {
      database.run(
        `INSERT INTO submission_answers (id, submission_id, exam_question_id, selected_option, is_correct)
         SELECT id, submission_id, question_id, selected_option, is_correct
         FROM answers`
      );
    }

    database.run('DROP TABLE IF EXISTS answers');
    database.run('DROP TABLE IF EXISTS questions');
    database.run('DROP TABLE IF EXISTS question_bank');
    database.run('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [2, 'normalized-question-structure']);
    database.run('COMMIT');
  } catch (error) {
    database.run('ROLLBACK');
    throw error;
  }
}

function ensureSchema(database: Database) {
  applySchema(database);
  const hasMigrations = tableExists(database, 'schema_migrations');
  if (!hasMigrations) {
    return;
  }
  const versionStmt = database.prepare('SELECT COALESCE(MAX(version), 0) as version FROM schema_migrations');
  versionStmt.step();
  const currentVersion = Number((versionStmt.getAsObject() as any).version || 0);
  versionStmt.free();

  if (currentVersion === 0) {
    migrateFromLegacySchema(database);
    const vStmt = database.prepare('SELECT COALESCE(MAX(version), 0) as version FROM schema_migrations');
    vStmt.step();
    const migratedVersion = Number((vStmt.getAsObject() as any).version || 0);
    vStmt.free();
    if (migratedVersion === 0) {
      database.run('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [SCHEMA_VERSION, 'bootstrap']);
    }
  }

  if (!columnExists(database, 'exam_questions', 'weight')) {
    database.run('ALTER TABLE exam_questions ADD COLUMN weight REAL NOT NULL DEFAULT 1.0');
  }
  if (!columnExists(database, 'exam_questions', 'negative_mark')) {
    database.run('ALTER TABLE exam_questions ADD COLUMN negative_mark REAL NOT NULL DEFAULT 0.0');
  }
  if (!columnExists(database, 'submission_answers', 'awarded_points')) {
    database.run('ALTER TABLE submission_answers ADD COLUMN awarded_points REAL NOT NULL DEFAULT 0.0');
  }
  if (!columnExists(database, 'submission_answers', 'penalty_points')) {
    database.run('ALTER TABLE submission_answers ADD COLUMN penalty_points REAL NOT NULL DEFAULT 0.0');
  }
  if (!columnExists(database, 'submission_answers', 'needs_review')) {
    database.run('ALTER TABLE submission_answers ADD COLUMN needs_review BOOLEAN NOT NULL DEFAULT 0');
  }
  if (!columnExists(database, 'submission_answers', 'reviewer_override_is_correct')) {
    database.run('ALTER TABLE submission_answers ADD COLUMN reviewer_override_is_correct BOOLEAN');
  }
  if (!columnExists(database, 'submission_answers', 'reviewer_note')) {
    database.run('ALTER TABLE submission_answers ADD COLUMN reviewer_note TEXT');
  }
  if (!columnExists(database, 'submission_answers', 'reviewed_by_teacher_id')) {
    database.run('ALTER TABLE submission_answers ADD COLUMN reviewed_by_teacher_id INTEGER');
  }
  if (!columnExists(database, 'submission_answers', 'reviewed_at')) {
    database.run('ALTER TABLE submission_answers ADD COLUMN reviewed_at TEXT');
  }

  database.run(
    'INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)',
    [SCHEMA_VERSION, 'weighted-scoring-and-attempt-foundation']
  );
}

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
    ensureSchema(db);
  } else {
    db = new SQL.Database();
    ensureSchema(db);
    db.run('INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)', [SCHEMA_VERSION, 'bootstrap']);
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