import { date, entity, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * One audit engagement (the room). Read-only through the API: the deployer creates engagements, areas and members
 * with SQL or the seed tool, so nobody can make themselves an auditor or a coordinator from the app.
 */
@entity()
@role('authenticated', 'read')
export class Engagement {
  @uuid() id!: string;
  @text({ min: 3, max: 120 }) name!: string;
  @date() periodEnd!: Date;
  @date() fieldworkStart!: Date;
  @date() fieldworkEnd!: Date;
  @set('planning', 'fieldwork', 'completion', 'closed') status!: 'planning' | 'fieldwork' | 'completion' | 'closed';
}
