import type { Principal } from '../domain/permissions.js';
import { forbidden } from '../core/errors.js';
import { can, type Permission } from '../domain/permissions.js';

/**
 * The per-request identity every service call carries. Passing this explicitly
 * (rather than reading ambient state) is what makes workspace scoping and the
 * §103 permission checks impossible to forget.
 */
export interface Actor {
  principal: Principal;
  /** How the action was initiated — audit and event rows record this. */
  kind: 'user' | 'system' | 'automation' | 'ai';
  deviceId?: string | null;
  ip?: string | null;
  automationRunId?: string | null;
  source?: string | null;
}

export function systemActor(workspaceId: string, userId = 'system'): Actor {
  return {
    principal: { userId, workspaceId, role: 'owner' },
    kind: 'system',
    source: 'system',
  };
}

export function automationActor(workspaceId: string, runId: string): Actor {
  return {
    principal: { userId: 'automation', workspaceId, role: 'manager' },
    kind: 'automation',
    automationRunId: runId,
    source: 'automation',
  };
}

export function requirePermission(actor: Actor, permission: Permission): void {
  // System and automation actors are still bound by their principal's role, so
  // an automation running as a CRM agent cannot reach studio generation.
  if (!can(actor.principal, permission)) {
    throw forbidden(`Missing permission: ${permission}`,
      `The role "${actor.principal.role}" does not grant ${permission}.`);
  }
}

export const workspaceOf = (actor: Actor): string => actor.principal.workspaceId;
