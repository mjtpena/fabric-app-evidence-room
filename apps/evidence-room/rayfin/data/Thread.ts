import { date, entity, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * The conversation on a request: queries, replies, notes and withdrawal reasons. Append-only. Security: everyone
 * reads; you can only post as yourself (bySub = your sub); no update or delete.
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', {
  policy: (claims, item) => claims.sub.eq(item.bySub),
})
export class Thread {
  @uuid() id!: string;
  @uuid() requestId!: string;
  @text({ min: 1, max: 255 }) bySub!: string;
  @text({ min: 1, max: 100 }) byName!: string;
  @set('auditor', 'client') side!: 'auditor' | 'client';
  @set('message', 'query', 'withdrawal') kind!: 'message' | 'query' | 'withdrawal';
  @text({ min: 1, max: 1500 }) body!: string;
  @date() at!: Date;
}
