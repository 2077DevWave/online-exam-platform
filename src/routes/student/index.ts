// src/routes/student/index.ts
import { Router } from 'express';
import publicExams from './publicExams';
import submissions from './submissions';

const router = Router();

router.use(publicExams);
router.use(submissions);

export default router;