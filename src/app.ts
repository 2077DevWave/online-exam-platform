import express from 'express';
import path from 'path';
import { getDb, saveDb } from './database';
import { registerRoutes } from './routes';

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

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
