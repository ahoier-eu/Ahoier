import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadPostRepliesPage, loadSocialData, loadSocialPostById, loadSocialPostsPage, olderPostFilter, visibleSocialIds } from '../src/components/live-social-data.ts';

const voyage = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherVoyage = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const id = number => `00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
const when = '2026-10-05T12:00:00.123456+00:00';

function fakeClient({ legacyProfiles = false, replyCount = 1 } = {}) {
  const posts = Array.from({ length: 52 }, (_, index) => ({
    id: id(index + 1), voyage_id: voyage, author_id: index % 2 ? bob : alice,
    category: 'Frage', body: `Post ${index + 1}`, created_at: when, published_at: when,
  }));
  posts.push({ id: id(1000), voyage_id: otherVoyage, author_id: alice,
    category: 'Frage', body: 'Other voyage', created_at: when, published_at: when });
  posts.push({ id: id(1001), voyage_id: voyage, author_id: alice,
    category: 'Frage', body: 'Draft', created_at: when, published_at: null });
  const oldest = id(1);
  const reply = id(2000);
  const rows = {
    ahoier_posts: posts,
    ahoier_replies: Array.from({ length: replyCount }, (_, index) => ({ id: id(2000 + index), post_id: oldest, author_id: bob, body: 'Ahoi', created_at: when, published_at: when })),
    ahoier_post_photos: [{ post_id: oldest, slot: 0, path: 'post-photo.webp' }],
    ahoier_reply_photos: [{ reply_id: reply, path: 'reply-photo.webp' }],
    ahoier_profiles: [
      { user_id: alice, display_name: 'Alice', avatar_path: null, bio: 'Hi', interests: ['Spiele'] },
      { user_id: bob, display_name: 'Bob', avatar_path: null, bio: 'Ahoi', interests: [] },
    ],
    ahoier_memberships: [{ voyage_id: voyage, user_id: alice }, { voyage_id: voyage, user_id: bob }],
    ahoier_stories: [], ahoier_friend_requests: [], ahoier_messages: [], ahoier_blocks: [],
    'rpc:ahoier_reaction_summary': [
      { target_kind: 'post', target_id: oldest, emoji: '👍', total: '2', reacted_by_me: true },
      { target_kind: 'reply', target_id: reply, emoji: '❤️', total: '1', reacted_by_me: false },
    ],
  };
  const calls = [];
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.orders = []; this.columns = ''; this.max = Infinity; this.start = 0; }
    select(columns) { this.columns = columns; return this; }
    eq(column, value) { this.filters.push(row => row[column] === value); return this; }
    not(column, operator, value) { assert.equal(operator, 'is'); this.filters.push(row => row[column] !== value); return this; }
    gt(column, value) { this.filters.push(row => row[column] > value); return this; }
    in(column, values) { this.filters.push(row => values.includes(row[column])); return this; }
    order(column, { ascending = true } = {}) { this.orders.push([column, ascending]); return this; }
    limit(value) { this.max = value; return this; }
    range(start, end) { this.start = start; this.max = end - start + 1; return this; }
    or(filter) {
      const match = /^created_at\.lt\.(.+),and\(created_at\.eq\.(.+),id\.lt\.([0-9a-f-]{36})\)$/.exec(filter);
      assert.ok(match, `Unexpected cursor filter: ${filter}`);
      assert.equal(match[1], match[2]);
      this.filters.push(row => row.created_at < match[1] || row.created_at === match[1] && row.id < match[3]);
      return this;
    }
    maybeSingle() { return Promise.resolve(this.run(true)); }
    then(resolve, reject) { return Promise.resolve(this.run(false)).then(resolve, reject); }
    run(single) {
      calls.push({ table: this.table, columns: this.columns, limit: this.max, orders: this.orders });
      if (legacyProfiles && this.table === 'ahoier_profiles' && this.columns.includes('bio')) {
        return { data: null, error: { code: '42703', message: 'column bio does not exist' } };
      }
      let result = (rows[this.table] ?? []).filter(row => this.filters.every(test => test(row)));
      result = result.sort((a, b) => {
        for (const [column, ascending] of this.orders) {
          const diff = String(a[column]).localeCompare(String(b[column]));
          if (diff) return ascending ? diff : -diff;
        }
        return 0;
      }).slice(this.start, this.start + this.max);
      if (this.columns) {
        const columns = this.columns.split(',');
        result = result.map(row => Object.fromEntries(columns.map(column => [column, row[column]])));
      }
      return { data: single ? result[0] ?? null : result, error: null };
    }
  }
  return { client: { from: table => new Query(table), rpc: name => new Query(`rpc:${name}`) }, calls, oldest, reply };
}

test('post cursor preserves microseconds and rejects unsafe PostgREST expressions', () => {
  assert.equal(olderPostFilter({ created_at: when, id: id(50) }),
    `created_at.lt.${when},and(created_at.eq.${when},id.lt.${id(50)})`);
  assert.throws(() => olderPostFilter({ created_at: `${when}),id.gt.${id(1)}`, id: id(50) }));
  assert.throws(() => olderPostFilter({ created_at: when, id: 'not-a-uuid' }));
});

test('feed and profile history page across equal timestamps without duplicates', async () => {
  const { client, calls, oldest, reply } = fakeClient();
  const first = await loadSocialPostsPage(client, voyage);
  const second = await loadSocialPostsPage(client, voyage, { before: first.nextCursor });
  assert.equal(first.posts.length, 50);
  assert.equal(first.hasMore, true);
  assert.equal(second.posts.length, 2);
  assert.equal(second.hasMore, false);
  assert.equal(new Set([...first.posts, ...second.posts].map(post => post.id)).size, 52);
  assert.deepEqual([...first.posts, ...second.posts].map(post => post.id),
    Array.from({ length: 52 }, (_, i) => id(52 - i)));
  assert.ok(calls.filter(call => call.table === 'ahoier_posts').every(call => call.limit === 51));
  assert.deepEqual(calls.find(call => call.table === 'ahoier_posts').orders,
    [['created_at', false], ['id', false]]);
  assert.deepEqual(second.postPhotos.map(photo => photo.post_id), [oldest]);
  assert.deepEqual(second.replyPhotos.map(photo => photo.reply_id), [reply]);
  assert.equal(second.reactions.find(row => row.target_id === oldest).total, 2);
  assert.equal(second.profiles[bob].bio, 'Ahoi');
  const profile = await loadSocialPostsPage(client, voyage, { authorId: alice });
  assert.equal(profile.posts.length, 26);
  assert.equal(profile.hasMore, false);
  assert.ok(profile.posts.every(post => post.author_id === alice && post.voyage_id === voyage));
});

test('direct post lookup is voyage-scoped, includes relations, and old profile schema degrades', async () => {
  const { client, oldest } = fakeClient({ legacyProfiles: true });
  const page = await loadSocialPostById(client, voyage, oldest);
  assert.deepEqual(page.posts.map(post => post.id), [oldest]);
  assert.equal(page.replyPhotos.length, 1);
  assert.equal(page.profiles[alice].bio, '');
  assert.deepEqual(page.profiles[bob].interests, []);
  assert.equal(await loadSocialPostById(client, otherVoyage, oldest), null);
  assert.equal(await loadSocialPostById(client, voyage, id(9999)), null);
});

test('older replies can fetch their own bounded reaction summary', async () => {
  const { client, oldest, reply } = fakeClient();
  const page = await loadPostRepliesPage(client, oldest, undefined, voyage);
  assert.deepEqual(page.replies.map(item => item.id), [reply]);
  assert.deepEqual(page.reactions.map(item => item.target_id), [reply]);
});

test('reply pages preserve replies with identical timestamps', async () => {
  const { client, oldest } = fakeClient({ replyCount: 52 });
  const first = await loadPostRepliesPage(client, oldest, undefined, voyage);
  const second = await loadPostRepliesPage(client, oldest, first.nextCursor, voyage);
  assert.equal(first.replies.length, 50);
  assert.equal(first.hasMore, true);
  assert.equal(second.replies.length, 2);
  assert.equal(second.hasMore, false);
  assert.equal(new Set([...first.replies, ...second.replies].map(row => row.id)).size, 52);
});

test('cached history recheck stays within the selected voyage and excludes drafts', async () => {
  const { client, oldest, reply } = fakeClient();
  const visible = await visibleSocialIds(client, voyage, [oldest, id(1000), id(1001)], [reply]);
  assert.deepEqual([...visible.posts], [oldest]);
  assert.deepEqual([...visible.replies], [reply]);
});

test('initial social state exposes the same bounded feed cursor', async () => {
  const { client } = fakeClient();
  const data = await loadSocialData(client, alice, voyage);
  assert.equal(data.posts.length, 50);
  assert.equal(data.postsHasMore, true);
  assert.deepEqual(data.postsCursor, { created_at: when, id: id(3) });
  assert.deepEqual(data.directory, [alice, bob]);
});
