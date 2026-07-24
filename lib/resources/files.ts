// lib/resources/files.ts
//
// Typed read service for canonical resource files (migration 0106). Returns a
// resource's files with their storage-object metadata (provider, resolved URL,
// visibility, checksum), replacing the per-type book_files / publication_files
// / single-column shapes. Uses the anon+RLS client (resource_files is public
// only for published resources).
//
// IMPORTANT: this returns file METADATA and references, never bytes. Restricted
// downloads still flow through /api/books/[slug]/download, which is where
// signed URLs and access checks live. `url` here is the public CDN URL only
// when the storage object already resolves to one (Zima); a bare R2 key has a
// null url and must be signed at download time.

import { createClient } from "@/lib/supabase/server";
import type { ResourceType, FileRole } from "./types";

export type ResourceFileRef = {
  role: FileRole;
  isPrimary: boolean;
  format: string | null;
  locale: string | null;
  sequence: number;
  accessPolicy: "public" | "authenticated" | "restricted";
  provider: string;
  objectKey: string;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  visibility: string;
};

type Row = {
  file_role: FileRole;
  is_primary: boolean;
  file_format: string | null;
  locale: string | null;
  sequence: number;
  access_policy: "public" | "authenticated" | "restricted";
  storage_objects: {
    provider: string;
    object_key: string;
    url: string | null;
    mime_type: string | null;
    size_bytes: number | null;
    visibility: string;
  } | null;
};

export async function getResourceFiles(
  resourceType: ResourceType,
  resourceId: string,
): Promise<ResourceFileRef[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resource_files")
    .select(
      `file_role, is_primary, file_format, locale, sequence, access_policy,
       storage_objects:storage_object_id ( provider, object_key, url, mime_type, size_bytes, visibility )`,
    )
    .eq("resource_type", resourceType)
    .eq("resource_id", resourceId)
    .order("file_role", { ascending: true })
    .order("sequence", { ascending: true });

  if (error || !data) return [];

  return (data as unknown as Row[])
    .filter((row) => row.storage_objects != null)
    .map((row) => ({
      role: row.file_role,
      isPrimary: row.is_primary,
      format: row.file_format,
      locale: row.locale,
      sequence: row.sequence,
      accessPolicy: row.access_policy,
      provider: row.storage_objects!.provider,
      objectKey: row.storage_objects!.object_key,
      url: row.storage_objects!.url,
      mimeType: row.storage_objects!.mime_type,
      sizeBytes: row.storage_objects!.size_bytes,
      visibility: row.storage_objects!.visibility,
    }));
}

/** The primary PDF reference, if any (role primary_pdf + is_primary). */
export function primaryPdf(files: ResourceFileRef[]): ResourceFileRef | null {
  return files.find((f) => f.role === "primary_pdf" && f.isPrimary) ?? null;
}

/** The cover reference, if any. */
export function coverFile(files: ResourceFileRef[]): ResourceFileRef | null {
  return files.find((f) => f.role === "cover") ?? null;
}
