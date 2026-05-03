// src/routes/student/publicExams.ts
import { Router, Request, Response } from 'express';
import { getDb } from '../../database';
import bcrypt from 'bcryptjs';
import { generateExamToken } from '../../utils/tokens';

const router = Router();

// GET /public/exams/:id
router.get('/public/exams/:id', async (req: Request, res: Response) => {
  try {
    const examId = parseInt(String(req.params.id), 10);
    const db = await getDb();

    const examStmt = db.prepare('SELECT id, title, duration_minutes, require_name, require_student_id, allow_multiple_submissions, shuffle_questions, shuffle_options, status, password FROM exams WHERE id = ?');
    examStmt.bind([examId]);
    let exam: any = null;
    if (examStmt.step()) exam = examStmt.getAsObject();
    examStmt.free();
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    // Check status
    if (exam.status !== 'published') {
      return res.status(404).json({ error: 'Exam not published yet' });
    }

    // Check if exam has pre-defined students
    const sStmt = db.prepare('SELECT COUNT(*) as cnt FROM exam_students WHERE exam_id = ?');
    sStmt.bind([examId]);
    sStmt.step();
    const studentCount = (sStmt.getAsObject() as any).cnt;
    sStmt.free();

    // Questions without correct answers
    const qStmt = db.prepare('SELECT id, text, option_a, option_b, option_c, option_d FROM questions WHERE exam_id = ? ORDER BY id');
    qStmt.bind([examId]);
    const questions: any[] = [];
    while (qStmt.step()) questions.push(qStmt.getAsObject());
    qStmt.free();

    res.json({
      id: exam.id,
      title: exam.title,
      duration_minutes: exam.duration_minutes,
      require_name: !!exam.require_name,
      require_student_id: !!exam.require_student_id,
      allow_multiple_submissions: !!exam.allow_multiple_submissions,
      shuffle_questions: !!exam.shuffle_questions,
      shuffle_options: !!exam.shuffle_options,
      has_password: !!exam.password,
      require_student_auth: studentCount > 0,
      questions
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /public/exams/:id/verify-password
router.post('/public/exams/:id/verify-password', async (req: Request, res: Response) => {
  try {
    const examId = parseInt(String(req.params.id), 10);
    const { password } = req.body;
    const db = await getDb();

    const stmt = db.prepare('SELECT password FROM exams WHERE id = ? AND status = "published"');
    stmt.bind([examId]);
    if (!stmt.step()) { stmt.free(); return res.status(404).json({ error: 'Exam not found' }); }
    const row = stmt.getAsObject() as any;
    stmt.free();

    if (!row.password || row.password !== password) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    const token = generateExamToken({ exam_id: examId, type: 'password' });
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /public/exams/:id/student-login
router.post('/public/exams/:id/student-login', async (req: Request, res: Response) => {
  try {
    const examId = parseInt(String(req.params.id), 10);
    const { student_id, password } = req.body;
    const db = await getDb();

    const stmt = db.prepare('SELECT password_hash FROM exam_students WHERE exam_id = ? AND student_id = ?');
    stmt.bind([examId, student_id]);
    if (!stmt.step()) { stmt.free(); return res.status(401).json({ error: 'Invalid credentials' }); }
    const row = stmt.getAsObject() as any;
    stmt.free();

    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = generateExamToken({ exam_id: examId, type: 'student', student_id });
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /public/exams/:id/already-submitted
router.get('/public/exams/:id/already-submitted', async (req: Request, res: Response) => {
  try {
    const examId = parseInt(String(req.params.id), 10);
    const name = req.query.name as string || '';
    const studentId = req.query.student_id as string || '';
    const db = await getDb();

    const examStmt = db.prepare('SELECT allow_multiple_submissions, require_name, require_student_id FROM exams WHERE id = ?');
    examStmt.bind([examId]);
    if (!examStmt.step()) { examStmt.free(); return res.status(404).json({ error: 'Exam not found' }); }
    const exam = examStmt.getAsObject() as any;
    examStmt.free();

    if (exam.allow_multiple_submissions) {
      return res.json({ submitted: false });
    }

    let condition = 'exam_id = ?';
    const params: any[] = [examId];
    if (exam.require_name && name) { condition += ' AND student_name = ?'; params.push(name); }
    if (exam.require_student_id && studentId) { condition += ' AND student_id = ?'; params.push(studentId); }

    if ((exam.require_name && !name) || (exam.require_student_id && !studentId)) {
      return res.json({ submitted: false });
    }

    const stmt = db.prepare(`SELECT COUNT(*) as cnt FROM submissions WHERE ${condition}`);
    stmt.bind(params);
    stmt.step();
    const row = stmt.getAsObject() as any;
    stmt.free();

    res.json({ submitted: row.cnt > 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;