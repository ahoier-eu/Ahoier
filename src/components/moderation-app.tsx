"use client";

/* Moderator media comes from authenticated private Storage downloads. */
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, EyeOff, RefreshCw, Shield, UserX } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { SOCIAL_MEDIA_BUCKET } from "@/lib/social-media";
import "./live-social.css";

type Report = {
  id: string; post_id: string | null; reply_id: string | null; story_id: string | null; message_id: string | null; profile_id: string | null; meetup_id: string | null;
  reporter_id: string; reason: string; details: string; target_voyage_id: string | null;
  target_author_id: string; target_body: string; target_photo_paths: string[]; created_at: string; status: string;
};

function ReviewPhoto({ path }: { path: string }) {
  const client = useMemo(() => supabaseBrowser(), []);
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    void client.storage.from(SOCIAL_MEDIA_BUCKET).download(path).then(({ data, error }) => {
      if (!active || error || !data) return;
      objectUrl = URL.createObjectURL(data);
      setUrl(objectUrl);
    });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [client, path]);
  return url ? <img src={url} alt="Gemeldetes Foto" /> : <span>Foto konnte nicht geladen werden.</span>;
}

export function ModerationApp() {
  const client = useMemo(() => supabaseBrowser(), []);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const { data: user, error: authError } = await client.auth.getUser();
        if (authError || !user.user) { if (active) setAllowed(false); return; }
        const status = await client.rpc("ahoier_is_moderator");
        if (status.error) throw status.error;
        if (!active) return;
        setAllowed(Boolean(status.data));
        if (!status.data) return;
        const result = await client.from("ahoier_reports")
          .select("*")
          .eq("status", "open").order("created_at", { ascending: true }).limit(100);
        if (result.error) throw result.error;
        if (active) setReports((result.data ?? []) as Report[]);
      } catch { if (active) setError("Die Moderationsmeldungen konnten nicht geladen werden."); }
      finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [client, version]);

  async function moderate(id: string, action: "dismiss" | "hide" | "suspend") {
    if (action === "suspend" && !window.confirm("Diesen Account für die gesamte Community sperren?")) return;
    setBusyId(id); setError("");
    const result = await client.rpc("ahoier_moderate_report", { p_report_id: id, p_action: action });
    if (result.error) setError("Die Moderationsentscheidung konnte nicht gespeichert werden.");
    else setVersion(current => current + 1);
    setBusyId("");
  }

  return <div className="social-live-app"><header className="social-live-header"><Link href="/" className="brand">ahoier<span className="brand-dot">.</span></Link><Link href="/community"><ArrowLeft size={16} /> Community</Link></header><main className="social-live-main social-moderation"><div className="social-page-head"><span className="social-eyebrow"><Shield size={15} /> NUR FÜR MODERATION</span><h1>Gemeldete Inhalte</h1><p>Es werden nur gemeldete Inhalte und ihre gespeicherten Beweise angezeigt.</p></div>{error && <p className="social-moderation-error" role="alert">{error}</p>}{loading ? <div className="social-panel social-center" role="status">Meldungen werden geladen …</div> : !allowed ? <div className="social-panel social-center" role="alert">Kein Moderationszugang.</div> : <><button type="button" className="social-secondary" onClick={() => setVersion(current => current + 1)}><RefreshCw size={16} /> Aktualisieren</button>{reports.length === 0 ? <div className="social-panel social-center">Keine offenen Meldungen.</div> : <div className="social-report-list">{reports.map(report => <article key={report.id} className="social-panel social-report-card"><div className="social-report-top"><strong>{report.profile_id ? "Profil" : report.message_id ? "Private Nachricht" : report.story_id ? "Story" : report.meetup_id ? "Treffen" : report.reply_id ? "Antwort" : "Beitrag"}</strong><span>{new Date(report.created_at).toLocaleString("de-DE")}</span></div><p><b>Grund:</b> {report.reason}</p>{report.details && <p><b>Hinweis:</b> {report.details}</p>}<blockquote>{report.target_body || "(Nur Foto)"}</blockquote>{report.target_photo_paths?.length > 0 && <div className="social-report-photos">{report.target_photo_paths.map(path => <ReviewPhoto key={path} path={path} />)}</div>}<details><summary>Technische Angaben</summary><small>Meldung {report.id}<br />Gemeldet von {report.reporter_id}<br />Autor {report.target_author_id}<br />Reise {report.target_voyage_id ?? "privater Kontakt"}</small></details><div className="social-report-actions"><button type="button" disabled={Boolean(busyId)} onClick={() => void moderate(report.id, "dismiss")}><Check size={15} /> Verwerfen</button>{!report.profile_id && <button type="button" disabled={Boolean(busyId)} onClick={() => void moderate(report.id, "hide")}><EyeOff size={15} /> Verbergen</button>}<button type="button" disabled={Boolean(busyId)} onClick={() => void moderate(report.id, "suspend")}><UserX size={15} /> Account sperren</button></div></article>)}</div>}</>}</main></div>;
}
