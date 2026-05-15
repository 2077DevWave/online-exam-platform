import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

export class ValidationError extends Error {
  public statusCode = 400;
  public details: Array<{ field: string; message: string }>;

  constructor(message: string, details: Array<{ field: string; message: string }> = []) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export function validateRequest(schema: z.ZodObject<any, any>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message
        }));
        const validationError = new ValidationError('Validation failed', details);
        next(validationError);
      } else {
        next(error);
      }
    }
  };
}

// Common validation schemas
export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

export const registerSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
});

export const organizationSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(255, 'Organization name is too long')
});

export const organizationMemberSchema = z.object({
  member_teacher_id: z.number().int().positive('Invalid teacher ID'),
  role: z.enum(['admin', 'teacher']).optional().default('teacher')
});

export const createExamSchema = z.object({
  title: z.string().min(1, 'Exam title is required').max(255, 'Exam title is too long'),
  duration_minutes: z.number().int().positive('Duration must be a positive number').optional(),
  require_name: z.boolean().optional().default(true),
  require_student_id: z.boolean().optional().default(false),
  allow_multiple_submissions: z.boolean().optional().default(true),
  shuffle_questions: z.boolean().optional().default(true),
  shuffle_options: z.boolean().optional().default(true),
  status: z.enum(['draft', 'published']).optional().default('published'),
  password: z.string().max(255).optional().nullable(),
  start_time: z.string().transform((val) => {
    if (!val) return null;
    const date = new Date(val);
    if (isNaN(date.getTime())) throw new Error('Invalid start_time format');
    return val;
  }).optional().nullable(),
  end_time: z.string().transform((val) => {
    if (!val) return null;
    const date = new Date(val);
    if (isNaN(date.getTime())) throw new Error('Invalid end_time format');
    return val;
  }).optional().nullable()
});

export const updateExamSchema = createExamSchema.partial();

export const submissionAnswerSchema = z.object({
  question_id: z.number().int().positive('Invalid question ID'),
  selected_option: z.string().max(1).optional().nullable()
});

export const createSubmissionSchema = z.object({
  exam_id: z.number().int().positive('Invalid exam ID'),
  student_name: z.string().max(255).optional().nullable(),
  student_id: z.string().max(255).optional().nullable(),
  answers: z.array(submissionAnswerSchema).min(1, 'At least one answer is required'),
  exam_token: z.string().optional()
});

export const addQuestionSchema = z.object({
  text: z.string().min(1, 'Question text is required'),
  correct_option: z.enum(['A', 'B', 'C', 'D'], 'Correct option must be A, B, C, or D'),
  weight: z.number().int().positive('Weight must be a positive number').optional().default(1),
  negative_mark: z.number().int().nonnegative('Negative mark must be non-negative').optional().default(0),
  options: z.object({
    A: z.string().min(1, 'Option A is required'),
    B: z.string().min(1, 'Option B is required'),
    C: z.string().min(1, 'Option C is required'),
    D: z.string().min(1, 'Option D is required')
  })
});

export const poolRuleSchema = z.object({
  tag: z.string().max(255).optional().nullable(),
  difficulty: z.string().max(255).optional().nullable(),
  question_count: z.number().int().nonnegative('Question count must be non-negative')
});

export const poolRulesSchema = z.object({
  rules: z.array(poolRuleSchema).min(1, 'At least one rule is required')
});
