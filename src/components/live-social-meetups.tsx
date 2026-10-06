"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { CalendarDays, Check, Clock3, Coffee, Compass, Dice5, Flag, MapPin, Plus, RefreshCw, Users, UtensilsCrossed, X } from "lucide-react";
import { instantForLocalTime, localTimeForInstant } from "@/lib/meetup-time";
import styles from "./live-social-meetups.module.css";

export type MeetupAttendee = { user_id: string; display_name: string; is_organizer?: boolean };

export type SocialMeetup = {
  id: string;
  organizer_id: string;
  organizer_name?: string | null;
  title: string;
  description: string;
  location_label: string;
  starts_at: string;
  time_zone: string;
  capacity: number;
  attendee_count: number;
  joined_by_me: boolean;
  canceled_at: string | null;
};

export type CreateMeetupInput = {
  title: string;
  description: string;
  location_label: string;
  starts_at: string;
  time_zone: string;
  capacity: number;
};

export type MeetupReportReason = "spam" | "harassment" | "unsafe" | "other";

type Props = {
  meetups: SocialMeetup[];
  status: "loading" | "ready" | "unavailable" | "error";
  userId: string;
  voyageStartDate: string;
  voyageEndDate: string;
  onCreate: (input: CreateMeetupInput) => Promise<void>;
  onUpdate: (id: string, input: CreateMeetupInput) => Promise<void>;
  onJoin: (id: string) => Promise<void>;
  onLeave: (id: string) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
  onLoadAttendees: (id: string) => Promise<MeetupAttendee[]>;
  onReport: (id: string, reason: MeetupReportReason, details: string) => Promise<void>;
  focusMeetupId?: string;
  createRequest?: number;
  onRefresh?: () => void;
};

const SUGGESTED_ZONES = [
  "Europe/Berlin", "Europe/London", "Europe/Lisbon", "Europe/Athens",
  "Atlantic/Canary", "Atlantic/Azores", "America/New_York", "America/Los_Angeles", "UTC",
];

const MEETUP_IDEAS = [
  { label: "Kaffee", Icon: Coffee, title: "Wer kommt auf einen Kaffee mit?", description: "Ein Kaffee, ein bisschen Meer und neue Bekanntschaften. Auch allein bist du willkommen!" },
  { label: "Spiele", Icon: Dice5, title: "Wer hat Lust auf eine Runde Spiele?", description: "Eine entspannte Spielrunde für neue und bekannte Gesichter. Was wir spielen, entscheiden wir zusammen." },
  { label: "Hafenspaziergang", Icon: Compass, title: "Zusammen den nächsten Hafen entdecken", description: "Wer möchte gemeinsam auf Entdeckungstour gehen? Route, Treffpunkt und Rückkehr stimmen wir vorab ab." },
  { label: "Abendessen", Icon: UtensilsCrossed, title: "Gesellschaft fürs Abendessen gesucht", description: "Lass uns gemeinsam essen und kennenlernen. Restaurant und Treffpunkt stimmen wir in der Gruppe ab." },
] as const;

function meetupStateLabel(meetup: SocialMeetup, now: number, userId: string): string {
  if (meetup.canceled_at) return "Abgesagt";
  if (new Date(meetup.starts_at).getTime() < now) return "Vergangen";
  if (meetup.joined_by_me) return "Ich bin dabei";
  if (meetup.organizer_id === userId) return "Dein Treffen";
  const places = Math.max(0, meetup.capacity - meetup.attendee_count);
  if (places === 0) return "Ausgebucht";
  return `${places} ${places === 1 ? "Platz frei" : "Plätze frei"}`;
}

function deviceTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
  catch { return "UTC"; }
}

function formatInZone(value: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("de-DE", {
      timeZone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    }).format(value);
  } catch { return "Zeit nicht verfügbar"; }
}

function ReportDialog({ meetup, busy, error, onClose, onSubmit }: {
  meetup: SocialMeetup;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (reason: MeetupReportReason, details: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  return <dialog ref={ref} className={styles.reportDialog} aria-labelledby={titleId} onClose={onClose} onCancel={onClose}>
    <form onSubmit={event => {
      event.preventDefault();
      const form = event.currentTarget;
      onSubmit((form.elements.namedItem("reason") as HTMLSelectElement).value as MeetupReportReason,
        (form.elements.namedItem("details") as HTMLTextAreaElement).value.trim());
    }}>
      <div className={styles.dialogHead}><h2 id={titleId}>Treffen melden</h2><button type="button" onClick={onClose} aria-label="Schließen"><X size={19} /></button></div>
      <p>Deine Meldung zu „{meetup.title}“ ist nur für die Prüfung sichtbar.</p>
      <label htmlFor={`${titleId}-reason`}>Grund</label>
      <select id={`${titleId}-reason`} name="reason" required><option value="unsafe">Unsicherer Ort oder Inhalt</option><option value="harassment">Belästigung</option><option value="spam">Spam</option><option value="other">Anderes</option></select>
      <label htmlFor={`${titleId}-details`}>Details (freiwillig)</label>
      <textarea id={`${titleId}-details`} name="details" maxLength={300} rows={3} />
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button type="submit" className={styles.primary} disabled={busy}>{busy ? "Wird gesendet …" : "Meldung senden"}</button>
    </form>
  </dialog>;
}

export function LiveSocialMeetups({ meetups, status, userId, voyageStartDate, voyageEndDate, onCreate, onUpdate, onJoin, onLeave, onCancel, onLoadAttendees, onReport, focusMeetupId, createRequest, onRefresh }: Props) {
  const formId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const lastCreateRequest = useRef(createRequest);
  const [formOpen, setFormOpen] = useState(false);
  const [editingMeetupId, setEditingMeetupId] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [joinedPulseId, setJoinedPulseId] = useState("");
  const pulseTimer = useRef<number | null>(null);
  const [now, setNow] = useState(Date.now);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [localTime, setLocalTime] = useState("");
  const [timeZone, setTimeZone] = useState(deviceTimeZone);
  const [capacity, setCapacity] = useState(8);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmCancelId, setConfirmCancelId] = useState("");
  const [openAttendeesId, setOpenAttendeesId] = useState("");
  const [attendees, setAttendees] = useState<Record<string, MeetupAttendee[]>>({});
  const [attendeeLoadingId, setAttendeeLoadingId] = useState("");
  const [attendeeErrorId, setAttendeeErrorId] = useState("");
  const [reportMeetup, setReportMeetup] = useState<SocialMeetup | null>(null);
  const [reportError, setReportError] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => () => { if (pulseTimer.current !== null) window.clearTimeout(pulseTimer.current); }, []);
  useEffect(() => { if (focusMeetupId) queueMicrotask(() => { setOnlyMine(false); setShowAll(true); }); }, [focusMeetupId]);
  useEffect(() => {
    if (createRequest === undefined || createRequest === lastCreateRequest.current) return;
    lastCreateRequest.current = createRequest;
    queueMicrotask(() => {
      if (!formOpen || editingMeetupId) {
        setEditingMeetupId("");
        setTitle(""); setDescription(""); setLocation(""); setLocalTime(""); setCapacity(8);
        setTimeZone(deviceTimeZone());
        setError("");
      }
      setFormOpen(true);
      window.requestAnimationFrame(() => document.getElementById(`${formId}-form`)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
    });
  }, [createRequest, editingMeetupId, formId, formOpen]);
  useEffect(() => { if (formOpen) titleRef.current?.focus(); }, [formOpen, editingMeetupId]);

  const ordered = [...meetups].sort((a, b) => {
    const rank = (item: SocialMeetup) => new Date(item.starts_at).getTime() < now ? 2 : item.canceled_at ? 1 : 0;
    return rank(a) - rank(b) || a.starts_at.localeCompare(b.starts_at);
  });
  const currentPledges = ordered.filter(item => item.joined_by_me && !item.canceled_at && new Date(item.starts_at).getTime() >= now);
  const myCount = currentPledges.length;
  const filtered = onlyMine ? currentPledges : ordered;
  const expanded = showAll || Boolean(focusMeetupId);
  const visible = expanded ? filtered : filtered.slice(0, 3);
  const editingMeetup = ordered.find(item => item.id === editingMeetupId);

  function openCreate(idea?: (typeof MEETUP_IDEAS)[number]) {
    if (formOpen && !editingMeetupId && !idea) { setFormOpen(false); return; }
    if (formOpen && !editingMeetupId && idea) {
      setTitle(current => current.trim() ? current : idea.title);
      setDescription(current => current.trim() ? current : idea.description);
      setError("");
      titleRef.current?.focus();
      return;
    }
    setEditingMeetupId("");
    setTitle(idea?.title ?? ""); setDescription(idea?.description ?? ""); setLocation(""); setLocalTime(""); setCapacity(8);
    setTimeZone(deviceTimeZone());
    setError("");
    setFormOpen(true);
  }

  function openEdit(meetup: SocialMeetup) {
    setEditingMeetupId(meetup.id);
    setTitle(meetup.title);
    setDescription(meetup.description);
    setLocation(meetup.location_label);
    setLocalTime(localTimeForInstant(meetup.starts_at, meetup.time_zone));
    setTimeZone(meetup.time_zone);
    setCapacity(meetup.capacity);
    setError("");
    setFormOpen(true);
    window.requestAnimationFrame(() => document.getElementById(`${formId}-form`)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
  }

  function closeForm() { setFormOpen(false); setEditingMeetupId(""); setError(""); }

  async function run(action: string, callback: () => Promise<void>, success: string) {
    if (busyAction) return;
    setBusyAction(action);
    setError("");
    setNotice("");
    try {
      await callback();
      setNotice(success);
      if (action.startsWith("cancel:")) setConfirmCancelId("");
      if (action.startsWith("join:") || action.startsWith("leave:")) {
        const id = action.slice(action.indexOf(":") + 1);
        setAttendees(current => { const next = { ...current }; delete next[id]; return next; });
        setOpenAttendeesId("");
        if (action.startsWith("join:")) {
          if (pulseTimer.current !== null) window.clearTimeout(pulseTimer.current);
          setJoinedPulseId(id);
          pulseTimer.current = window.setTimeout(() => {
            setJoinedPulseId(current => current === id ? "" : current);
            pulseTimer.current = null;
          }, 1400);
        }
      }
    } catch {
      setError("Das hat nicht geklappt. Bitte versuche es erneut.");
    } finally { setBusyAction(""); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyAction) return;
    const cleanedZone = timeZone.trim();
    let instant: Date | null;
    try { instant = instantForLocalTime(localTime, cleanedZone); }
    catch { setError("Bitte gib eine gültige Zeitzone ein, zum Beispiel Europe/Berlin."); return; }
    if (!instant) { setError("Diese Uhrzeit gibt es in der gewählten Zeitzone nicht. Bitte wähle eine andere Uhrzeit."); return; }
    if (instant.getTime() <= Date.now() + 15 * 60_000) { setError("Bitte plane das Treffen mindestens 15 Minuten im Voraus."); return; }
    const localDate = localTime.slice(0, 10);
    if (localDate < voyageStartDate || localDate > voyageEndDate) { setError("Das Treffen muss während dieser Reise stattfinden."); return; }
    if (capacity < 2 || capacity > 30 || !Number.isInteger(capacity)) { setError("Wähle zwischen 2 und 30 Plätzen."); return; }
    if (editingMeetup && capacity < editingMeetup.attendee_count) { setError("Die Platzzahl darf nicht unter der aktuellen Teilnehmerzahl liegen."); return; }
    if (title.trim().length < 3 || title.trim().length > 80 || location.trim().length < 3 || location.trim().length > 100 || description.trim().length > 300) {
      setError("Bitte prüfe Titel, Beschreibung und Treffpunkt."); return;
    }
    if (/[\x00-\x1f\x7f]/.test(`${title}${description}${location}`)) { setError("Bitte entferne Steuerzeichen aus den Angaben."); return; }
    setBusyAction(editingMeetupId ? `update:${editingMeetupId}` : "create");
    setError("");
    setNotice("");
    try {
      const input = { title: title.trim(), description: description.trim(), location_label: location.trim(), starts_at: instant.toISOString(), time_zone: cleanedZone, capacity };
      if (editingMeetupId) await onUpdate(editingMeetupId, input);
      else await onCreate(input);
      setTitle(""); setDescription(""); setLocation(""); setLocalTime(""); setCapacity(8);
      setFormOpen(false); setEditingMeetupId("");
      setNotice(editingMeetupId ? "Die Änderungen wurden gespeichert." : "Dein Treffen ist veröffentlicht.");
    } catch { setError(editingMeetupId ? "Die Änderungen konnten nicht gespeichert werden. Bitte versuche es erneut." : "Das Treffen konnte nicht erstellt werden. Bitte versuche es erneut."); }
    finally { setBusyAction(""); }
  }

  async function toggleAttendees(id: string) {
    if (openAttendeesId === id) { setOpenAttendeesId(""); return; }
    setOpenAttendeesId(id);
    setAttendeeLoadingId(id);
    setAttendeeErrorId("");
    try {
      const next = await onLoadAttendees(id);
      setAttendees(current => ({ ...current, [id]: next }));
    }
    catch { setAttendeeErrorId(id); }
    finally { setAttendeeLoadingId(current => current === id ? "" : current); }
  }

  async function submitReport(reason: MeetupReportReason, details: string) {
    if (!reportMeetup || busyAction) return;
    const id = reportMeetup.id;
    setBusyAction(`report:${id}`);
    setReportError("");
    try { await onReport(id, reason, details); setReportMeetup(null); setNotice("Deine Meldung wurde gesendet."); }
    catch { setReportError("Die Meldung konnte nicht gesendet werden. Bitte versuche es erneut."); }
    finally { setBusyAction(""); }
  }

  return <section className={styles.section} aria-labelledby={`${formId}-title`}>
    <div className={styles.sectionHead}>
      <div><span className={styles.eyebrow}>GEMEINSAM ERLEBEN</span><h2 id={`${formId}-title`}>Heute & kommende Treffen</h2></div>
      {status === "ready" && <button type="button" className={styles.newButton} onClick={() => openCreate()} aria-expanded={formOpen && !editingMeetupId} aria-controls={`${formId}-form`}><Plus size={17} aria-hidden="true" /> Treffen vorschlagen</button>}
    </div>

    {status === "unavailable" ? <p className={styles.quiet} role="status">Treffen sind für diese Reise bald verfügbar.</p>
      : status === "loading" ? <p className={styles.quiet} role="status">Treffen werden geladen …</p>
        : status === "error" ? <div className={styles.quiet} role="status">Treffen konnten nicht geladen werden. {onRefresh && <button type="button" onClick={onRefresh}><RefreshCw size={14} /> Erneut versuchen</button>}</div>
          : <>
            <div aria-live="polite" className={styles.messages}>{error && <p className={styles.error}>{error}</p>}{notice && <p className={styles.notice}>{notice}</p>}</div>
            {!editingMeetupId && <div className={styles.ideaBar} aria-label="Ideen für ein Treffen"><span>Eine Idee zum Start:</span><div className={styles.ideaButtons}>{MEETUP_IDEAS.map(idea => <button key={idea.label} type="button" onClick={() => openCreate(idea)} aria-controls={`${formId}-form`}><idea.Icon size={15} aria-hidden="true" />{idea.label}</button>)}</div><small>Öffnet nur einen Entwurf.</small></div>}
            {formOpen && <form id={`${formId}-form`} className={styles.form} onSubmit={event => void create(event)}>
              <div className={styles.formTitle}><div><h3>{editingMeetupId ? "Treffen bearbeiten" : "Ein Treffen planen"}</h3><p>Eine konkrete Idee macht es anderen leicht, dazuzukommen.</p></div><button type="button" onClick={closeForm} aria-label="Formular schließen"><X size={19} /></button></div>
              <div className={styles.formGrid}>
                <label className={styles.full}>Was möchtet ihr machen?<input ref={titleRef} name="title" value={title} onChange={event => setTitle(event.target.value)} minLength={3} maxLength={80} required placeholder="Zum Beispiel: Kaffee und Kennenlernen" /></label>
                <label className={styles.full}>Kurze Beschreibung (freiwillig)<textarea name="description" value={description} onChange={event => setDescription(event.target.value)} maxLength={300} rows={2} placeholder="Was ist geplant?" /></label>
                <label className={styles.full}>Öffentlicher Treffpunkt<input name="location" value={location} onChange={event => setLocation(event.target.value)} minLength={3} maxLength={100} required placeholder="Zum Beispiel: Café auf Deck 6" /></label>
                <label>Datum und Uhrzeit<input name="local-time" type="datetime-local" value={localTime} onChange={event => setLocalTime(event.target.value)} min={`${voyageStartDate}T00:00`} max={`${voyageEndDate}T23:59`} required /></label>
                <label>Zeitzone<input name="time-zone" value={timeZone} onChange={event => setTimeZone(event.target.value)} list={`${formId}-zones`} autoCapitalize="off" spellCheck={false} required /><datalist id={`${formId}-zones`}>{[...new Set([deviceTimeZone(), ...SUGGESTED_ZONES])].map(zone => <option key={zone} value={zone} />)}</datalist></label>
                <label>Plätze einschließlich dir<input name="capacity" type="number" min={Math.max(2, editingMeetup?.attendee_count ?? 2)} max={30} step={1} value={capacity} onChange={event => setCapacity(Number(event.target.value))} required /></label>
              </div>
              <p className={styles.safety}>Trefft euch an einem öffentlichen Ort. Teile keine Kabinennummer. Die gewählte Zeitzone ist deine Angabe, keine offizielle Schiffszeit. Die Reiseauswahl bestätigt keine Buchung.</p>
              <div className={styles.formActions}><button type="button" className={styles.secondary} onClick={closeForm}>Abbrechen</button><button type="submit" className={styles.primary} disabled={Boolean(busyAction)}>{busyAction ? "Wird gespeichert …" : editingMeetupId ? "Änderungen speichern" : "Treffen veröffentlichen"}</button></div>
            </form>}

            {ordered.length > 0 && <div className={styles.filters} role="group" aria-label="Treffen anzeigen"><button type="button" className={!onlyMine ? styles.selectedFilter : ""} aria-pressed={!onlyMine} onClick={() => { setOnlyMine(false); setShowAll(false); }}>Alle Treffen</button><button type="button" className={onlyMine ? styles.selectedFilter : ""} aria-pressed={onlyMine} onClick={() => { setOnlyMine(true); setShowAll(false); }}>Meine Zusagen ({myCount})</button></div>}
            {ordered.length === 0 ? <div className={styles.empty}><CalendarDays size={22} aria-hidden="true" /><p>Noch keine Treffen geplant. Wähle eine Idee oder schlage selbst ein Treffen vor.</p></div>
              : filtered.length === 0 ? <div className={styles.empty}><Check size={22} aria-hidden="true" /><p>Du hast noch keine Zusagen für kommende Treffen. Entdecke die Treffen deiner Reisegruppe.</p><button type="button" onClick={() => setOnlyMine(false)}>Alle Treffen ansehen</button></div>
              : <><div className={`${styles.cards} ${expanded ? styles.allCards : ""}`} role="list" aria-label={onlyMine ? "Meine Zusagen" : "Treffen dieser Reise"}>
                {visible.map(meetup => {
                  const own = meetup.organizer_id === userId;
                  const canceled = Boolean(meetup.canceled_at);
                  const passed = new Date(meetup.starts_at).getTime() < now;
                  const full = meetup.attendee_count >= meetup.capacity;
                  const participantLabel = `${meetup.attendee_count} von ${meetup.capacity} Plätzen belegt`;
                  return <article key={meetup.id} id={`social-meetup-${meetup.id}`} tabIndex={-1} className={`${styles.card} ${canceled ? styles.canceled : ""} ${joinedPulseId === meetup.id ? styles.joinPulse : ""}`} role="listitem">
                    <div className={styles.cardTop}><span className={styles.kindBadge}>Treffen</span><span className={`${styles.stateBadge} ${canceled ? styles.stateCanceled : passed ? styles.statePast : meetup.joined_by_me ? styles.stateJoined : full ? styles.stateFull : ""}`}>{meetupStateLabel(meetup, now, userId)}</span></div>
                    <p className={styles.cardDate}><CalendarDays size={15} aria-hidden="true" />{formatInZone(new Date(meetup.starts_at), meetup.time_zone)}</p>
                    <h3>{meetup.title}</h3>
                    {meetup.description && <p className={styles.description}>{meetup.description}</p>}
                    <p className={styles.meta}><MapPin size={15} aria-hidden="true" /><span>{meetup.location_label}</span></p>
                    <p className={styles.meta}><Clock3 size={15} aria-hidden="true" /><span>Zeitzone des Gastgebers: {meetup.time_zone}</span></p>
                    {meetup.organizer_name && <p className={styles.organizer}>Von {meetup.organizer_name}</p>}
                    <button type="button" className={styles.attendeesToggle} onClick={() => void toggleAttendees(meetup.id)} aria-expanded={openAttendeesId === meetup.id}><Users size={16} aria-hidden="true" /> {participantLabel} · Teilnehmende ansehen</button>
                    {openAttendeesId === meetup.id && <div className={styles.attendees}>
                      {attendeeLoadingId === meetup.id ? <p role="status">Teilnehmende werden geladen …</p>
                        : attendeeErrorId === meetup.id ? <p>Teilnehmende konnten nicht geladen werden.</p>
                          : <ul>{(attendees[meetup.id] ?? []).map(person => <li key={person.user_id}>{person.display_name}{person.is_organizer && <small>Gastgeber</small>}</li>)}</ul>}
                    </div>}
                    <div className={styles.cardActions}>
                      {canceled ? <span className={styles.inactive}>Dieses Treffen wurde abgesagt.</span>
                        : passed ? <span className={styles.inactive}>Dieses Treffen ist vorbei.</span>
                          : own ? confirmCancelId === meetup.id ? <div className={styles.confirm}><span>Wirklich absagen?</span><button type="button" className={styles.secondary} onClick={() => setConfirmCancelId("")} disabled={Boolean(busyAction)}>Nein</button><button type="button" className={styles.danger} disabled={Boolean(busyAction)} onClick={() => void run(`cancel:${meetup.id}`, () => onCancel(meetup.id), "Das Treffen wurde abgesagt.")}>Ja, absagen</button></div>
                            : <><button type="button" className={styles.secondary} onClick={() => openEdit(meetup)} disabled={Boolean(busyAction)}>Bearbeiten</button><button type="button" className={styles.secondary} onClick={() => setConfirmCancelId(meetup.id)} disabled={Boolean(busyAction)}>Absagen</button></>
                            : meetup.joined_by_me ? <button type="button" className={styles.joined} disabled={Boolean(busyAction)} onClick={() => void run(`leave:${meetup.id}`, () => onLeave(meetup.id), "Du hast deine Teilnahme zurückgezogen.")}><Check size={16} aria-hidden="true" /> Dabei · Zurückziehen</button>
                              : <button type="button" className={styles.primary} disabled={full || Boolean(busyAction)} onClick={() => void run(`join:${meetup.id}`, () => onJoin(meetup.id), "Du bist dabei!")}>{full ? "Ausgebucht" : "Ich bin dabei"}</button>}
                      {!own && <button type="button" className={styles.reportButton} onClick={() => { setReportError(""); setReportMeetup(meetup); }} disabled={Boolean(busyAction)} aria-label={`Treffen ${meetup.title} melden`}><Flag size={14} aria-hidden="true" /> Melden</button>}
                    </div>
                  </article>;
                })}
              </div>{filtered.length > 3 && <button type="button" className={styles.showAll} onClick={() => setShowAll(current => !current)} aria-expanded={expanded}>{expanded ? "Weniger Treffen anzeigen" : onlyMine ? `Alle ${filtered.length} Zusagen anzeigen` : `Alle ${filtered.length} Treffen anzeigen`}</button>}</>}
            <p className={styles.footerNote}>Bitte nur öffentliche Treffpunkte vereinbaren. Die Reisegruppe prüft keine Buchung oder Anwesenheit.</p>
          </>}
    {reportMeetup && <ReportDialog meetup={reportMeetup} busy={busyAction === `report:${reportMeetup.id}`} error={reportError} onClose={() => setReportMeetup(null)} onSubmit={(reason, details) => void submitReport(reason, details)} />}
  </section>;
}
