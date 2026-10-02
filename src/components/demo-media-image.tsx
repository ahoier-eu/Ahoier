"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { getDemoImage } from "@/lib/demo-media";

export function DemoMediaImage({ source, alt, className = "", eager = false }: { source: string; alt: string; className?: string; eager?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!source.startsWith("demo-media:")) return;
    let active = true;
    let objectUrl: string | null = null;
    getDemoImage(source).then(blob => {
      if (!active || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => {});
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [source]);
  if (source.startsWith("demo-media:") && !url) return <span className={`demo-media-missing ${className}`} role="img" aria-label="Bild in diesem Browser nicht verfügbar" />;
  return <Image src={url ?? source} alt={alt} className={className} width={900} height={600} loading={eager ? "eager" : "lazy"} unoptimized />;
}
