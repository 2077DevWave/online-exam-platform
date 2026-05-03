// src/routes/teacher/students.ts
import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getDb, saveDb } from '../../database';
import { AuthRequest } from '../../middleware/auth';
import { services } from '../../modules/composition';
import { toErrorResponse } from '../../modules/shared/DomainError';

const router = Router();
const { teacherExamService } = services;

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

    await teacherExamService.ensureOwnership(examId, teacherId);

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
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

// GET /exams/:id/students - list students
router.get('/exams/:id/students', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const examId = parseInt(String(req.params.id), 10);
    const db = await getDb();

    await teacherExamService.ensureOwnership(examId, teacherId);

    const stmt = db.prepare('SELECT id, student_id FROM exam_students WHERE exam_id = ? ORDER BY student_id');
    stmt.bind([examId]);
    const students: any[] = [];
    while (stmt.step()) students.push(stmt.getAsObject());
    stmt.free();
    res.json(students);
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

// DELETE /exams/:id/students/:studentId
router.delete('/exams/:id/students/:studentId', async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.teacherId!;
    const examId = parseInt(String(req.params.id), 10);
    const studentId = String(req.params.studentId);
    const db = await getDb();

    await teacherExamService.ensureOwnership(examId, teacherId);

    db.run('DELETE FROM exam_students WHERE exam_id = ? AND student_id = ?', [examId, studentId]);
    saveDb();
    res.json({ success: true });
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

export default router;