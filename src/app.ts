import express from 'express';
import path from 'path';
import { registerRoutes } from './routes';

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  registerRoutes(app);

  app.get('/exam/:id', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'exam.html'));
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
