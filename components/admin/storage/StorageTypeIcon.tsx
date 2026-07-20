import { FileText, FileImage, File as FileIcon, FolderClosed } from "lucide-react";
import { fileKind } from "@/lib/admin/storage-shared";

export default function StorageTypeIcon({ type, extension, className = "h-4 w-4" }: { type: "file" | "folder"; extension?: string; className?: string }) {
  if (type === "folder") return <FolderClosed className={className} aria-hidden="true" />;
  const kind = fileKind(extension ?? "");
  if (kind === "pdf") return <FileText className={className} aria-hidden="true" />;
  if (kind === "image") return <FileImage className={className} aria-hidden="true" />;
  return <FileIcon className={className} aria-hidden="true" />;
}
