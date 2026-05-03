"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.saveDb = saveDb;
exports.resetDbForTests = resetDbForTests;
exports.insertRow = insertRow;
// src/database.ts
const sql_js_1 = __importDefault(require("sql.js"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const env_1 = require("./config/env");
const schema_1 = require("./database/schema");
const DB_PATH = env_1.env.dbPath;
let db;
let autosaveTimer = null;
function tableExists(database, tableName) {
    const stmt = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?");
    stmt.bind([tableName]);
    const exists = stmt.step();
    stmt.free();
    return exists;
}
function applySchema(database) {
    database.run('PRAGMA foreign_keys = ON');
    database.run(schema_1.BASE_SCHEMA_SQL);
}
function insertLegacyQuestionItem(database, text, correctOption, optionA, optionB, optionC, optionD) {
    database.run('INSERT INTO question_items (text, correct_option) VALUES (?, ?)', [text, correctOption]);
    const itemIdResult = database.exec('SELECT last_insert_rowid() AS id');
    const questionItemId = itemIdResult[0].values[0][0];
    database.run(`INSERT INTO question_item_options (question_item_id, option_key, option_text)
     VALUES
     (?, 'A', ?),
     (?, 'B', ?),
     (?, 'C', ?),
     (?, 'D', ?)`, [
        questionItemId, optionA,
        questionItemId, optionB,
        questionItemId, optionC,
        questionItemId, optionD
    ]);
    return questionItemId;
}
function migrateFromLegacySchema(database) {
    const hasLegacyQuestions = tableExists(database, 'questions');
    const hasLegacyQuestionBank = tableExists(database, 'question_bank');
    const hasLegacyAnswers = tableExists(database, 'answers');
    if (!hasLegacyQuestions && !hasLegacyQuestionBank && !hasLegacyAnswers) {
        return;
    }
    database.run('BEGIN TRANSACTION');
    try {
        if (hasLegacyQuestionBank) {
            const stmt = database.prepare('SELECT id, teacher_id, text, option_a, option_b, option_c, option_d, correct_option, tags, created_at FROM question_bank');
            while (stmt.step()) {
                const row = stmt.getAsObject();
                const questionItemId = insertLegacyQuestionItem(database, row.text, row.correct_option, row.option_a, row.option_b, row.option_c, row.option_d);
                database.run('INSERT INTO question_bank_entries (id, teacher_id, question_item_id, tags, created_at) VALUES (?, ?, ?, ?, ?)', [row.id, row.teacher_id, questionItemId, row.tags || null, row.created_at || null]);
            }
            stmt.free();
        }
        if (hasLegacyQuestions) {
            const stmt = database.prepare('SELECT id, exam_id, text, option_a, option_b, option_c, option_d, correct_option FROM questions ORDER BY id');
            while (stmt.step()) {
                const row = stmt.getAsObject();
                const questionItemId = insertLegacyQuestionItem(database, row.text, row.correct_option, row.option_a, row.option_b, row.option_c, row.option_d);
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
            database.run(`INSERT INTO submission_answers (id, submission_id, exam_question_id, selected_option, is_correct)
         SELECT id, submission_id, question_id, selected_option, is_correct
         FROM answers`);
        }
        database.run('DROP TABLE IF EXISTS answers');
        database.run('DROP TABLE IF EXISTS questions');
        database.run('DROP TABLE IF EXISTS question_bank');
        database.run('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [2, 'normalized-question-structure']);
        database.run('COMMIT');
    }
    catch (error) {
        database.run('ROLLBACK');
        throw error;
    }
}
function ensureSchema(database) {
    applySchema(database);
    const hasMigrations = tableExists(database, 'schema_migrations');
    if (!hasMigrations) {
        return;
    }
    const versionStmt = database.prepare('SELECT COALESCE(MAX(version), 0) as version FROM schema_migrations');
    versionStmt.step();
    const currentVersion = Number(versionStmt.getAsObject().version || 0);
    versionStmt.free();
    if (currentVersion === 0) {
        migrateFromLegacySchema(database);
        const vStmt = database.prepare('SELECT COALESCE(MAX(version), 0) as version FROM schema_migrations');
        vStmt.step();
        const migratedVersion = Number(vStmt.getAsObject().version || 0);
        vStmt.free();
        if (migratedVersion === 0) {
            database.run('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [schema_1.SCHEMA_VERSION, 'bootstrap']);
        }
    }
}
async function getDb() {
    if (db)
        return db;
    const SQL = await (0, sql_js_1.default)();
    const dir = path_1.default.dirname(DB_PATH);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
    if (fs_1.default.existsSync(DB_PATH)) {
        const fileBuffer = fs_1.default.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
        ensureSchema(db);
    }
    else {
        db = new SQL.Database();
        ensureSchema(db);
        db.run('INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)', [schema_1.SCHEMA_VERSION, 'bootstrap']);
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
function resetDbForTests() {
    if (db) {
        db.close();
    }
    db = undefined;
}
async function insertRow(sql, params) {
    const db = await getDb();
    db.run(sql, params);
    const result = db.exec('SELECT last_insert_rowid() as id');
    if (result.length && result[0].values.length) {
        return result[0].values[0][0];
    }
    throw new Error('Insert failed');
}
autosaveTimer = setInterval(saveDb, 30000);
autosaveTimer.unref();
process.on('exit', saveDb);
process.on('SIGINT', () => { saveDb(); process.exit(); });
process.on('SIGTERM', () => { saveDb(); process.exit(); });
