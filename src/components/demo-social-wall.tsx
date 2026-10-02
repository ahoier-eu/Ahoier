"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, Camera, Heart, MessageCircle, Plus, Search, Ship, Users } from "lucide-react";
import { DEMO_PEOPLE, SELF, TRAVEL_GROUP_LABELS, type DemoDirectMessage, type DemoPerson, type DemoStory, type Meeting, type Post, type Profile } from "@/lib/community";
import { dateLabel } from "@/lib/journey";
import { SHIP_PHOTOS } from "@/lib/ships";
import { DemoMediaImage } from "./demo-media-image";

export function DemoAvatar({ name, photo, size = "normal" }: { name: string; photo?: string; size?: "normal" | "large" }) {
  return <span className={`social-avatar demo-avatar ${size === "large" ? "demo-avatar-large" : ""}`} data-tone={Array.from(name).reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 5} aria-label={name}>
    {photo ? <DemoMediaImage key={photo} source={photo} alt="" className="demo-avatar-image" /> : name.slice(0, 1).toLocaleUpperCase("de") || "?"}
  </span>;
}

export function DemoStoryStrip({ stories, add, open, profile }: { stories: DemoStory[]; add: () => void; open: (story: DemoStory) => void; profile: Profile }) {
  return <section className="demo-stories" aria-label="Stories in der lokalen Vorschau">
    <div className="demo-section-head"><div><span className="eyebrow">MOMENTE AN BORD</span><h2>Stories</h2></div><span className="demo-pill">BEISPIELE + LOKALE ENTWÜRFE</span></div>
    <div className="demo-stories-row">
      <button className="demo-story-add" onClick={add} type="button"><DemoAvatar name={profile.name || "Du"} photo={profile.photo} /><span><Plus size={16} /> Dein Moment</span><small>Nur auf diesem Gerät</small></button>
      {stories.map((story, index) => <button type="button" onClick={() => open(story)} key={story.id} className="demo-story-card">
        <DemoMediaImage source={story.photo} alt="" className="demo-story-photo" eager={index === 0} />
        <span className="demo-story-gradient" aria-hidden="true" />
        <span className="demo-story-owner"><DemoAvatar name={story.name} photo={story.author === SELF ? profile.photo : undefined} /><strong>{story.author === SELF ? "Deine Story" : story.name}</strong></span>
        <small>{story.demo ? "Beispiel · erfunden" : "Lokal · 24 Stunden"}</small>
      </button>)}
    </div>
  </section>;
}

export function DemoWall({ ship, from, to, profile, stories, posts, meetings, renderPost, openPost, openMeeting, openStory, addStory, openPeople, openMeetings }: {
  ship: string; from: string; to: string; profile: Profile; stories: DemoStory[]; posts: Post[]; meetings: Meeting[];
  renderPost: (post: Post) => ReactNode; openPost: () => void; openMeeting: () => void; openStory: (story: DemoStory) => void; addStory: () => void; openPeople: () => void; openMeetings: () => void;
}) {
  return <div className="demo-wall">
    <header className="demo-wall-header"><div className="demo-voyage-chip"><Ship size={18} /><span>{ship} · {dateLabel(from)} – {dateLabel(to)}</span></div><h1>Deine Reise. <em>Deine Leute.</em></h1><p>Ein Blick auf die Menschen und Gespräche an Bord. Alle gezeigten Gäste sind erfunden.</p><button type="button" className="demo-wall-meeting-link" onClick={openMeetings}>Treffen ansehen <ArrowRight size={15} /></button></header>
    <div className="demo-wall-layout"><div className="demo-wall-main">
      <DemoStoryStrip stories={stories} add={addStory} open={openStory} profile={profile} />
      <div className="demo-wall-composer"><DemoAvatar name={profile.name || "Du"} photo={profile.photo} /><button type="button" onClick={openPost}>Was möchtest du mit deinen Mitreisenden teilen?</button><button className="demo-composer-photo" type="button" onClick={openPost} aria-label="Beitrag mit Fotos erstellen"><Camera size={20} /></button></div>
      <div className="demo-section-head demo-feed-head"><div><span className="eyebrow">DEINE REISEGEMEINSCHAFT</span><h2>Die Pinnwand an Bord</h2></div><span className="demo-pill">BEISPIEL + LOKAL</span></div>
      <div className="social-feed">{posts.map(renderPost)}{!posts.length && <div className="social-empty"><p>Hier ist Platz für deinen ersten Beitrag.</p><button className="primary-button" onClick={openPost}>Beitrag schreiben</button></div>}</div>
    </div><aside className="demo-wall-side">
      <section className="demo-side-card"><div className="demo-section-head"><div><span className="eyebrow">MENSCHEN ENTDECKEN</span><h2>Wer ist dabei?</h2></div></div><p>20 erfundene Beispielprofile zeigen, wie eine Reisegemeinschaft aussehen könnte.</p><div className="demo-side-faces">{DEMO_PEOPLE.slice(0, 8).map(person => <DemoAvatar key={person.id} name={person.name} />)}</div><button className="text-link" onClick={openPeople}>Beispielprofile ansehen <ArrowRight size={16} /></button></section>
      <section className="demo-side-card"><div className="demo-section-head"><div><span className="eyebrow">GEMEINSAM AN BORD</span><h2>Kleine Treffen</h2></div></div>{meetings.slice(0, 2).map(meeting => <div className="demo-side-meeting" key={meeting.id}><strong>{meeting.title}</strong><small>{meeting.demo ? "Beispieltreffen" : "Dein lokales Treffen"} · {dateLabel(meeting.date)}</small></div>)}<button className="text-link" onClick={openMeetings}>Alle Treffen <ArrowRight size={16} /></button><button className="secondary-button demo-side-create" onClick={openMeeting}><Plus size={15} /> Treffen vorschlagen</button></section>
      <p className="demo-side-footnote"><Heart size={15} /> Keine echten Personen oder Aktivitäten. Deine Eingaben bleiben in diesem Browser.</p>
    </aside></div>
  </div>;
}

export function DemoPeople({ profile, friends, requests, blocked, onRequest, onAccept, onRemove, onMessage, onBlock }: {
  profile: Profile; friends: string[]; requests: string[]; blocked: string[];
  onRequest: (id: string) => void; onAccept: (id: string) => void; onRemove: (id: string) => void; onMessage: (id: string) => void; onBlock: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const people = DEMO_PEOPLE.filter(person => !blocked.includes(person.id) && `${person.name} ${person.intro} ${person.interests.join(" ")}`.toLocaleLowerCase("de").includes(query.toLocaleLowerCase("de")));
  return <section className="demo-people-page"><div className="social-heading"><div><span className="eyebrow">MENSCHEN AN BORD</span><h1>Neue Leute<span>.</span></h1><p>20 erfundene Beispielprofile. Keine dieser Personen erhält Anfragen oder Nachrichten.</p></div></div>
    <label className="social-search demo-people-search"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Name oder Interesse suchen" aria-label="Beispielprofile durchsuchen" /></label>
    <div className="demo-people-directory">{people.map((person: DemoPerson) => <article className="demo-person-card" key={person.id}>
      <DemoAvatar name={person.name} size="large" /><div className="demo-person-info"><div className="demo-person-title"><h2>{person.name}</h2><span className="demo-pill">BEISPIELPROFIL</span></div><small>{TRAVEL_GROUP_LABELS[person.travelGroup]}</small><p>{person.intro}</p><div className="demo-person-interests">{person.interests.map(interest => <span key={interest}>{interest}</span>)}</div>
        <div className="demo-person-actions">{friends.includes(person.id) ? <><button className="primary-button" onClick={() => onMessage(person.id)}><MessageCircle size={15} /> Lokalen Chat öffnen</button><button className="text-link" onClick={() => onRemove(person.id)}>Freundschaft entfernen</button></> : requests.includes(person.id) ? <><button className="primary-button" onClick={() => onAccept(person.id)}>Annahme simulieren</button><button className="text-link" onClick={() => onRemove(person.id)}>Anfrage zurücknehmen</button></> : <button className="secondary-button" onClick={() => onRequest(person.id)}><Users size={15} /> Anfrage lokal vormerken</button>}<button className="text-link demo-block-link" onClick={() => onBlock(person.id)}>Ausblenden</button></div>
        {friends.includes(person.id) && <small className="demo-person-note">Beispiel-Freundschaft · nur in diesem Browser</small>}
        {requests.includes(person.id) && <small className="demo-person-note">Nicht versendet. Du kannst die Annahme selbst simulieren.</small>}
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
