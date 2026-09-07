import { z } from 'zod';

/** Spec §103 */
export const Role = z.enum([
  'owner',
  'admin',
  'manager',
  'creator',
  'crm_agent',
  'viewer',
  'developer',
]);
export type Role = z.infer<typeof Role>;

/** Spec §103 — permission granularity, expressed as `domain:action`. */
export const PERMISSIONS = [
  'studio:read',
  'studio:write',
  'studio:generate',
  'studio:delete',
  'crm:read',
  'crm:write',
  'crm:message',
  'crm:delete',
  'publishing:read',
  'publishing:publish',
  'ai:use',
  'ai:configure',
  'automations:read',
  'automations:write',
  'automations:run',
  'approvals:decide',
  'integrations:read',
  'integrations:manage',
  'billing:manage',
  'workspace:manage',
  'members:manage',
  'audit:read',
  'developer:access',
  'data:export',
  'data:import',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

/**
 * Default grants per role. Spec §104/§105 give the shape: a CRM Agent messages
 * fans but cannot touch providers; a Creator generates but cannot touch billing
 * or global credentials.
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ALL,
  admin: ALL.filter((p) => p !== 'billing:manage'),
  manager: [
    'studio:read', 'studio:write', 'studio:generate',
    'crm:read', 'crm:write', 'crm:message',
    'publishing:read', 'publishing:publish',
    'ai:use',
    'automations:read', 'automations:write', 'automations:run',
    'approvals:decide',
    'integrations:read',
    'audit:read',
    'data:export',
  ],
  creator: [
    'studio:read', 'studio:write', 'studio:generate',
    'crm:read',
    'publishing:read',
    'ai:use',
    'automations:read',
    'integrations:read',
    'data:export',
  ],
  crm_agent: [
    'crm:read', 'crm:write', 'crm:message',
    'studio:read',
    'ai:use',
    'automations:read',
    'integrations:read',
  ],
  viewer: ['studio:read', 'crm:read', 'publishing:read', 'automations:read', 'integrations:read'],
  developer: [
    'developer:access',
    'studio:read', 'crm:read',
    'integrations:read', 'integrations:manage',
    'ai:configure', 'ai:use',
    'automations:read',
    'audit:read',
    'data:export', 'data:import',
  ],
};

export interface Principal {
  userId: string;
  workspaceId: string;
  role: Role;
  /** Extra grants layered on top of the role. */
  overrides?: Permission[];
}

export function permissionsFor(principal: Principal): Set<Permission> {
  return new Set<Permission>([
    ...ROLE_PERMISSIONS[principal.role],
    ...(principal.overrides ?? []),
  ]);
}

export function can(principal: Principal, permission: Permission): boolean {
  return permissionsFor(principal).has(permission);
}
