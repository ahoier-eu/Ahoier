"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { ArrowRight, Compass, Mail, Ship, Waves } from "lucide-react";
import { dateLabel } from "@/lib/journey";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { LiveSocialWorkspace, type SocialProfile, type SocialVoyage } from "./live-social-workspace";
import "./live-social.css";

function voyageLabel(voyage: SocialVoyage) {
  return `${voyage.ship} · ${dateLabel(voyage.starts_on, { year: "numeric" })} – ${dateLabel(voyage.ends_on, { year: "numeric" })}`;
}

export function LiveSocialApp() {
  const client = useMemo(() => supabaseBrowser(), []);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [voyages, setVoyages] = useState<SocialVoyage[]>([]);
  const [joinedIds, setJoinedIds] = useState<string[]>([]);
  const [voyageId, setVoyageId] = useState("");
  const [loadedUserId, setLoadedUserId] = useState("");
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lastUserId = useRef<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    let changed = false;
    const adopt = (next: User | null) => {
      if (!active) return;
      if (lastUserId.current !== next?.id) {
        lastUserId.current = next?.id;
        setProfile(null); setVoyages([]); setJoinedIds([]); setVoyageId(""); setLoadedUserId("");
        setError(""); setNotice("");
      }
      setUser(next); setAuthReady(true);
    };
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      changed = true;
      adopt(session?.user ?? null);
    });
    void client.auth.getSession().then(async ({ data }) => {
      if (!active || changed) return;
      if (!data.session) { adopt(null); return; }
      const result = await client.auth.getUser();
      if (!active || changed) return;
      adopt(result.data.user);
      if (result.error) setError("Die Anmeldung konnte nicht geprüft werden.");
    }).catch(() => { if (active && !changed) adopt(null); });
    return () => { active = false; subscription.unsubscribe(); };
  }, [client]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = async () => {
      const [p, m, v] = await Promise.all([
        client.rpc("ahoier_my_profile").maybeSingle(),
        client.from("ahoier_memberships").select("voyage_id").eq("user_id", user.id),
        client.from("ahoier_voyages").select("id,ship,starts_on,ends_on").order("starts_on", { ascending: false }),
      ]);
      if (!active) return;
      if (p.error || m.error || v.error) {
        setError("Deine Daten konnten nicht geladen werden. Bitte versuche es erneut.");
        setLoadedUserId("");
        return;
      }
      const nextVoyages = (v.data ?? []) as SocialVoyage[];
      const nextJoined = (m.data ?? []).map(row => row.voyage_id as string);
      setProfile(p.data as SocialProfile | null);
      setVoyages(nextVoyages);
      setJoinedIds(nextJoined);
      setVoyageId(current => nextJoined.includes(current) ? current : nextJoined[0] ?? "");
      setLoadedUserId(user.id);
      setError("");
    };
    void load();
    return () => { active = false; };
  }, [client, user, version]);

  async function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const { error: authError } = await client.auth.signInWithOtp({
        email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/community` },
      });
      if (authError) throw authError;
      setNotice("Anmeldelink gesendet. Öffne deine E-Mail und folge dem Link.");
    } catch { setError("Der Anmeldelink konnte nicht gesendet werden."); }
    finally { setBusy(false); }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get("displayName") ?? profile?.display_name ?? "").trim();
    if (name.length < 2 || name.length > 40 || data.get("adult") !== "on") {
      setError("Bitte wähle einen Namen und bestätige, dass du mindestens 18 Jahre alt bist.");
      return;
    }
    setBusy(true); setError("");
    try {
      const changes = { display_name: name, adult_confirmed_at: new Date().toISOString() };
      const result = profile
        ? await client.from("ahoier_profiles").update(changes).eq("user_id", user.id)
        : await client.from("ahoier_profiles").insert({ user_id: user.id, ...changes });
      if (result.error) throw result.error;
      setVersion(n => n + 1);
    } catch { setError("Das Profil konnte nicht gespeichert werden."); }
    finally { setBusy(false); }
  }

  async function joinVoyage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const id = String(new FormData(event.currentTarget).get("voyageId") ?? "");
    if (!voyages.some(v => v.id === id) || joinedIds.includes(id)) return;
    setBusy(true); setError("");
    try {
      const { error: joinError } = await client.from("ahoier_memberships").insert({ voyage_id: id, user_id: user.id });
      if (joinError) throw joinError;
      setVoyageId(id);
      setVersion(n => n + 1);
    } catch { setError("Die Reisegruppe konnte nicht geöffnet werden."); }
    finally { setBusy(false); }
  }

  const joinedVoyages = voyages.filter(v => joinedIds.includes(v.id));
  const unjoinedVoyages = voyages.filter(v => !joinedIds.includes(v.id));
  const selectedVoyage = joinedVoyages.find(v => v.id === voyageId);

  return <div className="social-live-app">
    <a className="skip-link" href="#social-main">Zum Inhalt</a>
    <header className="social-live-header"><Link href="/" className="brand" aria-label="Ahoier Startseite">ahoier<span className="brand-dot">.</span><Waves size={23} /></Link><nav aria-label="Hauptnavigation"><Link href="/reise"><Compass size={17} /> Reise</Link>{user && <button type="button" disabled={busy} onClick={() => void client.auth.signOut()}>Abmelden</button>}</nav></header>
    <main id="social-main" className="social-live-main">
      {!authReady ? <div className="social-panel social-center" role="status">Anmeldung wird geprüft …</div>
        : !user ? <section className="social-entry"><div><span className="social-eyebrow"><Ship size={16} /> DEINE COMMUNITY AN BORD</span><h1>Deine Reise. <em>Deine Leute.</em></h1><p>Teile Momente, stell Fragen und lerne Menschen auf deiner Reise kennen.</p><Link href="/demo" className="social-demo-link">Demo ansehen <ArrowRight size={16} /></Link></div><form className="social-panel social-entry-form" onSubmit={sendLink}><Mail size={28} /><h2>Willkommen an Bord</h2><p>Ein Anmeldelink kommt per E-Mail.</p><label htmlFor="social-email">E-Mail-Adresse</label><input id="social-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" maxLength={254} required placeholder="du@beispiel.de" /><button type="submit" disabled={busy} className="social-primary">Link senden <ArrowRight size={16} /></button><small>Der Link erstellt bei Bedarf ein Konto. Die Community ist für Erwachsene ab 18 Jahren.</small></form></section>
        : loadedUserId !== user.id ? <div className="social-panel social-center" role="status">Deine Community wird geladen … <button type="button" onClick={() => setVersion(n => n + 1)}>Erneut versuchen</button></div>
        : profile?.suspended_at ? <div className="social-panel social-center" role="alert"><h1>Dein Zugang ist eingeschränkt</h1><p>Du kannst die Community zurzeit nicht nutzen.</p></div>
        : !profile || !profile.adult_confirmed_at ? <section className="social-panel social-onboarding"><span className="social-eyebrow">DEIN PROFIL</span><h1>Wie sollen dich andere nennen?</h1><p>Dein Name erscheint in der Reisegruppe. Deine E-Mail-Adresse bleibt privat.</p><form onSubmit={saveProfile}><label htmlFor="social-name">Anzeigename</label><input id="social-name" name="displayName" defaultValue={profile?.display_name ?? ""} minLength={2} maxLength={40} autoComplete="nickname" required /><label className="social-checkbox"><input type="checkbox" name="adult" required /> Ich bin mindestens 18 Jahre alt.</label><button type="submit" className="social-primary" disabled={busy}>Weiter <ArrowRight size={16} /></button></form><small>Diese Bestätigung ist eine eigene Erklärung und keine Altersprüfung.</small></section>
        : !selectedVoyage ? <section className="social-panel social-onboarding"><span className="social-eyebrow">DEINE REISE</span><h1>{voyages.length ? "Wähle deine Reise" : "Noch keine Reise verfügbar"}</h1><p>Eine Reisegruppe ist für angemeldete Erwachsene offen. Die Auswahl bestätigt keine Buchung oder Anwesenheit an Bord.</p>{voyages.length > 0 && <form onSubmit={joinVoyage}><label htmlFor="social-voyage">Schiff und Zeitraum</label><select id="social-voyage" name="voyageId" required defaultValue=""><option value="" disabled>Reise auswählen</option>{unjoinedVoyages.map(v => <option key={v.id} value={v.id}>{voyageLabel(v)}</option>)}</select><button className="social-primary" disabled={busy} type="submit">Reisegruppe öffnen <ArrowRight size={16} /></button></form>}</section>
        : <LiveSocialWorkspace key={`${user.id}:${voyageId}`} client={client} userId={user.id} profile={profile} voyage={selectedVoyage} voyages={joinedVoyages} onVoyageChange={setVoyageId} unjoinedVoyages={unjoinedVoyages} onJoinVoyage={joinVoyage} onProfileChanged={() => setVersion(n => n + 1)} />}
      {(error || notice) && <div className={`social-toast ${error ? "is-error" : ""}`} role={error ? "alert" : "status"}>{error || notice}<button type="button" onClick={() => { setError(""); setNotice(""); }} aria-label="Hinweis schließen">×</button></div>}
    </main>
    <footer className="social-live-footer">Ahoier ist unabhängig und kein AIDA-Dienst. Die Reiseauswahl bestätigt weder Buchung noch Identität.</footer>
  </div>;
}
