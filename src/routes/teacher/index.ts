// src/routes/teacher/index.ts
import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import examRoutes from './exams';
import questionRoutes from './questions';
import submissionRoutes from './submissions';
import studentRoutes from './students';
import questionBankRoutes from './questionBank';

const router = Router();

router.use(authMiddleware);

router.use(examRoutes);
router.use(questionRoutes);
router.use(submissionRoutes);
router.use(studentRoutes);
router.use(questionBankRoutes);

export default router;