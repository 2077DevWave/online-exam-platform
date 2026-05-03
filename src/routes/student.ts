// src/routes/student.ts
import { Router, Request, Response } from 'express';
import { getDb, saveDb } from '../database';

const router = Router();


/**
 * GET /public/exams/:id
 * Public – returns exam + questions WITHOUT correct_option
 */
router.get('/public/exams/:id', async (req: Request, res: Response) => {
  try {
    const examId = parseInt(String(req.params.id), 10);
    const db = await getDb();

    // Exam metadata
    const examStmt = db.prepare(`
      SELECT id, title, duration_minutes, require_name, require_student_id 
      FROM exams WHERE id = ?
    `);
    examStmt.bind([examId]);
    let exam: any = null;
    if (examStmt.step()) {
      exam = examStmt.getAsObject();
    }
    examStmt.free();

    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    // Questions without correct_option
    const qStmt = db.prepare(`
      SELECT id, text, option_a, option_b, option_c, option_d 
      FROM questions WHERE exam_id = ? ORDER BY id
    `);
    qStmt.bind([examId]);
    const questions: any[] = [];
    while (qStmt.step()) {
      questions.push(qStmt.getAsObject());
    }
    qStmt.free();

    res.json({ ...exam, questions });
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

    // Check if exam allows multiple submissions
    const examStmt = db.prepare('SELECT allow_multiple_submissions, require_name, require_student_id FROM exams WHERE id = ?');
    examStmt.bind([examId]);
    if (!examStmt.step()) {
      examStmt.free();
      return res.status(404).json({ error: 'Exam not found' });
    }
    const exam = examStmt.getAsObject() as any;
    examStmt.free();

    if (exam.allow_multiple_submissions) {
      return res.json({ submitted: false }); // multiple allowed, no need to check
    }

    // Build condition based on what's required
    let condition = 'exam_id = ?';
    const params: any[] = [examId];
    if (exam.require_name && name) {
      condition += ' AND student_name = ?';
      params.push(name);
    }
    if (exam.require_student_id && studentId) {
      condition += ' AND student_id = ?';
      params.push(studentId);
    }

    // If no identifier available, we can't check – assume not submitted
    if ((exam.require_name && !name) || (exam.require_student_id && !studentId)) {
      return res.json({ submitted: false }); // can't determine
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
router.post('/submissions', async (req: Request, res: Response) => {
  try {
    const { exam_id, student_name, student_id, started_at, answers } = req.body;

    // Basic validation
    if (!exam_id || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'exam_id and answers array are required.' });
    }

    const db = await getDb();

    // Fetch exam
    const examStmt = db.prepare('SELECT * FROM exams WHERE id = ?');
    examStmt.bind([exam_id]);
    if (!examStmt.step()) { examStmt.free(); return res.status(404).json({ error: 'Exam not found' }); }
    const exam = examStmt.getAsObject() as any;
    examStmt.free();

    // DUPLICATE CHECK
    if (!exam.allow_multiple_submissions) {
      let dupCondition = 'exam_id = ?';
      const dupParams: any[] = [exam_id];
      if (exam.require_name && student_name) {
        dupCondition += ' AND student_name = ?';
        dupParams.push(student_name);
      }
      if (exam.require_student_id && student_id) {
        dupCondition += ' AND student_id = ?';
        dupParams.push(student_id);
      }
      if ((exam.require_name && student_name) || (exam.require_student_id && student_id)) {
        const dupStmt = db.prepare(`SELECT COUNT(*) as cnt FROM submissions WHERE ${dupCondition}`);
        dupStmt.bind(dupParams);
        dupStmt.step();
        const cnt = (dupStmt.getAsObject() as any).cnt;
        dupStmt.free();
        if (cnt > 0) {
          return res.status(409).json({ error: 'You have already submitted this exam.' });
        }
      }
    }

    // Fetch all questions for this exam
    const qStmt = db.prepare('SELECT id, correct_option FROM questions WHERE exam_id = ?');
    qStmt.bind([exam_id]);
    const questions: { id: number, correct_option: string }[] = [];
    while (qStmt.step()) {
      questions.push(qStmt.getAsObject() as any);
    }
    qStmt.free();

    if (questions.length === 0) {
      return res.status(400).json({ error: 'Exam has no questions.' });
    }

    // Calculate score
    let correctCount = 0;
    const answersToInsert = answers.map((a: any) => {
      const question = questions.find(q => q.id === a.question_id);
      const isCorrect = question && a.selected_option === question.correct_option;
      if (isCorrect) correctCount++;
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
    if (!subIdResult.length || !subIdResult[0].values.length) throw new Error('Insert failed');
    const submissionId = subIdResult[0].values[0][0] as number;

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

    saveDb();

    res.status(201).json({
      submission_id: submissionId,
      score,
      total_questions: questions.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;