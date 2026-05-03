// src/routes/student/publicExams.ts
import { Router, Request, Response } from 'express';
import { services } from '../../modules/composition';
import { toErrorResponse } from '../../modules/shared/DomainError';

const router = Router();
const { examAccessService } = services;

// GET /public/exams/:id
router.get('/public/exams/:id', async (req: Request, res: Response) => {
  try {
    const examId = parseInt(String(req.params.id), 10);
    const exam = await examAccessService.getPublicExam(examId);
    res.json(exam);
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

// POST /public/exams/:id/verify-password
router.post('/public/exams/:id/verify-password', async (req: Request, res: Response) => {
  try {
    const examId = parseInt(String(req.params.id), 10);
    const { password } = req.body;
    const token = await examAccessService.verifyPassword(examId, password);
    res.json({ token });
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

// POST /public/exams/:id/student-login
router.post('/public/exams/:id/student-login', async (req: Request, res: Response) => {
  try {
    const examId = parseInt(String(req.params.id), 10);
    const { student_id, password } = req.body;
    const token = await examAccessService.loginStudent(examId, student_id, password);
    res.json({ token });
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

// GET /public/exams/:id/already-submitted
router.get('/public/exams/:id/already-submitted', async (req: Request, res: Response) => {
  try {
    const examId = parseInt(String(req.params.id), 10);
    const name = req.query.name as string || '';
    const studentId = req.query.student_id as string || '';
    const submitted = await examAccessService.hasAlreadySubmitted(examId, name, studentId);
    res.json({ submitted });
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

export default router;