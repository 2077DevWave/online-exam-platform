// src/routes/student/submissions.ts
import { Router, Request, Response } from 'express';
import { getDb, saveDb } from '../../database';
import { verifyExamToken } from '../../utils/tokens';

const router = Router();

router.post('/submissions', async (req: Request, res: Response) => {
  try {
    const { exam_id, student_name, student_id, started_at, answers, exam_token } = req.body;

    if (!exam_id || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'exam_id and answers array are required.' });
    }

    const db = await getDb();

    // Fetch exam details
    const examStmt = db.prepare('SELECT * FROM exams WHERE id = ?');
    examStmt.bind([exam_id]);
    if (!examStmt.step()) { examStmt.free(); return res.status(404).json({ error: 'Exam not found' }); }
    const exam = examStmt.getAsObject() as any;
    examStmt.free();

    // Enforce exam access restrictions
    const hasPassword = !!exam.password;
    const hasStudentList = (() => {
      const sStmt = db.prepare('SELECT COUNT(*) as cnt FROM exam_students WHERE exam_id = ?');
      sStmt.bind([exam_id]);
      sStmt.step();
      const cnt = (sStmt.getAsObject() as any).cnt;
      sStmt.free();
      return cnt > 0;
    })();

    if (hasPassword || hasStudentList) {
      // Must provide a valid token
      const token = exam_token || (req.headers.authorization || '').replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Exam access token required' });

      let payload;
      try {
        payload = verifyExamToken(token);
      } catch (e) {
        return res.status(401).json({ error: 'Invalid or expired exam token' });
      }

      if (payload.exam_id !== exam_id) return res.status(401).json({ error: 'Token does not match exam' });

      if (hasStudentList && payload.type === 'student') {
        // Optionally enforce that student_id in token matches submission
        if (exam.require_student_id && payload.student_id !== student_id) {
          return res.status(401).json({ error: 'Student ID mismatch' });
        }
      } else if (hasPassword && payload.type === 'password') {
        // OK
      } else {
        return res.status(401).json({ error: 'Token type not accepted for this exam' });
      }
    }

    // Duplicate check if not allowed
    if (!exam.allow_multiple_submissions) {
      let dupCondition = 'exam_id = ?';
      const dupParams: any[] = [exam_id];
      if (exam.require_name && student_name) { dupCondition += ' AND student_name = ?'; dupParams.push(student_name); }
      if (exam.require_student_id && student_id) { dupCondition += ' AND student_id = ?'; dupParams.push(student_id); }
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

    // Fetch correct answers
    const qStmt = db.prepare('SELECT id, correct_option FROM questions WHERE exam_id = ?');
    qStmt.bind([exam_id]);
    const questions: { id: number; correct_option: string }[] = [];
    while (qStmt.step()) questions.push(qStmt.getAsObject() as any);
    qStmt.free();

    if (questions.length === 0) {
      return res.status(400).json({ error: 'Exam has no questions.' });
    }

    let correctCount = 0;
    const answersToInsert = answers.map((a: any) => {
      const question = questions.find(q => q.id === a.question_id);
      const isCorrect = question && a.selected_option === question.correct_option;
      if (isCorrect) correctCount++;
      return { question_id: a.question_id, selected_option: a.selected_option || null, is_correct: isCorrect ? 1 : 0 };
    });

    const score = (correctCount / questions.length) * 100;

    // Insert submission
    const insertSubmission = db.prepare(`
      INSERT INTO submissions (exam_id, student_name, student_id, score, total_questions, started_at, finished_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    insertSubmission.bind([exam_id, student_name || null, student_id || null, score, questions.length, started_at]);
    insertSubmission.step();
    insertSubmission.free();

    // Get submission id
    const subIdResult = db.exec('SELECT last_insert_rowid() as id');
    if (!subIdResult.length || !subIdResult[0].values.length) throw new Error('Insert failed');
    const submissionId = subIdResult[0].values[0][0] as number;

    // Insert answers
    const insertAnswer = db.prepare(`INSERT INTO answers (submission_id, question_id, selected_option, is_correct) VALUES (?, ?, ?, ?)`);
    for (const ans of answersToInsert) {
      insertAnswer.bind([submissionId, ans.question_id, ans.selected_option, ans.is_correct]);
      insertAnswer.step();
      insertAnswer.reset();
    }
    insertAnswer.free();

    saveDb();

    res.status(201).json({ submission_id: submissionId, score, total_questions: questions.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;