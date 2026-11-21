import { entity, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * Who is in the room and on which side. The side decides who may write requests, raise queries and accept
 * (auditors) and who provides evidence (owners and coordinators). Read-only through the API, so a signed-in user
 * cannot add themselves as an auditor; the deployer manages members with SQL or the seed tool.
 */
@entity()
@role('authenticated', 'read')
export class Member {
  @uuid() id!: string;
  @uuid() engagementId!: string;
  @text({ min: 1, max: 255 }) personSub!: string;
  @text({ min: 1, max: 100 }) personName!: string;
  @set('auditor', 'client') side!: 'auditor' | 'client';
  @set('lead', 'member', 'coordinator') role!: 'lead' | 'member' | 'coordinator';
}
