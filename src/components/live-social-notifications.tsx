"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Bell, CalendarDays, Check, CheckCheck, Heart, Mail, MessageCircle, RefreshCw, UserCheck, UserPlus, X } from "lucide-react";
import styles from "./live-social-notifications.module.css";

export type NotificationKind = "friend_request" | "friend_accepted" | "reply" | "reaction" | "message" | "meetup_changed" | "meetup_canceled" | "meetup_removed";

export type SocialNotification = {
  id: string;
  recipient_id: string;
  actor_id: string;
  kind: NotificationKind;
  post_id: string | null;
  reply_id: string | null;
  message_id: string | null;
  friend_request_id: string | null;
  voyage_id: string | null;
  meetup_id: string | null;
  created_at: string;
  read_at: string | null;
};

export type NotificationDestination = {
  kind: NotificationKind;
  actorId: string;
  voyageId?: string;
  postId?: string;
  replyId?: string;
  meetupId?: string;
};

type Props = {
  client: SupabaseClient;
  userId: string;
  onNavigate: (destination: NotificationDestination) => void;
  refreshKey?: number;
};

const ROWS_LIMIT = 30;
// Selecting the row keeps this panel usable between frontend deployment and
// the meetup migration, when the optional meetup_id column does not exist yet.
const FIELDS = "*";

function isMigrationMissing(code?: string) {
  return code === "42P01" || code === "PGRST205";
}

function notificationText(item: SocialNotification, actorName?: string) {
  const who = actorName || "Eine Person";
  switch (item.kind) {
    case "friend_request": return `${who} hat dir eine Freundschaftsanfrage gesendet.`;
    case "friend_accepted": return `${who} hat deine Freundschaftsanfrage angenommen.`;
    case "reply": return `${who} hat auf deinen Beitrag geantwortet.`;
    case "reaction": return `${who} hat auf ${item.reply_id ? "deine Antwort" : "deinen Beitrag"} reagiert.`;
    case "message": return `${who} hat dir eine Nachricht gesendet.`;
    case "meetup_changed": return `${who} hat ein Treffen geändert, bei dem du dabei bist.`;
    case "meetup_canceled": return `${who} hat ein Treffen abgesagt, bei dem du dabei bist.`;
    case "meetup_removed": return "Ein Treffen, bei dem du dabei warst, ist nicht mehr verfügbar.";
  }
}

function destinationFor(item: SocialNotification): NotificationDestination {
  return {
    kind: item.kind,
    actorId: item.actor_id,
    ...(item.voyage_id ? { voyageId: item.voyage_id } : {}),
    ...(item.post_id ? { postId: item.post_id } : {}),
    ...(item.reply_id ? { replyId: item.reply_id } : {}),
    ...(item.meetup_id && item.kind !== "meetup_removed" ? { meetupId: item.meetup_id } : {}),
  };
}

function KindIcon({ kind }: { kind: NotificationKind }) {
  if (kind === "friend_request") return <UserPlus size={18} aria-hidden="true" />;
  if (kind === "friend_accepted") return <UserCheck size={18} aria-hidden="true" />;
  if (kind === "message") return <Mail size={18} aria-hidden="true" />;
  if (kind === "reaction") return <Heart size={18} aria-hidden="true" />;
  if (kind === "meetup_changed" || kind === "meetup_canceled" || kind === "meetup_removed") return <CalendarDays size={18} aria-hidden="true" />;
  return <MessageCircle size={18} aria-hidden="true" />;
}

export function LiveSocialNotifications({ client, userId, onNavigate, refreshKey = 0 }: Props) {
  const [items, setItems] = useState<SocialNotification[]>([]);
  const [actorNames, setActorNames] = useState<Record<string, string>>({});
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pendingReadIds = useRef(new Set<string>());
  const mutationVersion = useRef(0);

  useEffect(() => {
    let active = true;
    const snapshot = mutationVersion.current;
    const load = async () => {
      const [listResult, countResult] = await Promise.all([
        client.from("ahoier_notifications").select(FIELDS).eq("recipient_id", userId)
          .order("created_at", { ascending: false }).limit(ROWS_LIMIT),
        client.from("ahoier_notifications").select("id", { count: "exact", head: true })
          .eq("recipient_id", userId).is("read_at", null),
      ]);
      if (!active || snapshot !== mutationVersion.current) return;
      const queryError = listResult.error ?? countResult.error;
      if (queryError) {
        if (isMigrationMissing(queryError.code)) setUnavailable(true);
        else setError("Benachrichtigungen konnten nicht geladen werden.");
        setLoaded(true);
        return;
      }

      const nextItems = (listResult.data ?? []) as SocialNotification[];
      const actorIds = [...new Set(nextItems.map(item => item.actor_id))];
      const nameResult = actorIds.length
        ? await client.from("ahoier_profiles").select("user_id,display_name").in("user_id", actorIds)
        : null;
      if (!active || snapshot !== mutationVersion.current) return;
      const names: Record<string, string> = {};
      if (nameResult && !nameResult.error) {
        for (const profile of nameResult.data ?? []) names[profile.user_id as string] = profile.display_name as string;
      }
      setItems(nextItems);
      setActorNames(names);
      setUnreadCount(countResult.count ?? 0);
      setError("");
      setUnavailable(false);
      setLoaded(true);
    };
    void load();
    return () => { active = false; };
  }, [client, userId, refreshKey, reload]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") setReload(value => value + 1); };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [open]);

  async function markRead(item: SocialNotification) {
    if (item.read_at) return true;
    if (pendingReadIds.current.has(item.id)) return false;
    pendingReadIds.current.add(item.id);
    mutationVersion.current += 1;
    const now = new Date().toISOString();
    try {
      const result = await client.from("ahoier_notifications").update({ read_at: now })
        .eq("id", item.id).eq("recipient_id", userId).is("read_at", null);
      if (result.error) {
        setError("Benachrichtigung konnte nicht als gelesen markiert werden.");
        return false;
      }
      setItems(current => current.map(row => row.id === item.id ? { ...row, read_at: now } : row));
      setUnreadCount(current => Math.max(0, current - 1));
      return true;
    } finally {
      pendingReadIds.current.delete(item.id);
      setReload(value => value + 1);
    }
  }

  async function markAllRead() {
    if (busy || !unreadCount) return;
    setBusy(true);
    mutationVersion.current += 1;
    const now = new Date().toISOString();
    const result = await client.from("ahoier_notifications").update({ read_at: now })
      .eq("recipient_id", userId).is("read_at", null);
    if (result.error) setError("Benachrichtigungen konnten nicht markiert werden.");
    else {
      setItems(current => current.map(row => ({ ...row, read_at: row.read_at ?? now })));
      setUnreadCount(0);
      setError("");
      closeRef.current?.focus();
    }
    setBusy(false);
    setReload(value => value + 1);
  }

  function openItem(item: SocialNotification) {
    if (!item.read_at) void markRead(item);
    setOpen(false);
    onNavigate(destinationFor(item));
  }

  if (unavailable) return null;

  return <div className={styles.root} ref={rootRef}>
    <button ref={triggerRef} type="button" className={styles.trigger} aria-label={`Benachrichtigungen${unreadCount ? `, ${unreadCount} ungelesen` : ""}`} aria-expanded={open} aria-controls="social-notifications-panel" onClick={() => { setOpen(value => !value); setReload(value => value + 1); }}>
      <Bell size={20} aria-hidden="true" />
      {unreadCount > 0 && <span className={styles.badge} aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>}
    </button>
    {open && <section id="social-notifications-panel" className={styles.panel} aria-labelledby="social-notifications-title">
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>DEIN POSTFACH</span><h2 id="social-notifications-title">Benachrichtigungen</h2></div>
        <button ref={closeRef} type="button" className={styles.close} aria-label="Benachrichtigungen schließen" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}><X size={19} /></button>
      </header>
      <div className={styles.actions}>
        <span>{unreadCount ? `${unreadCount} ungelesen` : "Alles gelesen"}</span>
        {unreadCount > 0 && <button type="button" onClick={() => void markAllRead()} disabled={busy}><CheckCheck size={15} aria-hidden="true" /> Alle gelesen</button>}
      </div>
      {error && <p className={styles.error} role="alert">{error} <button type="button" onClick={() => setReload(value => value + 1)}>Erneut versuchen</button></p>}
      {!loaded ? <p className={styles.empty} role="status">Benachrichtigungen werden geladen …</p> : items.length === 0 && !error ? <p className={styles.empty}>Noch keine Benachrichtigungen. Neue Antworten und Nachrichten erscheinen hier.</p> : <ul className={styles.list}>
        {items.map(item => <li key={item.id} className={item.read_at ? styles.read : styles.unread}>
          <span className={styles.kindIcon}><KindIcon kind={item.kind} /></span>
          <button id={`social-notification-${item.id}`} type="button" className={styles.itemMain} onClick={() => openItem(item)}>
            <span>{notificationText(item, actorNames[item.actor_id])}</span>
            <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString("de-DE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
          </button>
          {!item.read_at && <button type="button" className={styles.markOne} aria-label={`Als gelesen markieren: ${notificationText(item, actorNames[item.actor_id])}`} onClick={() => { void markRead(item).then(marked => { if (marked) requestAnimationFrame(() => document.getElementById(`social-notification-${item.id}`)?.focus()); }); }}><Check size={16} aria-hidden="true" /></button>}
        </li>)}
      </ul>}
      {items.length >= ROWS_LIMIT && <p className={styles.footerNote}>Die letzten {ROWS_LIMIT} Benachrichtigungen.</p>}
      <button type="button" className={styles.refresh} onClick={() => setReload(value => value + 1)}><RefreshCw size={14} aria-hidden="true" /> Aktualisieren</button>
    </section>}
  </div>;
}
