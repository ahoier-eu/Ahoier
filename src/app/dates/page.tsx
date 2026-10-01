import type { Metadata } from "next";
import { DatesApp } from "@/components/dates-app";

export const metadata: Metadata = {
  title: "Ahoi Dates — Ahoier",
  description: "Freiwillige lokale Vorschau für Erwachsene, die an einem Date interessiert sind.",
};

export default function DatesPage() { return <DatesApp />; }
