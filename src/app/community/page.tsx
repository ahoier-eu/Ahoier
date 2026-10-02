import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveSocialApp } from "@/components/live-social-app";

export const metadata: Metadata = { title: "Community an Bord — Ahoier", robots: { index: false, follow: false } };

export default function CommunityPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) notFound();
  return <LiveSocialApp />;
}
