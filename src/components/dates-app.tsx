"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, Heart, LockKeyhole, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { DATE_GENDERS, DATE_INTENTS, DATE_STATUSES, STATUS_LABELS, decodeDatePreferences, validateDatePreferences, type DateGender, type DateIntent, type DateStatus } from "@/lib/dates";
import "./dates.css";

const KEY = "ahoier:dates:v1";
const eventName = "ahoier:dates-changed";
const subscribe = (listener: () => void) => {
  window.addEventListener("storage", listener);
  window.addEventListener(eventName, listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener(eventName, listener); };
};
const snapshot = () => { try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; } };

export function DatesApp() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "");
  const saved = decodeDatePreferences(raw);
  const [editing, setEditing] = useState(false);
  const [age, setAge] = useState<number | "">("");
  const [intent, setIntent] = useState<DateIntent>("Kennenlernen");
  const [preferred, setPreferred] = useState<DateGender[]>([]);
  const [minAge, setMinAge] = useState(25);
  const [maxAge, setMaxAge] = useState(45);
  const [status, setStatus] = useState<DateStatus>("private");
  const [about, setAbout] = useState("");
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [optedIn, setOptedIn] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const showForm = !saved || editing;

  function edit() {
    if (saved) { setAge(saved.age); setIntent(saved.intent); setPreferred(saved.preferred); setMinAge(saved.minAge); setMaxAge(saved.maxAge); setStatus(saved.status); setAbout(saved.about); setAdultConfirmed(true); setOptedIn(true); }
    setError(""); setEditing(true);
  }
  function toggleGender(value: DateGender) { setPreferred(items => items.includes(value) ? items.filter(item => item !== value) : [...items, value]); }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adultConfirmed || !optedIn) { setError("Bitte bestätige dein Alter und die freiwillige Aktivierung."); return; }
    const draft = { age: Number(age), intent, preferred, minAge, maxAge, status, about: about.trim() };
    const problem = validateDatePreferences(draft);
    if (problem) { setError(problem); return; }
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, active: true, ...draft, consentedAt: new Date().toISOString() }));
      window.dispatchEvent(new Event(eventName));
      setEditing(false); setError(""); setNotice("Deine private Vorschau wurde auf diesem Gerät gespeichert.");
    } catch { setError("Speichern nicht möglich. Bitte erlaube lokalen Speicher im Browser."); }
  }
  function remove() {
    if (!window.confirm("Ahoi Dates ausschalten und alle Angaben dazu auf diesem Gerät löschen?")) return;
    try { localStorage.removeItem(KEY); window.dispatchEvent(new Event(eventName)); setEditing(false); setAge(""); setIntent("Kennenlernen"); setPreferred([]); setMinAge(25); setMaxAge(45); setStatus("private"); setAbout(""); setAdultConfirmed(false); setOptedIn(false); setError(""); setNotice("Ahoi Dates ist ausgeschaltet. Deine Angaben wurden lokal gelöscht."); }
    catch { setNotice("Löschen war nicht möglich. Bitte prüfe die Browsereinstellungen."); }
  }

  return <div className="dates-app"><a href="#dates-main" className="skip-link">Zum Inhalt</a><header className="dates-topbar"><Link href="/" className="brand">ahoier<span className="brand-dot">.</span></Link><Link href="/demo#profile" className="dates-back"><ArrowLeft size={17} /> Zurück zum Profil</Link></header><main id="dates-main" className="dates-main"><div className="dates-intro"><span className="dates-eyebrow"><Heart size={16} /> NUR WENN DU MÖCHTEST</span><h1>Ein Ahoi kann<br />mehr werden<span>.</span></h1><p>Für Erwachsene, die auf ihrer Reise offen für ein Date oder eine neue Begegnung sind. Du entscheidest, ob du diesen Bereich nutzt.</p><div className="dates-intro-tags"><span>Freiwillig</span><span>Ab 18</span><span>Jederzeit löschen</span></div></div><div className="dates-layout"><section className="dates-panel" aria-labelledby="dates-form-title"><div className="dates-panel-head"><span className="dates-symbol"><Sparkles size={22} /></span><div><span className="dates-kicker">AHOI DATES</span><h2 id="dates-form-title">{saved && !editing ? "Deine private Vorschau" : "Wen möchtest du kennenlernen?"}</h2></div></div>
      {showForm ? <form className="dates-form" onSubmit={save}><p className="dates-form-lead">Drei kurze Fragen. Deine Antworten bleiben vorerst ausschließlich in diesem Browser.</p>
        <fieldset><legend><span>1</span> Was suchst du?</legend><div className="dates-choices">{DATE_INTENTS.map(value => <button type="button" key={value} aria-pressed={intent === value} className={intent === value ? "selected" : ""} onClick={() => setIntent(value)}>{value}</button>)}</div><small>Du kannst deine Absicht später ändern.</small></fieldset>
        <fieldset><legend><span>2</span> Wen möchtest du kennenlernen?</legend><div className="dates-choices">{DATE_GENDERS.map(value => <button type="button" key={value} aria-pressed={preferred.includes(value)} className={preferred.includes(value) ? "selected" : ""} onClick={() => toggleGender(value)}>{value}</button>)}</div><div className="dates-range"><div><label htmlFor="min-age">Alter von</label><input id="min-age" type="number" min={18} max={120} value={minAge} onChange={e => setMinAge(Number(e.target.value))} required /></div><span aria-hidden="true">–</span><div><label htmlFor="max-age">bis</label><input id="max-age" type="number" min={18} max={120} value={maxAge} onChange={e => setMaxAge(Number(e.target.value))} required /></div></div><small>Mehrfachauswahl ist möglich. Diese Wünsche werden noch nicht zum Finden anderer Gäste verwendet.</small></fieldset>
        <fieldset><legend><span>3</span> Was möchtest du über dich sagen?</legend><div className="dates-form-grid"><div><label htmlFor="own-age">Dein Alter</label><input id="own-age" type="number" min={18} max={120} value={age} onChange={e => setAge(e.target.value ? Number(e.target.value) : "")} required placeholder="Mindestens 18" /></div><div><label htmlFor="relationship">Beziehungsstatus <em>optional</em></label><select id="relationship" value={status} onChange={e => setStatus(e.target.value as DateStatus)}>{DATE_STATUSES.map(value => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}</select></div></div><label htmlFor="dates-about">Ein Satz über dich <em>optional</em></label><textarea id="dates-about" maxLength={180} value={about} onChange={e => setAbout(e.target.value)} placeholder="Zum Beispiel: Lieber ein ruhiger Kaffee als eine laute Party." /><small>{about.length}/180 Zeichen · keine Kabinennummer oder privaten Kontaktdaten</small></fieldset>
        <div className="dates-consent"><label><input type="checkbox" checked={adultConfirmed} onChange={e => setAdultConfirmed(e.target.checked)} required />Ich bin mindestens 18 Jahre alt.</label><label><input type="checkbox" checked={optedIn} onChange={e => setOptedIn(e.target.checked)} required />Ich möchte Ahoi Dates freiwillig aktivieren und diese Angaben nur auf meinem Gerät speichern.</label></div>
        {error && <p className="dates-error" role="alert">{error}</p>}<div className="dates-form-actions"><button className="dates-primary" type="submit"><Check size={18} /> Private Vorschau speichern</button>{saved && <button className="dates-secondary" type="button" onClick={() => setEditing(false)}>Abbrechen</button>}</div></form> : <div className="dates-saved"><span className="dates-private"><LockKeyhole size={16} /> Nur auf diesem Gerät sichtbar</span><h3>{saved.intent}</h3><dl><div><dt>Du interessierst dich für</dt><dd>{saved.preferred.join(", ")}</dd></div><div><dt>Gewünschtes Alter</dt><dd>{saved.minAge}–{saved.maxAge} Jahre</dd></div><div><dt>Dein Alter</dt><dd>{saved.age} Jahre</dd></div><div><dt>Beziehungsstatus</dt><dd>{STATUS_LABELS[saved.status]}</dd></div></dl>{saved.about && <p className="dates-bio">{saved.about}</p>}<p className="dates-empty-match">Es werden keine Personen angezeigt. Profile und gegenseitige Kontakte gibt es erst, wenn eine echte, geschützte Community eingerichtet ist.</p><div className="dates-form-actions"><button className="dates-primary" onClick={edit}>Angaben bearbeiten <ArrowRight size={17} /></button><button className="dates-delete" onClick={remove}><RotateCcw size={16} /> Ausschalten & Daten löschen</button></div></div>}
    </section><aside className="dates-aside"><section><ShieldCheck size={25} /><h2>Deine Entscheidung.</h2><p>Ahoi Dates erscheint nicht im allgemeinen Community-Feed. Deine Angaben werden weder veröffentlicht noch an andere Gäste gesendet.</p><p>Du kannst diesen Bereich jederzeit ausschalten und alle Angaben dazu löschen.</p></section><section><Heart size={24} /><h2>Begegnungen mit Respekt.</h2><p>Später sollen nur gegenseitig bestätigte Kontakte miteinander schreiben können. Blockieren und Melden gehören dazu, bevor echte Gäste teilnehmen.</p><small>Diese Vorschau prüft dein Alter oder deine Buchung noch nicht.</small></section></aside></div><footer className="dates-footer"><span>ahoier. · Ahoi Dates</span><span>Unabhängige lokale Vorschau · kein AIDA Service</span></footer></main>{notice && <div role="status" className="dates-toast">{notice}<button aria-label="Hinweis schließen" onClick={() => setNotice("")}>×</button></div>}</div>;
}
