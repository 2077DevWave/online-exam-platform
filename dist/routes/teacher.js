"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/teacher.ts
const express_1 = require("express");
const database_1 = require("../database");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// All routes in this router require authentication
router.use(auth_1.authMiddleware);
// POST /api/exams
router.post('/exams', async (req, res) => {
    try {
        const teacherId = req.teacherId;
        const { title, duration_minutes, require_name = true, require_student_id = false } = req.body;
        if (!title || !duration_minutes) {
            return res.status(400).json({ error: 'Title and duration_minutes are required.' });
        }
        const examId = await (0, database_1.insertRow)(`INSERT INTO exams (teacher_id, title, duration_minutes, require_name, require_student_id)
       VALUES (?, ?, ?, ?, ?)`, [teacherId, title, duration_minutes, require_name ? 1 : 0, require_student_id ? 1 : 0]);
        (0, database_1.saveDb)();
        res.status(201).json({ id: examId, title, duration_minutes, require_name, require_student_id });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/exams – only teacher's exams
router.get('/exams', async (req, res) => {
    try {
        const teacherId = req.teacherId;
        const db = await (0, database_1.getDb)();
        const stmt = db.prepare('SELECT * FROM exams WHERE teacher_id = ? ORDER BY created_at DESC');
        stmt.bind([teacherId]);
        const exams = [];
        while (stmt.step()) {
            exams.push(stmt.getAsObject());
        }
        stmt.free();
        res.json(exams);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/exams/:id – only if belongs to teacher
router.get('/exams/:id', async (req, res) => {
    try {
        const teacherId = req.teacherId;
        const examId = parseInt(String(req.params.id), 10);
        const db = await (0, database_1.getDb)();
        const examStmt = db.prepare('SELECT * FROM exams WHERE id = ? AND teacher_id = ?');
        examStmt.bind([examId, teacherId]);
        let exam = null;
        if (examStmt.step()) {
            exam = examStmt.getAsObject();
        }
        examStmt.free();
        if (!exam) {
            return res.status(404).json({ error: 'Exam not found' });
        }
        const qStmt = db.prepare('SELECT * FROM questions WHERE exam_id = ? ORDER BY id');
        qStmt.bind([examId]);
        const questions = [];
        while (qStmt.step()) {
            questions.push(qStmt.getAsObject());
        }
        qStmt.free();
        exam.questions = questions;
        res.json(exam);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/exams/:id/questions
router.post('/exams/:id/questions', async (req, res) => {
    try {
        const teacherId = req.teacherId;
        const examId = parseInt(String(req.params.id), 10);
        const { text, option_a, option_b, option_c, option_d, correct_option } = req.body;
        if (!text || !option_a || !option_b || !option_c || !option_d || !correct_option) {
            return res.status(400).json({ error: 'Missing required fields.' });
        }
        if (!['A', 'B', 'C', 'D'].includes(correct_option)) {
            return res.status(400).json({ error: 'correct_option must be A, B, C, or D.' });
        }
        const db = await (0, database_1.getDb)();
        // Verify exam ownership
        const examStmt = db.prepare('SELECT id FROM exams WHERE id = ? AND teacher_id = ?');
        examStmt.bind([examId, teacherId]);
        if (!examStmt.step()) {
            examStmt.free();
            return res.status(404).json({ error: 'Exam not found' });
        }
        examStmt.free();
        const questionId = await (0, database_1.insertRow)(`INSERT INTO questions (exam_id, text, option_a, option_b, option_c, option_d, correct_option)
       VALUES (?, ?, ?, ?, ?, ?, ?)`, [examId, text, option_a, option_b, option_c, option_d, correct_option]);
        (0, database_1.saveDb)();
        res.status(201).json({ id: questionId, exam_id: examId, text, correct_option });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// DELETE /api/exams/:id
router.delete('/exams/:id', async (req, res) => {
    try {
        const teacherId = req.teacherId;
        const examId = parseInt(String(req.params.id), 10);
        const db = await (0, database_1.getDb)();
        // Delete only if owned by teacher
        db.run('DELETE FROM exams WHERE id = ? AND teacher_id = ?', [examId, teacherId]);
        (0, database_1.saveDb)();
        res.json({ success: true });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// DELETE /api/questions/:id (with ownership check)
router.delete('/questions/:id', async (req, res) => {
    try {
        const teacherId = req.teacherId;
        const qId = parseInt(String(req.params.id), 10);
        const db = await (0, database_1.getDb)();
        // Delete question only if its exam belongs to teacher
        // We do a subquery to check ownership
        const stmt = db.prepare(`
      DELETE FROM questions 
      WHERE id = ? 
      AND exam_id IN (SELECT id FROM exams WHERE teacher_id = ?)
    `);
        stmt.bind([qId, teacherId]);
        stmt.step();
        stmt.free();
        (0, database_1.saveDb)();
        res.json({ success: true });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
