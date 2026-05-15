import express from 'express';
import path from 'path';
import { getDb, saveDb } from './database';
import { registerRoutes } from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  setInterval(async () => {
    const db = await getDb();
    db.run(
      `UPDATE notification_jobs
       SET status = 'sent'
       WHERE status = 'pending' AND datetime(scheduled_for) <= datetime('now')`
    );
    saveDb();
  }, 30_000).unref();

  registerRoutes(app);

  app.get('/exam/:id', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'exam.html'));
  });

  // Improved health check that verifies database connection
  app.get('/api/health', async (req, res, next) => {
    try {
      const db = await getDb();
      // Test database connection with a simple query
      db.exec('SELECT 1');
      res.json({ 
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  });

  // Error handling middleware
  app.use(errorHandler);
  
  // 404 handler for unknown routes
  app.use(notFoundHandler);

  return app;
}
