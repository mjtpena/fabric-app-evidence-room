import { date, entity, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * One "provided by client" request: a card in an area's drawer.
 *
 * Security (README "Security model"):
 * - read: every signed-in user.
 * - create: only as yourself (createdBy = your sub), only in status "open", and without an owner or any
 *   submission/acceptance stamps. That the creator is an auditor is checked in src/domain (Member.side).
 * - update: only while the request is still live (open, in progress, submitted or query): accepted and withdrawn
 *   cards are final at the database. What the auditor asked for (engagement, area, ref, title, detail, due date, priority, creator) is frozen
 *   after create; only the owner, the status and its stamps can change. Who may make which change (owner or
 *   coordinator submits, auditor queries, accepts or withdraws) is checked in the domain, because the policy DSL
 *   cannot look up Member.side. The shelf list flags rows whose stamps do not match the members.
 * - delete: nobody (withdraw instead).
 * Keep the field lists in step with src/domain/policies.ts.
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', {
  policy: (claims, item) => claims.sub.eq(item.createdBy).and(item.status.eq('open')),
  exclude: ['ownerSub', 'ownerName', 'submittedAt', 'acceptedAt', 'acceptedBy'],
})
@role('authenticated', 'update', {
  // Accepted and withdrawn are final: the policy filters the existing row, so a closed card cannot be reopened.
  policy: (_claims, item) =>
    item.status.eq('open').or(item.status.eq('in_progress')).or(item.status.eq('submitted')).or(item.status.eq('query')),
  exclude: ['engagementId', 'areaId', 'ref', 'title', 'detail', 'dueAt', 'priority', 'createdBy'],
})
export class EvidenceRequest {
  @uuid() id!: string;
  @uuid() engagementId!: string;
  @uuid() areaId!: string;
  @text({ min: 2, max: 12 }) ref!: string;
  @text({ min: 3, max: 150 }) title!: string;
  @text({ max: 1500 }) detail!: string;
  @text({ max: 255, optional: true }) ownerSub?: string;
  @text({ max: 100, optional: true }) ownerName?: string;
  @date() dueAt!: Date;
  @set('normal', 'high') priority!: 'normal' | 'high';
  @set('open', 'in_progress', 'submitted', 'query', 'accepted', 'withdrawn')
  status!: 'open' | 'in_progress' | 'submitted' | 'query' | 'accepted' | 'withdrawn';
  @text({ min: 1, max: 255 }) createdBy!: string;
  @date({ optional: true }) submittedAt?: Date;
  @date({ optional: true }) acceptedAt?: Date;
  @text({ max: 255, optional: true }) acceptedBy?: string;
}
