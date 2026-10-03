"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Camera, Heart, MessageCircle, Plus, Search, Ship, UserPlus } from "lucide-react";
import { DEMO_PEOPLE, SELF, TRAVEL_GROUP_LABELS, type DemoDirectMessage, type DemoPerson, type DemoStory, type Meeting, type Post, type Profile } from "@/lib/community";
import { dateLabel } from "@/lib/journey";
import { SHIP_PHOTOS } from "@/lib/ships";
import { DemoMediaImage } from "./demo-media-image";

const DEMO_PORTRAIT = "/demo-social/mara-portrait.webp";
const DEMO_COFFEE = "/demo-social/friends-coffee.webp";
export function demoPersonPhoto(id: string) { return id === "demo-mira" ? DEMO_PORTRAIT : undefined; }
export const demoCoffeePhoto = DEMO_COFFEE;

export function DemoAvatar({ name, photo, size = "normal" }: { name: string; photo?: string; size?: "normal" | "large" }) {
  return <span className={`social-avatar demo-avatar ${size === "large" ? "demo-avatar-large" : ""}`} data-tone={Array.from(name).reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 5} aria-label={name}>
    {photo ? <DemoMediaImage key={photo} source={photo} alt="" className="demo-avatar-image" /> : name.slice(0, 1).toLocaleUpperCase("de") || "?"}
  </span>;
}

export function DemoStoryStrip({ stories, add, open, profile }: { stories: DemoStory[]; add: () => void; open: (story: DemoStory) => void; profile: Profile }) {
  return <section className="demo-stories" aria-label="Stories in der lokalen Vorschau">
    <div className="demo-section-head"><div><span className="eyebrow">DEINE STORY: 24 STUNDEN SICHTBAR</span><h2>Momente an Bord</h2></div><span className="demo-pill">BEISPIEL-STORIES</span></div>
    <div className="demo-stories-row">
      <button className="demo-story-add" onClick={add} type="button" aria-label="Deinen lokalen Moment hinzufügen"><span className="demo-story-image"><DemoAvatar name={profile.name || "Du"} photo={profile.photo} /><span className="demo-story-plus"><Plus size={17} /></span></span><strong>Dein Moment</strong><small>Nur lokal</small></button>
      {stories.map((story, index) => <button type="button" onClick={() => open(story)} key={story.id} className="demo-story-card" aria-label={`Story von ${story.author === SELF ? "dir" : story.name} öffnen: ${story.demo ? "erfundenes Beispiel" : "lokal gespeichert"}`}>
        <span className="demo-story-image"><DemoMediaImage source={story.photo} alt="" className="demo-story-photo" eager={index === 0} /></span>
        <strong>{story.author === SELF ? "Deine Story" : story.id === "demo-story-ship" ? "An Deck" : story.id === "demo-story-coffee" ? "Kaffee" : story.name}</strong>
        <small>{story.demo ? "Erfunden" : "Nur lokal"}</small>
      </button>)}
    </div>
  </section>;
}

export function DemoWall({ ship, from, to, profile, stories, posts, meetings, renderPost, openPost, openMeeting, openStory, addStory, openPeople, openMeetings }: {
  ship: string; from: string; to: string; profile: Profile; stories: DemoStory[]; posts: Post[]; meetings: Meeting[];
  renderPost: (post: Post) => ReactNode; openPost: () => void; openMeeting: () => void; openStory: (story: DemoStory) => void; addStory: () => void; openPeople: () => void; openMeetings: () => void;
}) {
  const featured = posts.find(post => post.id === "demo-tip");
  const wallPosts = featured ? [...posts.filter(post => !post.demo), featured, ...posts.filter(post => post.demo && post.id !== featured.id)] : posts;
  return <div className="demo-wall">
    <header className="demo-wall-header"><div className="demo-voyage-cover">{SHIP_PHOTOS[ship] && <DemoMediaImage source={SHIP_PHOTOS[ship]} alt="" eager className="demo-voyage-photo" />}<div className="demo-voyage-cover-copy"><span className="demo-cover-kicker"><Ship size={15} /> DEINE REISEGRUPPE · VORSCHAU</span><div><h1>{ship}</h1><p>Deine Reise. Deine Leute.</p><small>{dateLabel(from)} – {dateLabel(to)}</small></div></div></div></header>
    <button type="button" className="demo-wall-people-link" onClick={openPeople}><span className="demo-wall-face-stack"><DemoAvatar name="Mira" photo={DEMO_PORTRAIT} /><DemoAvatar name="Lena" /><DemoAvatar name="Ben" /></span><span><strong>Menschen an Bord entdecken</strong><small>20 erfundene Beispielprofile · keine echten Gäste</small></span><ArrowRight size={17} aria-hidden="true" /></button>
    <div className="demo-wall-layout"><div className="demo-wall-main">
      <DemoStoryStrip stories={stories} add={addStory} open={openStory} profile={profile} />
      <div className="demo-wall-composer"><DemoAvatar name={profile.name || "Du"} photo={profile.photo} /><button type="button" onClick={openPost}>Was möchtest du mit deinen Mitreisenden teilen?</button><button className="demo-composer-photo" type="button" onClick={openPost} aria-label="Beitrag mit Fotos erstellen"><Camera size={20} /></button></div>
      <div className="demo-section-head demo-feed-head"><div><span className="eyebrow">NEUE GESPRÄCHE</span><h2>Die Pinnwand</h2></div><span className="demo-pill">BEISPIEL + LOKAL</span></div>
      <div className="social-feed">{wallPosts.map(renderPost)}{!wallPosts.length && <div className="social-empty"><p>Hier ist Platz für deinen ersten Beitrag.</p><button className="primary-button" onClick={openPost}>Beitrag schreiben</button></div>}</div>
    </div><aside className="demo-wall-side">
      <section className="demo-side-card"><div className="demo-section-head"><div><span className="eyebrow">MENSCHEN ENTDECKEN</span><h2>Wer ist dabei?</h2></div></div><p>20 erfundene Beispielprofile zeigen, wie eine Reisegemeinschaft aussehen könnte.</p><div className="demo-side-faces">{DEMO_PEOPLE.slice(0, 8).map(person => <DemoAvatar key={person.id} name={person.name} photo={demoPersonPhoto(person.id)} />)}</div><button className="text-link" onClick={openPeople}>Beispielprofile ansehen <ArrowRight size={16} /></button></section>
      <section className="demo-side-card"><div className="demo-section-head"><div><span className="eyebrow">GEMEINSAM AN BORD</span><h2>Kleine Treffen</h2></div></div>{meetings.slice(0, 2).map(meeting => <div className="demo-side-meeting" key={meeting.id}><strong>{meeting.title}</strong><small>{meeting.demo ? "Beispieltreffen" : "Dein lokales Treffen"} · {dateLabel(meeting.date)}</small></div>)}<button className="text-link" onClick={openMeetings}>Alle Treffen <ArrowRight size={16} /></button><button className="secondary-button demo-side-create" onClick={openMeeting}><Plus size={15} /> Treffen vorschlagen</button></section>
      <p className="demo-side-footnote"><Heart size={15} /> Keine echten Personen oder Aktivitäten. Deine Eingaben bleiben in diesem Browser.</p>
    </aside></div>
  </div>;
}

type DemoPeopleProps = {
  ship: string; profile: Profile; stories: DemoStory[]; openStory: (story: DemoStory) => void;
  friends: string[]; requests: string[]; blocked: string[];
  onRequest: (id: string) => void; onAccept: (id: string) => void; onRemove: (id: string) => void; onMessage: (id: string) => void; onBlock: (id: string) => void;
};

function DemoPersonActions({ person, friends, requests, onRequest, onAccept, onRemove, onMessage, onBlock }: Pick<DemoPeopleProps, "friends" | "requests" | "onRequest" | "onAccept" | "onRemove" | "onMessage" | "onBlock"> & { person: DemoPerson }) {
  const friend = friends.includes(person.id);
  const requested = requests.includes(person.id);
  return <><div className="demo-person-actions">{friend ? <><button type="button" className="primary-button" onClick={() => onMessage(person.id)}><MessageCircle size={16} /> Lokalen Chat öffnen</button><button type="button" className="text-link" onClick={() => onRemove(person.id)}>Freundschaft entfernen</button></> : requested ? <><button type="button" className="primary-button" onClick={() => onAccept(person.id)}>Annahme simulieren</button><button type="button" className="text-link" onClick={() => onRemove(person.id)}>Anfrage zurücknehmen</button></> : <button type="button" className="primary-button" onClick={() => onRequest(person.id)}><UserPlus size={17} /> Freundschaft anfragen</button>}<button type="button" className="text-link demo-block-link" onClick={() => onBlock(person.id)}>Profil ausblenden</button></div>
    <small className="demo-person-note">{friend ? "Beispiel-Freundschaft · Chat nur in diesem Browser" : requested ? "Anfrage nicht versendet. Die Annahme kannst du selbst simulieren." : "Private Nachrichten erst nach angenommener Freundschaft. Alles nur lokal."}</small></>;
}

export function DemoPeople({ ship, profile, stories, openStory, friends, requests, blocked, onRequest, onAccept, onRemove, onMessage, onBlock }: DemoPeopleProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const visiblePeople = DEMO_PEOPLE.filter(person => !blocked.includes(person.id));
  const selected = visiblePeople.find(person => person.id === selectedId);
  const people = visiblePeople.filter(person => `${person.name} ${person.intro} ${person.interests.join(" ")}`.toLocaleLowerCase("de").includes(query.toLocaleLowerCase("de")));
  const blockAndClose = (id: string) => { onBlock(id); setSelectedId(null); };
  const openProfile = (id: string) => { setSelectedId(id); window.scrollTo({ top: 0, behavior: "instant" }); };

  if (selected) {
    const moments = stories.filter(story => story.author === selected.id);
    return <section className="demo-guest-profile" aria-labelledby="demo-guest-name">
      <div className="demo-guest-topline"><button type="button" className="demo-guest-back" onClick={() => setSelectedId(null)}><ArrowLeft size={18} /> Leute</button><span>Gastprofil · Vorschau</span></div>
      <div className="demo-guest-cover">{SHIP_PHOTOS[ship] && <DemoMediaImage source={SHIP_PHOTOS[ship]} alt="" eager />}<span>{ship} · Beispiel-Reisegruppe</span></div>
      <div className="demo-guest-identity"><DemoAvatar name={selected.name} photo={demoPersonPhoto(selected.id)} size="large" /><h1 id="demo-guest-name">{selected.name}</h1><p>Beispielprofil in deiner {ship}-Vorschau</p><span className="demo-pill">ERFUNDENE PERSON · KEIN ECHTER GAST</span><DemoPersonActions person={selected} friends={friends} requests={requests} onRequest={onRequest} onAccept={onAccept} onRemove={onRemove} onMessage={onMessage} onBlock={blockAndClose} /></div>
      <section className="demo-guest-about"><h2>Ahoi, ich bin {selected.name}.</h2><p>{selected.intro}</p><div className="demo-person-interests">{selected.interests.map(interest => <span key={interest}>{interest}</span>)}</div><small>{TRAVEL_GROUP_LABELS[selected.travelGroup]} · Beispielangabe</small></section>
      {moments.length > 0 && <section className="demo-guest-moments"><div className="demo-section-head"><div><span className="eyebrow">NUR IN DER VORSCHAU</span><h2>Momente</h2></div><span className="demo-pill">BEISPIEL-MOMENTE</span></div><div className="demo-guest-moment-row">{moments.map(story => <button type="button" key={story.id} onClick={() => openStory(story)}><DemoMediaImage source={story.photo} alt="" /><span>{story.caption}</span></button>)}</div></section>}
      <p className="demo-people-disclaimer">Die Reiseauswahl bestätigt weder eine Buchung noch die Anwesenheit an Bord. Dieses Profil und alle gezeigten Momente sind erfunden.</p>
    </section>;
  }

  return <section className="demo-people-page"><div className="social-heading"><div><span className="eyebrow">MENSCHEN AN BORD</span><h1>Neue Leute<span>.</span></h1><p>20 erfundene Beispielprofile. Keine dieser Personen erhält Anfragen oder Nachrichten.</p></div></div>
    <label className="social-search demo-people-search"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Name oder Interesse suchen" aria-label="Beispielprofile durchsuchen" /></label>
    <div className="demo-people-directory">{people.map(person => <article className="demo-person-card" key={person.id}>
      <DemoAvatar name={person.name} photo={demoPersonPhoto(person.id)} size="large" /><div className="demo-person-info"><div className="demo-person-title"><h2>{person.name}</h2><span className="demo-pill">BEISPIELPROFIL</span></div><small>{TRAVEL_GROUP_LABELS[person.travelGroup]}</small><p>{person.intro}</p><div className="demo-person-interests">{person.interests.map(interest => <span key={interest}>{interest}</span>)}</div>
        <button type="button" className="demo-view-profile" onClick={() => openProfile(person.id)}>Profil ansehen <ArrowRight size={15} /></button>
      </div>
    </article>)}{!people.length && <p className="social-empty">Keine passenden Beispielprofile.</p>}</div>
    <p className="demo-people-disclaimer">Dein Profil „{profile.name || "Gast"}“ und alle Aktionen hier sind lokale Vorschau. Die echte Community hat ihre eigenen Mitglieder.</p>
  </section>;
}

export function DemoDirectMessages({ friends, messages, selected, select, send }: {
  friends: string[]; messages: DemoDirectMessage[]; selected: string | null; select: (id: string) => void; send: (person: string, body: string) => boolean;
}) {
  const people = DEMO_PEOPLE.filter(person => friends.includes(person.id));
  const current = people.find(person => person.id === selected) ?? people[0];
  return <section className="demo-direct"><div className="demo-section-head"><div><span className="eyebrow">NUR IN DIESEM BROWSER</span><h2>Private Nachrichten</h2></div><span className="demo-pill">SIMULATION</span></div>
    <p>Ein Chat wird erst nach einer angenommenen Freundschaft geöffnet. Keine Beispielperson kann deine Nachricht lesen oder beantworten.</p>
    {!current ? <div className="social-empty"><MessageCircle size={30} /><p>Noch keine lokale Freundschaft. Entdecke Beispielprofile und simuliere die Annahme einer Anfrage.</p><a className="primary-button" href="#people">Menschen ansehen <ArrowRight size={16} /></a></div> : <div className="demo-direct-layout"><nav aria-label="Lokale Unterhaltungen">{people.map(person => <button type="button" key={person.id} onClick={() => select(person.id)} aria-current={current.id === person.id ? "true" : undefined}><DemoAvatar name={person.name} /><span><strong>{person.name}</strong><small>Beispiel-Freundschaft</small></span></button>)}</nav><div className="demo-direct-chat"><header><DemoAvatar name={current.name} /><div><strong>{current.name}</strong><small>Erfundene Person · lokale Simulation</small></div></header><div className="demo-direct-log" role="log" aria-label={`Lokaler Chat mit ${current.name}`}>
      {messages.filter(message => message.person === current.id).map(message => <div className={`demo-direct-bubble ${message.from === "self" ? "own" : ""}`} key={message.id}><p>{message.body}</p><small>{message.demo ? "Beispielnachricht" : "Deine lokale Nachricht"}</small></div>)}
      {!messages.some(message => message.person === current.id) && <p className="demo-chat-empty">Noch keine Nachrichten. Diese Vorschau sendet niemandem etwas.</p>}
    </div><form onSubmit={event => { event.preventDefault(); const input = event.currentTarget.elements.namedItem("body") as HTMLInputElement; const body = input.value.trim(); if (body && send(current.id, body)) event.currentTarget.reset(); }}><label className="sr-only" htmlFor="demo-dm-body">Nachricht</label><input id="demo-dm-body" name="body" maxLength={1000} required placeholder="Nachricht nur lokal speichern …" /><button className="primary-button" type="submit">Speichern</button></form></div></div>}
  </section>;
}

export function demoSampleStory(ship: string, from: string): DemoStory {
  return { id: "demo-story-ship", author: "demo-lena", name: "Lena", caption: "Beispiel: Ein neuer Tag, ein neues Ahoi an Bord.", photo: SHIP_PHOTOS[ship] ?? "/ships/aidacosma.jpg", created: `${from}T09:00:00`, expires: "9999-12-31T00:00:00.000Z", demo: true };
}

export function demoSampleStories(ship: string, from: string): DemoStory[] {
  return [
    { id: "demo-story-portrait", author: "demo-mira", name: "Mira", caption: "Beispiel: Ahoi von Mira!", photo: DEMO_PORTRAIT, created: `${from}T09:00:00`, expires: "9999-12-31T00:00:00.000Z", demo: true },
    demoSampleStory(ship, from),
    { id: "demo-story-coffee", author: "demo-mira", name: "Mira", caption: "Beispiel: Kaffee und neue Gespräche an Deck.", photo: DEMO_COFFEE, created: `${from}T10:00:00`, expires: "9999-12-31T00:00:00.000Z", demo: true },
  ];
}
