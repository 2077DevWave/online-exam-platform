import { getDb } from './database';
import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

async function start() {
  await getDb();
  console.log('Database ready.');
  app.listen(env.port, () => {
    console.log(`Server running on http://localhost:${env.port}`);
  });
}

start().catch(console.error);