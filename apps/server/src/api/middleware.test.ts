import { describe, expect, it } from 'vitest';
import { actorFromRequest } from './middleware.js';
import { AppError } from '../core/errors.js';

function request(authorization?: string) {
  return {
    headers: authorization ? { authorization } : {},
    ip: '127.0.0.1',
  } as never;
}

describe('actorFromRequest', () => {
  it('only grants the manager actor for the configured bridge token', () => {
    expect(actorFromRequest(request('Bearer correct'), { mode: 'production', bridgeToken: 'correct' }).principal.role).toBe('manager');
    expect(() => actorFromRequest(request('Bearer wrong'), { mode: 'production', bridgeToken: 'correct' })).toThrow(AppError);
  });

  it('keeps unauthenticated development requests read-only', () => {
    expect(actorFromRequest(request(), { mode: 'dev', bridgeToken: 'correct' }).principal.role).toBe('viewer');
  });
});
