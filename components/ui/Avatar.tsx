"use client";
import { useState } from "react";

function getInitials(name: string | null, email: string): string {
  if (name) return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  return email.slice(0, 2).toUpperCase();
}

export default function Avatar({
  url,
  name,
  email,
  size = 32,
  className = "",
}: {
  url: string | null;
  name: string | null;
  email: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = !!url && !failed;

  return (
    <div
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.35)) }}
      className={`shrink-0 rounded-full overflow-hidden flex items-center justify-center bg-brand text-brand-contrast font-bold ${className}`}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        getInitials(name, email)
      )}
    </div>
  );
}
