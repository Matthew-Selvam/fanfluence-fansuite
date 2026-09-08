import { createApp } from './main.js';

createApp().catch((err) => {
  console.error('fatal boot error:', err);
  process.exit(1);
});