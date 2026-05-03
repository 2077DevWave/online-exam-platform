// src/routes/teacher/questionBank.ts
import { Router, Response } from 'express';
import { getDb, saveDb, insertRow } from '../../database';
import { AuthRequest } from '../../middleware/auth';

const router = Router();

// GET /api/question-bank
router.get('/question-bank', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const db = await getDb();
    const stmt = db.prepare(`
      SELECT qb.id, qb.teacher_id, qi.text, qi.correct_option,
             MAX(CASE WHEN qio.option_key = 'A' THEN qio.option_text END) AS option_a,
             MAX(CASE WHEN qio.option_key = 'B' THEN qio.option_text END) AS option_b,
             MAX(CASE WHEN qio.option_key = 'C' THEN qio.option_text END) AS option_c,
             MAX(CASE WHEN qio.option_key = 'D' THEN qio.option_text END) AS option_d,
             qb.tags, qb.created_at
      FROM question_bank_entries qb
      JOIN question_items qi ON qi.id = qb.question_item_id
      JOIN question_item_options qio ON qio.question_item_id = qi.id
      WHERE qb.teacher_id = ?
      GROUP BY qb.id, qb.teacher_id, qi.text, qi.correct_option, qb.tags, qb.created_at
      ORDER BY qb.created_at DESC
    `);
    stmt.bind([teacherId]);
    const questions: any[] = [];
    while (stmt.step()) questions.push(stmt.getAsObject());
    stmt.free();
    res.json(questions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/question-bank
router.post('/question-bank', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const { text, option_a, option_b, option_c, option_d, correct_option } = req.body;
    if (!text || !option_a || !option_b || !option_c || !option_d || !correct_option) {
      return res.status(400).json({ error: 'All question fields are required.' });
    }
    const questionItemId = await insertRow(
      'INSERT INTO question_items (text, correct_option) VALUES (?, ?)',
      [text, correct_option]
    );
    const db = await getDb();
    db.run(
      `INSERT INTO question_item_options (question_item_id, option_key, option_text)
       VALUES (?, 'A', ?), (?, 'B', ?), (?, 'C', ?), (?, 'D', ?)`,
      [questionItemId, option_a, questionItemId, option_b, questionItemId, option_c, questionItemId, option_d]
    );
    const id = await insertRow(
      'INSERT INTO question_bank_entries (teacher_id, question_item_id) VALUES (?, ?)',
      [teacherId, questionItemId]
    );
    saveDb();
    res.status(201).json({ id, message: 'Question added to bank' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/question-bank/:id
router.delete('/question-bank/:id', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const qId = parseInt(String(req.params.id), 10);
    const db = await getDb();
    // Delete only if belongs to teacher
    db.run('DELETE FROM question_bank_entries WHERE id = ? AND teacher_id = ?', [qId, teacherId]);
    saveDb();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/question-bank/:id/copy-to-exam/:examId
router.post('/question-bank/:id/copy-to-exam/:examId', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const bankId = parseInt(String(req.params.id), 10);
    const examId = parseInt(String(req.params.examId), 10);
    const db = await getDb();

    // Verify both belong to teacher
    const bankStmt = db.prepare('SELECT question_item_id FROM question_bank_entries WHERE id = ? AND teacher_id = ?');
    bankStmt.bind([bankId, teacherId]);
    if (!bankStmt.step()) { bankStmt.free(); return res.status(404).json({ error: 'Bank question not found' }); }
    const question = bankStmt.getAsObject() as any;
    bankStmt.free();

    const examStmt = db.prepare('SELECT id FROM exams WHERE id = ? AND teacher_id = ?');
    examStmt.bind([examId, teacherId]);
    if (!examStmt.step()) { examStmt.free(); return res.status(404).json({ error: 'Exam not found' }); }
    examStmt.free();

    // Insert into exam questions
    const newId = await insertRow(
      'INSERT INTO exam_questions (exam_id, question_item_id, position) VALUES (?, ?, ?)',
      [examId, question.question_item_id, Date.now()]
    );
    saveDb();
    res.status(201).json({ id: newId, message: 'Question copied to exam' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;