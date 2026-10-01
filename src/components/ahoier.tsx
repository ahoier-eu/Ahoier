"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Anchor, ArrowDown, ArrowRight, Bookmark, CalendarDays, Check, ChevronLeft, ChevronRight, Compass, ExternalLink, Heart, MapPin, Route, Settings2, Ship, Sparkles, Sun, Waves, X } from "lucide-react";
import { addDays, dateLabel, isISODate, validateJourney, type FleetEntry, type Journey, type Stop } from "@/lib/journey";
import { SHIP_PHOTOS, SHIP_PHOTO_CREDITS } from "@/lib/ships";
import { getPortCoords } from "@/lib/port-coords";

const STORAGE_KEY = "ahoier:state:v1";
const EMPTY = "{}";
type Tab = "today" | "journey" | "discover" | "saved" | "profile";
type StoredState = { journey?: Journey; saved: Stop[] };
const NAV = [
  { id: "today", label: "Mein Tag", icon: Sun },
  { id: "journey", label: "Meine Reise", icon: Route },
  { id: "discover", label: "Entdecken", icon: Compass },
  { id: "saved", label: "Merkliste", icon: Bookmark },
  { id: "profile", label: "Einstellungen", icon: Settings2 },
] as const;

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("ahoier:changed", listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener("ahoier:changed", listener); };
}
function read() { try { return localStorage.getItem(STORAGE_KEY) ?? EMPTY; } catch { return EMPTY; } }
function write(value: StoredState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); window.dispatchEvent(new Event("ahoier:changed")); return true; }
  catch { return false; }
}
function parseState(raw: string, fleet: FleetEntry[]): StoredState {
  try {
    const value = JSON.parse(raw);
    const journey = value?.journey;
    const valid = journey && typeof journey.ship === "string" && typeof journey.from === "string" && typeof journey.to === "string" && !validateJourney(journey, fleet);
    const saved = Array.isArray(value?.saved) ? value.saved.filter((s: Partial<Stop>) => s && [s.id, s.location, s.ship, s.country, s.pier, s.arrival, s.departure, s.cruise, s.title].every(v => typeof v === "string") && typeof s.seaDay === "boolean" && typeof s.date === "string" && isISODate(s.date)).slice(0, 200) : [];
    return { journey: valid ? journey : undefined, saved };
  } catch { return { saved: [] }; }
}

function MapLink({ stop }: { stop: Stop }) {
  const coords = getPortCoords(stop.location);
  const href = coords ? `https://www.openstreetmap.org/?mlat=${coords[0]}&mlon=${coords[1]}#map=13/${coords[0]}/${coords[1]}` : `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${stop.location} ${stop.country}`)}`;
  return <a href={href} target="_blank" rel="noopener noreferrer" className="text-link">Auf der Karte <ExternalLink size={14} /><span className="sr-only"> (neuer Tab)</span></a>;
}

function RouteSketch({ stops }: { stops: Stop[] }) {
  const places = [...new Map(stops.filter(s => !s.seaDay).map(s => [s.location, s])).values()].slice(0, 7);
  if (!places.length) return <div className="sea-sketch"><Waves size={60} strokeWidth={1} /><p>{stops.length ? "Ein bisschen Meer zwischen den Häfen." : "Noch keine Hafenroute hinterlegt."}</p></div>;
  return <div className="route-sketch" aria-label="Schematische Reihenfolge der Häfen">
    <svg viewBox="0 0 620 180" role="img" aria-label={places.map(s => s.location).join(" → ")}>
      <defs><pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#b9d3d6" /></pattern></defs>
      <rect width="620" height="180" fill="url(#dots)" />
      <path d="M35 90 Q160 5 305 90 T585 90" fill="none" stroke="#d0e1e1" strokeWidth="28" />
      <polyline points={places.map((_, i) => `${places.length === 1 ? 310 : 55 + i * 510 / (places.length - 1)},${i % 2 ? 115 : 65}`).join(" ")} fill="none" stroke="#137b80" strokeWidth="2" strokeDasharray="5 5" />
      {places.map((s, i) => { const x = places.length === 1 ? 310 : 55 + i * 510 / (places.length - 1); const y = i % 2 ? 115 : 65; return <g key={s.id}><circle cx={x} cy={y} r="9" fill={i === 0 ? "#ed875f" : "#137b80"} stroke="white" strokeWidth="4" /><text x={x} y={y + (i % 2 ? 29 : -22)} textAnchor="middle" fill="#23444a" fontSize="12">{s.location.length > 15 ? `${s.location.slice(0, 13)}…` : s.location}</text></g>; })}
    </svg><span>Deine Häfen · schematische Übersicht</span>
  </div>;
}

function JourneyDialog({ fleet, journey, onSave }: { fleet: FleetEntry[]; journey: Journey; onSave: (journey: Journey) => boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(journey);
  const [error, setError] = useState("");
  const ship = fleet.find(s => s.name === draft.ship)!;
  return <>
    <button className="trip-switch" onClick={() => { setDraft(journey); setError(""); dialog.current?.showModal(); }}><Ship size={18} /><span><strong>{journey.ship}</strong><small>{dateLabel(journey.from)} – {dateLabel(journey.to)}</small></span><Settings2 size={16} /></button>
    <dialog ref={dialog} className="journey-dialog" aria-labelledby="journey-heading">
      <div className="dialog-heading"><span className="eyebrow">DEIN URLAUB BEGINNT HIER</span><button className="icon-button" aria-label="Schließen" onClick={() => dialog.current?.close()}><X size={20} /></button></div>
      <h2 id="journey-heading">Wohin geht dein Ahoi?</h2><p>Wähle dein Schiff und deine Reisedaten. Eine Hafenroute zeigen wir nur, wenn dafür Daten hinterlegt sind.</p>
      <form onSubmit={event => { event.preventDefault(); const problem = validateJourney(draft, fleet); if (problem) { setError(problem); return; } if (onSave(draft)) dialog.current?.close(); else setError("Dein Browser konnte die Reise nicht speichern. Bitte erlaube lokalen Speicher."); }}>
        <label htmlFor="ship">Dein Schiff</label><select id="ship" value={draft.ship} onChange={e => setDraft({ ...draft, ship: e.target.value })}>{fleet.map(s => <option key={s.name}>{s.name}</option>)}</select>
        <div className="form-dates"><div><label htmlFor="from">Reisebeginn</label><input id="from" type="date" required value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} /></div><div><label htmlFor="to">Reiseende</label><input id="to" type="date" required value={draft.to} min={draft.from} max={isISODate(draft.from) ? addDays(draft.from, 31) : undefined} onChange={e => setDraft({ ...draft, to: e.target.value })} /></div></div>
        <p className="form-hint">{ship.count ? <>Hinterlegte Daten für {ship.name}: {dateLabel(ship.firstDate, { year: "numeric" })} – {dateLabel(ship.lastDate, { year: "numeric" })}. Einzelne Tage können fehlen.</> : <>Für {ship.name} sind derzeit keine Routendaten hinterlegt. Deine Reiseauswahl und die lokale Community-Vorschau funktionieren trotzdem.</>}</p>
        {error && <p role="alert" className="form-error">{error}</p>}
        <button className="primary-button" type="submit">Meine Reise entdecken <ArrowRight size={18} /></button>
      </form>
    </dialog>
  </>;
}

function PortCard({ stop, saved, toggle }: { stop: Stop; saved: boolean; toggle: () => void }) {
  return <article className="port-card"><div className="port-card-top"><span className="port-symbol"><MapPin size={23} /></span><button className={`icon-button ${saved ? "is-saved" : ""}`} aria-label={`${stop.location} ${saved ? "aus Merkliste entfernen" : "merken"}`} aria-pressed={saved} onClick={toggle}><Heart size={21} fill={saved ? "currentColor" : "none"} /></button></div><span className="eyebrow">{stop.country || "DEIN HAFEN"}</span><h3>{stop.location}</h3><p>{dateLabel(stop.date, { weekday: "short" })} · {stop.ship}</p><div className="port-card-bottom"><span>{stop.arrival || "–"} – {stop.departure || "–"}</span><MapLink stop={stop} /></div></article>;
}

export function Ahoier({ fleet, initialJourney, initialStops, today }: { fleet: FleetEntry[]; initialJourney: Journey; initialStops: Stop[]; today: string }) {
  const raw = useSyncExternalStore(subscribe, read, () => EMPTY);
  const stored = useMemo(() => parseState(raw, fleet), [raw, fleet]);
  const journey = stored.journey ?? initialJourney;
  const key = JSON.stringify(journey);
  const initialKey = JSON.stringify(initialJourney);
  const [tab, setTab] = useState<Tab>("today");
  const [selectedId, setSelectedId] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const [resource, setResource] = useState<{ key: string; stops: Stop[]; error?: string } | null>(null);
  useEffect(() => {
    if (key === initialKey) return;
    const controller = new AbortController();
    const selection = JSON.parse(key) as Journey;
    fetch(`/api/itinerary?${new URLSearchParams(selection)}`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("Die Route konnte nicht geladen werden."); return response.json() as Promise<{ stops: Stop[] }>; })
      .then(data => { if (!controller.signal.aborted) setResource({ key, stops: data.stops }); })
      .catch(() => { if (!controller.signal.aborted) setResource({ key, stops: [], error: "Die Route konnte nicht geladen werden. Bitte versuche es erneut." }); });
    return () => controller.abort();
  }, [key, initialKey, retry]);

  const stops = key === initialKey ? initialStops : resource?.key === key ? resource.stops : [];
  const loading = key !== initialKey && resource?.key !== key;
  const error = key !== initialKey && resource?.key === key ? resource.error : undefined;
  const ports = stops.filter(s => !s.seaDay);
  const active = stops.find(s => s.id === selectedId) ?? stops.find(s => s.date === today) ?? stops[0];
  const activeIndex = active ? stops.indexOf(active) : 0;
  const next = stops.slice(activeIndex + 1).find(s => !s.seaDay);
  const photo = SHIP_PHOTOS[journey.ship];
  const credits = SHIP_PHOTO_CREDITS[journey.ship];
  const hasShipRouteData = (fleet.find(entry => entry.name === journey.ship)?.count ?? 0) > 0;
  const savedIds = new Set(stored.saved.map(s => s.id));
  function changeTab(value: Tab) { setTab(value); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function toggleSaved(stop: Stop) {
    const already = savedIds.has(stop.id);
    const success = write({ ...stored, saved: already ? stored.saved.filter(s => s.id !== stop.id) : [...stored.saved, stop].slice(-200) });
    setNotice(success ? already ? "Aus deiner Merkliste entfernt." : `${stop.location} ist auf deiner Merkliste.` : "Speichern nicht möglich. Bitte erlaube lokalen Speicher im Browser.");
  }
  function chooseJourney(value: Journey) { const success = write({ ...stored, journey: value }); if (success) { setSelectedId(""); setNotice("Deine Reise ist bereit."); } return success; }

  return <div className="app-shell">
    <a className="skip-link" href="#main">Zum Inhalt</a>
    <aside className="sidebar"><Link className="brand" href="/" aria-label="Ahoier Startseite">ahoier<span className="brand-dot">.</span><Waves size={25} /></Link><div className="sidebar-caption">DEIN KLEINES MEER AN MÖGLICHKEITEN</div><nav aria-label="Hauptnavigation">{NAV.map(item => <button key={item.id} className={tab === item.id ? "nav-item active" : "nav-item"} aria-current={tab === item.id ? "page" : undefined} onClick={() => changeTab(item.id)}><item.icon size={20} /><span>{item.label}</span>{item.id === "saved" && stored.saved.length > 0 && <small>{stored.saved.length}</small>}</button>)}</nav><div className="sidebar-note"><span className="little-sun">✳</span><h3>Mehr erleben.<br />Weniger suchen.</h3><p>Dein Reisebegleiter für die schönen Momente dazwischen.</p><span className="tiny">Unabhängig. Für AIDA Gäste.</span></div><div className="sidebar-bottom"><Waves size={16} /> Mit Vorfreude gemacht.</div></aside>
    <div className="main-shell"><header className="topbar"><Link href="/" className="brand mobile-brand">ahoier<span className="brand-dot">.</span></Link><div className="breadcrumb">Dein Reisebegleiter <span>/</span> {NAV.find(n => n.id === tab)?.label}</div><JourneyDialog fleet={fleet} journey={journey} onSave={chooseJourney} /></header>
    <main id="main">
      <Link href="/" className="text-link" style={{ marginBottom: 22, display: "inline-flex" }}>← Zur Community an Bord</Link>
      {tab === "today" && <>
        <div className="page-heading"><div><span className="eyebrow"><span className="status-dot" /> URLAUBSMODUS AN</span><h1>Hallo, Vorfreude<span>.</span></h1><p>Ein neuer Tag. Ein neuer Lieblingsort.</p></div><span className="heading-date"><CalendarDays size={16} />{active ? dateLabel(active.date, { weekday: "long" }) : "Deine Reise"}</span></div>
        <div className="dashboard-grid"><section className="hero-card" aria-label="Deine Reise"><Image src={photo} alt={`${journey.ship} auf dem Wasser`} fill priority sizes="(max-width: 900px) 100vw, 65vw" /><div className="hero-shade" /><div className="hero-top"><span className="glass-pill"><Ship size={15} /> AN BORD DER {journey.ship}</span><span className="glass-pill">{dateLabel(journey.from)} – {dateLabel(journey.to)}</span></div><div className="hero-content"><span className="eyebrow light">DEIN MOMENT AM MEER</span><h2>Die Welt wartet.<br />Du bist unterwegs.</h2><button className="light-button" onClick={() => changeTab("journey")}>Meine Route ansehen <ArrowRight size={18} /></button></div></section>
          <section className="day-card"><div className="section-heading"><span className="eyebrow">{active?.date === today ? "HEUTE AUF DEINER REISE" : "DEIN REISETAG"}</span><span className="round-icon"><Compass size={19} /></span></div>{loading ? <p role="status">Deine Route wird geladen …</p> : active ? <><span className="day-type"><span className="status-dot" />{active.seaDay ? "Ein Tag auf See" : "Hafen entdecken"}</span><h2>{active.seaDay ? "Meer Zeit für dich." : active.location}</h2><p>{active.seaDay ? "Durchatmen. Den Horizont genießen." : active.country || journey.ship}</p><div className="times"><div><small>Ankunft</small><strong>{active.seaDay ? "—" : active.arrival || "—"}</strong></div><div><small>Abfahrt</small><strong>{active.seaDay ? "—" : active.departure || "—"}</strong></div></div><p className="schedule-note">Geplante Zeiten laut hinterlegter Route. Die verbindliche Rückkehrzeit erfährst du an Bord.</p><div className="day-actions">{!active.seaDay && <button className="primary-button" onClick={() => toggleSaved(active)}>{savedIds.has(active.id) ? <Check size={17} /> : <Bookmark size={17} />}{savedIds.has(active.id) ? "Hafen gemerkt" : "Hafen merken"}</button>}<div className="day-arrows"><button className="icon-button" disabled={activeIndex === 0} aria-label="Vorheriger Stopp" onClick={() => setSelectedId(stops[activeIndex - 1].id)}><ChevronLeft size={18} /></button><button className="icon-button" disabled={activeIndex >= stops.length - 1} aria-label="Nächster Stopp" onClick={() => setSelectedId(stops[activeIndex + 1].id)}><ChevronRight size={18} /></button></div></div></> : <div className="empty-inline"><Waves size={32} /><h3>{hasShipRouteData ? "Noch keine Route für diese Daten" : "Noch keine Routendaten"}</h3><p>{hasShipRouteData ? "Wähle oben andere Reisedaten. Wir zeigen nur hinterlegte Hafenanläufe." : "Für dieses Schiff sind keine Hafenstopps hinterlegt. Deine Reiseauswahl und die Community-Vorschau funktionieren trotzdem."}</p></div>}</section>
        </div>
        <div className="mini-stats"><div><span className="stat-icon"><MapPin size={20} /></span><div><strong>{stops.length ? `${new Set(ports.map(s => s.location)).size} Häfen` : "Keine Hafendaten"}</strong><small>{stops.length ? "Viele neue Perspektiven" : "Route nicht hinterlegt"}</small></div></div><div><span className="stat-icon peach"><Waves size={20} /></span><div><strong>{stops.length ? `${new Set(stops.filter(s => s.seaDay).map(s => s.date)).size} Seetage` : "Keine Tagesdaten"}</strong><small>{stops.length ? "Platz zum Durchatmen" : "Route nicht hinterlegt"}</small></div></div><div><span className="stat-icon lavender"><Heart size={20} /></span><div><strong>{stored.saved.length} Lieblingsmomente</strong><small>Auf deiner Merkliste</small></div></div></div>
        <div className="section-heading spacious"><div><span className="eyebrow">DER WEG IST DAS URLAUBSZIEL</span><h2>Das liegt vor dir</h2></div><button className="text-link" onClick={() => changeTab("journey")}>Ganze Reise <ArrowRight size={16} /></button></div>
        <div className="lower-grid"><section className="route-panel"><RouteSketch stops={stops.slice(activeIndex)} /></section><section className="next-card"><span className="eyebrow">{stops.length ? "NÄCHSTER HAFEN" : "HAFENROUTE"}</span>{next ? <><h3>{next.location}</h3><p>{dateLabel(next.date, { weekday: "long" })}{next.arrival && ` · ${next.arrival} Uhr`}</p><MapLink stop={next} /></> : <><h3>{stops.length ? "Den Moment genießen." : "Noch keine Route."}</h3><p>{stops.length ? "Kein weiterer Hafen im gewählten Zeitraum." : "Für diese Auswahl sind keine Hafenstopps hinterlegt."}</p></>}<Anchor className="next-decoration" size={75} strokeWidth={1} /></section></div>
        <div className="explore-banner"><span className="round-icon"><Sparkles size={23} /></span><div><h3>Deine Reise. Deine kleinen Entdeckungen.</h3><p>Merke dir die Häfen, auf die du dich besonders freust.</p></div><button className="text-link" onClick={() => changeTab("discover")}>Entdecken <ArrowRight size={17} /></button></div>
      </>}
      {tab === "journey" && <><div className="page-heading"><div><span className="eyebrow">VON HAFEN ZU HAFEN</span><h1>Meine Reise<span>.</span></h1><p>{journey.ship} · {dateLabel(journey.from, { year: "numeric" })} – {dateLabel(journey.to, { year: "numeric" })}</p></div></div><RouteSketch stops={stops} /><div className="timeline">{stops.map((stop, i) => <article key={stop.id} className="timeline-row"><div className="timeline-index">{i + 1}</div><div className="timeline-date">{dateLabel(stop.date, { weekday: "short" })}</div><div className="timeline-place"><h3>{stop.seaDay ? "Ein Tag auf See" : stop.location}</h3><p>{stop.seaDay ? "Zeit für deinen Lieblingsplatz an Bord." : [stop.country, stop.pier].filter(Boolean).join(" · ")}</p></div><div className="timeline-time">{!stop.seaDay && <><span>{stop.arrival || "—"} – {stop.departure || "—"}</span><small>Ankunft · Abfahrt</small></>}</div>{!stop.seaDay && <button className="icon-button" aria-label={`${stop.location} merken`} aria-pressed={savedIds.has(stop.id)} onClick={() => toggleSaved(stop)}><Heart size={20} fill={savedIds.has(stop.id) ? "currentColor" : "none"} /></button>}</article>)}</div>{!loading && !stops.length && <Empty text={hasShipRouteData ? "Für diese Auswahl sind keine Hafenanläufe hinterlegt. Bitte ändere deine Reisedaten." : "Für dieses Schiff sind derzeit keine Hafenstopps hinterlegt. Du kannst deine Reise trotzdem auswählen."} />}<p className="data-note">Es werden nur vorhandene Datensätze angezeigt. Fehlende Tage werden nicht als Seetage ergänzt.</p></>}
      {(tab === "discover" || tab === "saved") && <><div className="page-heading"><div><span className="eyebrow">KLEINE PLÄNE. GROSSE VORFREUDE.</span><h1>{tab === "saved" ? "Meine Merkliste" : "Land in Sicht"}<span>.</span></h1><p>{tab === "saved" ? "Deine gemerkten Hafenstopps, an einem Ort." : "Deine Häfen entdecken und auf der Karte erkunden."}</p></div></div><div className="ports-grid">{(tab === "saved" ? stored.saved : ports).map(stop => <PortCard key={stop.id} stop={stop} saved={savedIds.has(stop.id)} toggle={() => toggleSaved(stop)} />)}</div>{!(tab === "saved" ? stored.saved : ports).length && <Empty text={tab === "saved" ? "Noch nichts gemerkt. Tippe bei einem Hafen auf das Herz – hier bleibt deine Vorfreude gesammelt." : "Hier erscheinen die Häfen deiner gewählten Reise."} />}</>}
      {tab === "profile" && <><div className="page-heading"><div><span className="eyebrow">GANZ DEIN URLAUB</span><h1>Einfach Ahoier<span>.</span></h1><p>Deine Reise bleibt auf diesem Gerät gespeichert.</p></div></div><div className="settings-grid"><section className="info-card"><Ship size={27} /><h2>Deine Reise</h2><p>{journey.ship}<br />{dateLabel(journey.from, { year: "numeric" })} – {dateLabel(journey.to, { year: "numeric" })}</p><p>Schiff und Reisedaten kannst du jederzeit oben ändern.</p></section><section className="info-card"><Bookmark size={27} /><h2>Deine Daten</h2><p>Reiseauswahl und Merkliste werden nur in diesem Browser gespeichert. Es gibt noch kein Konto und keine Synchronisierung zwischen Geräten.</p><button className="secondary-button" onClick={() => { if (window.confirm("Reiseauswahl und Merkliste auf diesem Gerät zurücksetzen?")) { if (write({ saved: [] })) { setSelectedId(""); setNotice("Deine lokalen Daten wurden zurückgesetzt."); } else setNotice("Zurücksetzen war nicht möglich."); } }}>Lokale Daten zurücksetzen</button></section><section className="info-card wide"><Compass size={27} /><h2>Gut zu wissen</h2><p>Ahoier ist ein unabhängiger Reisebegleiter für AIDA Gäste. {fleet.some(entry => entry.count > 0) ? "Die Routen stammen aus einem übernommenen Datenbestand und sind nicht live mit der Reederei verbunden." : "Zurzeit sind keine Routendaten hinterlegt."} Aktuelle Hafenänderungen und verbindliche Rückkehrzeiten erfährst du an Bord.</p><p>Diese erste Version bietet Reiseauswahl, Routenübersicht, Hafenkarte und Merkliste. Wetter, Ausflugsbuchungen, Bordprogramm und Konten sind noch nicht angebunden.</p></section></div></>}
      {loading && tab !== "today" && <p role="status" className="loading">Deine Route wird geladen …</p>}
      {error && <div role="alert" className="error-banner">{error}<button onClick={() => setRetry(n => n + 1)}>Erneut versuchen</button></div>}
      <footer className="page-footer"><span>ahoier. <span>Deine Reise. Dein Moment.</span></span><span>{fleet.some(entry => entry.count > 0) ? "Routendaten: Stand 30.09.2026 · kein Live-Fahrplan" : "Routendaten: derzeit nicht hinterlegt"}</span>{credits && <span>Schiffsfoto: {credits.author} · <a href={credits.source} target="_blank" rel="noopener noreferrer">Quelle</a> · <a href={credits.licenseUrl} target="_blank" rel="noopener noreferrer">{credits.license}</a> · 960-px-Vorschau, sonst unverändert</span>}</footer>
    </main></div>
    <nav className="mobile-nav" aria-label="Mobile Navigation">{NAV.map(item => <button key={item.id} className={tab === item.id ? "active" : ""} aria-current={tab === item.id ? "page" : undefined} onClick={() => changeTab(item.id)}><item.icon size={21} /><span>{item.id === "profile" ? "Mehr" : item.label}</span></button>)}</nav>
    {notice && <div className="toast" role="status"><Check size={18} /><span>{notice}</span><button aria-label="Hinweis schließen" onClick={() => setNotice("")}><X size={17} /></button></div>}
  </div>;
}

function Empty({ text }: { text: string }) { return <div className="empty-state"><Waves size={42} strokeWidth={1.4} /><h2>Platz für Vorfreude.</h2><p>{text}</p><ArrowDown size={19} /></div>; }
