// src/routes/teacher/exams.ts
import { Router, Response } from 'express';
import { getDb, saveDb, insertRow } from '../../database';
import { AuthRequest } from '../../middleware/auth';

const router = Router();

// POST /exams
router.post('/exams', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const {
      title, duration_minutes,
      require_name = true, require_student_id = false,
      allow_multiple_submissions = true,
      shuffle_questions = true, shuffle_options = true,
      status = 'published', password
    } = req.body;

    if (!title || !duration_minutes) {
      return res.status(400).json({ error: 'Title and duration_minutes are required.' });
    }

    if (!['draft','published'].includes(status)) {
      return res.status(400).json({ error: 'status must be draft or published' });
    }

    const examId = await insertRow(
      `INSERT INTO exams (teacher_id, title, duration_minutes, require_name, require_student_id, allow_multiple_submissions, shuffle_questions, shuffle_options, status, password)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [teacherId, title, duration_minutes, require_name ? 1 : 0, require_student_id ? 1 : 0,
       allow_multiple_submissions ? 1 : 0, shuffle_questions ? 1 : 0, shuffle_options ? 1 : 0,
       status, password || null]
    );
    saveDb();

    res.status(201).json({
      id: examId, title, duration_minutes, require_name, require_student_id,
      allow_multiple_submissions, shuffle_questions, shuffle_options, status,
      password: !!password
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /exams
router.get('/exams', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM exams WHERE teacher_id = ? ORDER BY created_at DESC');
    stmt.bind([teacherId]);
    const exams: any[] = [];
    while (stmt.step()) exams.push(stmt.getAsObject());
    stmt.free();
    // Convert integer booleans, hide password
    exams.forEach(e => {
      e.require_name = !!e.require_name;
      e.require_student_id = !!e.require_student_id;
      e.allow_multiple_submissions = !!e.allow_multiple_submissions;
      e.shuffle_questions = !!e.shuffle_questions;
      e.shuffle_options = !!e.shuffle_options;
      e.password = e.password ? '****' : null;
    });
    res.json(exams);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /exams/:id (with questions and students list)
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

    // Questions
    const qStmt = db.prepare('SELECT * FROM questions WHERE exam_id = ? ORDER BY id');
    qStmt.bind([examId]);
    const questions: any[] = [];
    while (qStmt.step()) questions.push(qStmt.getAsObject());
    qStmt.free();

    // Allowed students
    const sStmt = db.prepare('SELECT id, student_id FROM exam_students WHERE exam_id = ? ORDER BY student_id');
    sStmt.bind([examId]);
    const students: any[] = [];
    while (sStmt.step()) students.push(sStmt.getAsObject());
    sStmt.free();

    exam.questions = questions;
    exam.students = students;
    // Convert booleans
    exam.require_name = !!exam.require_name;
    exam.require_student_id = !!exam.require_student_id;
    exam.allow_multiple_submissions = !!exam.allow_multiple_submissions;
    exam.shuffle_questions = !!exam.shuffle_questions;
    exam.shuffle_options = !!exam.shuffle_options;
    exam.password = exam.password ? '****' : null;

    res.json(exam);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /exams/:id
router.put('/exams/:id', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const examId = parseInt(String(req.params.id), 10);
    const db = await getDb();

    const check = db.prepare('SELECT id FROM exams WHERE id = ? AND teacher_id = ?');
    check.bind([examId, teacherId]);
    if (!check.step()) { check.free(); return res.status(404).json({ error: 'Exam not found' }); }
    check.free();

    const {
      title, duration_minutes,
      require_name, require_student_id,
      allow_multiple_submissions,
      shuffle_questions, shuffle_options,
      status, password
    } = req.body;

    const fields: string[] = [];
    const params: any[] = [];

    if (title !== undefined) { fields.push('title = ?'); params.push(title); }
    if (duration_minutes !== undefined) { fields.push('duration_minutes = ?'); params.push(duration_minutes); }
    if (require_name !== undefined) { fields.push('require_name = ?'); params.push(require_name ? 1 : 0); }
    if (require_student_id !== undefined) { fields.push('require_student_id = ?'); params.push(require_student_id ? 1 : 0); }
    if (allow_multiple_submissions !== undefined) { fields.push('allow_multiple_submissions = ?'); params.push(allow_multiple_submissions ? 1 : 0); }
    if (shuffle_questions !== undefined) { fields.push('shuffle_questions = ?'); params.push(shuffle_questions ? 1 : 0); }
    if (shuffle_options !== undefined) { fields.push('shuffle_options = ?'); params.push(shuffle_options ? 1 : 0); }
    if (status !== undefined) {
      if (!['draft','published'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
      fields.push('status = ?'); params.push(status);
    }
    if (password !== undefined) { fields.push('password = ?'); params.push(password || null); }

    if (fields.length > 0) {
      params.push(examId);
      db.run(`UPDATE exams SET ${fields.join(', ')} WHERE id = ?`, params);
      saveDb();
    }

    const updated = db.prepare('SELECT * FROM exams WHERE id = ?');
    updated.bind([examId]);
    updated.step();
    const exam = updated.getAsObject();
    updated.free();
    exam.password = exam.password ? '****' : null;
    res.json(exam);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /exams/:id
router.delete('/exams/:id', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const examId = parseInt(String(req.params.id), 10);
    const db = await getDb();
    db.run('DELETE FROM exams WHERE id = ? AND teacher_id = ?', [examId, teacherId]);
    saveDb();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;