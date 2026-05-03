// src/routes/teacher/questions.ts
import { Router, Response } from 'express';
import { getDb, saveDb, insertRow } from '../../database';
import { AuthRequest } from '../../middleware/auth';

const router = Router();

// POST /exams/:id/questions
router.post('/exams/:id/questions', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const examId = parseInt(String(req.params.id), 10);
    const { text, option_a, option_b, option_c, option_d, correct_option } = req.body;

    if (!text || !option_a || !option_b || !option_c || !option_d || !correct_option) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }
    if (!['A', 'B', 'C', 'D'].includes(correct_option)) {
      return res.status(400).json({ error: 'correct_option must be A, B, C, or D.' });
    }

    const db = await getDb();
    // Verify exam ownership
    const examStmt = db.prepare('SELECT id FROM exams WHERE id = ? AND teacher_id = ?');
    examStmt.bind([examId, teacherId]);
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

// DELETE /questions/:id
router.delete('/questions/:id', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const qId = parseInt(String(req.params.id), 10);
    const db = await getDb();

    // Delete only if question's exam belongs to teacher
    const stmt = db.prepare(`
      DELETE FROM questions 
      WHERE id = ? 
      AND exam_id IN (SELECT id FROM exams WHERE teacher_id = ?)
    `);
    stmt.bind([qId, teacherId]);
    stmt.step();
    stmt.free();
    saveDb();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;