"use client";

/* Authenticated Storage images use short-lived browser object URLs, not Next's public image optimizer. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, ArrowRight, Ban, Camera, Check, Ellipsis, Flag, Heart, House, Image as ImageIcon, MessageCircle, Pencil, RefreshCw, Send, Ship, Trash2, UserRound, Users, X } from "lucide-react";
import { dateLabel } from "@/lib/journey";
import { SHIP_PHOTOS, SHIP_PHOTO_CREDITS } from "@/lib/ships";
import { MAX_SOCIAL_IMAGE_BYTES, prepareSocialImage, SOCIAL_MEDIA_BUCKET } from "@/lib/social-media";
import {
  EMPTY_SOCIAL_DATA, loadConversationPage, loadPostRepliesPage, loadSocialData, loadSocialPostsPage, loadSocialPostById, visibleSocialIds,
  type SocialData, type SocialFriendRequest, type SocialMessage, type SocialPostCursor, type SocialPostsPage, type SocialProfile, type SocialPost, type SocialReply, type SocialReplyPhoto, type SocialStory, type SocialVoyage,
} from "./live-social-data";
import type { NotificationDestination } from "./live-social-notifications";
import { LiveSocialMeetups, type CreateMeetupInput, type MeetupAttendee, type MeetupReportReason, type SocialMeetup } from "./live-social-meetups";

export type { SocialProfile, SocialVoyage } from "./live-social-data";

type Tab = "wall" | "people" | "messages" | "profile";
type ReportTarget = { kind: "post" | "reply" | "story" | "message" | "profile"; id: string };
type Props = {
  client: SupabaseClient;
  userId: string;
  profile: SocialProfile;
  voyage: SocialVoyage;
  voyages: SocialVoyage[];
  unjoinedVoyages: SocialVoyage[];
  onVoyageChange: (id: string) => void;
  onJoinVoyage: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onProfileChanged: () => void;
  navigation: (NotificationDestination & { nonce: string }) | null;
  onNavigationHandled: () => void;
};

const CATEGORIES = ["Frage", "Tipp", "Zusammen an Land", "Fundstück"] as const;
const EMOJI = ["👍", "❤️", "😂", "😮", "🎉"] as const;
const PROFILE_INTERESTS = ["Kaffee", "Kulinarik", "Landgang", "Musik", "Sport", "Kultur", "Fotografie", "Spiele", "Wellness", "Familie", "Natur", "Tanzen"] as const;
const MAX_POST_PHOTOS = 4;
const timeLabel = (value: string) => new Date(value).toLocaleString("de-DE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
function mergeMessages(older: SocialMessage[], newer: SocialMessage[]): SocialMessage[] {
  return [...new Map([...older, ...newer].map(message => [message.id, message])).values()]
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}
function mergeReplies(older: SocialReply[], newer: SocialReply[]): SocialReply[] {
  return [...new Map([...older, ...newer].map(reply => [reply.id, reply])).values()]
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

function PrivateImage({ client, path, alt, className = "" }: { client: SupabaseClient; path: string; alt: string; className?: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true;
    let objectUrl = "";
    void client.storage.from(SOCIAL_MEDIA_BUCKET).download(path).then(({ data, error }) => {
      if (!live || error || !data) return;
      objectUrl = URL.createObjectURL(data);
      setUrl(objectUrl);
    });
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [client, path]);
  return url ? <img src={url} alt={alt} className={className} loading="lazy" /> : <span className={`social-image-placeholder ${className}`} aria-label={alt}><ImageIcon size={22} /></span>;
}

function Avatar({ client, profile, size = "normal" }: { client: SupabaseClient; profile?: SocialProfile; size?: "small" | "normal" | "large" }) {
  return <span className={`social-avatar ${size}`} aria-hidden="true">
    {profile?.avatar_path ? <PrivateImage client={client} path={profile.avatar_path} alt="" /> : (profile?.display_name ?? "G").slice(0, 1).toLocaleUpperCase("de")}
  </span>;
}

function LocalPreview({ file, index }: { file: File; index: number }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    queueMicrotask(() => {
      if (!active) return;
      objectUrl = URL.createObjectURL(file);
      setUrl(objectUrl);
    });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file]);
  return url ? <img src={url} alt={`Ausgewähltes Foto ${index + 1}`} /> : null;
}

function SelectedPhotos({ files }: { files: File[] }) {
  return files.length > 0 && <div className="social-photo-previews">{files.map((file, index) => <LocalPreview key={`${index}-${file.lastModified}-${file.size}`} file={file} index={index} />)}</div>;
}

function PhotoGrid({ client, paths, alt }: { client: SupabaseClient; paths: string[]; alt: string }) {
  if (!paths.length) return null;
  return <div className={`social-photo-grid count-${Math.min(paths.length, 4)}`}>{paths.map((path, index) => <PrivateImage key={path} client={client} path={path} alt={`${alt}, Foto ${index + 1}`} />)}</div>;
}

function ReportDialog({ target, close, submit, busy }: { target: ReportTarget; close: () => void; submit: (event: FormEvent<HTMLFormElement>) => void; busy: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { if (dialog?.open) dialog.close(); }; }, []);
  return <dialog ref={ref} onCancel={close} onClose={close} className="social-dialog" aria-labelledby="social-report-title"><form onSubmit={submit} className="social-panel"><div className="social-dialog-head"><h2 id="social-report-title">Inhalt melden</h2><button type="button" onClick={close} aria-label="Schließen"><X size={19} /></button></div><p>Die Meldung ist nur für die Prüfung sichtbar. Ziel: {target.kind === "message" ? "Nachricht" : target.kind === "story" ? "Story" : target.kind === "reply" ? "Antwort" : target.kind === "profile" ? "Profil" : "Beitrag"}.</p><label htmlFor="social-report-reason">Grund</label><select id="social-report-reason" name="reason" required><option value="spam">Spam</option><option value="harassment">Belästigung</option><option value="unsafe">Unsicherer Inhalt</option><option value="other">Anderes</option></select><label htmlFor="social-report-details">Details (freiwillig)</label><textarea id="social-report-details" name="details" maxLength={300} rows={3} /><button className="social-primary" disabled={busy}>Meldung senden</button></form></dialog>;
}

function StoryDialog({ story, author, client, own, close, report, remove, friendAction }: { story: SocialStory; author?: SocialProfile; client: SupabaseClient; own: boolean; close: () => void; report: () => void; remove: () => void; friendAction: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { if (dialog?.open) dialog.close(); }; }, []);
  return <dialog ref={ref} onCancel={close} onClose={close} className="social-story-dialog" aria-label={`Story von ${author?.display_name ?? "Gast"}`}><div className="social-story-view"><div className="social-story-view-head"><Avatar client={client} profile={author} /><div><strong>{author?.display_name ?? "Gast"}</strong><small>{timeLabel(story.published_at)} · 24 Stunden</small></div><button type="button" onClick={close} aria-label="Story schließen"><X size={21} /></button></div><PrivateImage client={client} path={story.photo_path} alt={`Story von ${author?.display_name ?? "Gast"}`} className="social-story-photo" />{story.caption && <p>{story.caption}</p>}<div className="social-story-view-actions">{own ? <button type="button" onClick={remove}><Trash2 size={16} /> Entfernen</button> : <><button type="button" onClick={friendAction}><Users size={16} /> Profil ansehen</button><button type="button" onClick={report}><Flag size={16} /> Melden</button></>}</div></div></dialog>;
}

export function LiveSocialWorkspace({ client, userId, profile, voyage, voyages, unjoinedVoyages, onVoyageChange, onJoinVoyage, onProfileChanged, navigation, onNavigationHandled }: Props) {
  const [tab, setTab] = useState<Tab>("wall");
  const [data, setData] = useState<SocialData>(EMPTY_SOCIAL_DATA);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);
  const [meetupVersion, setMeetupVersion] = useState(0);
  const [meetupState, setMeetupState] = useState<{ voyageId: string; rows: SocialMeetup[]; status: "loading" | "ready" | "unavailable" | "error" }>({ voyageId: voyage.id, rows: [], status: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Frage");
  const [postBody, setPostBody] = useState("");
  const [postFiles, setPostFiles] = useState<File[]>([]);
  const [replyBodies, setReplyBodies] = useState<Record<string, string>>({});
  const [replyFiles, setReplyFiles] = useState<Record<string, File>>({});
  const [storyCaption, setStoryCaption] = useState("");
  const [storyFile, setStoryFile] = useState<File | null>(null);
  const [showStoryComposer, setShowStoryComposer] = useState(false);
  const [selectedStoryId, setSelectedStoryId] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [peopleSearch, setPeopleSearch] = useState("");
  const [peopleInterest, setPeopleInterest] = useState("");
  const [activePeerId, setActivePeerId] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [conversation, setConversation] = useState<SocialMessage[]>([]);
  const [conversationPeer, setConversationPeer] = useState("");
  const [conversationHasMore, setConversationHasMore] = useState(false);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationError, setConversationError] = useState("");
  const [extraReplies, setExtraReplies] = useState<SocialReply[]>([]);
  const [extraReplyPhotos, setExtraReplyPhotos] = useState<SocialReplyPhoto[]>([]);
  const [extraProfiles, setExtraProfiles] = useState<Record<string, SocialProfile>>({});
  const [replyPaging, setReplyPaging] = useState<Record<string, { loaded: boolean; loading: boolean; hasMore: boolean; oldest?: SocialPostCursor }>>({});
  const [wallPages, setWallPages] = useState<SocialPostsPage[]>([]);
  const [wallPageLoading, setWallPageLoading] = useState(false);
  const [profilePages, setProfilePages] = useState<SocialPostsPage[]>([]);
  const [profileLoadedFor, setProfileLoadedFor] = useState("");
  const [profilePageLoading, setProfilePageLoading] = useState(false);
  const [profilePageError, setProfilePageError] = useState("");
  const [profilePageErrorFor, setProfilePageErrorFor] = useState("");
  const [profileRetry, setProfileRetry] = useState(0);
  const [focusedPostId, setFocusedPostId] = useState("");
  const [focusedMeetupId, setFocusedMeetupId] = useState("");
  const [focusRequest, setFocusRequest] = useState(0);
  const [focusedPostPage, setFocusedPostPage] = useState<SocialPostsPage | null>(null);
  const [focusedPostLoading, setFocusedPostLoading] = useState(false);
  const [extraReactions, setExtraReactions] = useState<SocialData["reactions"]>([]);
  const [isModerator, setIsModerator] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const composerTextarea = useRef<HTMLTextAreaElement>(null);
  const guestProfileHeading = useRef<HTMLHeadingElement>(null);
  const pageEpoch = useRef(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const next = await loadSocialData(client, userId, voyage.id);
        if (active) { setData(next); setLoaded(true); setError(""); }
      } catch {
        if (active) setError("Die Community konnte nicht geladen werden. Bitte aktualisiere die Seite.");
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [client, userId, voyage.id, version]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const result = await client.rpc("ahoier_meetup_summary", { p_voyage_id: voyage.id });
      if (!active) return;
      if (result.error) {
        const missing = ["42883", "PGRST202"].includes(result.error.code);
        setMeetupState({ voyageId: voyage.id, rows: [], status: missing ? "unavailable" : "error" });
      } else {
        setMeetupState({ voyageId: voyage.id, rows: (result.data ?? []) as SocialMeetup[], status: "ready" });
      }
    };
    void load();
    return () => { active = false; };
  }, [client, voyage.id, version, meetupVersion]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setVersion(current => current + 1);
    }, tab === "messages" ? 10_000 : 60_000);
    return () => window.clearInterval(timer);
  }, [tab]);

  const blocked = useMemo(() => new Set(data.blocks.map(block => block.blocked_id)), [data.blocks]);
  const friends = useMemo(() => data.requests.filter(request => request.status === "accepted")
    .map(request => request.requester_id === userId ? request.recipient_id : request.requester_id)
    .filter(id => !blocked.has(id)), [data.requests, userId, blocked]);
  const friendSet = useMemo(() => new Set(friends), [friends]);
  const activePeer = activePeerId && friendSet.has(activePeerId) ? activePeerId : friends[0] ?? "";
  const selectedStory = data.stories.find(story => story.id === selectedStoryId);
  const availableInterests = PROFILE_INTERESTS.filter(interest => data.directory.some(id =>
    id !== userId && !blocked.has(id) && data.profiles[id]?.interests?.includes(interest)));
  const ownInterests = new Set(profile.interests ?? []);
  const directory = data.directory.filter(id => {
    const person = data.profiles[id];
    return id !== userId && !blocked.has(id) && !!person
      && person.display_name.toLocaleLowerCase("de").includes(peopleSearch.trim().toLocaleLowerCase("de"))
      && (!peopleInterest || person.interests?.includes(peopleInterest));
  }).sort((a, b) => {
    const matchCount = (id: string) => data.profiles[id]?.interests?.filter(interest => ownInterests.has(interest)).length ?? 0;
    return matchCount(b) - matchCount(a)
      || (data.profiles[a]?.display_name ?? "").localeCompare(data.profiles[b]?.display_name ?? "", "de");
  });
  const selectedPerson = selectedPersonId && !blocked.has(selectedPersonId) ? data.profiles[selectedPersonId] ?? extraProfiles[selectedPersonId] : undefined;
  const selectedPersonInVoyage = selectedPersonId ? data.directory.includes(selectedPersonId) : false;
  const coverPhoto = SHIP_PHOTOS[voyage.ship];
  const coverCredit = SHIP_PHOTO_CREDITS[voyage.ship];
  const liveMeetupStatus = meetupState.voyageId === voyage.id ? meetupState.status : "loading";
  const liveMeetups = meetupState.voyageId === voyage.id ? meetupState.rows.map(meetup => ({
    ...meetup, organizer_name: data.profiles[meetup.organizer_id]?.display_name ?? null,
  })) : [];
  const previewPeople = data.directory.filter(id => id !== userId && !blocked.has(id)).slice(0, 3);
  const profilePersonId = tab === "profile" ? userId : tab === "people" && selectedPersonInVoyage ? selectedPersonId : "";
  const visibleProfilePages = useMemo(() => profileLoadedFor === profilePersonId ? profilePages : [], [profileLoadedFor, profilePersonId, profilePages]);
  const loadedPages = useMemo(() => [...wallPages, ...visibleProfilePages, ...(focusedPostPage ? [focusedPostPage] : [])], [wallPages, visibleProfilePages, focusedPostPage]);
  const pageProfiles = Object.assign({}, ...loadedPages.map(page => page.profiles)) as Record<string, SocialProfile>;
  const pageReplies = loadedPages.flatMap(page => page.replies);
  const pagePostPhotos = loadedPages.flatMap(page => page.postPhotos);
  const pageReplyPhotos = loadedPages.flatMap(page => page.replyPhotos);
  const pageReactions = loadedPages.flatMap(page => page.reactions);
  const visibleReactions = [...new Map([...pageReactions, ...extraReactions, ...(focusedPostPage?.reactions ?? []), ...data.reactions]
    .map(row => [`${row.target_kind}:${row.target_id}:${row.emoji}`, row])).values()];
  const wallPosts = [...new Map([...data.posts, ...wallPages.flatMap(page => page.posts)].map(post => [post.id, post])).values()]
    .filter(post => !blocked.has(post.author_id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  const focusedPost = focusedPostPage?.posts.find(post => post.id === focusedPostId);
  const visibleWallPosts = focusedPost && !wallPosts.some(post => post.id === focusedPost.id) && !blocked.has(focusedPost.author_id)
    ? [...wallPosts, focusedPost].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)) : wallPosts;
  const profilePosts = [...new Map(visibleProfilePages.flatMap(page => page.posts).map(post => [post.id, post])).values()]
    .filter(post => !blocked.has(post.author_id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  const wallHasMore = wallPages.length ? wallPages[wallPages.length - 1].hasMore : data.postsHasMore;
  const wallCursor: SocialPostCursor | null = wallPages.length ? wallPages[wallPages.length - 1].nextCursor : data.postsCursor;

  useEffect(() => {
    const cached = [...wallPages, ...profilePages, ...(focusedPostPage ? [focusedPostPage] : [])];
    const postIds = new Set(cached.flatMap(page => page.posts.map(post => post.id)));
    const replyIds = new Set([...cached.flatMap(page => page.replies.map(reply => reply.id)), ...extraReplies.map(reply => reply.id)]);
    if (!postIds.size && !replyIds.size) return;
    let active = true;
    const recheck = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const visible = await visibleSocialIds(client, voyage.id, [...postIds], [...replyIds]);
        if (!active) return;
        pageEpoch.current += 1;
        const filterPage = (page: SocialPostsPage): SocialPostsPage => ({
          ...page,
          posts: page.posts.filter(post => !postIds.has(post.id) || visible.posts.has(post.id)),
          replies: page.replies.filter(reply => !replyIds.has(reply.id) || visible.replies.has(reply.id)),
        });
        setWallPages(current => current.map(filterPage));
        setProfilePages(current => current.map(filterPage));
        setFocusedPostPage(current => {
          if (!current) return null;
          const first = current.posts[0];
          return first && postIds.has(first.id) && !visible.posts.has(first.id) ? null : filterPage(current);
        });
        setExtraReplies(current => current.filter(reply => !replyIds.has(reply.id) || visible.replies.has(reply.id)));
      } catch { /* Retain cached content if the recheck failed; the next tick retries. */ }
    };
    const timer = window.setInterval(() => void recheck(), 60_000);
    document.addEventListener("visibilitychange", recheck);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", recheck); };
  }, [client, voyage.id, wallPages, profilePages, focusedPostPage, extraReplies]);

  useEffect(() => {
    if (composerExpanded && tab === "wall") composerTextarea.current?.focus();
  }, [composerExpanded, tab]);

  useEffect(() => {
    if (tab !== "people") return;
    if (selectedPersonId) guestProfileHeading.current?.focus();
    else {
      const heading = document.querySelector<HTMLElement>(".social-people-page h1");
      if (heading) { heading.tabIndex = -1; heading.focus(); }
    }
  }, [tab, selectedPersonId, selectedPerson?.user_id]);

  useEffect(() => {
    pageEpoch.current += 1;
    if (!profilePersonId) return;
    let active = true;
    void loadSocialPostsPage(client, voyage.id, { authorId: profilePersonId }).then(page => {
      if (!active) return;
      setProfilePages([page]);
      setProfileLoadedFor(profilePersonId);
      setProfilePageError("");
      setProfilePageErrorFor("");
    }).catch(() => { if (active) { setProfilePageError("Beiträge konnten nicht geladen werden."); setProfilePageErrorFor(profilePersonId); } })
      .finally(() => { if (active) setProfilePageLoading(false); });
    return () => { active = false; };
  }, [client, voyage.id, profilePersonId, profileRetry]);

  useEffect(() => {
    if (!navigation || !loaded) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (navigation.voyageId && navigation.voyageId !== voyage.id) {
        if (voyages.some(item => item.id === navigation.voyageId)) onVoyageChange(navigation.voyageId);
        else { setError("Diese Reisegruppe ist für dich nicht verfügbar."); onNavigationHandled(); }
        return;
      }
      if (navigation.kind === "meetup_changed" || navigation.kind === "meetup_canceled" || navigation.kind === "meetup_removed") {
        setTab("wall");
        setFocusedMeetupId(navigation.kind === "meetup_removed" ? "" : navigation.meetupId ?? "");
      } else if (navigation.kind === "message") {
        if (friendSet.has(navigation.actorId)) { setActivePeerId(navigation.actorId); setTab("messages"); }
        else setError("Dieses Gespräch ist nicht mehr verfügbar.");
      } else if (navigation.kind === "friend_request" || navigation.kind === "friend_accepted") {
        setSelectedPersonId(data.profiles[navigation.actorId] ? navigation.actorId : "");
        setTab("people");
      } else {
        setTab("wall");
        if (navigation.postId) {
          const postId = navigation.postId;
          setFocusedPostId(postId);
          setFocusRequest(current => current + 1);
          if (!data.posts.some(post => post.id === postId) && !wallPages.some(page => page.posts.some(post => post.id === postId))) {
            setFocusedPostLoading(true);
            void loadSocialPostById(client, voyage.id, postId).then(page => {
              if (!active) return;
              if (page) setFocusedPostPage(page);
              else setError("Dieser Beitrag ist nicht mehr sichtbar.");
            }).catch(() => { if (active) setError("Der Beitrag konnte nicht geöffnet werden."); })
              .finally(() => { if (active) setFocusedPostLoading(false); });
          }
        }
      }
      onNavigationHandled();
    });
    return () => { active = false; };
  }, [navigation, loaded, voyage.id, voyages, onVoyageChange, onNavigationHandled, data.posts, data.profiles, wallPages, client, friendSet]);

  useEffect(() => {
    if (tab !== "wall" || !focusedPostId || focusedPostLoading) return;
    const target = document.getElementById(`social-post-${focusedPostId}`);
    if (target) { target.scrollIntoView({ behavior: "smooth", block: "start" }); target.focus({ preventScroll: true }); }
  }, [tab, focusedPostId, focusRequest, focusedPostLoading, focusedPostPage, loaded]);

  useEffect(() => {
    if (tab !== "wall" || !focusedMeetupId || meetupState.voyageId !== voyage.id || meetupState.status !== "ready") return;
    let active = true;
    const target = document.getElementById(`social-meetup-${focusedMeetupId}`);
    if (target) { target.scrollIntoView({ behavior: "smooth", block: "center" }); target.focus({ preventScroll: true }); }
    queueMicrotask(() => { if (active) { if (!target) setError("Dieses Treffen ist nicht mehr sichtbar."); setFocusedMeetupId(""); } });
    return () => { active = false; };
  }, [tab, focusedMeetupId, meetupState, voyage.id]);

  useEffect(() => {
    if (tab !== "messages" || !activePeer) return;
    let active = true;
    const load = async (reset: boolean) => {
      if (reset) { setConversationLoading(true); setConversationPeer(""); setConversationError(""); }
      try {
        const page = await loadConversationPage(client, userId, activePeer);
        if (!active) return;
        setConversation(previous => reset ? page.messages : mergeMessages(previous, page.messages));
        if (reset) { setConversationHasMore(page.hasMore); setConversationPeer(activePeer); }
        setConversationError("");
      } catch {
        if (active) setConversationError("Der Gesprächsverlauf konnte nicht geladen werden.");
      } finally { if (active && reset) setConversationLoading(false); }
    };
    void load(true);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(false); }, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [client, userId, activePeer, tab]);

  useEffect(() => {
    let active = true;
    void client.rpc("ahoier_is_moderator").then(result => { if (active && !result.error) setIsModerator(result.data === true); });
    return () => { active = false; };
  }, [client, userId]);

  async function loadOlderMessages() {
    if (!activePeer || conversationPeer !== activePeer || !conversationHasMore || conversationLoading || !conversation.length) return;
    setConversationLoading(true); setConversationError("");
    try {
      const page = await loadConversationPage(client, userId, activePeer, conversation[0].created_at);
      setConversation(current => mergeMessages(page.messages, current));
      setConversationHasMore(page.hasMore);
    } catch { setConversationError("Ältere Nachrichten konnten nicht geladen werden."); }
    finally { setConversationLoading(false); }
  }

  async function loadOlderReplies(postId: string) {
    const previous = replyPaging[postId];
    if (previous?.loading || previous?.loaded && !previous.hasMore) return;
    const oldestVisible = [...data.replies, ...pageReplies, ...extraReplies]
      .filter(reply => reply.post_id === postId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0];
    const before = previous?.oldest ?? (oldestVisible ? { created_at: oldestVisible.created_at, id: oldestVisible.id } : undefined);
    setReplyPaging(current => ({ ...current, [postId]: { ...current[postId], loaded: current[postId]?.loaded ?? false, loading: true, hasMore: current[postId]?.hasMore ?? true } }));
    try {
      const page = await loadPostRepliesPage(client, postId, before, voyage.id);
      setExtraReplies(current => mergeReplies(current, page.replies));
      setExtraReplyPhotos(current => [...new Map([...current, ...page.photos].map(photo => [photo.reply_id, photo])).values()]);
      setExtraProfiles(current => ({ ...current, ...Object.fromEntries(page.profiles.map(person => [person.user_id, person])) }));
      setExtraReactions(current => [...new Map([...current, ...page.reactions].map(row => [`${row.target_kind}:${row.target_id}:${row.emoji}`, row])).values()]);
      setReplyPaging(current => ({ ...current, [postId]: { loaded: true, loading: false, hasMore: page.hasMore, oldest: page.nextCursor ?? before } }));
    } catch { setReplyPaging(current => ({ ...current, [postId]: { ...current[postId], loaded: current[postId]?.loaded ?? false, loading: false, hasMore: true } })); showError("Ältere Antworten konnten nicht geladen werden."); }
  }

  function refresh() { setVersion(current => current + 1); }
  async function meetupAction(name: string, args: Record<string, unknown>) {
    const result = await client.rpc(name, args);
    if (result.error) throw result.error;
    setMeetupVersion(current => current + 1);
  }
  async function createMeetup(input: CreateMeetupInput) {
    await meetupAction("ahoier_create_meetup", {
      p_voyage_id: voyage.id, p_title: input.title, p_description: input.description,
      p_location_label: input.location_label, p_starts_at: input.starts_at,
      p_time_zone: input.time_zone, p_capacity: input.capacity,
    });
  }
  async function updateMeetup(id: string, input: CreateMeetupInput) {
    await meetupAction("ahoier_update_meetup", {
      p_meetup_id: id, p_title: input.title, p_description: input.description,
      p_location_label: input.location_label, p_starts_at: input.starts_at,
      p_time_zone: input.time_zone, p_capacity: input.capacity,
    });
  }
  async function loadMeetupAttendees(id: string): Promise<MeetupAttendee[]> {
    const result = await client.rpc("ahoier_meetup_attendees", { p_meetup_id: id });
    if (result.error) throw result.error;
    return (result.data ?? []) as MeetupAttendee[];
  }
  async function reportMeetup(id: string, reason: MeetupReportReason, details: string) {
    const result = await client.from("ahoier_reports").insert({
      meetup_id: id, reporter_id: userId, reason, details,
    });
    if (result.error) throw result.error;
  }
  function showError(message: string) { setError(message); setNotice(""); }
  async function perform(action: () => Promise<void>, success?: string) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); refresh(); if (success) setNotice(success); }
    catch (cause) { showError(cause instanceof Error && cause.message ? cause.message : "Das hat leider nicht funktioniert."); }
    finally { setBusy(false); }
  }

  async function upload(path: string, file: File) {
    if (file.size > MAX_SOCIAL_IMAGE_BYTES) throw new Error("Das Foto ist zu groß.");
    const result = await client.storage.from(SOCIAL_MEDIA_BUCKET).upload(path, file, { contentType: "image/webp", upsert: false });
    if (result.error) throw new Error("Das Foto konnte nicht hochgeladen werden.");
  }

  async function selectPostFiles(files: FileList | null) {
    if (!files) return;
    if (files.length > MAX_POST_PHOTOS) { showError("Du kannst höchstens vier Fotos hinzufügen."); return; }
    try { setPostFiles(await Promise.all(Array.from(files).map(prepareSocialImage))); setError(""); }
    catch (cause) { showError(cause instanceof Error ? cause.message : "Fotos konnten nicht vorbereitet werden."); }
  }

  async function selectReplyFile(postId: string, file?: File) {
    if (!file) return;
    try { const prepared = await prepareSocialImage(file); setReplyFiles(current => ({ ...current, [postId]: prepared })); setError(""); }
    catch (cause) { showError(cause instanceof Error ? cause.message : "Foto konnte nicht vorbereitet werden."); }
  }

  async function selectStoryFile(file?: File) {
    if (!file) return;
    try { setStoryFile(await prepareSocialImage(file)); setError(""); }
    catch (cause) { showError(cause instanceof Error ? cause.message : "Foto konnte nicht vorbereitet werden."); }
  }

  async function publishPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = postBody.trim();
    if (!body && !postFiles.length) return;
    await perform(async () => {
      if (!postFiles.length) {
        const result = await client.from("ahoier_posts").insert({ voyage_id: voyage.id, author_id: userId, category, body });
        if (result.error) throw new Error("Der Beitrag konnte nicht veröffentlicht werden.");
      } else {
        const id = crypto.randomUUID();
        const paths: string[] = [];
        const draft = await client.from("ahoier_posts").insert({ id, voyage_id: voyage.id, author_id: userId, category, body, published_at: null });
        if (draft.error) throw new Error("Der Beitragsentwurf konnte nicht gespeichert werden.");
        try {
          for (let slot = 0; slot < postFiles.length; slot++) {
            const path = `post/${voyage.id}/${id}/${slot}.webp`;
            await upload(path, postFiles[slot]); paths.push(path);
          }
          const photos = await client.from("ahoier_post_photos").insert(paths.map((path, slot) => ({ post_id: id, slot, path })));
          if (photos.error) throw new Error("Die Fotos konnten nicht mit dem Beitrag verbunden werden.");
          const published = await client.rpc("ahoier_publish_post", { p_post_id: id });
          if (published.error) throw new Error("Der Beitrag konnte nicht veröffentlicht werden.");
        } catch (cause) {
          if (paths.length) await client.storage.from(SOCIAL_MEDIA_BUCKET).remove(paths);
          await client.rpc("ahoier_remove_post", { p_post_id: id });
          throw cause;
        }
      }
      setPostBody(""); setPostFiles([]); setComposerExpanded(false); if (fileInput.current) fileInput.current.value = "";
    }, "Dein Beitrag ist in dieser Reisegruppe sichtbar.");
  }

  async function publishReply(event: FormEvent<HTMLFormElement>, postId: string) {
    event.preventDefault();
    const body = (replyBodies[postId] ?? "").trim();
    const file = replyFiles[postId];
    if (!body && !file) return;
    await perform(async () => {
      if (!file) {
        const result = await client.from("ahoier_replies").insert({ post_id: postId, author_id: userId, body });
        if (result.error) throw new Error("Die Antwort konnte nicht gespeichert werden.");
      } else {
        const id = crypto.randomUUID();
        const path = `reply/${voyage.id}/${id}/0.webp`;
        const draft = await client.from("ahoier_replies").insert({ id, post_id: postId, author_id: userId, body, published_at: null });
        if (draft.error) throw new Error("Der Antwortentwurf konnte nicht gespeichert werden.");
        try {
          await upload(path, file);
          const photo = await client.from("ahoier_reply_photos").insert({ reply_id: id, path });
          if (photo.error) throw new Error("Das Foto konnte nicht mit der Antwort verbunden werden.");
          const published = await client.rpc("ahoier_publish_reply", { p_reply_id: id });
          if (published.error) throw new Error("Die Antwort konnte nicht veröffentlicht werden.");
        } catch (cause) {
          await client.storage.from(SOCIAL_MEDIA_BUCKET).remove([path]);
          await client.rpc("ahoier_remove_reply", { p_reply_id: id });
          throw cause;
        }
      }
      setReplyBodies(current => ({ ...current, [postId]: "" }));
      setReplyFiles(current => { const next = { ...current }; delete next[postId]; return next; });
      if (!data.posts.some(post => post.id === postId)) {
        try { setFocusedPostPage(await loadSocialPostById(client, voyage.id, postId)); } catch { /* A later refresh can recover this older thread. */ }
      }
    });
  }

  async function publishStory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!storyFile) return;
    await perform(async () => {
      const draft = await client.from("ahoier_stories")
        .insert({ voyage_id: voyage.id, author_id: userId, caption: storyCaption.trim() })
        .select("id").single();
      if (draft.error || !draft.data) throw new Error("Die Story konnte nicht vorbereitet werden.");
      const id = draft.data.id as string;
      const path = `story/${voyage.id}/${id}/0.webp`;
      try {
        await upload(path, storyFile);
        const attached = await client.from("ahoier_stories").update({ photo_path: path }).eq("id", id);
        if (attached.error) throw new Error("Das Foto konnte nicht mit der Story verbunden werden.");
        const published = await client.rpc("ahoier_publish_story", { p_story_id: id });
        if (published.error) throw new Error("Die Story konnte nicht veröffentlicht werden.");
      } catch (cause) {
        await client.storage.from(SOCIAL_MEDIA_BUCKET).remove([path]);
        await client.rpc("ahoier_remove_story", { p_story_id: id });
        throw cause;
      }
      setStoryFile(null); setStoryCaption(""); setShowStoryComposer(false);
    }, "Deine Story ist 24 Stunden lang sichtbar.");
  }

  async function react(kind: "post" | "reply", id: string, emoji: string | null) {
    const postId = kind === "post" ? id : [...data.replies, ...pageReplies, ...extraReplies].find(reply => reply.id === id)?.post_id;
    await perform(async () => {
      const result = await client.rpc("ahoier_react", { p_post_id: kind === "post" ? id : null, p_reply_id: kind === "reply" ? id : null, p_emoji: emoji });
      if (result.error) throw new Error("Deine Reaktion konnte nicht gespeichert werden.");
      if (postId && !data.posts.some(post => post.id === postId)) {
        try { setFocusedPostPage(await loadSocialPostById(client, voyage.id, postId)); } catch { /* The next refresh can update this reaction. */ }
      }
    });
  }

  async function remove(kind: "post" | "reply" | "story" | "message", id: string) {
    if (!window.confirm(kind === "message" ? "Diese Nachricht aus deiner Ansicht entfernen? Die andere Person kann sie weiterhin sehen." : "Diesen Inhalt entfernen?")) return;
    const rpc = { post: "ahoier_remove_post", reply: "ahoier_remove_reply", story: "ahoier_remove_story", message: "ahoier_remove_message" }[kind];
    const args = { post: { p_post_id: id }, reply: { p_reply_id: id }, story: { p_story_id: id }, message: { p_message_id: id } }[kind];
    await perform(async () => {
      const result = await client.rpc(rpc, args);
      if (result.error) throw new Error("Der Inhalt konnte nicht entfernt werden.");
      if (kind === "post") {
        setData(current => ({ ...current, posts: current.posts.filter(post => post.id !== id) }));
        setWallPages(current => current.map(page => ({ ...page, posts: page.posts.filter(post => post.id !== id) })));
        setProfilePages(current => current.map(page => ({ ...page, posts: page.posts.filter(post => post.id !== id) })));
        setFocusedPostPage(current => current?.posts.some(post => post.id === id) ? null : current);
      }
      if (kind === "reply") {
        setData(current => ({ ...current, replies: current.replies.filter(reply => reply.id !== id) }));
        setWallPages(current => current.map(page => ({ ...page, replies: page.replies.filter(reply => reply.id !== id) })));
        setProfilePages(current => current.map(page => ({ ...page, replies: page.replies.filter(reply => reply.id !== id) })));
        setFocusedPostPage(current => current ? { ...current, replies: current.replies.filter(reply => reply.id !== id) } : null);
        setExtraReplies(current => current.filter(reply => reply.id !== id));
      }
      if (kind === "story") setSelectedStoryId("");
      if (kind === "message") setConversation(current => current.filter(message => message.id !== id));
    }, "Inhalt entfernt.");
  }

  async function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reportTarget) return;
    const form = new FormData(event.currentTarget);
    const target = reportTarget;
    await perform(async () => {
      const result = await client.from("ahoier_reports").insert({
        reporter_id: userId,
        reason: String(form.get("reason") ?? "other"),
        details: String(form.get("details") ?? "").trim(),
        [`${target.kind}_id`]: target.id,
      });
      if (result.error) throw new Error("Die Meldung konnte nicht gespeichert werden. Vielleicht hast du diesen Inhalt schon gemeldet.");
      setReportTarget(null); setSelectedStoryId("");
    }, "Meldung gesendet.");
  }

  function requestFor(otherId: string): SocialFriendRequest | undefined {
    return data.requests.find(request =>
      (request.requester_id === userId && request.recipient_id === otherId || request.recipient_id === userId && request.requester_id === otherId)
      && (request.status === "pending" || request.status === "accepted"));
  }

  async function sendFriendRequest(otherId: string) {
    await perform(async () => {
      const result = await client.rpc("ahoier_send_friend_request", { p_other_user: otherId });
      if (result.error) throw new Error(result.error.message.includes("Too many friend requests")
        ? "Du hast heute schon viele Anfragen gesendet. Versuche es morgen erneut."
        : "Die Freundschaftsanfrage konnte nicht gesendet werden.");
    }, "Anfrage gesendet.");
  }

  async function respondFriendRequest(id: string, accept: boolean) {
    await perform(async () => {
      const result = await client.rpc("ahoier_respond_friend_request", { p_request_id: id, p_accept: accept });
      if (result.error) throw new Error("Die Anfrage konnte nicht beantwortet werden.");
    }, accept ? "Ihr seid jetzt befreundet." : "Anfrage abgelehnt.");
  }

  async function cancelFriendRequest(id: string) {
    await perform(async () => {
      const result = await client.rpc("ahoier_cancel_friend_request", { p_request_id: id });
      if (result.error) throw new Error("Die Anfrage konnte nicht zurückgezogen werden.");
    });
  }

  async function removeFriend(otherId: string) {
    if (!window.confirm("Freundschaft beenden? Neue Nachrichten sind danach nicht mehr möglich.")) return;
    await perform(async () => {
      const result = await client.rpc("ahoier_remove_friend", { p_other_user: otherId });
      if (result.error) throw new Error("Die Freundschaft konnte nicht beendet werden.");
    });
  }

  async function block(otherId: string) {
    if (!window.confirm("Diese Person blockieren? Ihr könnt einander keine Nachrichten mehr senden.")) return;
    await perform(async () => {
      const result = await client.rpc("ahoier_block_user", { p_other_user: otherId });
      if (result.error) throw new Error("Die Person konnte nicht blockiert werden.");
      if (activePeerId === otherId) setActivePeerId("");
      if (selectedPersonId === otherId) setSelectedPersonId("");
    }, "Person blockiert.");
  }

  async function unblock(otherId: string) {
    await perform(async () => {
      const result = await client.rpc("ahoier_unblock_user", { p_other_user: otherId });
      if (result.error) throw new Error("Die Blockierung konnte nicht aufgehoben werden.");
    });
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = messageBody.trim();
    if (!activePeer || !body || body.length > 1000) return;
    await perform(async () => {
      const result = await client.rpc("ahoier_send_message", { p_recipient_id: activePeer, p_body: body });
      if (result.error) throw new Error(result.error.message.includes("Too many messages")
        ? "Du hast in der letzten Stunde schon viele Nachrichten gesendet. Versuche es später erneut."
        : "Die Nachricht konnte nicht gesendet werden.");
      if (typeof result.data === "string") setConversation(current => mergeMessages(current, [{ id: result.data, sender_id: userId, recipient_id: activePeer, body, created_at: new Date().toISOString() }]));
      setMessageBody("");
    });
  }

  async function saveProfileDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("displayName") ?? "").trim();
    const richProfileAvailable = profile.bio !== undefined && Array.isArray(profile.interests);
    const bio = String(form.get("bio") ?? "").replace(/\s+/g, " ").trim();
    const interests = form.getAll("interest").map(String);
    if (name.length < 2 || name.length > 40) { showError("Bitte gib einen Namen mit 2 bis 40 Zeichen ein."); return; }
    if (richProfileAvailable && (bio.length > 160 || interests.length > 5 || new Set(interests).size !== interests.length || interests.some(value => !PROFILE_INTERESTS.includes(value as typeof PROFILE_INTERESTS[number])))) {
      showError("Bitte wähle höchstens fünf Interessen und schreibe maximal 160 Zeichen über dich.");
      return;
    }
    await perform(async () => {
      const changes = richProfileAvailable ? { display_name: name, bio, interests } : { display_name: name };
      const result = await client.from("ahoier_profiles").update(changes).eq("user_id", userId);
      if (result.error) throw new Error("Das Profil konnte nicht gespeichert werden.");
      onProfileChanged();
    }, "Profil gespeichert.");
  }

  async function loadOlderWallPosts() {
    if (!wallHasMore || !wallCursor || wallPageLoading) return;
    const epoch = pageEpoch.current;
    setWallPageLoading(true);
    try {
      const page = await loadSocialPostsPage(client, voyage.id, { before: wallCursor });
      if (epoch === pageEpoch.current) setWallPages(current => [...current, page]);
    } catch { showError("Ältere Beiträge konnten nicht geladen werden."); }
    finally { setWallPageLoading(false); }
  }

  async function loadOlderProfilePosts() {
    const last = visibleProfilePages.at(-1);
    if (!profilePersonId || !last?.hasMore || !last.nextCursor || profilePageLoading) return;
    const epoch = pageEpoch.current;
    const personId = profilePersonId;
    setProfilePageLoading(true); setProfilePageError("");
    try {
      const page = await loadSocialPostsPage(client, voyage.id, { before: last.nextCursor, authorId: personId });
      if (epoch === pageEpoch.current && profilePersonId === personId) setProfilePages(current => [...current, page]);
    } catch { setProfilePageError("Ältere Profilbeiträge konnten nicht geladen werden."); setProfilePageErrorFor(profilePersonId); }
    finally { setProfilePageLoading(false); }
  }

  async function saveAvatar(file?: File) {
    if (!file) return;
    await perform(async () => {
      const prepared = await prepareSocialImage(file);
      const path = `avatar/${userId}/${crypto.randomUUID()}.webp`;
      await upload(path, prepared);
      const result = await client.from("ahoier_profiles").update({ avatar_path: path }).eq("user_id", userId);
      if (result.error) {
        await client.storage.from(SOCIAL_MEDIA_BUCKET).remove([path]);
        throw new Error("Das Profilfoto konnte nicht gespeichert werden.");
      }
      if (profile.avatar_path) await client.storage.from(SOCIAL_MEDIA_BUCKET).remove([profile.avatar_path]);
      onProfileChanged();
    }, "Profilfoto gespeichert.");
  }

  async function removeAvatar() {
    await perform(async () => {
      const result = await client.from("ahoier_profiles").update({ avatar_path: null }).eq("user_id", userId);
      if (result.error) throw new Error("Das Profilfoto konnte nicht entfernt werden.");
      if (profile.avatar_path) await client.storage.from(SOCIAL_MEDIA_BUCKET).remove([profile.avatar_path]);
      onProfileChanged();
    }, "Profilfoto entfernt.");
  }

  function openPerson(id: string) {
    setSelectedStoryId("");
    if (id === userId) { setSelectedPersonId(""); setTab("profile"); window.scrollTo(0, 0); return; }
    if (blocked.has(id) || !(data.profiles[id] ?? extraProfiles[id])) return;
    setPeopleSearch(""); setSelectedPersonId(id); setTab("people"); window.scrollTo(0, 0);
  }
  function personSubtitle(id: string) {
    const interests = data.profiles[id]?.interests ?? [];
    const shared = interests.filter(interest => ownInterests.has(interest));
    if (shared.length) return `Gemeinsame Interessen: ${shared.slice(0, 2).join(" · ")}`;
    return interests.length ? `Interessen: ${interests.slice(0, 2).join(" · ")}` : "Mitglied dieser Reisegruppe";
  }
  function profileActions(id: string) {
    const request = requestFor(id);
    return <div className="social-profile-hero-actions">
      {request?.status === "accepted" ? <button type="button" className="social-primary" onClick={() => { setActivePeerId(id); setTab("messages"); window.scrollTo(0, 0); }}><MessageCircle size={17} /> Nachricht senden</button>
        : request?.status === "pending" && request.recipient_id === userId ? <button type="button" className="social-primary" onClick={() => void respondFriendRequest(request.id, true)}><Check size={17} /> Anfrage annehmen</button>
          : request?.status === "pending" ? <button type="button" className="social-secondary" onClick={() => void cancelFriendRequest(request.id)}>Anfrage zurückziehen</button>
            : <button type="button" className="social-primary" onClick={() => void sendFriendRequest(id)}><Users size={17} /> Freundschaft anfragen</button>}
      <details className="social-profile-more"><summary aria-label="Weitere Profilaktionen"><Ellipsis size={21} /></summary><div>
        {request?.status === "accepted" && <button type="button" onClick={() => void removeFriend(id)}>Freundschaft beenden</button>}
        {request?.status === "pending" && request.recipient_id === userId && <button type="button" onClick={() => void respondFriendRequest(request.id, false)}>Anfrage ablehnen</button>}
        <button type="button" onClick={() => setReportTarget({ kind: "profile", id })}><Flag size={15} /> Profil melden</button>
        <button type="button" onClick={() => void block(id)}><Ban size={15} /> Blockieren</button>
      </div></details>
    </div>;
  }
  function personActions(id: string) {
    if (id === userId || blocked.has(id)) return null;
    const request = requestFor(id);
    return <div className="social-person-actions">
      {request?.status === "accepted" ? <><button type="button" className="social-primary small" onClick={() => { setActivePeerId(id); setTab("messages"); }}><MessageCircle size={15} /> Nachricht</button><button type="button" onClick={() => void removeFriend(id)}>Freundschaft beenden</button></>
        : request?.status === "pending" && request.recipient_id === userId ? <><button type="button" className="social-primary small" onClick={() => void respondFriendRequest(request.id, true)}><Check size={15} /> Annehmen</button><button type="button" onClick={() => void respondFriendRequest(request.id, false)}>Ablehnen</button></>
          : request?.status === "pending" ? <button type="button" onClick={() => void cancelFriendRequest(request.id)}>Anfrage zurückziehen</button>
            : <button type="button" className="social-primary small" onClick={() => void sendFriendRequest(id)}><Users size={15} /> Freundschaft anfragen</button>}
      <button type="button" onClick={() => setReportTarget({ kind: "profile", id })}><Flag size={15} /> Profil melden</button>
      <button type="button" onClick={() => void block(id)} aria-label={`${data.profiles[id]?.display_name ?? "Person"} blockieren`}><Ban size={15} /> Blockieren</button>
    </div>;
  }

  function reactionBar(kind: "post" | "reply", id: string) {
    const rows = visibleReactions.filter(row => row.target_kind === kind && row.target_id === id);
    const mine = rows.find(row => row.reacted_by_me)?.emoji;
    return <div className="social-reactions"><div className="social-reaction-counts">{rows.filter(row => row.total > 0).map(row => <span key={row.emoji} title={`${row.total} Reaktionen`}>{row.emoji} {row.total}</span>)}</div><details><summary aria-label="Reaktion auswählen">{mine ?? "♡"} Reagieren</summary><div className="social-emoji-menu">{EMOJI.map(emoji => <button key={emoji} type="button" aria-label={`Mit ${emoji} reagieren`} aria-pressed={mine === emoji} onClick={() => void react(kind, id, mine === emoji ? null : emoji)}>{emoji}</button>)}{mine && <button type="button" aria-label="Reaktion entfernen" onClick={() => void react(kind, id, null)}><X size={15} /></button>}</div></details></div>;
  }

  function replyCard(reply: SocialReply) {
    const author = data.profiles[reply.author_id] ?? pageProfiles[reply.author_id] ?? extraProfiles[reply.author_id];
    const photo = [...data.replyPhotos, ...pageReplyPhotos, ...extraReplyPhotos].find(item => item.reply_id === reply.id);
    return <div className="social-reply" key={reply.id}><button type="button" className="social-author-avatar" onClick={() => openPerson(reply.author_id)} aria-label={`Profil von ${author?.display_name ?? "Gast"}`}><Avatar client={client} profile={author} size="small" /></button><div className="social-reply-content"><div className="social-author-line"><button type="button" onClick={() => openPerson(reply.author_id)}>{author?.display_name ?? "Gast"}</button><small>{timeLabel(reply.created_at)}</small></div>{reply.body && <p>{reply.body}</p>}{photo && <PhotoGrid client={client} paths={[photo.path]} alt={`Antwort von ${author?.display_name ?? "Gast"}`} />}<div className="social-inline-actions">{reactionBar("reply", reply.id)}<button type="button" onClick={() => reply.author_id === userId ? void remove("reply", reply.id) : setReportTarget({ kind: "reply", id: reply.id })}>{reply.author_id === userId ? "Entfernen" : "Melden"}</button></div></div></div>;
  }

  function postCard(post: SocialPost) {
    const author = data.profiles[post.author_id] ?? pageProfiles[post.author_id] ?? extraProfiles[post.author_id];
    const replies = mergeReplies([...data.replies, ...pageReplies].filter(reply => reply.post_id === post.id), extraReplies.filter(reply => reply.post_id === post.id))
      .filter(reply => !blocked.has(reply.author_id));
    const paths = [...new Map([...pagePostPhotos, ...data.postPhotos].filter(photo => photo.post_id === post.id)
      .sort((a, b) => a.slot - b.slot).map(photo => [photo.slot, photo] as const)).values()].map(photo => photo.path);
    const replyFile = replyFiles[post.id];
    const repliesTruncated = (data.repliesTruncated && data.posts.some(item => item.id === post.id))
      || loadedPages.some(page => page.repliesTruncated && page.posts.some(item => item.id === post.id));
    return <article key={post.id} id={`social-post-${post.id}`} tabIndex={-1} className={`social-panel social-post ${focusedPostId === post.id ? "is-focused" : ""}`}><div className="social-post-head"><button type="button" className="social-author-avatar" onClick={() => openPerson(post.author_id)} aria-label={`Profil von ${author?.display_name ?? "Gast"}`}><Avatar client={client} profile={author} /></button><div className="social-post-author"><button type="button" onClick={() => openPerson(post.author_id)}>{author?.display_name ?? "Gast"}</button><small>{timeLabel(post.created_at)} · {voyage.ship}</small></div><span className="social-category">{post.category}</span></div>{post.body && <p className="social-post-body">{post.body}</p>}<PhotoGrid client={client} paths={paths} alt={`Beitrag von ${author?.display_name ?? "Gast"}`} /><div className="social-post-toolbar">{reactionBar("post", post.id)}<span><MessageCircle size={15} /> {replies.length}{repliesTruncated && (!replyPaging[post.id]?.loaded || replyPaging[post.id]?.hasMore) ? "+" : ""} Antworten</span><button type="button" onClick={() => post.author_id === userId ? void remove("post", post.id) : setReportTarget({ kind: "post", id: post.id })}>{post.author_id === userId ? "Entfernen" : <><Flag size={14} /> Melden</>}</button></div><div className="social-replies">{replies.map(replyCard)}{repliesTruncated && (!replyPaging[post.id]?.loaded || replyPaging[post.id]?.hasMore) && <button className="social-load-older social-load-replies" type="button" disabled={replyPaging[post.id]?.loading} onClick={() => void loadOlderReplies(post.id)}>{replyPaging[post.id]?.loading ? "Antworten werden geladen …" : replyPaging[post.id]?.loaded ? "Ältere Antworten laden" : "Weitere Antworten zu diesem Beitrag laden"}</button>}<form className="social-reply-form" onSubmit={event => void publishReply(event, post.id)}><Avatar client={client} profile={profile} size="small" /><label className="sr-only" htmlFor={`social-reply-${post.id}`}>Antwort schreiben</label><input id={`social-reply-${post.id}`} type="text" maxLength={1000} value={replyBodies[post.id] ?? ""} onChange={event => setReplyBodies(current => ({ ...current, [post.id]: event.target.value }))} placeholder="Antwort schreiben …" /><label className="social-icon-upload" title="Foto zur Antwort"><ImageIcon size={18} /><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void selectReplyFile(post.id, event.target.files?.[0])} aria-label="Foto zur Antwort auswählen" /></label><button type="submit" disabled={busy || !(replyBodies[post.id] ?? "").trim() && !replyFile} aria-label="Antwort senden"><Send size={18} /></button></form>{replyFile && <div className="social-reply-selected"><SelectedPhotos files={[replyFile]} /><button type="button" onClick={() => setReplyFiles(current => { const next = { ...current }; delete next[post.id]; return next; })}>Foto entfernen</button></div>}</div></article>;
  }

  function messagesWith(peerId: string): SocialMessage[] {
    if (peerId === activePeer) return conversationPeer === activePeer ? conversation : [];
    return data.messages.filter(message => message.sender_id === peerId && message.recipient_id === userId || message.sender_id === userId && message.recipient_id === peerId);
  }

  function storyTile(story: SocialStory) {
    const author = data.profiles[story.author_id];
    const name = author?.display_name ?? "Gast";
    return <button type="button" className="social-story" key={story.id} onClick={() => setSelectedStoryId(story.id)} aria-label={`Story von ${name} ansehen`}>
      <PrivateImage client={client} path={story.photo_path} alt="" className="social-story-cover" />
      <span className="social-story-shade" aria-hidden="true" />
      <Avatar client={client} profile={author} size="small" />
      <strong>{name}</strong>
    </button>;
  }

  function profileHero(person: SocialProfile, own: boolean, inVoyage: boolean) {
    return <section className="social-profile-hero" aria-label={`Profil von ${person.display_name}`}>
      <div className="social-profile-cover">
        {inVoyage && coverPhoto && <img src={coverPhoto} alt={`${voyage.ship} auf See`} />}
        {inVoyage && coverPhoto && coverCredit && <span className="social-voyage-cover-credit"><a href={coverCredit.source} target="_blank" rel="noopener noreferrer">Foto: {coverCredit.author}</a> · <a href={coverCredit.licenseUrl} target="_blank" rel="noopener noreferrer">{coverCredit.license}</a></span>}
      </div>
      <div className="social-profile-hero-body">
        <Avatar client={client} profile={person} size="large" />
        <h1 ref={own ? undefined : guestProfileHeading} tabIndex={own ? undefined : -1}>{person.display_name}</h1>
        <p className="social-profile-hero-subtitle">{own ? `Dein Profil · ${voyage.ship}` : inVoyage ? `Mitglied dieser ${voyage.ship}-Reisegruppe` : "Profil auf Ahoier"}</p>
        {own ? <div className="social-profile-hero-actions"><button type="button" className="social-primary" onClick={() => document.getElementById("social-profile-name")?.focus()}><Pencil size={17} /> Profil bearbeiten</button></div> : profileActions(person.user_id)}
        {!own && <p className="social-profile-note">Private Nachrichten sind erst nach bestätigter Freundschaft möglich.</p>}
      </div>
    </section>;
  }

  function profileAbout(person: SocialProfile, own: boolean) {
    if (person.bio === undefined && person.interests === undefined) return null;
    const bio = person.bio?.trim() ?? "";
    const interests = (person.interests ?? []).filter(value => PROFILE_INTERESTS.includes(value as typeof PROFILE_INTERESTS[number]));
    if (!own && !bio && !interests.length) return null;
    return <section className="social-panel social-profile-about" aria-labelledby="social-profile-about-title">
      <h2 id="social-profile-about-title">Über mich</h2>
      {bio ? <p>{bio}</p> : <p className="social-muted">Erzähl deinen Mitreisenden ein paar Worte über dich.</p>}
      {interests.length > 0 && <div className="social-profile-interests" aria-label="Interessen">{interests.map(value => <span key={value}>{value}</span>)}</div>}
    </section>;
  }

  function profileMoments(personId: string) {
    const moments = data.stories.filter(story => story.author_id === personId);
    return <section className="social-profile-moments" aria-label="Aktuelle Stories"><div className="social-section-head"><h2>Momente</h2><span className="social-eyebrow">24 STUNDEN SICHTBAR</span></div>
      {moments.length ? <div className="social-story-row">{moments.map(storyTile)}</div> : <p>In den zuletzt geladenen Stories ist zurzeit kein Moment {personId === userId ? "von dir" : "dieser Person"} sichtbar.</p>}
    </section>;
  }

  function profilePostsSection() {
    const last = visibleProfilePages.at(-1);
    const activeError = profilePageErrorFor === profilePersonId ? profilePageError : "";
    const firstPageLoading = profileLoadedFor !== profilePersonId && !activeError;
    return <section className="social-profile-posts" aria-label="Beiträge dieses Profils">
      <div className="social-feed-head"><div><span className="social-eyebrow">AUS DIESER REISEGRUPPE</span><h2>Beiträge</h2></div></div>
      {firstPageLoading ? <div className="social-panel social-center" role="status">Beiträge werden geladen …</div>
        : profilePosts.length ? <div className="social-post-list">{profilePosts.map(postCard)}</div>
          : !activeError && <div className="social-panel social-empty"><p>Hier sind noch keine Beiträge aus dieser Reisegruppe.</p></div>}
      {activeError && <p className="social-page-error" role="alert">{activeError} <button type="button" onClick={() => { setProfilePageError(""); setProfileRetry(current => current + 1); }}>Erneut versuchen</button></p>}
      {last?.hasMore && <button type="button" className="social-load-older social-load-posts" disabled={profilePageLoading} onClick={() => void loadOlderProfilePosts()}>{profilePageLoading ? "Wird geladen …" : "Weitere Beiträge laden"}</button>}
    </section>;
  }

  const nav: { id: Tab; label: string; icon: typeof Heart }[] = [
    { id: "wall", label: "Pinnwand", icon: House }, { id: "people", label: "Leute", icon: Users },
    { id: "messages", label: "Nachrichten", icon: MessageCircle }, { id: "profile", label: "Profil", icon: UserRound },
  ];

  return <>
    {tab === "wall" ? <div className="social-voyage-cover">
      {coverPhoto && <img src={coverPhoto} alt={`${voyage.ship} auf See`} />}
      <div className="social-voyage-cover-content"><span className="social-cover-kicker">DEINE REISEGRUPPE</span><h1>{voyage.ship}</h1><p>Deine Reise. Deine Leute.</p><small>{dateLabel(voyage.starts_on, { year: "numeric" })} – {dateLabel(voyage.ends_on, { year: "numeric" })}</small></div>
      {voyages.length > 1 && <select aria-label="Reisegruppe auswählen" value={voyage.id} onChange={event => onVoyageChange(event.target.value)}>{voyages.map(item => <option key={item.id} value={item.id}>{item.ship} · {dateLabel(item.starts_on)}</option>)}</select>}
      {coverPhoto && coverCredit && <span className="social-voyage-cover-credit"><a href={coverCredit.source} target="_blank" rel="noopener noreferrer">Foto: {coverCredit.author}</a> · <a href={coverCredit.licenseUrl} target="_blank" rel="noopener noreferrer">{coverCredit.license}</a></span>}
    </div> : tab === "messages" || tab === "people" && !selectedPersonId ? <div className="social-voyage-bar"><div className="social-voyage-icon"><Ship size={20} /></div><div><strong>{voyage.ship}</strong><small>{dateLabel(voyage.starts_on, { year: "numeric" })} – {dateLabel(voyage.ends_on, { year: "numeric" })} · Deine Reisegruppe</small></div>{voyages.length > 1 && <select aria-label="Reisegruppe auswählen" value={voyage.id} onChange={event => onVoyageChange(event.target.value)}>{voyages.map(item => <option key={item.id} value={item.id}>{item.ship} · {dateLabel(item.starts_on)}</option>)}</select>}</div> : null}
    <nav className="social-tabs" aria-label="Community"><div>{nav.map(item => <button key={item.id} type="button" className={tab === item.id ? "active" : ""} aria-current={tab === item.id ? "page" : undefined} onClick={() => { setSelectedPersonId(""); setTab(item.id); window.scrollTo(0, 0); }}><item.icon size={19} /><span>{item.label}</span></button>)}</div></nav>
    {tab === "wall" && <div className="social-wall-layout"><div className="social-wall-main">
      <button type="button" className="social-people-strip" onClick={() => { setSelectedPersonId(""); setTab("people"); window.scrollTo(0, 0); }}><span className="social-people-avatars">{previewPeople.map(id => <Avatar key={id} client={client} profile={data.profiles[id]} size="small" />)}{!previewPeople.length && <Users size={22} />}</span><span className="social-people-strip-copy"><strong>Menschen deiner Reisegruppe entdecken</strong><small>{previewPeople.length ? `${previewPeople.length} ${previewPeople.length === 1 ? "Gesicht" : "Gesichter"} aus deiner Reisegruppe` : "Wer ist auf Ahoier dabei?"}</small></span><ArrowRight size={19} /></button>
      <LiveSocialMeetups
        meetups={liveMeetups} status={liveMeetupStatus} userId={userId} focusMeetupId={focusedMeetupId}
        voyageStartDate={voyage.starts_on} voyageEndDate={voyage.ends_on}
        onCreate={createMeetup} onUpdate={updateMeetup}
        onJoin={id => meetupAction("ahoier_rsvp_meetup", { p_meetup_id: id })}
        onLeave={id => meetupAction("ahoier_leave_meetup", { p_meetup_id: id })}
        onCancel={id => meetupAction("ahoier_cancel_meetup", { p_meetup_id: id })}
        onLoadAttendees={loadMeetupAttendees} onReport={reportMeetup}
        onRefresh={() => setMeetupVersion(current => current + 1)}
      />
      {data.repliesTruncated && <p className="social-reply-limit" role="status">Es werden die neuesten 300 Antworten der angezeigten Beiträge geladen. Ältere Antworten kannst du je Beitrag nachladen.</p>}<section className="social-panel social-stories" aria-labelledby="social-stories-title"><div className="social-section-head"><div><span className="social-eyebrow">MOMENTE AN BORD</span><h2 id="social-stories-title">Stories</h2></div><button type="button" onClick={() => setShowStoryComposer(current => !current)}><Camera size={17} /> Story teilen</button></div><div className="social-story-row"><button type="button" className="social-story-add" onClick={() => setShowStoryComposer(true)}><Avatar client={client} profile={profile} size="large" /><span>Deine Story <strong>+</strong></span></button>{data.stories.map(storyTile)}{loaded && !data.stories.length && <p className="social-muted">Noch keine Stories. Teile einen Moment deiner Reise.</p>}</div>{showStoryComposer && <form className="social-story-composer" onSubmit={event => void publishStory(event)}><label htmlFor="social-story-photo">Ein Foto für 24 Stunden</label><input id="social-story-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void selectStoryFile(event.target.files?.[0])} required /><SelectedPhotos files={storyFile ? [storyFile] : []} /><label htmlFor="social-story-caption">Kurzer Text (freiwillig)</label><input id="social-story-caption" value={storyCaption} onChange={event => setStoryCaption(event.target.value)} maxLength={160} placeholder="Was passiert gerade an Bord?" /><p className="social-privacy-note">Jede angemeldete Person kann dieser Reisegruppe beitreten und deine Story sehen.</p><button className="social-primary" disabled={busy || !storyFile}>Story teilen</button></form>}</section>
      {!composerExpanded ? <div className="social-panel social-composer-collapsed"><Avatar client={client} profile={profile} /><button type="button" onClick={() => setComposerExpanded(true)}>{postBody || postFiles.length ? "Entwurf fortsetzen …" : "Was möchtest du teilen?"}<Camera size={20} /></button></div> : <form className="social-panel social-composer" onSubmit={event => void publishPost(event)}><div className="social-composer-head"><Avatar client={client} profile={profile} /><div><strong>Was möchtest du teilen, {profile.display_name}?</strong><small>Fragen, Tipps und Momente deiner Reise</small></div><button className="social-composer-close" type="button" onClick={() => setComposerExpanded(false)} aria-label="Beitragsformular schließen"><X size={18} /></button></div><label className="sr-only" htmlFor="social-post-text">Beitrag</label><textarea ref={composerTextarea} id="social-post-text" value={postBody} onChange={event => setPostBody(event.target.value)} maxLength={1000} rows={3} placeholder="Schreib etwas für deine Reisegruppe …" /><SelectedPhotos files={postFiles} /><div className="social-composer-bottom"><select aria-label="Kategorie" value={category} onChange={event => setCategory(event.target.value as typeof category)}>{CATEGORIES.map(item => <option key={item}>{item}</option>)}</select><label className="social-add-photo"><ImageIcon size={18} /> Fotos<input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => void selectPostFiles(event.target.files)} aria-label="Bis zu vier Fotos auswählen" /></label>{postFiles.length > 0 && <button type="button" onClick={() => { setPostFiles([]); if (fileInput.current) fileInput.current.value = ""; }}>Fotos entfernen</button>}<button className="social-primary" disabled={busy || !postBody.trim() && !postFiles.length}>Teilen <ArrowRight size={15} /></button></div><p className="social-privacy-note">Alle angemeldeten Personen, die diese Reise auswählen, können deine Beiträge und Fotos sehen.</p></form>}
      <div className="social-feed-head"><div><span className="social-eyebrow">GEMEINSAM AN BORD</span><h2>Aus der Reisegruppe</h2></div><button type="button" onClick={() => { pageEpoch.current += 1; setWallPages([]); setFocusedPostPage(null); refresh(); }} disabled={loading}><RefreshCw size={16} /> Aktualisieren</button></div>{!loaded ? <div className="social-panel social-center" role="status">Beiträge werden geladen …</div> : !visibleWallPosts.length ? <div className="social-panel social-empty"><MessageCircle size={28} /><h3>Hier beginnt das Gespräch.</h3><p>Stell die erste Frage oder teile einen Moment deiner Reise.</p></div> : <div className="social-post-list">{visibleWallPosts.map(postCard)}</div>}{wallHasMore && <button type="button" className="social-load-older social-load-posts" disabled={wallPageLoading} onClick={() => void loadOlderWallPosts()}>{wallPageLoading ? "Wird geladen ?" : "Weitere Beitr?ge laden"}</button>}</div><aside className="social-wall-aside"><section className="social-panel"><span className="social-eyebrow">LEUTE AN BORD</span><h2>Neue Gesichter</h2><div className="social-aside-people">{data.directory.filter(id => id !== userId && !blocked.has(id)).slice(0, 4).map(id => <button type="button" key={id} onClick={() => openPerson(id)}><Avatar client={client} profile={data.profiles[id]} /><span>{data.profiles[id]?.display_name ?? "Gast"}</span><ArrowRight size={15} /></button>)}</div><button type="button" className="social-text-button" onClick={() => setTab("people")}>Alle Mitglieder ansehen <ArrowRight size={15} /></button></section><section className="social-panel"><span className="social-eyebrow">GUT ZU WISSEN</span><h2>Offene Reisegruppe</h2><p>Die Auswahl einer Reise bestätigt keine Buchung. Teile nur Fotos und Informationen, die du in dieser Gruppe zeigen möchtest.</p></section></aside></div>}
    {tab === "people" && (selectedPersonId ? <section className="social-guest-profile">
      <button className="social-profile-back" type="button" onClick={() => { setSelectedPersonId(""); window.scrollTo(0, 0); }}><ArrowLeft size={17} /> Leute</button>
      {selectedPerson ? <>
        {profileHero(selectedPerson, false, selectedPersonInVoyage)}
        {profileAbout(selectedPerson, false)}
        {selectedPersonInVoyage && profileMoments(selectedPersonId)}
        {selectedPersonInVoyage && profilePostsSection()}
        <p className="social-guest-disclaimer">Die Auswahl einer Reisegruppe bestätigt keine Buchung oder Anwesenheit an Bord.</p>
      </> : <div className="social-panel social-empty"><p>Dieses Profil ist nicht mehr verfügbar.</p></div>}
    </section> : <section className="social-panel social-people-page"><div className="social-page-head"><span className="social-eyebrow">NEUE BEKANNTSCHAFTEN</span><h1>Leute deiner Reisegruppe</h1><p>Hier siehst du angemeldete Mitglieder. Eine Buchung oder Anwesenheit an Bord wurde nicht geprüft.</p></div><label htmlFor="social-people-search">Personen suchen</label><input id="social-people-search" type="search" value={peopleSearch} onChange={event => setPeopleSearch(event.target.value)} placeholder="Name suchen" />{availableInterests.length > 0 && <div className="social-people-interest-filter"><label htmlFor="social-people-interest">Nach Interesse filtern</label><select id="social-people-interest" value={peopleInterest} onChange={event => setPeopleInterest(event.target.value)}><option value="">Alle Interessen</option>{availableInterests.map(interest => <option key={interest} value={interest}>{interest}</option>)}</select></div>}<div className="social-people-list">{data.requests.filter(request => request.recipient_id === userId && request.status === "pending" && !blocked.has(request.requester_id)).length > 0 && <section className="social-incoming-requests"><h2>Offene Freundschaftsanfragen</h2><p>Auch Anfragen aus früheren Reisegruppen erscheinen hier.</p>{data.requests.filter(request => request.recipient_id === userId && request.status === "pending" && !blocked.has(request.requester_id)).map(request => <article key={request.id} className="social-person"><button type="button" className="social-person-open" onClick={() => openPerson(request.requester_id)}><Avatar client={client} profile={data.profiles[request.requester_id]} size="large" /><span><strong>{data.profiles[request.requester_id]?.display_name ?? "Gast"}</strong><small>Hat dir eine Anfrage gesendet</small></span></button>{personActions(request.requester_id)}</article>)}</section>}{directory.map(id => <article key={id} className="social-person"><button type="button" className="social-person-open" onClick={() => openPerson(id)}><Avatar client={client} profile={data.profiles[id]} size="large" /><span><strong>{data.profiles[id]?.display_name ?? "Gast"}</strong><small>{personSubtitle(id)}</small></span><ArrowRight size={17} aria-hidden="true" /></button></article>)}{loaded && !directory.length && <p className="social-muted">Keine Personen gefunden.</p>}</div></section>)}
    {tab === "messages" && <section className="social-messages-page"><div className="social-page-head"><span className="social-eyebrow">IN VERBINDUNG</span><h1>Nachrichten</h1><p>Private Gespräche sind erst nach bestätigter Freundschaft möglich.</p></div>{friends.length === 0 ? <div className="social-panel social-empty"><Heart size={29} /><h2>Noch keine bestätigten Freundschaften</h2><p>Entdecke Menschen in deiner Reisegruppe und sende eine Anfrage.</p><button type="button" className="social-primary" onClick={() => setTab("people")}>Leute ansehen <ArrowRight size={16} /></button></div> : <div className="social-chat-layout"><nav className="social-chat-list" aria-label="Gespräche">{friends.map(id => <button type="button" key={id} className={id === activePeer ? "active" : ""} onClick={() => setActivePeerId(id)}><Avatar client={client} profile={data.profiles[id]} /><span><strong>{data.profiles[id]?.display_name ?? "Gast"}</strong><small>{messagesWith(id).at(-1)?.body ?? "Verlauf öffnen"}</small></span></button>)}</nav>{activePeer && <div className="social-panel social-chat"><header><Avatar client={client} profile={data.profiles[activePeer]} /><div><h2>{data.profiles[activePeer]?.display_name ?? "Gast"}</h2><small>Bestätigte Freundschaft · private Unterhaltung</small></div><button type="button" onClick={() => void block(activePeer)} aria-label="Person blockieren"><Ban size={17} /></button></header><div className="social-chat-log" role="log" aria-label="Private Nachrichten">{conversationPeer === activePeer && conversationHasMore && <button type="button" className="social-load-older" disabled={conversationLoading} onClick={() => void loadOlderMessages()}>Ältere Nachrichten laden</button>}{conversationLoading && <p className="social-muted" role="status">Nachrichten werden geladen …</p>}{conversationError && <p className="social-chat-error" role="alert">{conversationError}</p>}{messagesWith(activePeer).map(message => <article key={message.id} className={message.sender_id === userId ? "mine" : ""}><p>{message.body}</p><small>{timeLabel(message.created_at)}</small><button type="button" onClick={() => message.sender_id === userId ? void remove("message", message.id) : setReportTarget({ kind: "message", id: message.id })}>{message.sender_id === userId ? "Für mich entfernen" : "Melden"}</button></article>)}{conversationPeer === activePeer && !conversationLoading && !messagesWith(activePeer).length && <p className="social-muted">Sag zuerst Ahoi.</p>}</div><form onSubmit={event => void sendMessage(event)}><label className="sr-only" htmlFor="social-message-text">Nachricht schreiben</label><input id="social-message-text" value={messageBody} onChange={event => setMessageBody(event.target.value)} maxLength={1000} placeholder="Nachricht schreiben …" /><button type="submit" disabled={busy || !messageBody.trim()} aria-label="Nachricht senden"><Send size={19} /></button></form></div>}</div>}</section>}
    {tab === "profile" && <section className="social-profile-page">
      {profileHero(profile, true, true)}
      {profileAbout(profile, true)}
      {profileMoments(userId)}
      {profilePostsSection()}
      <div className="social-profile-grid" id="social-profile-settings"><div className="social-panel"><h2>Profil bearbeiten</h2><p>So sehen dich Mitglieder dieser Reisegruppe und bestätigte Freunde.</p><label className="social-add-photo"><Camera size={17} /> Profilfoto wählen<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void saveAvatar(event.target.files?.[0])} aria-label="Profilfoto hochladen" /></label>{profile.avatar_path && <button type="button" className="social-text-button" onClick={() => void removeAvatar()}>Profilfoto entfernen</button>}<form onSubmit={event => void saveProfileDetails(event)}>
  <label htmlFor="social-profile-name">Anzeigename</label>
  <input id="social-profile-name" name="displayName" defaultValue={profile.display_name} minLength={2} maxLength={40} required />
  {profile.bio !== undefined && Array.isArray(profile.interests) && <>
    <label htmlFor="social-profile-bio">Kurz über dich <span className="optional-label">freiwillig</span></label>
    <textarea id="social-profile-bio" name="bio" maxLength={160} rows={3} defaultValue={profile.bio} placeholder="Zum Beispiel: Ich mag Kaffee, Musik und neue Bekanntschaften." />
    <fieldset className="social-profile-interest-fieldset">
      <legend>Deine Interessen <span className="optional-label">bis zu fünf</span></legend>
      <div className="social-profile-interest-options">{PROFILE_INTERESTS.map(value => <label key={value}><input type="checkbox" name="interest" value={value} defaultChecked={profile.interests?.includes(value)} onChange={event => { if (event.currentTarget.checked && (event.currentTarget.closest("fieldset")?.querySelectorAll('input[name="interest"]:checked').length ?? 0) > 5) { event.currentTarget.checked = false; showError("Wähle höchstens fünf Interessen."); } }} />{value}</label>)}</div>
      <p>Dein Text und deine Interessen sind für Mitglieder deiner Reisegruppe und bestätigte Freunde sichtbar.</p>
    </fieldset>
  </>}
  <button className="social-primary" disabled={busy}>Profil speichern</button>
</form></div><div className="social-panel"><h2>Deine Kontakte</h2><p>{friends.length} bestätigte {friends.length === 1 ? "Freundschaft" : "Freundschaften"}</p><h3>Blockierte Personen</h3>{data.blocks.length ? <div className="social-block-list">{data.blocks.map(item => <div key={item.blocked_id}><span>{data.profiles[item.blocked_id]?.display_name ?? "Blockierte Person"}</span><button type="button" onClick={() => void unblock(item.blocked_id)}>Blockierung aufheben</button></div>)}</div> : <p className="social-muted">Keine blockierten Personen.</p>}{unjoinedVoyages.length > 0 && <form onSubmit={onJoinVoyage}><label htmlFor="social-add-voyage">Weitere Reisegruppe</label><select id="social-add-voyage" name="voyageId" defaultValue="" required><option value="" disabled>Reise auswählen</option>{unjoinedVoyages.map(item => <option key={item.id} value={item.id}>{item.ship} · {dateLabel(item.starts_on)}</option>)}</select><button type="submit" className="social-secondary">Beitreten</button></form>}</div></div>
    </section>}
    {tab === "profile" && isModerator && <div className="social-panel social-moderator-entry"><div><strong>Moderation</strong><p>Gemeldete Inhalte prüfen und Konten verwalten.</p></div><Link href="/community/moderation" className="social-secondary">Meldungen öffnen <ArrowRight size={16} /></Link></div>}
    {selectedStory && <StoryDialog story={selectedStory} author={data.profiles[selectedStory.author_id]} client={client} own={selectedStory.author_id === userId} close={() => setSelectedStoryId("")} report={() => { setReportTarget({ kind: "story", id: selectedStory.id }); setSelectedStoryId(""); }} remove={() => void remove("story", selectedStory.id)} friendAction={() => openPerson(selectedStory.author_id)} />}
    {reportTarget && <ReportDialog target={reportTarget} close={() => setReportTarget(null)} submit={report} busy={busy} />}
    {(error || notice) && <div className={`social-toast ${error ? "is-error" : ""}`} role={error ? "alert" : "status"}>{error || notice}<button type="button" onClick={() => { setError(""); setNotice(""); }} aria-label="Hinweis schließen">×</button></div>}
  </>;
}
