"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, CalendarDays, Check, Flag, MapPin, Plus, RefreshCw, Ship, Users, X } from "lucide-react";
import { isUpcomingMeeting } from "@/lib/community";
import { dateLabel, shipLocalDateTime } from "@/lib/journey";
import "./pilot.css";

type PilotMeeting = {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  description: string;
  place: string;
  date: string;
  time: string;
  capacity: number;
  attendeeCount: number;
  myCount: number;
  familyFriendly: boolean;
  cancelled: boolean;
  myAttendance: boolean | null;
};
type PilotState =
  | { authenticated: false }
  | { authenticated: true; participant: { id: string; name: string }; voyage: { id: string; ship: string; from: string; to: string; timeZone: string }; meetings: PilotMeeting[] };

async function pilotRequest(payload?: Record<string, unknown>): Promise<PilotState> {
  const response = await fetch("/api/pilot", payload ? {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  } : { credentials: "same-origin", cache: "no-store" });
  const result: PilotState | { error?: string } = await response.json();
  if (!response.ok) throw new Error("error" in result && result.error ? result.error : "Die Verbindung zum Pilotbereich ist gerade nicht möglich.");
  return result as PilotState;
}

function MeetingCard({ meeting, selfId, busy, timeZone, act }: { meeting: PilotMeeting; selfId: string; busy: boolean; timeZone: string; act: (action: string, payload: Record<string, unknown>, success: string) => Promise<boolean> }) {
  const upcoming = isUpcomingMeeting(meeting, new Date(), timeZone);
  const owner = meeting.authorId === selfId;
  const free = Math.max(0, meeting.capacity - meeting.attendeeCount);
  const report = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const saved = await act("report", { meetingId: meeting.id, reason: String(data.get("reason")), details: String(data.get("details") ?? "") }, "Deine Meldung wurde für die Pilotprüfung gespeichert.");
    if (saved) form.reset();
  };
  const group = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const count = Number(new FormData(event.currentTarget).get("count"));
    void act("rsvp", { meetingId: meeting.id, count }, `${count} ${count === 1 ? "Platz" : "Plätze"} für dich vorgemerkt.`);
  };
  return <article className={`pilot-meeting${meeting.cancelled ? " is-cancelled" : ""}`}>
    <div className="pilot-meeting-top"><span className="pilot-type"><Users size={15} aria-hidden="true" /> Gästetreffen</span>{meeting.familyFriendly && <span className="pilot-family">Für Familien</span>}{meeting.cancelled && <span className="pilot-cancelled">Abgesagt</span>}</div>
    <p className="pilot-host"><span className="pilot-avatar" aria-hidden="true">{meeting.authorName.slice(0, 1).toLocaleUpperCase("de")}</span><strong>{meeting.authorName}</strong> lädt ein</p>
    <h3>{meeting.title}</h3>
    {meeting.description && <p className="pilot-description">{meeting.description}</p>}
    <div className="pilot-facts"><span><CalendarDays size={16} aria-hidden="true" /> {dateLabel(meeting.date)} · {meeting.time}</span><span><MapPin size={16} aria-hidden="true" /> {meeting.place}</span></div>
    <div className="pilot-meeting-bottom"><span>{meeting.attendeeCount} von {meeting.capacity} Plätzen belegt</span>{meeting.myCount > 0 && <strong><Check size={15} aria-hidden="true" /> Du bist mit {meeting.myCount} {meeting.myCount === 1 ? "Platz" : "Plätzen"} dabei</strong>}</div>
    {!meeting.cancelled && upcoming && <div className="pilot-actions">
      {owner ? <button className="pilot-secondary" disabled={busy} onClick={() => { if (window.confirm("Dein Treffen für alle absagen?")) void act("cancel", { meetingId: meeting.id }, "Das Treffen wurde abgesagt."); }}>Treffen absagen</button> : meeting.myCount > 0 ? <button className="pilot-secondary" disabled={busy} onClick={() => void act("leave", { meetingId: meeting.id }, "Deine Zusage wurde entfernt.")}>Abmelden</button> : <button className="pilot-primary" disabled={busy || free === 0} onClick={() => void act("rsvp", { meetingId: meeting.id, count: 1 }, "Ein Platz für dich vorgemerkt.")}>{free === 0 ? "Alle Plätze belegt" : "Ich bin dabei"}{free > 0 && <Plus size={16} aria-hidden="true" />}</button>}
      {(!owner && (free + meeting.myCount) >= 2) && <details className="pilot-group"><summary>{meeting.myCount ? "Plätze ändern" : "Wir kommen zusammen"}</summary><form onSubmit={group}><label htmlFor={`group-${meeting.id}`}>Personen einschließlich dir</label><input id={`group-${meeting.id}`} name="count" type="number" min={1} max={Math.min(10, free + meeting.myCount)} defaultValue={meeting.myCount || 2} required /><button className="pilot-secondary" type="submit" disabled={busy}>Speichern</button></form></details>}
    </div>}
    {!meeting.cancelled && !upcoming && meeting.myCount > 0 && <div className="pilot-actions">
      {meeting.myAttendance === null ? <>
        <span className="pilot-attendance-prompt">Warst du dabei?</span>
        <button className="pilot-secondary" disabled={busy} onClick={() => void act("attendance", { meetingId: meeting.id, attended: true }, "Danke. Deine Teilnahme wurde von dir selbst bestätigt.")}>Ja, dabei</button>
        <button className="pilot-secondary" disabled={busy} onClick={() => void act("attendance", { meetingId: meeting.id, attended: false }, "Danke. Deine Abwesenheit wurde von dir selbst angegeben.")}>Nein, leider nicht</button>
      </> : <>
        <span className={`pilot-attended${meeting.myAttendance ? "" : " is-absent"}`}><Check size={16} aria-hidden="true" /> {meeting.myAttendance ? "Teilnahme selbst bestätigt" : "Nicht dabei (selbst angegeben)"}</span>
        <button className="pilot-secondary" disabled={busy} onClick={() => void act("attendance", { meetingId: meeting.id, attended: !meeting.myAttendance }, "Deine Angabe wurde geändert.")}>Angabe ändern</button>
      </>}
    </div>}
    {!owner && <details className="pilot-report"><summary><Flag size={14} aria-hidden="true" /> Treffen melden</summary><form onSubmit={report}><label htmlFor={`reason-${meeting.id}`}>Grund</label><select id={`reason-${meeting.id}`} name="reason" required><option value="spam">Spam</option><option value="unsafe">Unsicherer Treffpunkt</option><option value="harassment">Belästigung</option><option value="other">Anderes</option></select><label htmlFor={`details-${meeting.id}`}>Details (freiwillig)</label><textarea id={`details-${meeting.id}`} name="details" maxLength={300} rows={2} /><button className="pilot-secondary" type="submit" disabled={busy}>Meldung speichern</button></form></details>}
  </article>;
}

export function PilotApp() {
  const [data, setData] = useState<PilotState | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const requestVersion = useRef(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);

  useEffect(() => {
    let active = true;
    let loading = false;
    const load = async (showError: boolean) => {
      if (loading || busyRef.current || (!showError && document.visibilityState === "hidden")) return;
      loading = true;
      const version = requestVersion.current;
      try { const next = await pilotRequest(); if (active && version === requestVersion.current && !busyRef.current) setData(next); }
      catch (cause) { if (active && showError) setError(cause instanceof Error ? cause.message : "Laden fehlgeschlagen."); }
      finally { loading = false; }
    };
    void load(true);
    const timer = window.setInterval(() => void load(false), 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") void load(false); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  async function refresh() {
    if (busyRef.current) return;
    busyRef.current = true;
    requestVersion.current++;
    setBusy(true); setError("");
    try { setData(await pilotRequest()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Aktualisieren fehlgeschlagen."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function act(action: string, payload: Record<string, unknown>, success: string): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    requestVersion.current++;
    setBusy(true); setError(""); setNotice("");
    try { setData(await pilotRequest({ action, ...payload })); setNotice(success); if (action === "create") setShowCreate(false); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Speichern fehlgeschlagen."); return false; }
    finally { busyRef.current = false; setBusy(false); }
  }
  function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void act("join", { code: String(form.get("code") ?? "").trim(), name: String(form.get("name") ?? "").trim() }, "Willkommen an Bord.");
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void act("create", {
      title: String(form.get("title") ?? "").trim(), description: String(form.get("description") ?? "").trim(),
      place: String(form.get("place") ?? "").trim(), date: String(form.get("date") ?? ""), time: String(form.get("time") ?? ""),
      capacity: Number(form.get("capacity")), familyFriendly: form.has("familyFriendly"),
    }, "Dein Treffen ist für die eingeladenen Gäste sichtbar.");
  }
  const timeZone = data?.authenticated ? data.voyage.timeZone : undefined;
  const now = new Date();
  const current = shipLocalDateTime(now, timeZone);
  const upcoming = data?.authenticated ? data.meetings.filter(meeting => isUpcomingMeeting(meeting, now, timeZone) && (!onlyMine || meeting.myCount > 0)) : [];
  const previous = data?.authenticated ? data.meetings.filter(meeting => !isUpcomingMeeting(meeting, now, timeZone) && (!onlyMine || meeting.myCount > 0)) : [];
  const firstDate = data?.authenticated ? (data.voyage.from > current.date ? data.voyage.from : current.date) : current.date;

  return <div className="pilot-shell"><header className="pilot-header"><Link href="/" className="pilot-brand" aria-label="Ahoier Startseite">ahoier<span>.</span></Link><span className="pilot-header-label">EINLADUNGSPILOT</span><Link href="/demo" className="pilot-home"><ArrowLeft size={16} aria-hidden="true" /> Vorschau</Link></header>
    <main className="pilot-main">
      {!data ? <div className="pilot-loading" role="status">{error ? <button className="pilot-secondary" onClick={() => void refresh()}>Erneut versuchen</button> : "Pilotbereich wird geladen …"}</div> : !data.authenticated ? <>
        <section className="pilot-intro"><span className="pilot-eyebrow">ZUSAMMEN MEHR MEER</span><h1>Aus Ahoi wird ein Treffen.</h1><p>Hier organisieren eingeladene Gäste einer Pilotreise gemeinsame Momente. Mit einem Code kommst du zur richtigen Reisegruppe.</p></section>
        <form className="pilot-entry" onSubmit={join}><h2>Mit Einladung starten</h2><label htmlFor="pilot-code">Dein persönlicher Code</label><input id="pilot-code" name="code" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} required minLength={16} maxLength={100} placeholder="Code eingeben" /><label htmlFor="pilot-name">Dein Anzeigename</label><input id="pilot-name" name="name" autoComplete="nickname" required minLength={2} maxLength={40} placeholder="Wie dürfen wir dich nennen?" /><button className="pilot-primary" type="submit" disabled={busy}>Zur Reisegruppe <ArrowLeft size={16} className="pilot-enter-icon" aria-hidden="true" /></button><p>Dein Code ermöglicht auch eine spätere Anmeldung auf einem anderen Gerät. Bewahre ihn privat auf. Er bestätigt keine AIDA Buchung.</p></form>
      </> : <>
        <section className="pilot-voyage"><span className="pilot-voyage-icon"><Ship size={24} aria-hidden="true" /></span><div><span className="pilot-eyebrow">DEINE PILOTREISE</span><h1>{data.voyage.ship}</h1><p>{dateLabel(data.voyage.from, { year: "numeric" })} – {dateLabel(data.voyage.to, { year: "numeric" })} · Hallo, {data.participant.name}</p></div><button className="pilot-signout" onClick={() => void act("logout", {}, "Du bist abgemeldet.")} disabled={busy}>Abmelden</button></section>
        <div className="pilot-toolbar"><div><h2>Treffen an Bord</h2><p>Von Gästen für Gäste. Für diese Reise ist {data.voyage.timeZone} eingestellt; die tatsächliche Bordzeit bitte gemeinsam bestätigen.</p></div><button className="pilot-primary" onClick={() => setShowCreate(!showCreate)} disabled={busy || firstDate > data.voyage.to}>{showCreate ? <X size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}{showCreate ? "Schließen" : "Treffen vorschlagen"}</button></div>
        {showCreate && <form className="pilot-create" onSubmit={create}><h3>Eine kleine Runde starten</h3><div className="pilot-form-grid"><div><label htmlFor="pilot-title">Wozu lädst du ein?</label><input id="pilot-title" name="title" required minLength={4} maxLength={90} placeholder="Zum Beispiel: Kaffee an Deck" /></div><div><label htmlFor="pilot-place">Öffentlicher Treffpunkt</label><input id="pilot-place" name="place" required maxLength={120} placeholder="Zum Beispiel: Café, Deck …" /></div><div><label htmlFor="pilot-date">Datum</label><input id="pilot-date" name="date" type="date" min={firstDate} max={data.voyage.to} defaultValue={firstDate} required /></div><div><label htmlFor="pilot-time">Uhrzeit laut Gastgeber</label><input id="pilot-time" name="time" type="time" required /></div><div><label htmlFor="pilot-capacity">Plätze inklusive dir</label><input id="pilot-capacity" name="capacity" type="number" min={2} max={30} defaultValue={6} required /></div></div><label htmlFor="pilot-description">Kurzbeschreibung (freiwillig)</label><textarea id="pilot-description" name="description" maxLength={1000} rows={3} placeholder="Was erwartet die anderen?" /><label className="pilot-check"><input type="checkbox" name="familyFriendly" /> Für Familien geeignet</label><p>Nur öffentliche Treffpunkte. Keine Kabinen- oder Kontaktdaten veröffentlichen.</p><button className="pilot-primary" type="submit" disabled={busy}>Treffen veröffentlichen</button></form>}
        <div className="pilot-filter"><button aria-pressed={!onlyMine} className={!onlyMine ? "active" : ""} onClick={() => setOnlyMine(false)}>Alle Treffen</button><button aria-pressed={onlyMine} className={onlyMine ? "active" : ""} onClick={() => setOnlyMine(true)}>Meine Treffen</button><button className="pilot-refresh" onClick={() => void refresh()} disabled={busy}><RefreshCw size={15} aria-hidden="true" /> Aktualisieren</button></div>
        <div className="pilot-list">{upcoming.map(meeting => <MeetingCard key={meeting.id} meeting={meeting} selfId={data.participant.id} busy={busy} timeZone={data.voyage.timeZone} act={act} />)}{!upcoming.length && <div className="pilot-empty"><Users size={28} aria-hidden="true" /><h3>{onlyMine ? "Du hast noch keine Zusage." : "Noch keine offenen Treffen."}</h3><p>{onlyMine ? "Schau bei den Einladungen vorbei oder starte selbst eine kleine Runde." : "Du kannst das erste Treffen für diese Pilotreise vorschlagen."}</p></div>}</div>
        {previous.length > 0 && <details className="pilot-previous"><summary>Vergangene und abgesagte Treffen ({previous.length})</summary><div className="pilot-list">{previous.map(meeting => <MeetingCard key={meeting.id} meeting={meeting} selfId={data.participant.id} busy={busy} timeZone={data.voyage.timeZone} act={act} />)}</div></details>}
      </>}
      {error && <div className="pilot-alert" role="alert">{error}<button onClick={() => setError("")} aria-label="Fehlerhinweis schließen"><X size={17} /></button></div>}
      {notice && <div className="pilot-notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Hinweis schließen"><X size={17} /></button></div>}
      <footer className="pilot-footer">Unabhängiger, eingeladener Pilot · kein AIDA Service · keine bestätigte Buchungsprüfung. Angaben zu Bordzeit und Treffpunkt direkt an Bord abstimmen.</footer>
    </main>
  </div>;
}
