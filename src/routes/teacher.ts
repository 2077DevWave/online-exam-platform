// src/routes/teacher.ts
import { Router, Response } from 'express';
import { getDb, saveDb, insertRow } from '../database';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// All routes in this router require authentication
router.use(authMiddleware);

// POST /api/exams (updated to include allow_multiple_submissions)
router.post('/exams', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const { title, duration_minutes, require_name = true, require_student_id = false, allow_multiple_submissions = true } = req.body;
    if (!title || !duration_minutes) {
      return res.status(400).json({ error: 'Title and duration_minutes are required.' });
    }

    const examId = await insertRow(
      `INSERT INTO exams (teacher_id, title, duration_minutes, require_name, require_student_id, allow_multiple_submissions)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [teacherId, title, duration_minutes, require_name ? 1 : 0, require_student_id ? 1 : 0, allow_multiple_submissions ? 1 : 0]
    );
    saveDb();

    res.status(201).json({
      id: examId,
      title,
      duration_minutes,
      require_name,
      require_student_id,
      allow_multiple_submissions
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/exams – returns all fields
router.get('/exams', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM exams WHERE teacher_id = ? ORDER BY created_at DESC');
    stmt.bind([teacherId]);
    const exams: any[] = [];
    while (stmt.step()) exams.push(stmt.getAsObject());
    stmt.free();
    res.json(exams);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/exams/:id – returns full exam with questions
router.get('/exams/:id', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const examId = parseInt(String(req.params.id), 10);
    const db = await getDb();

    const examStmt = db.prepare('SELECT * FROM exams WHERE id = ? AND teacher_id = ?');
    examStmt.bind([examId, teacherId]);
    let exam: any = null;
    if (examStmt.step()) exam = examStmt.getAsObject();
    examStmt.free();
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const qStmt = db.prepare('SELECT * FROM questions WHERE exam_id = ? ORDER BY id');
    qStmt.bind([examId]);
    const questions: any[] = [];
    while (qStmt.step()) questions.push(qStmt.getAsObject());
    qStmt.free();

    exam.questions = questions;
    res.json(exam);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/exams/:id – update exam settings
router.put('/exams/:id', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const examId = parseInt(String(req.params.id), 10);
    const db = await getDb();

    // Verify ownership
    const check = db.prepare('SELECT id FROM exams WHERE id = ? AND teacher_id = ?');
    check.bind([examId, teacherId]);
    if (!check.step()) {
      check.free();
      return res.status(404).json({ error: 'Exam not found' });
    }
    check.free();

    const { title, duration_minutes, require_name, require_student_id, allow_multiple_submissions } = req.body;

    // Build dynamic update
    const fields: string[] = [];
    const params: any[] = [];
    if (title !== undefined) { fields.push('title = ?'); params.push(title); }
    if (duration_minutes !== undefined) { fields.push('duration_minutes = ?'); params.push(duration_minutes); }
    if (require_name !== undefined) { fields.push('require_name = ?'); params.push(require_name ? 1 : 0); }
    if (require_student_id !== undefined) { fields.push('require_student_id = ?'); params.push(require_student_id ? 1 : 0); }
    if (allow_multiple_submissions !== undefined) { fields.push('allow_multiple_submissions = ?'); params.push(allow_multiple_submissions ? 1 : 0); }

    if (fields.length > 0) {
      params.push(examId);
      const sql = `UPDATE exams SET ${fields.join(', ')} WHERE id = ?`;
      db.run(sql, params);
      saveDb();
    }

    // Return updated exam
    const updated = db.prepare('SELECT * FROM exams WHERE id = ?');
    updated.bind([examId]);
    updated.step();
    const exam = updated.getAsObject();
    updated.free();
    res.json(exam);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/exams/:id/questions
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

// DELETE /api/exams/:id
router.delete('/exams/:id', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const examId = parseInt(String(req.params.id), 10);
    const db = await getDb();

    // Delete only if owned by teacher
    db.run('DELETE FROM exams WHERE id = ? AND teacher_id = ?', [examId, teacherId]);
    saveDb();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/questions/:id (with ownership check)
router.delete('/questions/:id', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const qId = parseInt(String(req.params.id), 10);
    const db = await getDb();

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
    saveDb();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/exams/:id/submissions
router.get('/exams/:id/submissions', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const examId = parseInt(String(req.params.id), 10);
    const db = await getDb();

    // Verify that the exam belongs to this teacher
    const examStmt = db.prepare('SELECT id FROM exams WHERE id = ? AND teacher_id = ?');
    examStmt.bind([examId, teacherId]);
    if (!examStmt.step()) {
      examStmt.free();
      return res.status(404).json({ error: 'Exam not found' });
    }
    examStmt.free();

    // Fetch submissions
    const stmt = db.prepare(`
      SELECT id, student_name, student_id, score, total_questions, started_at, finished_at
      FROM submissions
      WHERE exam_id = ?
      ORDER BY finished_at DESC
    `);
    stmt.bind([examId]);
    const submissions: any[] = [];
    while (stmt.step()) {
      submissions.push(stmt.getAsObject());
    }
    stmt.free();

    res.json(submissions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;