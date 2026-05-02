"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/student.ts
const express_1 = require("express");
const database_1 = require("../database");
const router = (0, express_1.Router)();
/**
 * POST /api/submissions
 * Submit an exam attempt
 * Body: {
 *   exam_id: number,
 *   student_name?: string,
 *   student_id?: string,
 *   started_at: string (ISO),
 *   answers: Array<{ question_id: number, selected_option: string | null }>
 * }
 */
router.post('/submissions', async (req, res) => {
    try {
        const { exam_id, student_name, student_id, started_at, answers } = req.body;
        // Basic validation
        if (!exam_id || !Array.isArray(answers)) {
            return res.status(400).json({ error: 'exam_id and answers array are required.' });
        }
        const db = await (0, database_1.getDb)();
        // Check exam exists and fetch its questions
        const examStmt = db.prepare('SELECT * FROM exams WHERE id = ?');
        examStmt.bind([exam_id]);
        if (!examStmt.step()) {
            examStmt.free();
            return res.status(404).json({ error: 'Exam not found' });
        }
        const exam = examStmt.getAsObject();
        examStmt.free();
        // Fetch all questions for this exam
        const qStmt = db.prepare('SELECT id, correct_option FROM questions WHERE exam_id = ?');
        qStmt.bind([exam_id]);
        const questions = [];
        while (qStmt.step()) {
            questions.push(qStmt.getAsObject());
        }
        qStmt.free();
        if (questions.length === 0) {
            return res.status(400).json({ error: 'Exam has no questions.' });
        }
        // Calculate score
        let correctCount = 0;
        const answersToInsert = answers.map((a) => {
            const question = questions.find(q => q.id === a.question_id);
            const isCorrect = question && a.selected_option === question.correct_option;
            if (isCorrect)
                correctCount++;
            return {
                question_id: a.question_id,
                selected_option: a.selected_option || null,
                is_correct: isCorrect ? 1 : 0
            };
        });
        const score = (correctCount / questions.length) * 100; // percentage
        // Insert submission
        const insertSubmission = db.prepare(`
      INSERT INTO submissions (exam_id, student_name, student_id, score, total_questions, started_at, finished_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);
        insertSubmission.bind([exam_id, student_name || null, student_id || null, score, questions.length, started_at]);
        insertSubmission.step();
        insertSubmission.free();
        // Get the submission id
        const subIdResult = db.exec('SELECT last_insert_rowid() as id');
        if (!subIdResult.length || !subIdResult[0].values.length)
            throw new Error('Insert failed');
        const submissionId = subIdResult[0].values[0][0];
        // Insert individual answers
        const insertAnswer = db.prepare(`
      INSERT INTO answers (submission_id, question_id, selected_option, is_correct)
      VALUES (?, ?, ?, ?)
    `);
        for (const ans of answersToInsert) {
            insertAnswer.bind([submissionId, ans.question_id, ans.selected_option, ans.is_correct]);
            insertAnswer.step();
            insertAnswer.reset();
        }
        insertAnswer.free();
        (0, database_1.saveDb)();
        res.status(201).json({
            submission_id: submissionId,
            score,
            total_questions: questions.length
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
