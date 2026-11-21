/**
 * A mirror of the row-level security on the entities (rayfin/data/*.ts), so tests can check that every write the
 * app makes is one the deployed API accepts. Keep in step with the decorators.
 *
 * What the database enforces (Fabric mode):
 * - Engagement, AuditArea, Member: read-only (managed with SQL or the seed tool).
 * - EvidenceRequest create: createdBy = caller and status = 'open'; owner and stamps cannot be set.
 * - EvidenceRequest update: only while the row is live (open, in progress, submitted, query); the request's
 *   content is frozen. No delete.
 * - Evidence create: addedBy = caller. Thread create: bySub = caller. Neither can be updated or deleted.
 * What it cannot express (no claim says which side someone is on) is enforced in src/domain/room.ts.
 */
import type { EvidenceRequest, Status } from '../model';
import { LIVE } from './rules';

export const REQUEST_CREATE_EXCLUDED = ['ownerSub', 'ownerName', 'submittedAt', 'acceptedAt', 'acceptedBy'] as const;

export const REQUEST_UPDATE_EXCLUDED = ['engagementId', 'areaId', 'ref', 'title', 'detail', 'dueAt', 'priority', 'createdBy'] as const;

/** The create row policy. */
export function canCreateRequestRow(sub: string, row: Pick<EvidenceRequest, 'createdBy' | 'status'>): boolean {
  return row.createdBy === sub && row.status === 'open';
}

/** The update row policy (evaluated on the existing row). */
export function canUpdateRequestRow(existing: { status: Status }): boolean {
  return LIVE.includes(existing.status);
}

/** True when a patch only touches fields the update policy lets through. */
export function patchAllowed(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).every((k) => !(REQUEST_UPDATE_EXCLUDED as readonly string[]).includes(k));
}
