import 'source-map-support/register';
import { createServer } from './src/main.js';

let cached: any = null;

export default async function handler(req: any, reply: any) {
  if (!cached) {
    const app = await createServer('production');
    cached = app;
  }
  await cached.ready();
  cached.routing(req, reply);
}