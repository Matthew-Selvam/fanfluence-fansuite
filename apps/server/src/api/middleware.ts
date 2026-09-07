import { timingSafeEqual } from 'node:crypto';
import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../core/config.js';
import { AppError } from '../core/errors.js';
import { createLogger, LogLevel } from '../core/logger.js';
import { Principal, Role } from '../domain/permissions.js';
import { Actor } from '../services/context.js';

const log = createLogger({ service: 'api', level: (process.env.FANFLUENCE_LOG_LEVEL as LogLevel) ?? 'info' });

declare module 'fastify' {
  interface FastifyRequest {
    actor?: Actor;
    workspaceId?: string;
  }
}

export function actorFromRequest(req: FastifyRequest, config?: Pick<Config, 'bridgeToken' | 'mode'>): Actor {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const expected = config?.bridgeToken;
  const tokenMatches = Boolean(token && expected && safeTokenEqual(token, expected));

  // Local development can use the anonymous viewer, but an API token is
  // required for privileged access and for every non-dev deployment.
  if (tokenMatches) {
    return {
      principal: { userId: 'api-user', workspaceId: 'default', role: 'manager' },
      kind: 'user',
      ip: req.ip,
    };
  }

  if (config?.mode !== 'dev') {
    throw new AppError('UNAUTHORIZED', 'Authentication required', {
      reason: 'Provide a valid bearer token.',
      affected: 'authentication',
      remediation: ['reconnect'],
      retryable: false,
    });
  }

  return {
    principal: { userId: 'anonymous', workspaceId: 'default', role: 'viewer' },
    kind: 'user',
    ip: req.ip,
  };
}

export function createAuthHook(config: Pick<Config, 'bridgeToken' | 'mode'>) {
  return async function configuredAuthHook(req: FastifyRequest, _reply: FastifyReply) {
    req.actor = actorFromRequest(req, config);
    req.workspaceId = req.actor.principal.workspaceId;
  };
}

export async function authHook(req: FastifyRequest, _reply: FastifyReply) {
  req.actor = actorFromRequest(req);
  req.workspaceId = req.actor.principal.workspaceId;
}

function safeTokenEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof AppError) {
    log.warn('api error', { code: error.code, message: error.message, path: request.url });
    return reply.status(error.status).send(error.toJSON());
  }

  const fastifyErr = error as FastifyError;
  if (fastifyErr.validation) {
    return reply.status(400).send({
      error: {
        code: 'VALIDATION_FAILED',
        message: fastifyErr.message,
        details: fastifyErr.validation,
      },
    });
  }

  log.error('unhandled api error', { message: error.message, stack: error.stack, path: request.url });
  return reply.status(500).send({
    error: {
      code: 'INTERNAL',
      message: 'An unexpected error occurred',
      retryable: true,
    },
  });
}