import type { SupabaseClient } from "@supabase/supabase-js";

export type SocialProfile = {
  user_id: string; display_name: string; avatar_path: string | null;
  bio?: string; interests?: string[];
  adult_confirmed_at?: string | null; suspended_at?: string | null;
};
export type SocialVoyage = { id: string; ship: string; starts_on: string; ends_on: string };
export type SocialPost = { id: string; voyage_id: string; author_id: string; category: string; body: string; created_at: string };
export type SocialReply = { id: string; post_id: string; author_id: string; body: string; created_at: string };
export type SocialStory = { id: string; voyage_id: string; author_id: string; caption: string; photo_path: string; published_at: string; expires_at: string };
export type SocialPostPhoto = { post_id: string; slot: number; path: string };
export type SocialReplyPhoto = { reply_id: string; path: string };
export type SocialReaction = { target_kind: "post" | "reply"; target_id: string; emoji: string; total: number; reacted_by_me: boolean };
export type SocialFriendRequest = { id: string; requester_id: string; recipient_id: string; status: string; created_at: string };
export type SocialMessage = { id: string; sender_id: string; recipient_id: string; body: string; created_at: string };
export type SocialBlock = { blocked_id: string };
export type SocialPostCursor = { created_at: string; id: string };
export type SocialPostsPage = {
  posts: SocialPost[];
  replies: SocialReply[];
  postPhotos: SocialPostPhoto[];
  replyPhotos: SocialReplyPhoto[];
  profiles: Record<string, SocialProfile>;
  reactions: SocialReaction[];
  repliesTruncated: boolean;
  hasMore: boolean;
  nextCursor: SocialPostCursor | null;
};

export type SocialData = {
  posts: SocialPost[];
  replies: SocialReply[];
  postPhotos: SocialPostPhoto[];
  replyPhotos: SocialReplyPhoto[];
  stories: SocialStory[];
  directory: string[];
  profiles: Record<string, SocialProfile>;
  reactions: SocialReaction[];
  requests: SocialFriendRequest[];
  messages: SocialMessage[];
  blocks: SocialBlock[];
  repliesTruncated: boolean;
  postsHasMore: boolean;
  postsCursor: SocialPostCursor | null;
};

export const EMPTY_SOCIAL_DATA: SocialData = {
  posts: [], replies: [], postPhotos: [], replyPhotos: [], stories: [], directory: [],
  profiles: {}, reactions: [], requests: [], messages: [], blocks: [], repliesTruncated: false,
  postsHasMore: false, postsCursor: null,
};

const POST_PAGE_SIZE = 50;
const POST_REPLY_PREVIEW_SIZE = 300;
const CONVERSATION_PAGE_SIZE = 50;
const REPLY_PAGE_SIZE = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

// Keep the database's timestamp precision; Date.toISOString() would discard
// microseconds and could skip posts with the same millisecond.
export function olderPostFilter(cursor: SocialPostCursor): string {
  if (!UUID.test(cursor.id) || !TIMESTAMP.test(cursor.created_at) || Number.isNaN(Date.parse(cursor.created_at))) {
    throw new Error("Ungültiger Beitrags-Cursor.");
  }
  return `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`;
}

async function loadVisibleProfiles(client: SupabaseClient, ids: string[]): Promise<SocialProfile[]> {
  const profiles: SocialProfile[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const part = ids.slice(offset, offset + 100);
    const enriched = await client.from("ahoier_profiles")
      .select("user_id,display_name,avatar_path,bio,interests").in("user_id", part);
    // A running client can be deployed before the optional profile-field
    // migration. Retry only missing-column errors; preserve other failures.
    let rows: SocialProfile[];
    if (enriched.error?.code === "42703") {
      const legacy = await client.from("ahoier_profiles")
        .select("user_id,display_name,avatar_path").in("user_id", part);
      if (legacy.error) throw legacy.error;
      rows = (legacy.data ?? []) as SocialProfile[];
    } else {
      if (enriched.error) throw enriched.error;
      rows = (enriched.data ?? []) as SocialProfile[];
    }
    profiles.push(...rows.map(profile => ({
      ...profile,
      bio: typeof profile.bio === "string" ? profile.bio : "",
      interests: Array.isArray(profile.interests) ? profile.interests.filter((item): item is string => typeof item === "string") : [],
    })));
  }
  return profiles;
}

async function loadReactionSummaryForTargets(
  client: SupabaseClient, voyageId: string, targetIds: string[],
): Promise<SocialReaction[]> {
  if (!UUID.test(voyageId)) throw new Error("Ungültige Reisegruppe.");
  const queries = [];
  for (let offset = 0; offset < targetIds.length; offset += 75) {
    // A table-valued RPC can be filtered by PostgREST. The RPC still applies
    // voyage/member visibility while the response stays bounded to these IDs.
    queries.push(client.rpc("ahoier_reaction_summary", { p_voyage_id: voyageId })
      .in("target_id", targetIds.slice(offset, offset + 75)));
  }
  const results = await Promise.all(queries);
  if (results.some(result => result.error)) throw new Error("Reaktionen konnten nicht geladen werden.");
  return results.flatMap(result => ((result.data ?? []) as SocialReaction[])
    .map(row => ({ ...row, total: Number(row.total) })));
}

export async function loadPostRepliesPage(client: SupabaseClient, postId: string, before?: SocialPostCursor, voyageId?: string): Promise<{ replies: SocialReply[]; photos: SocialReplyPhoto[]; profiles: SocialProfile[]; reactions: SocialReaction[]; hasMore: boolean; nextCursor: SocialPostCursor | null }> {
  if (!UUID.test(postId)) throw new Error("Ungültiger Beitrag.");
  let query = client.from("ahoier_replies")
    .select("id,post_id,author_id,body,created_at")
    .eq("post_id", postId).not("published_at", "is", null)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .limit(REPLY_PAGE_SIZE + 1);
  if (before) query = query.or(olderPostFilter(before));
  const result = await query;
  if (result.error) throw result.error;
  const rows = (result.data ?? []) as SocialReply[];
  const replies = rows.slice(0, REPLY_PAGE_SIZE).reverse();
  const ids = replies.map(reply => reply.id);
  const authors = [...new Set(replies.map(reply => reply.author_id))];
  const [photos, profiles, reactions] = await Promise.all([
    ids.length ? client.from("ahoier_reply_photos").select("reply_id,path").in("reply_id", ids) : Promise.resolve(null),
    loadVisibleProfiles(client, authors),
    voyageId && ids.length ? loadReactionSummaryForTargets(client, voyageId, ids) : Promise.resolve([]),
  ]);
  if (photos?.error) throw new Error("Antworten konnten nicht geladen werden.");
  const oldest = replies[0];
  return { replies, photos: (photos?.data ?? []) as SocialReplyPhoto[], profiles, reactions,
    hasMore: rows.length > REPLY_PAGE_SIZE,
    nextCursor: oldest ? { created_at: oldest.created_at, id: oldest.id } : null };
}

export async function loadConversationPage(client: SupabaseClient, userId: string, peerId: string, before?: string): Promise<{ messages: SocialMessage[]; hasMore: boolean }> {
  // Only UUIDs already selected from authenticated profile rows reach this
  // PostgREST expression. RLS still limits every returned row to a participant.
  if (!/^[0-9a-f-]{36}$/.test(userId) || !/^[0-9a-f-]{36}$/.test(peerId)) throw new Error("Ungültiger Kontakt.");
  let query = client.from("ahoier_messages")
    .select("id,sender_id,recipient_id,body,created_at")
    .or(`and(sender_id.eq.${userId},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${userId})`)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .limit(CONVERSATION_PAGE_SIZE + 1);
  if (before) query = query.lt("created_at", before);
  const result = await query;
  if (result.error) throw result.error;
  const rows = (result.data ?? []) as SocialMessage[];
  return { messages: rows.slice(0, CONVERSATION_PAGE_SIZE).reverse(), hasMore: rows.length > CONVERSATION_PAGE_SIZE };
}

export async function loadSocialPostsPage(
  client: SupabaseClient,
  voyageId: string,
  options: { before?: SocialPostCursor; authorId?: string } = {},
): Promise<SocialPostsPage> {
  if (!UUID.test(voyageId) || options.authorId !== undefined && !UUID.test(options.authorId)) throw new Error("Ungültige Reisegruppe oder Person.");
  let query = client.from("ahoier_posts")
    .select("id,voyage_id,author_id,category,body,created_at")
    .eq("voyage_id", voyageId).not("published_at", "is", null)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .limit(POST_PAGE_SIZE + 1);
  if (options.authorId !== undefined) query = query.eq("author_id", options.authorId);
  if (options.before) query = query.or(olderPostFilter(options.before));
  const postResult = await query;
  if (postResult.error) throw postResult.error;
  const rows = (postResult.data ?? []) as SocialPost[];
  return hydrateSocialPosts(client, voyageId, rows.slice(0, POST_PAGE_SIZE), rows.length > POST_PAGE_SIZE);
}

export async function loadSocialPostById(
  client: SupabaseClient, voyageId: string, postId: string,
): Promise<SocialPostsPage | null> {
  if (!UUID.test(voyageId) || !UUID.test(postId)) throw new Error("Ungültige Reisegruppe oder Beitrag.");
  const result = await client.from("ahoier_posts")
    .select("id,voyage_id,author_id,category,body,created_at")
    .eq("voyage_id", voyageId).eq("id", postId).not("published_at", "is", null)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return null;
  return hydrateSocialPosts(client, voyageId, [result.data as SocialPost], false);
}

// Cached history is rechecked against RLS so a moderator-hidden post or reply
// disappears from an open page without forcing the reader back to the top.
export async function visibleSocialIds(
  client: SupabaseClient, voyageId: string, postIds: string[], replyIds: string[],
): Promise<{ posts: Set<string>; replies: Set<string> }> {
  if (!UUID.test(voyageId) || [...postIds, ...replyIds].some(id => !UUID.test(id))) throw new Error("Ungültige Beiträge.");
  const postQueries = [];
  const replyQueries = [];
  for (let offset = 0; offset < postIds.length; offset += 100) {
    postQueries.push(client.from("ahoier_posts").select("id")
      .eq("voyage_id", voyageId).not("published_at", "is", null)
      .in("id", postIds.slice(offset, offset + 100)));
  }
  for (let offset = 0; offset < replyIds.length; offset += 100) {
    replyQueries.push(client.from("ahoier_replies").select("id")
      .not("published_at", "is", null).in("id", replyIds.slice(offset, offset + 100)));
  }
  const [postResults, replyResults] = await Promise.all([Promise.all(postQueries), Promise.all(replyQueries)]);
  if ([...postResults, ...replyResults].some(result => result.error)) throw new Error("Beiträge konnten nicht überprüft werden.");
  return {
    posts: new Set(postResults.flatMap(result => (result.data ?? []).map(row => row.id as string))),
    replies: new Set(replyResults.flatMap(result => (result.data ?? []).map(row => row.id as string))),
  };
}

async function hydrateSocialPosts(
  client: SupabaseClient, voyageId: string, posts: SocialPost[], hasMore: boolean,
): Promise<SocialPostsPage> {
  const last = posts.at(-1);
  const base: SocialPostsPage = {
    posts, replies: [], postPhotos: [], replyPhotos: [], profiles: {}, reactions: [],
    repliesTruncated: false, hasMore,
    nextCursor: last ? { created_at: last.created_at, id: last.id } : null,
  };
  if (!posts.length) return base;

  const postIds = posts.map(post => post.id);
  const [replyResult, photoResult] = await Promise.all([
    client.from("ahoier_replies").select("id,post_id,author_id,body,created_at")
      .in("post_id", postIds).not("published_at", "is", null)
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .limit(POST_REPLY_PREVIEW_SIZE + 1),
    client.from("ahoier_post_photos").select("post_id,slot,path").in("post_id", postIds).order("slot"),
  ]);
  if (replyResult.error || photoResult.error) throw new Error("Beitragsdetails konnten nicht geladen werden.");
  const replyRows = (replyResult.data ?? []) as SocialReply[];
  const replies = replyRows.slice(0, POST_REPLY_PREVIEW_SIZE).reverse();
  const replyIds = replies.map(reply => reply.id);
  const authorIds = [...new Set([...posts.map(post => post.author_id), ...replies.map(reply => reply.author_id)])];
  const targets = [...postIds, ...replyIds];
  const replyPhotoQueries = [];
  for (let offset = 0; offset < replyIds.length; offset += 100) {
    replyPhotoQueries.push(client.from("ahoier_reply_photos").select("reply_id,path")
      .in("reply_id", replyIds.slice(offset, offset + 100)));
  }
  const [replyPhotoResults, reactions, profileRows] = await Promise.all([
    Promise.all(replyPhotoQueries), loadReactionSummaryForTargets(client, voyageId, targets),
    loadVisibleProfiles(client, authorIds),
  ]);
  if (replyPhotoResults.some(result => result.error)) {
    throw new Error("Beitragsdetails konnten nicht geladen werden.");
  }
  return {
    ...base,
    replies,
    postPhotos: (photoResult.data ?? []) as SocialPostPhoto[],
    replyPhotos: replyPhotoResults.flatMap(result => (result.data ?? []) as SocialReplyPhoto[]),
    profiles: Object.fromEntries(profileRows.map(profile => [profile.user_id, profile])),
    reactions,
    repliesTruncated: replyRows.length > POST_REPLY_PREVIEW_SIZE,
  };
}

async function allMemberIds(client: SupabaseClient, voyageId: string): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; ; offset += 200) {
    const result = await client.from("ahoier_memberships").select("user_id")
      .eq("voyage_id", voyageId).order("user_id").range(offset, offset + 199);
    if (result.error) throw result.error;
    const rows = result.data ?? [];
    ids.push(...rows.map(row => row.user_id as string));
    if (rows.length < 200) return ids;
  }
}

export async function loadSocialData(client: SupabaseClient, userId: string, voyageId: string): Promise<SocialData> {
  const [postPage, storyResult, memberIds, requestResult, messageResult, blockResult] = await Promise.all([
    loadSocialPostsPage(client, voyageId),
    client.from("ahoier_stories").select("id,voyage_id,author_id,caption,photo_path,published_at,expires_at")
      .eq("voyage_id", voyageId).gt("expires_at", new Date().toISOString())
      .order("published_at", { ascending: false }).limit(60),
    allMemberIds(client, voyageId),
    client.from("ahoier_friend_requests").select("id,requester_id,recipient_id,status,created_at"),
    client.from("ahoier_messages").select("id,sender_id,recipient_id,body,created_at")
      .order("created_at", { ascending: false }).limit(300),
    client.from("ahoier_blocks").select("blocked_id").eq("blocker_id", userId),
  ]);
  if (storyResult.error || requestResult.error || messageResult.error || blockResult.error) {
    throw new Error("social data");
  }
  const stories = (storyResult.data ?? []) as SocialStory[];
  const requests = (requestResult.data ?? []) as SocialFriendRequest[];
  const messages = ((messageResult.data ?? []) as SocialMessage[]).reverse();
  const people = new Set<string>([
    userId, ...memberIds, ...postPage.posts.map(post => post.author_id), ...postPage.replies.map(reply => reply.author_id),
    ...stories.map(story => story.author_id), ...requests.flatMap(request => [request.requester_id, request.recipient_id]),
    ...messages.flatMap(message => [message.sender_id, message.recipient_id]),
  ]);
  const missingProfiles = [...people].filter(id => !postPage.profiles[id]);
  const profiles = {
    ...postPage.profiles,
    ...Object.fromEntries((await loadVisibleProfiles(client, missingProfiles))
      .map(profile => [profile.user_id, profile])),
  };
  return {
    posts: postPage.posts, replies: postPage.replies, stories, directory: memberIds, profiles,
    postPhotos: postPage.postPhotos, replyPhotos: postPage.replyPhotos,
    reactions: postPage.reactions,
    requests, messages, blocks: (blockResult.data ?? []) as SocialBlock[],
    repliesTruncated: postPage.repliesTruncated,
    postsHasMore: postPage.hasMore, postsCursor: postPage.nextCursor,
  };
}
