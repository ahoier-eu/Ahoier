import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Compass, Mail, MessageCircle, Ship, Users, Waves } from "lucide-react";
import { SHIP_PHOTO_CREDITS, SHIP_PHOTOS } from "@/lib/ships";
import { DEMO_PEOPLE } from "@/lib/community";
import { DemoHashRedirect } from "@/components/demo-hash-redirect";
import "./landing.css";

export const metadata: Metadata = {
  title: "Ahoier — Deine Reise. Deine Leute.",
  description: "Ahoier verbindet AIDA-Gäste in offenen Reisegruppen für Fragen, Tipps und neue Bekanntschaften. Unabhängig von AIDA.",
};

export default function Home() {
  const liveEnabled = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const credit = SHIP_PHOTO_CREDITS.AIDAcosma;

  return <div className="landing-page">
    <DemoHashRedirect />
    <a className="skip-link" href="#landing-main">Zum Inhalt</a>
    <header className="landing-header">
      <Link href="/" className="brand" aria-label="Ahoier Startseite">ahoier<span className="brand-dot">.</span><Waves size={23} /></Link>
      <nav aria-label="Hauptnavigation">
        <Link href="/reise">Reise</Link>
        <Link href="/demo">Demo</Link>
        {liveEnabled && <Link className="landing-header-cta" href="/community">Community öffnen <ArrowRight size={16} /></Link>}
      </nav>
    </header>

    <main id="landing-main" className="landing-main">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-copy">
          <span className="landing-kicker"><Ship size={17} /> UNABHÄNGIG · FÜR AIDA GÄSTE</span>
          <h1 id="landing-title">Deine Reise.<br /><span>Deine Leute.</span></h1>
          <p>Stell Fragen, teile Tipps und lern Menschen in deiner Reisegruppe kennen.</p>
          <div className="landing-actions">
            <Link className="landing-primary" href={liveEnabled ? "/community" : "/demo"}>{liveEnabled ? "Zur Community" : "Demo ansehen"}<ArrowRight size={19} /></Link>
            {liveEnabled && <Link className="landing-secondary" href="/demo">Demo ansehen</Link>}
          </div>
          <p className="landing-access-note">{liveEnabled ? "Anmeldung per E-Mail · Reise auswählen · kein Code nötig" : "Die gemeinsame Community wird eingerichtet. Die Demo zeigt Beispielinhalte."}</p>
          <Link className="landing-demo-people" href="/demo">
            <span className="landing-demo-avatars" aria-hidden="true">{DEMO_PEOPLE.slice(0, 5).map((person, index) => <span key={person.id} data-tone={index % 5}>{person.name[0]}</span>)}</span>
            <span><strong>{DEMO_PEOPLE.length} Beispielprofile in der Demo</strong><small>Erfundene Personen · keine echten Gäste</small></span>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>

        <div className="landing-visual">
          <div className="landing-photo"><Image src={SHIP_PHOTOS.AIDAcosma} alt="AIDAcosma" fill priority sizes="(max-width: 840px) 100vw, 42vw" /></div>
          <div className="landing-feature-card" aria-label="Ahoier verbindet Gäste in ihrer Reisegruppe">
            <span>GEMEINSAM AN BORD</span>
            <strong>Ein Ahoi macht den Anfang.</strong>
            <div><span><MessageCircle size={16} /> Fragen</span><span><Compass size={16} /> Tipps</span><span><Users size={16} /> Kontakte</span></div>
          </div>
          <small className="landing-photo-credit">Foto: <a href={credit.source} target="_blank" rel="noopener noreferrer">{credit.author}</a> · <a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer">{credit.license}</a></small>
        </div>
      </section>

      <section className="landing-steps" aria-label="So funktioniert Ahoier">
        <div><span className="landing-step-icon"><Mail size={20} /></span><strong>1. Anmelden</strong><p>Ein Link per E-Mail bringt dich an Bord.</p></div>
        <div><span className="landing-step-icon"><Ship size={20} /></span><strong>2. Reise auswählen</strong><p>Wähle Schiff und Zeitraum aus der Liste.</p></div>
        <div><span className="landing-step-icon"><MessageCircle size={20} /></span><strong>3. Austauschen</strong><p>Fragen stellen, antworten und Tipps teilen.</p></div>
      </section>

      <footer className="landing-footer"><span>ahoier. Zusammen mehr Meer.</span><span>Ahoier ist unabhängig und kein AIDA-Dienst. Die <Link href="/demo">Demo</Link> enthält ausschließlich Beispielpersonen und Beispieldaten.</span></footer>
    </main>
  </div>;
}
