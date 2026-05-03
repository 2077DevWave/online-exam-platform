// src/routes/teacher/students.ts
import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getDb, saveDb } from '../../database';
import { AuthRequest } from '../../middleware/auth';

const router = Router();

// POST /exams/:id/students - add a student to exam
router.post('/exams/:id/students', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const examId = parseInt(String(req.params.id), 10);
    const { student_id, password } = req.body;

    if (!student_id || !password) {
      return res.status(400).json({ error: 'student_id and password are required' });
    }

    const db = await getDb();

    // Verify exam ownership
    const examStmt = db.prepare('SELECT id FROM exams WHERE id = ? AND teacher_id = ?');
    examStmt.bind([examId, teacherId]);
    if (!examStmt.step()) { examStmt.free(); return res.status(404).json({ error: 'Exam not found' }); }
    examStmt.free();

    // Check if student already exists
    const dupStmt = db.prepare('SELECT id FROM exam_students WHERE exam_id = ? AND student_id = ?');
    dupStmt.bind([examId, student_id]);
    if (dupStmt.step()) { dupStmt.free(); return res.status(409).json({ error: 'Student already added' }); }
    dupStmt.free();

    const hash = await bcrypt.hash(password, 10);
    db.run('INSERT INTO exam_students (exam_id, student_id, password_hash) VALUES (?, ?, ?)',
      [examId, student_id, hash]);
    saveDb();

    res.status(201).json({ student_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /exams/:id/students - list students
router.get('/exams/:id/students', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const examId = parseInt(String(req.params.id), 10);
    const db = await getDb();

    // Verify ownership
    const examStmt = db.prepare('SELECT id FROM exams WHERE id = ? AND teacher_id = ?');
    examStmt.bind([examId, teacherId]);
    if (!examStmt.step()) { examStmt.free(); return res.status(404).json({ error: 'Exam not found' }); }
    examStmt.free();

    const stmt = db.prepare('SELECT id, student_id FROM exam_students WHERE exam_id = ? ORDER BY student_id');
    stmt.bind([examId]);
    const students: any[] = [];
    while (stmt.step()) students.push(stmt.getAsObject());
    stmt.free();
    res.json(students);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /exams/:id/students/:studentId
router.delete('/exams/:id/students/:studentId', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const examId = parseInt(String(req.params.id), 10);
    const studentId = String(req.params.studentId);
    const db = await getDb();

    // Verify ownership
    const examStmt = db.prepare('SELECT id FROM exams WHERE id = ? AND teacher_id = ?');
    examStmt.bind([examId, teacherId]);
    if (!examStmt.step()) { examStmt.free(); return res.status(404).json({ error: 'Exam not found' }); }
    examStmt.free();

    db.run('DELETE FROM exam_students WHERE exam_id = ? AND student_id = ?', [examId, studentId]);
    saveDb();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;