import { entity, int, role, text, uuid } from '@microsoft/rayfin-core';

/**
 * An audit area: one drawer in the card catalogue. `code` prefixes request refs (REV-07); `position` orders the
 * drawers. Read-only through the API (set up with SQL or the seed tool).
 */
@entity()
@role('authenticated', 'read')
export class AuditArea {
  @uuid() id!: string;
  @uuid() engagementId!: string;
  @text({ min: 3, max: 60 }) name!: string;
  @text({ min: 2, max: 6 }) code!: string;
  @int() position!: number;
  @text({ min: 1, max: 100 }) leadAuditorName!: string;
}
