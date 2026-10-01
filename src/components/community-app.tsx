"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowRight, CalendarDays, Check, Coffee, Compass, Dice5, Heart, MapPin, MessageCircle, Plus, Search, Ship, Sparkles, Users, UtensilsCrossed, Waves, X } from "lucide-react";
import { CATEGORIES, INTERESTS, TRAVEL_GROUPS, TRAVEL_GROUP_LABELS, SELF, attendeeCount, availablePlaces, memberPartySize, decodeState, examples, isUpcomingMeeting, joinMeeting, updateMeetingPartySize, leaveMeeting, scopeKey, validateMeeting, type CommunityState, type Meeting, type Profile, type Space, type Post } from "@/lib/community";
import { dateLabel, validateJourney, type FleetEntry, type Journey } from "@/lib/journey";
import { SHIP_PHOTO_CREDITS } from "@/lib/ships";
import { IDEAS, SocialBoard } from "./social-board";
import "./community.css";

const STORAGE = "ahoier:community:v1";
const TRAVEL = "ahoier:state:v1";
const NAV = [{ id: "board", label: "An Bord", icon: Ship }, { id: "meetings", label: "Treffen", icon: Users }, { id: "community", label: "Community", icon: MessageCircle }, { id: "messages", label: "Nachrichten", icon: Heart }, { id: "profile", label: "Profil", icon: Coffee }] as const;
type Tab = typeof NAV[number]["id"];
function subscribe(callback: () => void) { window.addEventListener("storage", callback); window.addEventListener("ahoier:changed", callback); window.addEventListener("hashchange", callback); return () => { window.removeEventListener("storage", callback); window.removeEventListener("ahoier:changed", callback); window.removeEventListener("hashchange", callback); }; }
function read(key: string) { try { return localStorage.getItem(key) ?? "{}"; } catch { return "{}"; } }
function hash(): Tab { const id = window.location.hash.slice(1); return NAV.find(n => n.id === id)?.id ?? "board"; }
function navigate(tab: Tab) { window.history.pushState(null, "", `#${tab}`); window.dispatchEvent(new HashChangeEvent("hashchange")); }
const uid = () => crypto.randomUUID();
const field = (data: FormData, name: string) => String(data.get(name) ?? "").trim();

function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog className="social-modal" ref={ref} onCancel={close} onClose={close} aria-labelledby="social-dialog-title"><div className="social-modal-head"><h2 id="social-dialog-title">{title}</h2><button className="icon-button" onClick={close} aria-label="Schließen"><X size={22} /></button></div>{children}</dialog>;
}
function Avatar({ name }: { name: string }) { return <span className="social-avatar" data-tone={Array.from(name).reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 5} aria-hidden="true">{name.slice(0, 1).toLocaleUpperCase("de") || "?"}</span>; }

function meetingTheme(meeting: Meeting) {
  if (meeting.familyFriendly) return "family";
  const words = `${meeting.title} ${meeting.description}`.toLocaleLowerCase("de").split(/[^\p{L}]+/u);
  const mentions = (...terms: string[]) => words.some(word => terms.some(term => word.startsWith(term)));
  if (mentions("kaffee", "café", "cafe", "plaudern")) return "coffee";
  if (mentions("spiel", "quiz", "karte", "brett")) return "games";
  if (mentions("essen", "abendessen", "restaurant", "kulinar", "frühstück", "fruehstueck")) return "dining";
  if (mentions("landgang", "hafen", "ausfl", "entdecken", "spaziergang")) return "landgang";
  return "general";
}

const MEETING_ICONS = { family: Users, coffee: Coffee, games: Dice5, dining: UtensilsCrossed, landgang: Compass, general: Users };

export function CommunityApp({ fleet, initialJourney }: { fleet: FleetEntry[]; initialJourney: Journey }) {
  const raw = useSyncExternalStore(subscribe, () => read(STORAGE), () => "{}");
  const travelRaw = useSyncExternalStore(subscribe, () => read(TRAVEL), () => "{}");
  const tab = useSyncExternalStore(subscribe, hash, () => "board" as Tab);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [tab]);
  const state = useMemo(() => decodeState(raw), [raw]);
  const journey = useMemo(() => { try { const j = JSON.parse(travelRaw).journey; return j && typeof j.ship === "string" && typeof j.from === "string" && typeof j.to === "string" && !validateJourney(j, fleet) ? j as Journey : initialJourney; } catch { return initialJourney; } }, [travelRaw, fleet, initialJourney]);
  const scope = scopeKey(journey.ship, journey.from, journey.to);
  const space = state.spaces[scope] ?? examples(journey.from, journey.to);
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<"meeting" | "post" | null>(null);
  const [idea, setIdea] = useState<number | null>(null);
  const [postSeed, setPostSeed] = useState("");
  const [pendingModal, setPendingModal] = useState<"meeting" | "post" | null>(null);
  const [formError, setFormError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [category, setCategory] = useState("Alle");
  const [search, setSearch] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [familyOnly, setFamilyOnly] = useState(false);
  const [partyMeetingId, setPartyMeetingId] = useState<string | null>(null);
  const [partySize, setPartySize] = useState(2);
  const [pendingJoin, setPendingJoin] = useState<{ id: string; count: number } | null>(null);
  const meetings = space.meetings.filter(m => !space.hidden.includes(m.id) && !space.blocked.includes(m.author));
  const posts = space.posts.filter(p => !space.hidden.includes(p.id) && !space.blocked.includes(p.author));
  const filteredMeetings = meetings.filter(m => (!onlyMine || m.members.includes(SELF)) && (!familyOnly || m.familyFriendly) && `${m.title} ${m.description}`.toLocaleLowerCase("de").includes(search.toLocaleLowerCase("de"))).sort((a, b) => Number(isUpcomingMeeting(b)) - Number(isUpcomingMeeting(a)) || `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const joined = meetings.filter(m => m.members.includes(SELF));
  const current = joined.find(m => m.id === selected) ?? joined[0];
  const partyMeeting = partyMeetingId ? meetings.find(m => m.id === partyMeetingId) : null;
  const partyLimit = partyMeeting ? Math.min(10, availablePlaces(partyMeeting) + memberPartySize(partyMeeting, SELF)) : 1;

  function persist(update: (latest: CommunityState) => CommunityState) {
    try { const next = update(decodeState(read(STORAGE))); localStorage.setItem(STORAGE, JSON.stringify(next)); window.dispatchEvent(new Event("ahoier:changed")); return true; }
    catch { setNotice("Speichern nicht möglich. Bitte prüfe den freien Browserspeicher und erlaube lokale Daten."); return false; }
  }
  function changeSpace(update: (latest: Space) => Space) { return persist(latest => ({ ...latest, spaces: { ...latest.spaces, [scope]: update(latest.spaces[scope] ?? examples(journey.from, journey.to)) } })); }
  function ready() { if (state.profile.name.trim()) return true; setNotice("Lege zuerst deinen Anzeigenamen im Profil fest. Ein echtes Konto ist dafür noch nicht nötig."); navigate("profile"); return false; }
  function openModal(type: "meeting" | "post", template: number | null = null, seed = "") { setIdea(template); setPostSeed(seed); setFormError(""); if (ready()) setModal(type); else setPendingModal(type); }
  function saveAttendance(id: string, count: number) {
    const result: { status: "missing" | "unavailable" | "past" | "saved" } = { status: "missing" };
    if (!changeSpace(s => ({ ...s, meetings: s.meetings.map(m => {
      if (m.id !== id) return m;
      if (!isUpcomingMeeting(m)) { result.status = "past"; return m; }
      const next = m.members.includes(SELF) ? updateMeetingPartySize(m, SELF, count) : joinMeeting(m, SELF, count);
      result.status = next === m ? "unavailable" : "saved";
      return next;
    }) }))) return false;
    if (result.status !== "saved") {
      setNotice(result.status === "missing" ? "Dieses Treffen ist nicht mehr verfügbar." : result.status === "past" ? "Dieses Treffen ist bereits vorbei." : "Für diese Gruppe sind nicht genügend Plätze frei.");
      return false;
    }
    setNotice(`${count} ${count === 1 ? "Platz" : "Plätze"} lokal vorgemerkt. Niemand wurde benachrichtigt.`);
    setPartyMeetingId(null);
    return true;
  }
  function toggleJoin(meeting: Meeting) {
    if (!isUpcomingMeeting(meeting)) { setNotice("Dieses Treffen ist bereits vorbei."); return; }
    if (meeting.members.includes(SELF)) {
      if (changeSpace(s => ({ ...s, meetings: s.meetings.map(m => m.id === meeting.id ? leaveMeeting(m, SELF) : m) }))) setNotice("Du hast das Treffen lokal verlassen.");
      return;
    }
    if (!state.profile.name.trim()) { setPendingJoin({ id: meeting.id, count: 1 }); ready(); return; }
    saveAttendance(meeting.id, 1);
  }
  function hide(id: string) { if (changeSpace(s => ({ ...s, hidden: [...new Set([...s.hidden, id])] }))) setNotice("In dieser Vorschau ausgeblendet. Es wurde keine Meldung an ein Moderationsteam gesendet."); }
  function block(author: string) { if (window.confirm("Beiträge und Treffen dieses Beispielprofils lokal ausblenden?")) changeSpace(s => ({ ...s, blocked: [...new Set([...s.blocked, author])] })); }
  function reply(post: Post, form: HTMLFormElement) {
    if (!ready()) return;
    const body = field(new FormData(form), "reply");
    if (!body || body.length > 1000) return;
    if (post.replies.length >= 100) { setNotice("In der Vorschau sind höchstens 100 Antworten pro Beitrag möglich."); return; }
    if (changeSpace(s => ({ ...s, posts: s.posts.map(p => p.id === post.id ? { ...p, replies: [...p.replies, { id: uid(), name: state.profile.name, body }] } : p) }))) form.reset();
  }
  function meetingCard(m: Meeting) {
    const member = m.members.includes(SELF), owner = m.author === SELF;
    const upcoming = isUpcomingMeeting(m);
    const theme = meetingTheme(m), MeetingIcon = MEETING_ICONS[theme];
    return <article className={`social-meeting ${m.cancelled ? "is-cancelled" : !upcoming ? "is-past" : ""}`} data-theme={theme} key={m.id}>
      <div className="social-card-top"><span className="meeting-badges"><span className="social-category"><MeetingIcon size={15} aria-hidden="true" /> Gästetreffen</span>{m.familyFriendly && <span className="family-pill">Für Familien</span>}{!m.cancelled && !upcoming && <span className="past-pill">Vorbei</span>}</span>{m.demo && <span className="demo-pill">Beispiel</span>}</div>
      <div className="invite-host"><Avatar name={owner ? state.profile.name : m.name} /><span><strong>{owner ? state.profile.name : m.name}</strong> lädt ein<small>{m.demo ? "Beispielprofil" : "Dein lokales Treffen"}</small></span></div><h3>{m.title}</h3><details className="meeting-description meeting-details"><summary>Mehr über das Treffen</summary><p>{m.description || "Weitere Details könnt ihr in der Gruppe abstimmen."}</p><p>Treffpunkt: {m.place}</p></details>
      <div className="meeting-meta"><span><CalendarDays size={16} />{dateLabel(m.date)} · {m.time}</span><span><MapPin size={16} />{m.place}</span></div>
      <div className="meeting-host"><div className="participant-stack" aria-label={`${attendeeCount(m)} Personen angemeldet`}>{m.members.slice(0, 3).map(member => <Avatar key={member} name={member === SELF ? state.profile.name : member.replace("demo-", "")} />)}</div><div><strong>{availablePlaces(m) > 0 ? `Noch ${availablePlaces(m)} ${availablePlaces(m) === 1 ? "Platz" : "Plätze"}` : "Runde vollständig"}</strong><small>{attendeeCount(m)} dabei{m.demo ? member ? " · Beispieltreffen, lokale Zusage" : " · Beispielgäste" : " · lokal"}</small>{member && <span className="meeting-confirmation"><Check size={12} aria-hidden="true" /> Deine Zusage ist lokal gespeichert</span>}</div></div>
      {m.cancelled ? <p className="cancelled-label">Dieses Treffen wurde abgesagt.</p> : !upcoming ? <p className="cancelled-label">Dieses Treffen ist vorbei.</p> : <><div className="social-actions">{owner ? <button className="secondary-button" onClick={() => { if (window.confirm("Dieses Treffen lokal absagen?")) changeSpace(s => ({ ...s, meetings: s.meetings.map(x => x.id === m.id ? { ...x, cancelled: true } : x) })); }}>Absagen</button> : <button className={member ? "secondary-button" : "primary-button"} disabled={!member && availablePlaces(m) < 1} onClick={() => toggleJoin(m)}>{member ? "Verlassen" : availablePlaces(m) < 1 ? "Alle Plätze belegt" : "Ich bin dabei"}{!member && availablePlaces(m) > 0 && <Plus size={16} />}</button>}{member && <button className="text-link" onClick={() => { setSelected(m.id); navigate("messages"); }}>Gruppe <MessageCircle size={17} /></button>}</div>{((member && (memberPartySize(m, SELF) > 1 || availablePlaces(m) > 0)) || (!member && availablePlaces(m) >= 2)) && <button className="party-link" onClick={() => { setPartySize(member ? memberPartySize(m, SELF) : 2); setPartyMeetingId(m.id); }}>{member ? `Plätze ändern (${memberPartySize(m, SELF)})` : "Wir kommen zusammen"} <ArrowRight size={14} /></button>}</>}
      {!owner && <details className="social-options"><summary>Weitere Optionen</summary><button onClick={() => hide(m.id)}>Treffen ausblenden</button><button onClick={() => block(m.author)}>Beispielprofil ausblenden</button></details>}
    </article>;
  }
  function postCard(p: Post) { return <article className="social-post" key={p.id}>
    <div className="social-card-top"><div className="post-author"><Avatar name={p.name} /><div><strong>{p.author === SELF ? state.profile.name : p.name}</strong><small>{p.demo ? "Beispielbeitrag" : "Nur auf diesem Gerät"} · {dateLabel(p.created.slice(0, 10))}</small></div></div><span className="social-category">{p.category}</span></div>
    <p className="post-body">{p.body}</p><div className="post-tools"><button aria-pressed={p.helpful} className={p.helpful ? "text-link liked" : "text-link"} onClick={() => changeSpace(s => ({ ...s, posts: s.posts.map(x => x.id === p.id ? { ...x, helpful: !x.helpful } : x) }))}><Heart size={17} fill={p.helpful ? "currentColor" : "none"} />{p.helpful ? "Als hilfreich markiert" : "Hilfreich"}</button><span><MessageCircle size={16} />{p.replies.length} Antworten</span><button className="text-link" onClick={() => hide(p.id)}>Ausblenden</button></div>
    <details className="post-replies"><summary>Antworten ansehen oder schreiben</summary>{p.replies.map(r => <div className="reply" key={r.id}><strong>{r.name}</strong><p>{r.body}</p></div>)}<form onSubmit={e => { e.preventDefault(); reply(p, e.currentTarget); }}><label className="sr-only" htmlFor={`reply-${p.id}`}>Antwort auf den Beitrag von {p.name}</label><input id={`reply-${p.id}`} name="reply" required maxLength={1000} placeholder="Deine Antwort …" /><button className="secondary-button" type="submit">Antworten</button></form></details>
  </article>; }

  return <div className="social-app">
    <a className="skip-link" href="#social-main">Zum Inhalt</a>
    <aside className="social-sidebar"><Link href="/" className="brand">ahoier<span className="brand-dot">.</span><Waves size={25} /></Link><p className="social-tagline">ZUSAMMEN MEHR MEER.</p><nav aria-label="Hauptnavigation">{NAV.map(n => <a href={`#${n.id}`} key={n.id} className={`nav-item ${tab === n.id ? "active" : ""}`} aria-current={tab === n.id ? "page" : undefined}><n.icon size={21} />{n.label}</a>)}</nav><div className="social-sidebar-note"><Sparkles size={28} /><h3>Aus Mitreisenden<br />werden Bekanntschaften.</h3><p>Ein Kaffee. Ein Spiel. Ein gemeinsamer Moment.</p><a href="#meetings" className="text-link">Gesellschaft finden <ArrowRight size={16} /></a></div><span className="social-independent">Unabhängig · Für AIDA Gäste</span></aside>
    <div className="social-shell"><header className="social-topbar"><Link href="/" className="brand social-mobile-brand">ahoier<span className="brand-dot">.</span></Link><span className="social-top-label">Deine Reise. Deine Leute.</span><Link href="/reise" className="trip-switch"><Ship size={19} /><span><strong>{journey.ship}</strong><small>{dateLabel(journey.from)} – {dateLabel(journey.to)} · Reise ändern</small></span><ArrowRight size={16} /></Link><a className="profile-shortcut" href="#profile" aria-label="Dein Profil"><Avatar name={state.profile.name} /></a></header>
    <main id="social-main"><div className="prototype-banner"><span className="demo-pill">LOKALE VORSCHAU</span><p className="prototype-desktop-note">Beispielgäste, keine echten Kontakte. Beiträge, Zusagen und Nachrichten bleiben in diesem Browser. Kein offizielles Bordprogramm.</p><details className="prototype-mobile-note"><summary>Beispielgäste · keine echten Kontakte</summary><p>Beiträge, Zusagen und Nachrichten bleiben in diesem Browser. Kein offizielles Bordprogramm.</p></details><Link href="/pilot" className="prototype-pilot-link">Pilot öffnen <ArrowRight size={13} /></Link></div>
      {tab === "board" && <SocialBoard ship={journey.ship} from={journey.from} to={journey.to} profile={state.profile} meetings={meetings} posts={posts} openMeeting={template => openModal("meeting", template)} openPost={prompt => openModal("post", null, prompt)} openGroup={id => { setSelected(id); navigate("messages"); }} openMatchingMeeting={meeting => { setSearch(meeting.title); navigate("meetings"); }} renderMeeting={meetingCard} renderPost={postCard} />}
      {tab === "meetings" && <>
        <div className="social-heading"><div><span className="eyebrow">EINLADEN. MITMACHEN. KENNENLERNEN.</span><h1>Wer ist dabei<span>?</span></h1><p>Treffen von Gästen für Gäste · angegebene Uhrzeiten gemeinsam bestätigen.</p></div><button className="primary-button" onClick={() => openModal("meeting")}><Plus size={18} /> Treffen erstellen</button></div>
        <div className="social-filters"><label className="social-search"><Search size={18} /><input aria-label="Treffen suchen" value={search} onChange={e => setSearch(e.target.value)} placeholder="Spiele, Kaffee, Abendessen …" /></label><button className={`filter-pill ${onlyMine ? "selected" : ""}`} aria-pressed={onlyMine} onClick={() => setOnlyMine(!onlyMine)}>Meine Treffen ({joined.length})</button><button className={`filter-pill ${familyOnly ? "selected" : ""}`} aria-pressed={familyOnly} onClick={() => setFamilyOnly(!familyOnly)}>Für Familien</button></div>
        <div className="social-meeting-grid">{filteredMeetings.map(meetingCard)}</div>{!filteredMeetings.length && <div className="social-empty">Keine passenden Treffen. Ändere die Suche oder erstelle ein eigenes.</div>}
      </>}
      {tab === "community" && <><div className="social-heading"><div><span className="eyebrow">DEINE MITREISENDEN WISSEN WEITER</span><h1>Im Gespräch<span>.</span></h1><p>Fragen stellen, Erfahrungen teilen und gemeinsam Ideen sammeln.</p></div><button className="primary-button" onClick={() => openModal("post")}><Plus size={18} /> Beitrag schreiben</button></div><div className="social-filters" aria-label="Beitragskategorien">{["Alle", ...CATEGORIES].map(c => <button className={`filter-pill ${category === c ? "selected" : ""}`} aria-pressed={category === c} key={c} onClick={() => setCategory(c)}>{c}</button>)}</div><div className="social-community-layout"><div className="social-feed">{posts.filter(p => category === "Alle" || p.category === category).map(postCard)}{!posts.some(p => category === "Alle" || p.category === category) && <div className="social-empty">Hier ist noch Platz für deinen ersten Beitrag.</div>}</div><aside className="social-guidelines"><Sparkles size={24} /><h3>Ein gutes Miteinander.</h3><p>Freundlich bleiben. Erfahrungen als solche kennzeichnen. Keine Kabinennummern oder privaten Daten anderer teilen.</p><p>Verbindliche Rückkehrzeiten und Änderungen deiner Reise immer direkt an Bord prüfen.</p><p>Ausblenden wirkt nur lokal. Diese Vorschau hat kein Moderationsteam.</p></aside></div></>}
      {tab === "messages" && <><div className="social-heading"><div><span className="eyebrow">VOM AHOI ZUM TREFFPUNKT</span><h1>In Verbindung<span>.</span></h1><p>Lokale Gruppengespräche deiner Treffen. Nachrichten werden nicht versendet.</p></div></div>{!joined.length ? <div className="social-empty"><MessageCircle size={35} /><h2>Deine erste Gruppe wartet.</h2><p>Trete einem Treffen bei oder erstelle eines, um den Gruppenbereich auszuprobieren.</p><a href="#meetings" className="primary-button">Treffen ansehen <ArrowRight size={17} /></a></div> : <div className="social-chat-layout"><nav aria-label="Deine Gruppen">{joined.map(m => <button key={m.id} className={current?.id === m.id ? "selected" : ""} onClick={() => setSelected(m.id)}><Users size={20} /><span>{m.title}<small>{m.cancelled ? "Abgesagt" : `${m.time} · ${dateLabel(m.date)}`}</small></span></button>)}</nav>{current && <section className="social-chat"><header><h2>{current.title}</h2><p>{current.place}</p><small>Nur lokal · keine anderen Personen empfangen diese Nachrichten</small></header><div className="chat-log" role="log" aria-label="Gruppennachrichten">{space.messages.filter(m => m.meeting === current.id).map(m => <article key={m.id}><strong>{m.name}</strong><p>{m.body}</p><small>{new Date(m.created).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} · lokal gespeichert</small></article>)}{!space.messages.some(m => m.meeting === current.id) && <p className="chat-empty">Noch keine Nachrichten. Hier könntest du den Treffpunkt mit der Gruppe abstimmen.</p>}</div><form onSubmit={e => { e.preventDefault(); if (!ready() || current.cancelled || !current.members.includes(SELF)) return; const form = e.currentTarget, body = field(new FormData(form), "message"); if (body && body.length <= 1000 && changeSpace(s => ({ ...s, messages: [...s.messages, { id: uid(), meeting: current.id, body, name: state.profile.name, created: new Date().toISOString() }].slice(-500) }))) form.reset(); }}><label className="sr-only" htmlFor="message">Nachricht</label><input id="message" name="message" required maxLength={1000} disabled={current.cancelled} placeholder={current.cancelled ? "Treffen abgesagt" : "Nachricht lokal ausprobieren …"} /><button className="primary-button" disabled={current.cancelled} type="submit">Speichern <ArrowRight size={16} /></button></form></section>}</div>}</>}
      {tab === "profile" && <>
        <div className="social-heading"><div><span className="eyebrow">SCHÖN, DASS DU DA BIST</span><h1>Dein Ahoi<span>.</span></h1><p>Dein lokales Vorschauprofil. Kein öffentliches Profil und kein Benutzerkonto.</p></div></div>
        <div className="social-profile-grid">
          <form className="social-profile-card" key={raw} onSubmit={e => {
            e.preventDefault();
            const d = new FormData(e.currentTarget), name = field(d, "name"), bio = field(d, "bio"), groupInput = field(d, "travelGroup");
            if (!name || name.length > 40 || bio.length > 250) return;
            const travelGroup: Profile["travelGroup"] = TRAVEL_GROUPS.includes(groupInput as Exclude<Profile["travelGroup"], "">) ? groupInput as Profile["travelGroup"] : "";
            if (persist(s => ({ ...s, profile: { name, bio, travelGroup, interests: d.getAll("interest").map(String).filter(i => INTERESTS.includes(i)) } }))) {
              if (pendingJoin) {
                const invitation = meetings.find(m => m.id === pendingJoin.id);
                setPendingJoin(null); setSearch(invitation?.title ?? ""); setOnlyMine(false); setFamilyOnly(false); navigate("meetings");
                saveAttendance(pendingJoin.id, pendingJoin.count);
              } else if (pendingModal) {
                setNotice("Dein Profil ist lokal gespeichert."); setModal(pendingModal); setPendingModal(null); navigate("board");
              } else setNotice("Dein Profil ist lokal gespeichert.");
            }
          }}>
            <Avatar name={state.profile.name} />
            <label htmlFor="profile-name">Dein Anzeigename</label><input id="profile-name" name="name" required maxLength={40} defaultValue={state.profile.name} placeholder="Wie dürfen wir dich nennen?" autoComplete="nickname" />
            <label htmlFor="profile-bio">Ein paar Worte über dich</label><textarea id="profile-bio" name="bio" maxLength={250} defaultValue={state.profile.bio} placeholder="Ich freue mich auf …" />
            <label htmlFor="profile-travel-group">Mit wem reist du? <span className="optional-label">freiwillig</span></label>
            <select id="profile-travel-group" name="travelGroup" defaultValue={state.profile.travelGroup}><option value="">Möchte ich nicht angeben</option>{TRAVEL_GROUPS.map(group => <option key={group} value={group}>{TRAVEL_GROUP_LABELS[group]}</option>)}</select>
            <p className="social-small profile-private-note">Nur für passende Vorschläge auf diesem Gerät. Nicht im Community-Profil sichtbar.</p>
            <fieldset><legend>Das macht dir Freude</legend><div className="interest-options">{INTERESTS.map(i => <label key={i}><input type="checkbox" name="interest" value={i} defaultChecked={state.profile.interests.includes(i)} />{i}</label>)}</div></fieldset>
            <button className="primary-button" type="submit">Profil speichern <Check size={17} /></button>
          </form>
          <div className="social-profile-side"><section className="social-guidelines"><Ship size={24} /><h3>Dein Reisebereich</h3><p>{journey.ship}<br />{dateLabel(journey.from, { year: "numeric" })} – {dateLabel(journey.to, { year: "numeric" })}</p><Link href="/reise" className="text-link">Reise und Route ansehen <ArrowRight size={16} /></Link><p className="social-small">Die Vorschau trennt Inhalte nach Schiff und Datumsbereich. Das bestätigt keine Buchung oder Mitgliedschaft.</p></section><section className="social-guidelines"><h3>Deine lokalen Daten</h3><p>Alle Entwürfe bleiben in diesem Browser. Eine echte Community benötigt noch Anmeldung, gemeinsamen Server und Moderation.</p><button className="secondary-button" onClick={() => { if (changeSpace(s => ({ ...s, hidden: [], blocked: [] }))) setNotice("Ausgeblendete Inhalte sind wieder sichtbar."); }}>Ausgeblendete Inhalte wiederherstellen</button><button className="danger-link" onClick={() => { if (window.confirm("Dein lokales Community-Profil und alle lokalen Beiträge, Treffen und Nachrichten für alle Reisen löschen? Die Reiseauswahl bleibt erhalten.")) { if (persist(() => decodeState("{}"))) setNotice("Community-Vorschau zurückgesetzt."); } }}>Community-Daten zurücksetzen</button></section></div>
        </div>
      </>}
      {tab === "profile" && <section className="dates-entry"><span className="dates-entry-icon"><Heart size={24} /></span><div><span className="eyebrow">FREIWILLIG · AB 18</span><h2>Ahoi Dates</h2><p>Offen für ein Date oder eine neue Begegnung? Dieser private Bereich ist nur für dich sichtbar, bis du ihn aktivierst.</p></div><Link href="/dates" className="secondary-button">Bereich ansehen <ArrowRight size={17} /></Link></section>}
      <footer className="social-footer"><span><strong>ahoier.</strong> Zusammen mehr Meer.</span><span>Unabhängige lokale Vorschau · kein AIDA Service</span>{tab === "board" && SHIP_PHOTO_CREDITS[journey.ship] && <small>Schiffsfoto: {SHIP_PHOTO_CREDITS[journey.ship].author} · <a href={SHIP_PHOTO_CREDITS[journey.ship].source} target="_blank" rel="noopener noreferrer">Quelle</a> · <a href={SHIP_PHOTO_CREDITS[journey.ship].licenseUrl} target="_blank" rel="noopener noreferrer">{SHIP_PHOTO_CREDITS[journey.ship].license}</a> · 960-px-Vorschau, sonst unverändert</small>}</footer>
    </main></div>
    <nav className="social-mobile-nav" aria-label="Mobile Navigation">{NAV.map(n => <a href={`#${n.id}`} key={n.id} className={tab === n.id ? "active" : ""} aria-current={tab === n.id ? "page" : undefined}><n.icon size={21} /><span>{n.label}</span></a>)}</nav>
    {notice && <div className="social-toast" role="status"><span>{notice}</span><button className="icon-button" aria-label="Hinweis schließen" onClick={() => setNotice("")}><X size={18} /></button></div>}
    {partyMeeting && isUpcomingMeeting(partyMeeting) && <Modal title={partyMeeting.members.includes(SELF) ? "Plätze für deine Gruppe ändern" : "Gemeinsam dabei sein"} close={() => setPartyMeetingId(null)}>
      <p className="modal-note"><strong>{partyMeeting.title}</strong><br />{dateLabel(partyMeeting.date)} · {partyMeeting.time}. In dieser Vorschau bleibt die Zusage nur in deinem Browser.</p>
      <form className="social-form party-form" onSubmit={e => {
        e.preventDefault();
        const count = Number(new FormData(e.currentTarget).get("partySize"));
        if (!Number.isInteger(count) || count < (partyMeeting.members.includes(SELF) ? 1 : 2) || count > partyLimit) { setNotice("Bitte wähle eine gültige Anzahl freier Plätze."); return; }
        if (partyMeeting.members.includes(SELF) && count === memberPartySize(partyMeeting, SELF)) { setPartyMeetingId(null); return; }
        if (!state.profile.name.trim()) { setPendingJoin({ id: partyMeeting.id, count }); setPartyMeetingId(null); ready(); return; }
        saveAttendance(partyMeeting.id, count);
      }}>
        <label htmlFor="party-size">Wie viele Personen seid ihr insgesamt, inklusive dir?</label>
        <input id="party-size" name="partySize" type="number" inputMode="numeric" required min={partyMeeting.members.includes(SELF) ? 1 : 2} max={partyLimit} value={partySize} onChange={e => setPartySize(Number(e.target.value))} />
        <p className="social-small">Noch {availablePlaces(partyMeeting)} freie Plätze. Es werden nur die Anzahl und dein Anzeigename gespeichert, keine Namen oder Alter von Kindern.</p>
        <button className="primary-button" type="submit">{partyMeeting.members.includes(SELF) ? "Anzahl lokal ändern" : "Plätze lokal vormerken"} <Check size={17} /></button>
      </form>
    </Modal>}
    {modal && <Modal title={modal === "meeting" ? "Ein kleines Treffen. Ein großes Ahoi." : "Was möchtest du teilen?"} close={() => setModal(null)}><p className="modal-note">Lokaler Entwurf für {journey.ship}. Wird nicht veröffentlicht oder an andere Gäste gesendet.</p><form className="social-form" onSubmit={e => {
      e.preventDefault(); const data = new FormData(e.currentTarget);
      if (modal === "meeting") {
        if (space.meetings.length >= 100) { setFormError("Die Vorschau unterstützt bis zu 100 Treffen pro Reise."); return; }
        const ownPartySize = Number(field(data, "ownPartySize"));
        const meeting: Meeting = { id: uid(), author: SELF, name: state.profile.name, title: field(data, "title"), description: field(data, "description"), place: field(data, "place"), date: field(data, "date"), time: field(data, "time"), capacity: Number(field(data, "capacity")), members: [SELF], memberCounts: { [SELF]: ownPartySize }, familyFriendly: data.get("familyFriendly") === "on", cancelled: false, demo: false };
        const error = validateMeeting(meeting, journey.from, journey.to); if (error) { setFormError(error); return; }
        if (!Number.isInteger(ownPartySize) || ownPartySize < 1 || ownPartySize > 10 || ownPartySize > meeting.capacity) { setFormError("Bitte wähle 1–10 Personen für deine Gruppe, höchstens so viele wie Plätze insgesamt."); return; }
        if (changeSpace(s => ({ ...s, meetings: [meeting, ...s.meetings] }))) { setModal(null); setSearch(""); setOnlyMine(false); setFamilyOnly(false); navigate("meetings"); setNotice("Dein Treffen ist lokal gespeichert. Es wurde nicht veröffentlicht."); }
      } else {
        const body = field(data, "body"), category = field(data, "category");
        if (!body || body.length > 2000) { setFormError("Bitte schreibe einen Beitrag mit 1–2000 Zeichen."); return; }
        if (space.posts.length >= 100) { setFormError("Die Vorschau unterstützt bis zu 100 Beiträge pro Reise."); return; }
        if (changeSpace(s => ({ ...s, posts: [{ id: uid(), author: SELF, name: state.profile.name, category, body, created: new Date().toISOString(), demo: false, replies: [], helpful: false }, ...s.posts] }))) { setModal(null); setCategory("Alle"); navigate("community"); setNotice("Dein Beitrag wurde nur auf diesem Gerät gespeichert."); }
      }
    }}>{modal === "meeting" ? <><label htmlFor="meeting-title">Worauf hast du Lust?</label><input id="meeting-title" name="title" required minLength={4} maxLength={90} placeholder="Zum Beispiel: Eine Runde Karten und ein Kaffee" defaultValue={idea !== null ? IDEAS[idea].title : ""} /><div className="social-form-row"><div><label htmlFor="meeting-date">Datum</label><input id="meeting-date" name="date" type="date" required min={journey.from} max={journey.to} defaultValue={journey.from} /></div><div><label htmlFor="meeting-time">Uhrzeit (an Bord bestätigen)</label><input id="meeting-time" name="time" type="time" required defaultValue="17:00" /></div></div><label htmlFor="meeting-place">Öffentlicher Treffpunkt</label><input id="meeting-place" name="place" required maxLength={120} placeholder="Ein gut auffindbarer öffentlicher Bereich" /><div className="social-form-row"><div><label htmlFor="meeting-capacity">Plätze insgesamt</label><input id="meeting-capacity" name="capacity" type="number" required min={2} max={30} defaultValue={6} /></div><div><label htmlFor="meeting-own-party">Davon aus deiner Gruppe</label><input id="meeting-own-party" name="ownPartySize" type="number" required min={1} max={10} defaultValue={1} /></div></div><label className="family-checkbox"><input name="familyFriendly" type="checkbox" /><span>Für Familien geeignet<small>Erwachsene begleiten Kinder; keine Kinderprofile oder Betreuung.</small></span></label><label htmlFor="meeting-description">Was sollten andere wissen?</label><textarea id="meeting-description" name="description" maxLength={1000} placeholder="Was habt ihr vor? Was sollte man mitbringen?" defaultValue={idea !== null ? IDEAS[idea].description : ""} /></> : <><label htmlFor="post-category">Kategorie</label><select id="post-category" name="category">{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select><label htmlFor="post-body">Dein Beitrag</label><textarea id="post-body" name="body" required maxLength={2000} defaultValue={postSeed} placeholder="Eine Frage, ein Tipp oder eine Idee …" rows={5} /><p className="social-small">Gästeerfahrungen sind keine offiziellen Auskünfte. Teile keine privaten Daten anderer Personen.</p></>}{formError && <p role="alert" className="form-error">{formError}</p>}<button className="primary-button" type="submit">Lokal speichern <Check size={17} /></button></form></Modal>}
  </div>;
}
