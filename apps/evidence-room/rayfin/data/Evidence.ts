import { date, entity, int, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * A piece of evidence on a request: a link, a file name with where it lives, or a note. Append-only: a new version
 * is a new row (version = the submission round). Security: everyone reads; you can only add evidence stamped with
 * your own sub; no update or delete. That you are the owner or a coordinator is checked in the domain.
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', {
  policy: (claims, item) => claims.sub.eq(item.addedBy),
})
export class Evidence {
  @uuid() id!: string;
  @uuid() requestId!: string;
  @set('file', 'link', 'note') kind!: 'file' | 'link' | 'note';
  @text({ min: 1, max: 200 }) title!: string;
  @text({ max: 500 }) location!: string;
  @text({ max: 1000, optional: true }) note?: string;
  @text({ min: 1, max: 255 }) addedBy!: string;
  @date() addedAt!: Date;
  @int() version!: number;
}
