import type { SupabaseClient } from "@supabase/supabase-js";

export type SocialProfile = { user_id: string; display_name: string; avatar_path: string | null; adult_confirmed_at?: string | null; suspended_at?: string | null };
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
};

export const EMPTY_SOCIAL_DATA: SocialData = {
  posts: [], replies: [], postPhotos: [], replyPhotos: [], stories: [], directory: [],
  profiles: {}, reactions: [], requests: [], messages: [], blocks: [], repliesTruncated: false,
};

const CONVERSATION_PAGE_SIZE = 50;
const REPLY_PAGE_SIZE = 50;

export async function loadPostRepliesPage(client: SupabaseClient, postId: string, before?: string): Promise<{ replies: SocialReply[]; photos: SocialReplyPhoto[]; profiles: SocialProfile[]; hasMore: boolean }> {
  if (!/^[0-9a-f-]{36}$/.test(postId)) throw new Error("Ungültiger Beitrag.");
  let query = client.from("ahoier_replies")
    .select("id,post_id,author_id,body,created_at")
    .eq("post_id", postId).not("published_at", "is", null)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .limit(REPLY_PAGE_SIZE + 1);
  if (before) query = query.lt("created_at", before);
  const result = await query;
  if (result.error) throw result.error;
  const rows = (result.data ?? []) as SocialReply[];
  const replies = rows.slice(0, REPLY_PAGE_SIZE).reverse();
  const ids = replies.map(reply => reply.id);
  const authors = [...new Set(replies.map(reply => reply.author_id))];
  const [photos, profiles] = await Promise.all([
    ids.length ? client.from("ahoier_reply_photos").select("reply_id,path").in("reply_id", ids) : Promise.resolve(null),
    authors.length ? client.from("ahoier_profiles").select("user_id,display_name,avatar_path").in("user_id", authors) : Promise.resolve(null),
  ]);
  if (photos?.error || profiles?.error) throw new Error("Antworten konnten nicht geladen werden.");
  return { replies, photos: (photos?.data ?? []) as SocialReplyPhoto[], profiles: (profiles?.data ?? []) as SocialProfile[], hasMore: rows.length > REPLY_PAGE_SIZE };
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
  const [postResult, storyResult, memberIds, reactionResult, requestResult, messageResult, blockResult] = await Promise.all([
    client.from("ahoier_posts").select("id,voyage_id,author_id,category,body,created_at")
      .eq("voyage_id", voyageId).not("published_at", "is", null).order("created_at", { ascending: false }).limit(50),
    client.from("ahoier_stories").select("id,voyage_id,author_id,caption,photo_path,published_at,expires_at")
      .eq("voyage_id", voyageId).gt("expires_at", new Date().toISOString())
      .order("published_at", { ascending: false }).limit(60),
    allMemberIds(client, voyageId),
    client.rpc("ahoier_reaction_summary", { p_voyage_id: voyageId }),
    client.from("ahoier_friend_requests").select("id,requester_id,recipient_id,status,created_at"),
    client.from("ahoier_messages").select("id,sender_id,recipient_id,body,created_at")
      .order("created_at", { ascending: false }).limit(300),
    client.from("ahoier_blocks").select("blocked_id").eq("blocker_id", userId),
  ]);
  if (postResult.error || storyResult.error || reactionResult.error || requestResult.error || messageResult.error || blockResult.error) {
    throw new Error("social data");
  }
  const posts = (postResult.data ?? []) as SocialPost[];
  const stories = (storyResult.data ?? []) as SocialStory[];
  const postIds = posts.map(post => post.id);
  const [replyResult, photoResult] = await Promise.all([
    postIds.length ? client.from("ahoier_replies").select("id,post_id,author_id,body,created_at")
      .in("post_id", postIds).not("published_at", "is", null).order("created_at", { ascending: false }).limit(301) : Promise.resolve(null),
    postIds.length ? client.from("ahoier_post_photos").select("post_id,slot,path")
      .in("post_id", postIds).order("slot") : Promise.resolve(null),
  ]);
  if (replyResult?.error || photoResult?.error) throw new Error("feed media");
  const replyRows = (replyResult?.data ?? []) as SocialReply[];
  const repliesTruncated = replyRows.length > 300;
  const replies = replyRows.slice(0, 300).reverse();
  const replyIds = replies.map(reply => reply.id);
  const replyPhotoResult = replyIds.length
    ? await client.from("ahoier_reply_photos").select("reply_id,path").in("reply_id", replyIds)
    : null;
  if (replyPhotoResult?.error) throw new Error("reply media");
  const requests = (requestResult.data ?? []) as SocialFriendRequest[];
  const messages = ((messageResult.data ?? []) as SocialMessage[]).reverse();
  const people = new Set<string>([
    userId, ...memberIds, ...posts.map(post => post.author_id), ...replies.map(reply => reply.author_id),
    ...stories.map(story => story.author_id), ...requests.flatMap(request => [request.requester_id, request.recipient_id]),
    ...messages.flatMap(message => [message.sender_id, message.recipient_id]),
  ]);
  const profiles: Record<string, SocialProfile> = {};
  const ids = [...people];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const result = await client.from("ahoier_profiles")
      .select("user_id,display_name,avatar_path")
      .in("user_id", ids.slice(offset, offset + 100));
    if (result.error) throw result.error;
    for (const profile of (result.data ?? []) as SocialProfile[]) profiles[profile.user_id] = profile;
  }
  return {
    posts, replies, stories, directory: memberIds, profiles,
    postPhotos: (photoResult?.data ?? []) as SocialPostPhoto[],
    replyPhotos: (replyPhotoResult?.data ?? []) as SocialReplyPhoto[],
    reactions: ((reactionResult.data ?? []) as SocialReaction[]).map(row => ({ ...row, total: Number(row.total) })),
    requests, messages, blocks: (blockResult.data ?? []) as SocialBlock[], repliesTruncated,
  };
}
