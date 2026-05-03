import { Express } from 'express';
import authRoutes from './auth';
import studentRoutes from './student';
import teacherRoutes from './teacher';

export function registerRoutes(app: Express): void {
  app.use('/api', authRoutes);
  app.use('/api', studentRoutes);
  app.use('/api', teacherRoutes);
}
