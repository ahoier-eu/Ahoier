"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Compass, Heart, MessageCircle, Plus, RefreshCw, Ship, Sparkles, Users } from "lucide-react";
import { dateLabel } from "@/lib/journey";
import { DEMO_PEOPLE, SELF, TRAVEL_GROUP_LABELS, isUpcomingMeeting, memberPartySize, type Meeting, type Post, type Profile } from "@/lib/community";
import { CONVERSATION_PROMPTS, RADAR_MODES, radarMeetings, type RadarMode } from "@/lib/radar";
import { SHIP_PHOTOS } from "@/lib/ships";

export const IDEAS = [
  { label: "Kaffee", emoji: "☕", title: "Wer kommt auf einen Kaffee mit?", description: "Ein Kaffee, ein bisschen Meer und neue Bekanntschaften. Auch allein bist du willkommen!" },
  { label: "Abendessen", emoji: "🍽", title: "Gesellschaft fürs Abendessen gesucht", description: "Lass uns gemeinsam essen und kennenlernen. Restaurant und Treffpunkt stimmen wir in der Gruppe ab." },
  { label: "Spiele", emoji: "🎲", title: "Wer hat Lust auf eine Runde Spiele?", description: "Eine entspannte Spielrunde für neue und bekannte Gesichter. Was wir spielen, entscheiden wir zusammen." },
  { label: "Landgang", emoji: "🚶", title: "Zusammen den nächsten Hafen entdecken", description: "Wer möchte gemeinsam auf Entdeckungstour gehen? Route, Treffpunkt und Rückkehr stimmen wir vorab ab." },
];

type Props = {
  ship: string;
  from: string;
  to: string;
  profile: Profile;
  meetings: Meeting[];
  posts: Post[];
  openMeeting: (idea?: number) => void;
  openPost: (prompt?: string) => void;
  openGroup: (id: string) => void;
  openMatchingMeeting: (meeting: Meeting) => void;
  renderMeeting: (meeting: Meeting) => ReactNode;
  renderPost: (post: Post) => ReactNode;
};

export function SocialBoard({ ship, from, to, profile, meetings, posts, openMeeting, openPost, openGroup, openMatchingMeeting, renderMeeting, renderPost }: Props) {
  const [filter, setFilter] = useState("Alle");
  const [mode, setMode] = useState<RadarMode>("Alle");
  const [promptIndex, setPromptIndex] = useState(0);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const interval = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  const visiblePosts = posts.filter(p => filter === "Alle" || (filter === "Meine Beiträge" ? p.author === SELF : p.category === filter));
  const upcomingMeetings = meetings.filter(m => isUpcomingMeeting(m, now));
  const openMeetings = upcomingMeetings.slice().sort((a, b) => (profile.travelGroup === "family" ? Number(b.familyFriendly) - Number(a.familyFriendly) : 0) || `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const bestMatch = radarMeetings(upcomingMeetings, mode, profile)[0];
  const prompt = CONVERSATION_PROMPTS[promptIndex];
  const myMeetings = upcomingMeetings.filter(m => m.members.includes(SELF)).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const shipPhoto = SHIP_PHOTOS[ship];
  return <>
    <div className="social-heading board-greeting"><div><Link href="/reise" className="board-voyage"><span className="board-voyage-media">{shipPhoto ? <Image src={shipPhoto} alt="" fill priority sizes="96px" className="board-voyage-image" /> : <Ship size={19} />}</span><span className="board-voyage-copy"><strong>Deine Reise auf der {ship}</strong><small>{dateLabel(from)} – {dateLabel(to)} · Route ansehen</small></span><ArrowRight size={15} /></Link><h1>{profile.name ? `Ahoi, ${profile.name}` : "Ahoi, schön, dass du da bist"}<span> 👋</span></h1><p>Triff Menschen an Bord.</p></div></div>
    <div className="social-board-layout">
      <div className="board-stream">
        {myMeetings.length > 0 && <div className="mobile-my-plans"><strong>Deine nächste Verabredung</strong><button onClick={() => openGroup(myMeetings[0].id)}><span>{dateLabel(myMeetings[0].date)} · {myMeetings[0].time}<b>{myMeetings[0].title}</b><small>{memberPartySize(myMeetings[0], SELF)} {memberPartySize(myMeetings[0], SELF) === 1 ? "Platz" : "Plätze"} lokal vorgemerkt</small></span><ArrowRight size={18} /></button></div>}
        <button className="demo-people-teaser" type="button" onClick={() => { const target = document.getElementById("demo-people"); target?.scrollIntoView({ block: "start" }); target?.focus({ preventScroll: true }); }}>
          <span className="demo-people-avatars" aria-hidden="true">{DEMO_PEOPLE.slice(0, 5).map((person, index) => <span key={person.id} className="social-avatar" data-tone={index % 5}>{person.name[0]}</span>)}</span>
          <span className="demo-people-teaser-copy"><strong>{DEMO_PEOPLE.length} Beispielprofile entdecken</strong><small>Erfundene Personen · keine echten Kontakte</small></span>
          <ArrowRight size={17} aria-hidden="true" />
        </button>
        <div className="social-section-title onboard-invitations-title"><div><h2>Treffen an Bord</h2><p>Kleine Runden. Neue Bekanntschaften.</p></div><a href="#meetings" className="text-link">Alle Treffen <ArrowRight size={16} /></a></div><div className="board-invitations">{openMeetings.slice(0, 2).map(renderMeeting)}</div>{!openMeetings.length && <div className="social-empty"><p>Noch kein offenes Treffen. Lade zu einem gemeinsamen Moment ein.</p><button className="primary-button" onClick={() => openMeeting()}>Treffen erstellen <Plus size={16} /></button></div>}
        <section className="social-composer social-composer-compact" aria-labelledby="composer-title">
          <div className="composer-start"><span className="social-avatar" aria-hidden="true">{profile.name.slice(0, 1).toLocaleUpperCase("de") || "?"}</span><div><h2 id="composer-title">Dein nächstes Ahoi starten</h2><p>Eine kleine Einladung oder eine Frage an Mitreisende.</p></div></div>
          <div className="composer-actions"><button className="primary-button" onClick={() => openMeeting()}><Plus size={16} />Treffen vorschlagen</button><button className="secondary-button" onClick={() => openPost()}><MessageCircle size={16} />Frage stellen</button></div>
          <details className="composer-ideas"><summary>Ideen für ein Treffen</summary><div className="quick-ideas">{IDEAS.map((item, i) => <button key={item.label} onClick={() => openMeeting(i)}><span aria-hidden="true">{item.emoji}</span>{item.label}</button>)}</div></details>
        </section>
        <section className="radar-panel" aria-labelledby="radar-title"><div className="radar-heading"><span className="radar-symbol"><Compass size={22} /></span><div><span className="eyebrow">DEIN NÄCHSTES AHOI</span><h2 id="radar-title">Ahoi Radar</h2><p>Worauf hast du gerade Lust?</p></div></div><div className="radar-modes" aria-label="Dazu passende Treffen finden">{RADAR_MODES.map(item => <button key={item} className={mode === item ? "selected" : ""} aria-pressed={mode === item} onClick={() => setMode(item)}>{item}</button>)}</div>{bestMatch ? <div className="radar-result"><span className="radar-result-label">{mode === "Alle" && profile.travelGroup === "family" && bestMatch.familyFriendly ? "F?r deine Familienreise" : mode === "Alle" && profile.interests.length ? "Passt zu deinen Interessen" : "Passendes Treffen"}{bestMatch.demo && <span className="demo-pill">Beispiel</span>}</span><h3>{bestMatch.title}</h3><p>{bestMatch.name} lädt ein · {dateLabel(bestMatch.date)} um {bestMatch.time}</p><button className="radar-result-link" onClick={() => openMatchingMeeting(bestMatch)}>Treffen ansehen <ArrowRight size={17} /></button></div> : <div className="radar-result radar-empty"><h3>Noch keine passende Runde.</h3><p>Du kannst den ersten Schritt machen und selbst ein Treffen vorschlagen.</p><button className="radar-result-link" onClick={() => openMeeting(({ Kaffee: 0, Spiele: 2, Kulinarik: 1, Landgang: 3 } as Partial<Record<RadarMode, number>>)[mode])}>Treffen vorschlagen <Plus size={17} /></button></div>}<small>Vorschläge aus den angezeigten Treffen · keine Live-Daten</small></section>
        <section className="conversation-spark" aria-labelledby="spark-title"><span className="spark-icon"><Sparkles size={21} /></span><div><span className="eyebrow">GESPRÄCHSIMPULS</span><h2 id="spark-title">Ein guter Anfang:</h2><p>{prompt}</p><div className="spark-actions"><button className="text-link" onClick={() => openPost(prompt)}>Als Frage teilen <ArrowRight size={16} /></button><button className="spark-next" onClick={() => setPromptIndex((promptIndex + 1) % CONVERSATION_PROMPTS.length)} aria-label="Nächste Gesprächsfrage"><RefreshCw size={16} />Andere Frage</button></div></div></section>
        <div className="social-section-title"><div><h2>Im Gespräch</h2><p>Was deine Mitreisenden beschäftigt.</p></div><button className="text-link" onClick={() => openPost()} aria-label="Neuen Beitrag schreiben"><Plus size={18} />Beitrag</button></div><div className="home-feed-filters" aria-label="Gespräche filtern">{["Alle", "Frage", "Tipp", "Meine Beiträge"].map(item => <button key={item} aria-pressed={filter === item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item === "Frage" ? "Fragen" : item === "Tipp" ? "Tipps" : item}</button>)}</div><div className="social-feed">{visiblePosts.map(renderPost)}{!visiblePosts.length && <div className="social-empty"><p>{filter === "Meine Beiträge" ? "Dein erstes Ahoi fehlt noch. Stell dich vor oder teile eine Idee." : "Hier ist noch Platz für die erste Unterhaltung."}</p><button className="primary-button" onClick={() => openPost()}>Beitrag schreiben</button></div>}</div>
        <section id="demo-people" className="demo-people" aria-labelledby="demo-people-title" tabIndex={-1}>
          <div className="demo-people-heading"><span className="demo-pill">DEMO · {DEMO_PEOPLE.length} BEISPIELPROFILE</span><h2 id="demo-people-title">So könnte deine Reisegemeinschaft aussehen.</h2><p>Alle Namen und Interessen sind erfunden. Hier gibt es keine echten Gäste, bestätigten Buchungen oder erreichbaren Profile.</p></div>
          <div className="demo-people-grid">{DEMO_PEOPLE.map((person, index) => <article className="demo-person" key={person.id}>
            <span className="social-avatar" data-tone={index % 5} aria-hidden="true">{person.name[0]}</span>
            <div><h3>{person.name}</h3><small>Beispielprofil · {TRAVEL_GROUP_LABELS[person.travelGroup]}</small><p>{person.intro}</p><div className="demo-person-interests" aria-label="Interessen">{person.interests.map(interest => <span key={interest}>{interest}</span>)}</div></div>
          </article>)}</div>
        </section>
      </div>
      <aside className="board-companion" aria-label="Deine Reisegemeinschaft"><section className="companion-card my-plans"><div className="companion-heading"><h2>Deine Verabredungen</h2><span className="plan-count">{myMeetings.length}</span></div>{myMeetings.length ? <div className="personal-plans">{myMeetings.slice(0, 4).map(m => <button key={m.id} onClick={() => openGroup(m.id)}><span className="plan-date"><strong>{m.time}</strong><small>{dateLabel(m.date)}</small></span><span><strong>{m.title}</strong><small>Zur Gruppe <ArrowRight size={12} /></small></span></button>)}</div> : <div className="no-plans"><Users size={27} /><h3>Dein erster gemeinsamer Moment?</h3><p>Sag bei einem Treffen zu. Hier behältst du deine Verabredungen im Blick.</p><a href="#meetings" className="text-link">Gesellschaft finden <ArrowRight size={16} /></a></div>}{myMeetings.length > 0 && <a href="#meetings" className="text-link">Alle meine Treffen <ArrowRight size={15} /></a>}</section>
        <section className="companion-card introduce-card"><span className="social-avatar" aria-hidden="true">{profile.name.slice(0, 1).toLocaleUpperCase("de") || "?"}</span><h2>{profile.name ? "Zeig, was dich begeistert." : "Ein Gesicht zur Begegnung."}</h2><p>{profile.bio || "Ein Name und ein paar Interessen machen den ersten Schritt leichter."}</p>{profile.interests.length > 0 && <div className="profile-interest-tags">{profile.interests.map(i => <span key={i}>{i}</span>)}</div>}<a href="#profile" className="text-link">{profile.name ? "Mein Profil bearbeiten" : "Stell dich kurz vor"}<ArrowRight size={16} /></a></section>
        <section className="companion-note"><Heart size={19} /><div><h3>Hier darfst du einfach du sein.</h3><p>Auch allein bist du willkommen. Begegnet euch respektvoll und trefft euch an öffentlichen Orten.</p><small>Beispielprofile · keine echten Kontakte</small></div></section></aside>
    </div>
  </>;
}
