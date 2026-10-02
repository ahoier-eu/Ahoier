import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModerationApp } from "@/components/moderation-app";

export const metadata: Metadata = { title: "Moderation — Ahoier", robots: { index: false, follow: false } };

export default function ModerationPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) notFound();
  return <ModerationApp />;
}
