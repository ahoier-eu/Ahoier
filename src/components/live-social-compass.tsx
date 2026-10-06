"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowRight, CalendarDays, Check, MapPin, MessageCircle, Plus } from "lucide-react";
import type { LiveSocialCompassChoice } from "@/lib/live-social-compass";
import type { SocialPost } from "./live-social-data";
import type { SocialMeetup } from "./live-social-meetups";
import styles from "./live-social-compass.module.css";

type Props = {
  choice: LiveSocialCompassChoice<SocialMeetup, SocialPost>;
  /** Pass the same clock value used to select the card, refreshed at least once a minute. */
  now: number;
  loading?: boolean;
  canCreateMeetup?: boolean;
  subjectName?: string;
  subjectAvatar?: ReactNode;
  questionImage?: ReactNode;
  onJoinMeetup: (id: string) => Promise<void>;
  onOpenMeetup: (id: string) => void;
  onOpenPost: (id: string) => void;
  onOpenCreateMeetup: () => void;
  onOpenQuestionComposer: () => void;
};

function dayInZone(instant: number, timeZone: string): string | null {
  if (!Number.isFinite(instant)) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date(instant));
    const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${fields.year}-${fields.month}-${fields.day}`;
  } catch { return null; }
}

function meetupTime(instant: string, timeZone: string): string | null {
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("de-DE", {
      timeZone, weekday: "short", day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(date);
  } catch { return null; }
}

function freeSpacesLabel(count: number): string {
  return count === 1 ? "1 Platz frei" : `${count} Plätze frei`;
}

export function LiveSocialCompass({
  choice, now, loading = false, canCreateMeetup = false, subjectName, subjectAvatar, questionImage,
  onJoinMeetup, onOpenMeetup, onOpenPost, onOpenCreateMeetup, onOpenQuestionComposer,
}: Props) {
  const titleId = useId();
  const [joiningId, setJoiningId] = useState("");
  const [joinedId, setJoinedId] = useState("");
  const [failedId, setFailedId] = useState("");
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (feedbackTimer.current !== null) clearTimeout(feedbackTimer.current); }, []);

  async function join(id: string) {
    if (joiningId || joinedId === id) return;
    setJoiningId(id);
    setFailedId("");
    try {
      await onJoinMeetup(id);
      setJoinedId(id);
      if (feedbackTimer.current !== null) clearTimeout(feedbackTimer.current);
      feedbackTimer.current = setTimeout(() => { setJoinedId(""); feedbackTimer.current = null; }, 4_000);
    } catch {
      setFailedId(id);
    } finally {
      setJoiningId("");
    }
  }

  if (loading) {
    return <section className={`${styles.card} ${styles.loading}`} aria-labelledby={titleId} aria-busy="true">
      <div className={styles.intro}><span className={styles.kicker}>GEMEINSAM ERLEBEN</span><h2 id={titleId}>Dein nächstes Ahoi</h2></div>
      <p role="status">Wir schauen, was in deiner Reisegruppe los ist …</p>
      <span className={styles.loadingLine} aria-hidden="true" />
    </section>;
  }

  if (choice.kind === "meetup") {
    const { meetup, spacesLeft } = choice;
    const joined = choice.participation === "joined" || joinedId === meetup.id;
    const today = dayInZone(Date.parse(meetup.starts_at), meetup.time_zone) === dayInZone(now, meetup.time_zone);
    const time = meetupTime(meetup.starts_at, meetup.time_zone);
    const status = joined ? "Ich bin dabei" : today ? "Heute" : freeSpacesLabel(spacesLeft);
    const organizer = subjectName || meetup.organizer_name;

    return <section className={`${styles.card} ${styles.meetup} ${joinedId === meetup.id ? styles.justJoined : ""}`} aria-labelledby={titleId}>
      <div className={styles.topline}>
        <span className={styles.kicker}>GEMEINSAM ERLEBEN</span>
        <span className={styles.symbol} aria-hidden="true"><CalendarDays size={22} strokeWidth={1.9} /></span>
      </div>
      <h2 id={titleId}>Dein nächstes Ahoi</h2>
      <div className={styles.badges}>
        <span className={styles.typeBadge}>Treffen</span>
        <span className={styles.statusBadge}>{joined && <Check size={13} aria-hidden="true" />}{status}</span>
      </div>
      <h3>{meetup.title}</h3>
      {meetup.description && <p className={styles.description}>{meetup.description}</p>}
      <div className={styles.details}>
        {time ? <p><CalendarDays size={16} aria-hidden="true" /><span>{time}<small>Zeitzone: {meetup.time_zone}</small></span></p> : <p><CalendarDays size={16} aria-hidden="true" /><span>Termin im Treffen ansehen</span></p>}
        <p><MapPin size={16} aria-hidden="true" /><span>{meetup.location_label}</span></p>
      </div>
      {organizer && <div className={styles.author}>{subjectAvatar && <span className={styles.avatar}>{subjectAvatar}</span>}<span>Vorgeschlagen von {organizer}</span></div>}
      {!joined && today && <p className={styles.spaces}>{freeSpacesLabel(spacesLeft)}</p>}
      {failedId === meetup.id && <p className={styles.error} role="alert">Die Anmeldung hat nicht geklappt. Bitte versuche es erneut.</p>}
      {joinedId === meetup.id && <p className={styles.success} role="status">Du bist für dieses Treffen angemeldet.</p>}
      <div className={styles.actions}>
        {joined
          ? <button type="button" className={styles.primary} onClick={() => onOpenMeetup(meetup.id)}>Treffen ansehen <ArrowRight size={17} aria-hidden="true" /></button>
          : <button type="button" className={styles.primary} disabled={Boolean(joiningId)} onClick={() => void join(meetup.id)}>{joiningId === meetup.id ? "Wird angemeldet …" : "Dabei sein"} <ArrowRight size={17} aria-hidden="true" /></button>}
        {!joined && <button type="button" className={styles.textButton} onClick={() => onOpenMeetup(meetup.id)}>Details ansehen</button>}
      </div>
    </section>;
  }

  if (choice.kind === "question") {
    return <section className={`${styles.card} ${styles.question}`} aria-labelledby={titleId}>
      <div className={styles.topline}>
        <span className={styles.kicker}>AUS DEINER REISEGRUPPE</span>
        <span className={styles.symbol} aria-hidden="true"><MessageCircle size={22} strokeWidth={1.9} /></span>
      </div>
      <h2 id={titleId}>Dein nächstes Ahoi</h2>
      <div className={styles.badges}><span className={styles.typeBadge}>Frage</span></div>
      <div className={questionImage ? styles.questionWithImage : undefined}>
        <div>
          <h3>{subjectName ? `${subjectName} fragt` : "Eine Frage aus deiner Reisegruppe"}</h3>
          {choice.post.body && <p className={styles.questionBody}>{choice.post.body}</p>}
          {subjectName && <div className={styles.author}>{subjectAvatar && <span className={styles.avatar}>{subjectAvatar}</span>}<span>{subjectName}</span></div>}
        </div>
        {questionImage && <div className={styles.questionImage}>{questionImage}</div>}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => onOpenPost(choice.post.id)}>Frage beantworten <ArrowRight size={17} aria-hidden="true" /></button>
      </div>
    </section>;
  }

  return <section className={`${styles.card} ${styles.empty}`} aria-labelledby={titleId}>
    <div className={styles.topline}>
      <span className={styles.kicker}>DEINE REISEGRUPPE</span>
      <span className={styles.symbol} aria-hidden="true"><Plus size={22} strokeWidth={1.9} /></span>
    </div>
    <h2 id={titleId}>Dein nächstes Ahoi</h2>
    <h3>Ein Ahoi macht den Anfang.</h3>
    <p className={styles.emptyCopy}>Hier ist gerade noch kein passendes Treffen und keine Frage sichtbar. Was möchtest du mit deiner Reisegruppe teilen?</p>
    <div className={styles.actions}>
      <button type="button" className={styles.primary} onClick={onOpenQuestionComposer}>Frage stellen <ArrowRight size={17} aria-hidden="true" /></button>
      {canCreateMeetup && <button type="button" className={styles.textButton} onClick={onOpenCreateMeetup}>Treffen vorschlagen</button>}
    </div>
  </section>;
}
