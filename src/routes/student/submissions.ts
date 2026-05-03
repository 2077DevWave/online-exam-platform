// src/routes/student/submissions.ts
import { Router, Request, Response } from 'express';
import { services } from '../../modules/composition';
import { toErrorResponse } from '../../modules/shared/DomainError';

const router = Router();
const { submissionService } = services;

router.post('/submissions', async (req: Request, res: Response) => {
  try {
    const result = await submissionService.createSubmission(req.body, req.headers.authorization);
    res.status(201).json(result);
  } catch (err) {
    const mapped = toErrorResponse(err);
    if (mapped.statusCode >= 500) console.error(err);
    res.status(mapped.statusCode).json(mapped.body);
  }
});

export default router;