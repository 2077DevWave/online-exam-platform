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
        for (const sql of schema_1.SAFE_MIGRATIONS) {
            try {
                db.run(sql);
            }
            catch (_e) {
                // Column/table may already exist in upgraded databases.
            }
        }
    }
    else {
        db = new SQL.Database();
        db.run(schema_1.SCHEMA_SQL);
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
