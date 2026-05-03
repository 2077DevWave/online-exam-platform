"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.saveDb = saveDb;
exports.insertRow = insertRow;
// src/database.ts
const sql_js_1 = __importDefault(require("sql.js"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DB_PATH = process.env.DB_PATH || path_1.default.join(__dirname, '..', 'data', 'exam.db');
let db;
async function getDb() {
    if (db)
        return db;
    const SQL = await (0, sql_js_1.default)();
    // Ensure the directory exists
    const dir = path_1.default.dirname(DB_PATH);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
    if (fs_1.default.existsSync(DB_PATH)) {
        const fileBuffer = fs_1.default.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
    }
    else {
        db = new SQL.Database();
        // Core tables
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
    `);
        // Save initial empty DB
        saveDb();
    }
    return db;
}
function saveDb() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        const dir = path_1.default.dirname(DB_PATH);
        if (!fs_1.default.existsSync(dir)) {
            fs_1.default.mkdirSync(dir, { recursive: true });
        }
        fs_1.default.writeFileSync(DB_PATH, buffer);
    }
}
// Helper to get last inserted row id
async function insertRow(sql, params) {
    const db = await getDb();
    db.run(sql, params);
    const result = db.exec('SELECT last_insert_rowid() as id');
    if (result.length && result[0].values.length) {
        return result[0].values[0][0];
    }
    throw new Error('Insert failed');
}
// Periodic save
setInterval(saveDb, 30000);
process.on('exit', saveDb);
process.on('SIGINT', () => { saveDb(); process.exit(); });
process.on('SIGTERM', () => { saveDb(); process.exit(); });
