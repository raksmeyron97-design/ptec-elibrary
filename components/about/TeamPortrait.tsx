// components/about/TeamPortrait.tsx
//
// One portrait treatment, shared by the featured card, the directory card and
// the profile sheet — so a face cannot be cropped one way in the grid and
// another in the panel.
//
// It is a CIRCLE, and that is not decoration. The previous card put a 4:5
// image block across the top, which made the photograph the first and largest
// thing on the card, pushed the name underneath it, and turned a member with
// no published portrait into a tall empty rectangle that reads as a failed
// image load. A circle beside the name costs about a fifth of the height, puts
// the NAME first, and makes a missing portrait a small monogram rather than a
// hole.
//
// Two rules it encodes:
//
//   1. FULL COLOUR, always. This page exists to make a reader comfortable
//      walking up to a librarian and asking a question; a desaturated portrait
//      reads formal and distant. There is no grayscale variant to opt out of.
//   2. A missing portrait gets a monogram on the brand tint — never a broken
//      image icon, never a blank grey box. Initials come from the person's
//      name with honorifics removed, so "Mrs. PHENG AMPOR" is PA, not MP.
//
// The alt text is `photoAltText()`, which prefers the admin-authored alt and
// falls back to name + position. It is never empty: a portrait in a directory
// carries information (who this is), so it is not decorative.

"use client";

import { useState } from "react";
import Image from "next/image";
import { photoAltText, type PublicTeamMember } from "@/lib/team/public";
import { committeeInitials } from "@/lib/committee/public";

export default function TeamPortrait({
  member,
  sizes,
  priority = false,
  className = "",
}: {
  member: PublicTeamMember;
  /** Required when there IS a photo — `fill` images without it download a
   *  full-width source into a 5rem circle. */
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showPhoto = !!member.photo_url && !failed;

  return (
    <span className={`team-avatar ${className}`}>
      {showPhoto ? (
        <Image
          src={member.photo_url!}
          alt={photoAltText(member)}
          fill
          sizes={sizes}
          priority={priority}
          loading={priority ? undefined : "lazy"}
          // object-top: an institutional portrait is shot head-and-shoulders,
          // so a square crop taken from the centre lands on the chest.
          className="object-cover object-top"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="team-avatar__mark" aria-hidden="true">
          {committeeInitials(member) || "?"}
        </span>
      )}
    </span>
  );
}
