"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/index.ts
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const database_1 = require("./database");
const auth_1 = __importDefault(require("./routes/auth"));
const teacher_1 = __importDefault(require("./routes/teacher"));
const student_1 = __importDefault(require("./routes/student"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
app.use(express_1.default.json());
app.use(express_1.default.static(path_1.default.join(__dirname, '..', 'public')));
// Auth routes (public)
app.use('/api', auth_1.default);
// Teacher routes (protected)
app.use('/api', teacher_1.default);
// Student routes (public)
app.use('/api', student_1.default);
// Dynamic exam page
app.get('/exam/:id', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '..', 'public', 'exam.html'));
});
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});
async function start() {
    await (0, database_1.getDb)();
    console.log('Database ready.');
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}
start().catch(console.error);
