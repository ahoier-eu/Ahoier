"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { ArrowRight, Check, Compass, Flag, Mail, MessageCircle, RefreshCw, Send, Ship, Users, Waves } from "lucide-react";
import { dateLabel } from "@/lib/journey";
import { supabaseBrowser } from "@/lib/supabase-browser";
import "./live-community.css";

type Profile = { user_id: string; display_name: string };
type Voyage = { id: string; ship: string; starts_on: string; ends_on: string };
type Post = { id: string; voyage_id: string; author_id: string; category: string; body: string; created_at: string };
type Reply = { id: string; post_id: string; author_id: string; body: string; created_at: string };
type Feed = { userId: string; voyageId: string; posts: Post[]; replies: Reply[]; names: Record<string, string> };
type ReportTarget = { type: "post" | "reply"; id: string };

const CATEGORIES = ["Frage", "Tipp", "Zusammen an Land", "Fundstück"] as const;
const EMPTY_FEED: Feed = { userId: "", voyageId: "", posts: [], replies: [], names: {} };
const formatTime = (value: string) => new Date(value).toLocaleString("de-DE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function ReportDialog({ busy, close, submit }: { busy: boolean; close: () => void; submit: (event: FormEvent<HTMLFormElement>) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { if (element?.open) element.close(); };
  }, []);
  return <dialog className="live-report-dialog" ref={dialog} onCancel={close} onClose={close} aria-labelledby="live-report-title"><form className="live-card live-report" onSubmit={submit}><div className="live-report-head"><h2 id="live-report-title">Inhalt melden</h2><button type="button" onClick={close} aria-label="Schließen">×</button></div><p>Deine Meldung ist nur für die Prüfung sichtbar.</p><label htmlFor="live-reason">Grund</label><select id="live-reason" name="reason" required><option value="spam">Spam</option><option value="harassment">Belästigung</option><option value="unsafe">Unsicherer Inhalt</option><option value="other">Anderes</option></select><label htmlFor="live-details">Details (freiwillig)</label><textarea id="live-details" name="details" maxLength={300} rows={3} /><button className="live-primary" disabled={busy} type="submit">Meldung senden</button></form></dialog>;
}

export function LiveCommunityApp() {
  const client = useMemo(() => supabaseBrowser(), []);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accountUserId, setAccountUserId] = useState("");
  const [voyages, setVoyages] = useState<Voyage[]>([]);
  const [voyageId, setVoyageId] = useState("");
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountFailed, setAccountFailed] = useState(false);
  const [accountVersion, setAccountVersion] = useState(0);
  const [loadedFeed, setLoadedFeed] = useState<Feed>(EMPTY_FEED);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedVersion, setFeedVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Frage");
  const [body, setBody] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const lastUserId = useRef<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    let changedAfterLoadStarted = false;
    const adoptUser = (next: User | null) => {
      if (!active) return;
      if (lastUserId.current !== next?.id) {
        lastUserId.current = next?.id;
        setEmail(""); setBody(""); setReplyDrafts({}); setReportTarget(null);
        setLoadedFeed(EMPTY_FEED); setProfile(null); setVoyages([]); setVoyageId("");
        setAccountUserId(""); setAccountFailed(false);
      }
      setUser(next);
      setAuthReady(true);
    };
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      changedAfterLoadStarted = true;
      adoptUser(session?.user ?? null);
    });
    void client.auth.getSession().then(async ({ data: sessionData }) => {
      if (!active || changedAfterLoadStarted) return;
      if (!sessionData.session) { adoptUser(null); return; }
      const { data, error: authError } = await client.auth.getUser();
      if (!active || changedAfterLoadStarted) return;
      if (authError) setError("Die Anmeldung konnte nicht geprüft werden. Bitte versuche es erneut.");
      adoptUser(data.user);
    }).catch(() => {
      if (!active || changedAfterLoadStarted) return;
      setError("Die Anmeldung konnte nicht geprüft werden. Bitte versuche es erneut.");
      adoptUser(null);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [client]);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const load = async () => {
      if (!active) return;
      setAccountLoading(true);
      setAccountFailed(false);
      try {
        const [profileResult, membershipResult] = await Promise.all([
          client.from("ahoier_profiles").select("user_id,display_name").eq("user_id", userId).maybeSingle(),
          client.from("ahoier_memberships").select("voyage_id").eq("user_id", userId),
        ]);
        if (profileResult.error || membershipResult.error) throw new Error("account");
        const ids = (membershipResult.data ?? []).map(row => row.voyage_id as string);
        const voyageResult = ids.length
          ? await client.from("ahoier_voyages").select("id,ship,starts_on,ends_on").in("id", ids).order("starts_on", { ascending: false })
          : null;
        if (voyageResult?.error) throw new Error("voyages");
        if (!active) return;
        const nextVoyages = (voyageResult?.data ?? []) as Voyage[];
        setProfile(profileResult.data as Profile | null);
        setVoyages(nextVoyages);
        setVoyageId(current => nextVoyages.some(voyage => voyage.id === current) ? current : nextVoyages[0]?.id ?? "");
        setAccountUserId(userId);
      } catch {
        if (active) { setAccountFailed(true); setError("Dein Profil und deine Reisen konnten nicht geladen werden. Bitte versuche es erneut."); }
      } finally {
        if (active) setAccountLoading(false);
      }
    };
    void Promise.resolve().then(load);
    return () => { active = false; };
  }, [client, userId, accountVersion]);

  useEffect(() => {
    if (!userId || !voyageId || accountUserId !== userId) return;
    let active = true;
    const load = async () => {
      if (!active) return;
      setFeedLoading(true);
      try {
        const postResult = await client.from("ahoier_posts")
          .select("id,voyage_id,author_id,category,body,created_at")
          .eq("voyage_id", voyageId).order("created_at", { ascending: false }).limit(50);
        if (postResult.error) throw new Error("posts");
        const posts = (postResult.data ?? []) as Post[];
        const replyResult = posts.length
          ? await client.from("ahoier_replies").select("id,post_id,author_id,body,created_at")
            .in("post_id", posts.map(post => post.id)).order("created_at", { ascending: false }).limit(300)
          : null;
        if (replyResult?.error) throw new Error("replies");
        const replies = ((replyResult?.data ?? []) as Reply[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
        const authorIds = [...new Set([...posts.map(post => post.author_id), ...replies.map(reply => reply.author_id)])];
        const profileResult = authorIds.length
          ? await client.from("ahoier_profiles").select("user_id,display_name").in("user_id", authorIds)
          : null;
        if (profileResult?.error) throw new Error("profiles");
        if (!active) return;
        setLoadedFeed({
          userId, voyageId, posts, replies,
          names: Object.fromEntries(((profileResult?.data ?? []) as Profile[]).map(author => [author.user_id, author.display_name])),
        });
      } catch {
        if (active) setError("Beiträge konnten nicht geladen werden. Bitte versuche es erneut.");
      } finally {
        if (active) setFeedLoading(false);
      }
    };
    void Promise.resolve().then(load);
    return () => { active = false; };
  }, [client, userId, accountUserId, voyageId, feedVersion]);

  useEffect(() => {
    if (!voyageId) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setFeedVersion(version => version + 1);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [voyageId]);

  async function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice(""); setBusy(true);
    try {
      const { error: authError } = await client.auth.signInWithOtp({
        email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/community` },
      });
      if (authError) throw authError;
      setNotice("Anmeldelink gesendet. Öffne die E-Mail auf diesem Gerät und folge dem Link.");
    } catch {
      setError("Der Anmeldelink konnte nicht gesendet werden. Bitte prüfe die E-Mail-Adresse und versuche es erneut.");
    } finally { setBusy(false); }
  }

  async function signOut() {
    setError(""); setNotice(""); setBusy(true);
    try {
      const { error: signOutError } = await client.auth.signOut();
      if (signOutError) throw signOutError;
    } catch {
      setError("Die Abmeldung ist fehlgeschlagen. Bitte versuche es erneut.");
    } finally { setBusy(false); }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) return;
    const name = String(new FormData(event.currentTarget).get("displayName") ?? "").trim();
    if (name.length < 2 || name.length > 40) { setError("Bitte wähle einen Namen mit 2 bis 40 Zeichen."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = profile
        ? await client.from("ahoier_profiles").update({ display_name: name }).eq("user_id", userId)
        : await client.from("ahoier_profiles").insert({ user_id: userId, display_name: name });
      if (result.error) throw result.error;
      setProfile({ user_id: userId, display_name: name });
      setFeedVersion(version => version + 1);
      setNotice("Dein Profil ist gespeichert.");
    } catch { setError("Das Profil konnte nicht gespeichert werden."); }
    finally { setBusy(false); }
  }

  async function joinVoyage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const code = String(new FormData(form).get("inviteCode") ?? "").trim().toLowerCase();
    setBusy(true); setError(""); setNotice("");
    try {
      const { error: joinError } = await client.rpc("ahoier_join_voyage", { p_code: code });
      if (joinError) throw joinError;
      setAccountVersion(version => version + 1);
      setNotice("Du bist jetzt in deiner Reisegruppe.");
      form.reset();
    } catch { setError("Der Einladungscode ist ungültig oder abgelaufen."); }
    finally { setBusy(false); }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || !voyageId) return;
    const content = body.trim();
    if (!content || content.length > 1000) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { error: postError } = await client.from("ahoier_posts").insert({
        voyage_id: voyageId, author_id: userId, category, body: content,
      });
      if (postError) throw postError;
      setBody(""); setFeedVersion(version => version + 1);
      setNotice("Dein Beitrag ist für diese Reisegruppe sichtbar.");
    } catch { setError("Der Beitrag konnte nicht veröffentlicht werden."); }
    finally { setBusy(false); }
  }

  async function reply(event: FormEvent<HTMLFormElement>, postId: string) {
    event.preventDefault();
    if (!userId) return;
    const content = (replyDrafts[postId] ?? "").trim();
    if (!content || content.length > 1000) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { error: replyError } = await client.from("ahoier_replies").insert({ post_id: postId, author_id: userId, body: content });
      if (replyError) throw replyError;
      setReplyDrafts(current => ({ ...current, [postId]: "" }));
      setFeedVersion(version => version + 1);
    } catch { setError("Die Antwort konnte nicht gespeichert werden."); }
    finally { setBusy(false); }
  }

  async function remove(type: "post" | "reply", id: string) {
    if (!window.confirm("Diesen Inhalt für alle entfernen?")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const table = type === "post" ? "ahoier_posts" : "ahoier_replies";
      const { error: deleteError } = await client.from(table).delete().eq("id", id);
      if (deleteError) throw deleteError;
      setFeedVersion(version => version + 1);
      setNotice("Inhalt entfernt.");
    } catch { setError("Der Inhalt konnte nicht entfernt werden."); }
    finally { setBusy(false); }
  }

  async function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reportTarget || !userId) return;
    const data = new FormData(event.currentTarget);
    const reason = String(data.get("reason") ?? "other");
    const details = String(data.get("details") ?? "").trim();
    setBusy(true); setError(""); setNotice("");
    try {
      const subject = reportTarget.type === "post" ? { post_id: reportTarget.id } : { reply_id: reportTarget.id };
      const { error: reportError } = await client.from("ahoier_reports").insert({ reporter_id: userId, reason, details, ...subject });
      if (reportError) throw reportError;
      setReportTarget(null);
      setNotice("Deine Meldung wurde gespeichert.");
    } catch { setError("Die Meldung konnte nicht gespeichert werden. Vielleicht hast du diesen Inhalt schon gemeldet."); }
    finally { setBusy(false); }
  }

  const activeVoyage = voyages.find(voyage => voyage.id === voyageId);
  const name = profile?.display_name ?? "Gast";
  const feed = loadedFeed.userId === userId && loadedFeed.voyageId === voyageId ? loadedFeed : EMPTY_FEED;

  return <div className="live-app">
    <a className="skip-link" href="#live-main">Zum Inhalt</a>
    <header className="live-header"><Link href="/" className="brand" aria-label="Ahoier Startseite">ahoier<span className="brand-dot">.</span><Waves size={24} /></Link><nav aria-label="Hauptnavigation"><Link href="/reise" aria-label="Reiseübersicht"><Compass size={17} /><span>Reise</span></Link>{user && <button type="button" onClick={() => void signOut()} disabled={busy}>Abmelden</button>}</nav></header>
    <main id="live-main" className="live-main">
      {!authReady ? <div className="live-card live-center" role="status">Anmeldung wird geprüft …</div> : !user ? <section className="live-entry">
        <div className="live-entry-copy"><span className="live-kicker"><Ship size={16} /> DEINE COMMUNITY AN BORD</span><h1>Aus Mitreisenden werden <span>Bekanntschaften.</span></h1><p>Fragen stellen, Tipps teilen und Menschen auf derselben Reise kennenlernen. Du brauchst nur einen Anmeldelink und einen Einladungscode für deine Reisegruppe.</p><div className="live-entry-points"><span><Users size={17} /> Reisegruppen per Code</span><span><MessageCircle size={17} /> Gemeinsame Beiträge</span></div></div>
        <form className="live-card live-auth" onSubmit={sendLink}><span className="live-icon"><Mail size={24} /></span><h2>Willkommen an Bord</h2><p>Wir senden dir einen einmaligen Anmeldelink per E-Mail.</p><label htmlFor="live-email">Deine E-Mail-Adresse</label><input id="live-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} required placeholder="du@beispiel.de" /><button className="live-primary" disabled={busy} type="submit">Anmeldelink senden <ArrowRight size={17} /></button><small>Der Link erstellt bei Bedarf ein Konto. Ein Einladungscode ist danach nötig, um Beiträge einer Reise zu sehen.</small></form>
      </section> : accountFailed ? <div className="live-card live-center" role="alert">Deine Daten konnten nicht geladen werden. <button className="live-secondary" type="button" onClick={() => setAccountVersion(version => version + 1)}>Erneut versuchen</button></div> : accountLoading || accountUserId !== userId ? <div className="live-card live-center" role="status">Deine Reisegruppe wird geladen …</div> : !profile ? <section className="live-setup live-card"><span className="live-kicker">SCHRITT 1 VON 2</span><h1>Wie sollen dich andere nennen?</h1><p>Dein Anzeigename erscheint bei Beiträgen und Antworten. Deine E-Mail-Adresse wird nicht angezeigt.</p><form onSubmit={saveProfile}><label htmlFor="live-name">Anzeigename</label><input id="live-name" name="displayName" minLength={2} maxLength={40} required autoComplete="nickname" placeholder="Zum Beispiel: Lea" /><button className="live-primary" disabled={busy} type="submit">Profil speichern <ArrowRight size={17} /></button></form></section> : voyages.length === 0 ? <section className="live-setup live-card"><span className="live-kicker">SCHRITT 2 VON 2</span><h1>Zu deiner Reisegruppe</h1><p>Gib den Einladungscode für deine Reise ein. Ein Code ist keine Bestätigung deiner Buchung oder Identität.</p><form onSubmit={joinVoyage}><label htmlFor="live-invite">Einladungscode</label><input id="live-invite" name="inviteCode" minLength={32} maxLength={32} pattern="[a-fA-F0-9]{32}" autoCapitalize="none" autoComplete="off" spellCheck={false} required placeholder="32-stelliger Code" /><button className="live-primary" disabled={busy} type="submit">Reisegruppe öffnen <ArrowRight size={17} /></button></form></section> : <>
        <section className="live-hero"><span className="live-kicker"><Ship size={16} /> ZUSAMMEN MEHR MEER</span><h1>Hallo, {name}. <span>Du bist an Bord.</span></h1><p>Frag nach, teil einen Tipp oder begrüße andere Gäste deiner Reisegruppe.</p><div className="live-journey"><Ship size={20} /><div><strong>{activeVoyage?.ship ?? "Deine Reise"}</strong><small>{activeVoyage ? `${dateLabel(activeVoyage.starts_on, { year: "numeric" })} – ${dateLabel(activeVoyage.ends_on, { year: "numeric" })}` : ""}</small></div>{voyages.length > 1 && <select aria-label="Reisegruppe auswählen" value={voyageId} onChange={event => setVoyageId(event.target.value)}>{voyages.map(voyage => <option key={voyage.id} value={voyage.id}>{voyage.ship} · {dateLabel(voyage.starts_on)}</option>)}</select>}</div></section>
        <div className="live-layout"><div className="live-stream"><form className="live-card live-composer" onSubmit={publish}><span className="live-kicker">DEINE STIMME AN BORD</span><h2>Was möchtest du teilen?</h2><div className="live-composer-row"><select aria-label="Kategorie" value={category} onChange={event => setCategory(event.target.value as (typeof CATEGORIES)[number])}>{CATEGORIES.map(item => <option key={item}>{item}</option>)}</select><span>{body.trim().length}/1000</span></div><label className="sr-only" htmlFor="live-post">Dein Beitrag</label><textarea id="live-post" value={body} onChange={event => setBody(event.target.value)} maxLength={1000} required placeholder="Eine Frage, ein Tipp oder eine Idee für andere Gäste …" rows={3} /><div className="live-composer-bottom"><small>Nur eingeladene Mitglieder dieser Reisegruppe können den Beitrag lesen.</small><button className="live-primary" disabled={busy || !body.trim()} type="submit">Teilen <Send size={16} /></button></div></form>
          <div className="live-feed-heading"><div><span className="live-kicker">GEMEINSAM AN BORD</span><h2>Aus der Reisegruppe</h2></div><button className="live-refresh" type="button" onClick={() => setFeedVersion(version => version + 1)} disabled={feedLoading}><RefreshCw size={17} /> Aktualisieren</button></div>
          {feedLoading && feed.posts.length === 0 ? <div className="live-card live-center" role="status">Beiträge werden geladen …</div> : feed.posts.length === 0 ? <div className="live-card live-empty"><MessageCircle size={30} /><h3>Noch keine Beiträge</h3><p>Du kannst die erste Frage stellen oder einen Tipp für andere Gäste teilen.</p></div> : <div className="live-posts">{feed.replies.length === 300 && <p className="live-feed-limit">Es werden die 300 neuesten Antworten angezeigt.</p>}{feed.posts.map(post => <article className="live-card live-post" key={post.id}><div className="live-post-head"><span className="live-avatar" aria-hidden="true">{(feed.names[post.author_id] ?? "G").slice(0, 1).toLocaleUpperCase("de")}</span><div><strong>{feed.names[post.author_id] ?? "Gast"}</strong><small>{formatTime(post.created_at)}</small></div><span className="live-tag">{post.category}</span></div><p className="live-post-body">{post.body}</p><div className="live-post-actions"><span><MessageCircle size={16} /> {feed.replies.filter(reply => reply.post_id === post.id).length} Antworten angezeigt</span>{post.author_id === userId ? <button type="button" disabled={busy} onClick={() => void remove("post", post.id)}>Entfernen</button> : <button type="button" onClick={() => setReportTarget({ type: "post", id: post.id })}><Flag size={15} /> Melden</button>}</div><div className="live-replies">{feed.replies.filter(reply => reply.post_id === post.id).map(reply => <div className="live-reply" key={reply.id}><span className="live-avatar small" aria-hidden="true">{(feed.names[reply.author_id] ?? "G").slice(0, 1).toLocaleUpperCase("de")}</span><div><strong>{feed.names[reply.author_id] ?? "Gast"}</strong><small> · {formatTime(reply.created_at)}</small><p>{reply.body}</p><button type="button" disabled={busy} onClick={() => reply.author_id === userId ? void remove("reply", reply.id) : setReportTarget({ type: "reply", id: reply.id })}>{reply.author_id === userId ? "Entfernen" : "Melden"}</button></div></div>)}<form onSubmit={event => void reply(event, post.id)}><label className="sr-only" htmlFor={`live-reply-${post.id}`}>Antwort an {feed.names[post.author_id] ?? "Gast"}</label><input id={`live-reply-${post.id}`} value={replyDrafts[post.id] ?? ""} onChange={event => setReplyDrafts(current => ({ ...current, [post.id]: event.target.value }))} maxLength={1000} required placeholder="Antwort schreiben …" /><button type="submit" disabled={busy || !(replyDrafts[post.id] ?? "").trim()} aria-label="Antwort senden"><Send size={17} /></button></form></div></article>)}</div>}
        </div><aside className="live-aside"><section className="live-card live-profile"><span className="live-kicker">DEIN PROFIL</span><span className="live-avatar large" aria-hidden="true">{name.slice(0, 1).toLocaleUpperCase("de")}</span><h2>{name}</h2><p>So sehen dich andere in der Reisegruppe.</p><details><summary>Namen ändern</summary><form onSubmit={saveProfile}><label htmlFor="live-edit-name">Neuer Anzeigename</label><input id="live-edit-name" name="displayName" minLength={2} maxLength={40} defaultValue={name} required /><button className="live-secondary" type="submit" disabled={busy}>Speichern</button></form></details></section><section className="live-card live-info"><Users size={23} /><h3>Ein guter Anfang</h3><p>Stell eine einfache Frage oder teile einen konkreten Tipp. So kommen Gespräche an Bord leichter in Gang.</p><p className="live-info-note"><Check size={15} /> Nur Mitglieder deiner Reisegruppe sehen diese Beiträge.</p></section><section className="live-card live-info"><h3>Weitere Reisegruppe?</h3><p>Wenn du einen weiteren Einladungscode hast, kannst du ihn hier eingeben.</p><form onSubmit={joinVoyage}><label className="sr-only" htmlFor="live-extra-invite">Weiterer Einladungscode</label><input id="live-extra-invite" name="inviteCode" minLength={32} maxLength={32} pattern="[a-fA-F0-9]{32}" autoCapitalize="none" autoComplete="off" spellCheck={false} required placeholder="Einladungscode" /><button className="live-secondary" disabled={busy} type="submit">Hinzufügen</button></form></section></aside></div>
      </>}
      {reportTarget && <ReportDialog busy={busy} close={() => setReportTarget(null)} submit={report} />}
      {(error || notice) && <div className={`live-feedback ${error ? "is-error" : ""}`} role={error ? "alert" : "status"}>{error || notice}<button type="button" onClick={() => { setError(""); setNotice(""); }} aria-label="Hinweis schließen">×</button></div>}
      <footer className="live-footer">Ahoier ist unabhängig und kein AIDA-Dienst. Einladungscodes bestätigen keine Buchung oder Identität. <Link href="/reise">Reiseübersicht</Link></footer>
    </main>
  </div>;
}
