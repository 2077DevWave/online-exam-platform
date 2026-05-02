// src/routes/teacher.ts
import { Router, Request, Response } from 'express';
import { getDb, saveDb, insertRow } from '../database';

const router = Router();

/**
 * POST /api/exams
 */
router.post('/exams', async (req: Request, res: Response) => {
  try {
    const { title, duration_minutes, require_name = true, require_student_id = false } = req.body;
    if (!title || !duration_minutes) {
      return res.status(400).json({ error: 'Title and duration_minutes are required.' });
    }

    const examId = await insertRow(
      `INSERT INTO exams (title, duration_minutes, require_name, require_student_id)
       VALUES (?, ?, ?, ?)`,
      [title, duration_minutes, require_name ? 1 : 0, require_student_id ? 1 : 0]
    );
    saveDb();

    res.status(201).json({ id: examId, title, duration_minutes, require_name, require_student_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/exams
 */
router.get('/exams', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM exams ORDER BY created_at DESC');
    const exams: any[] = [];
    while (stmt.step()) {
      exams.push(stmt.getAsObject());
    }
    stmt.free();
    res.json(exams);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/exams/:id
 */
router.get('/exams/:id', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const examId = parseInt(String(req.params.id), 10);   // <--- fixed

    const examStmt = db.prepare('SELECT * FROM exams WHERE id = ?');
    examStmt.bind([examId]);
    let exam: any = null;
    if (examStmt.step()) {
      exam = examStmt.getAsObject();
    }
    examStmt.free();

    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const qStmt = db.prepare('SELECT * FROM questions WHERE exam_id = ? ORDER BY id');
    qStmt.bind([examId]);
    const questions: any[] = [];
    while (qStmt.step()) {
      questions.push(qStmt.getAsObject());
    }
    qStmt.free();

    exam.questions = questions;
    res.json(exam);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/exams/:id/questions
 */
router.post('/exams/:id/questions', async (req: Request, res: Response) => {
  try {
    const examId = parseInt(String(req.params.id), 10);   // <--- fixed
    const { text, option_a, option_b, option_c, option_d, correct_option } = req.body;

    if (!text || !option_a || !option_b || !option_c || !option_d || !correct_option) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }
    if (!['A', 'B', 'C', 'D'].includes(correct_option)) {
      return res.status(400).json({ error: 'correct_option must be A, B, C, or D.' });
    }

    const db = await getDb();
    const examStmt = db.prepare('SELECT id FROM exams WHERE id = ?');
    examStmt.bind([examId]);
    if (!examStmt.step()) {
      examStmt.free();
      return res.status(404).json({ error: 'Exam not found' });
    }
    examStmt.free();

    const questionId = await insertRow(
      `INSERT INTO questions (exam_id, text, option_a, option_b, option_c, option_d, correct_option)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [examId, text, option_a, option_b, option_c, option_d, correct_option]
    );
    saveDb();

    res.status(201).json({ id: questionId, exam_id: examId, text, correct_option });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/exams/:id
 */
router.delete('/exams/:id', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const examId = parseInt(String(req.params.id), 10);   // <--- fixed
    db.run('DELETE FROM exams WHERE id = ?', [examId]);
    saveDb();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/questions/:id
 */
router.delete('/questions/:id', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const qId = parseInt(String(req.params.id), 10);     // <--- fixed
    db.run('DELETE FROM questions WHERE id = ?', [qId]);
    saveDb();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;