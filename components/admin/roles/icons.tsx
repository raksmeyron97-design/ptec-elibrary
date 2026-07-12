import {
  Library,
  Newspaper,
  Inbox,
  ShieldCheck,
  Minus,
  Eye,
  Pencil,
  Users,
  BookOpen,
  Shield,
  type LucideIcon,
} from "lucide-react";
import type { PermLevel } from "@/lib/types/roles";
import type { AppRole } from "@/lib/types/roles";

/** Icons for each sidebar-mirrored permission group. */
export const GROUP_ICON: Record<string, LucideIcon> = {
  library: Library,
  content: Newspaper,
  communication: Inbox,
  administration: ShieldCheck,
};

/** Icons for each permission level — paired with text so scanning never relies on colour alone. */
export const LEVEL_ICON: Record<PermLevel, LucideIcon> = {
  none: Minus,
  read: Eye,
  write: Pencil,
};

/** Small identity glyph per role, used on the overview cards. */
export const ROLE_ICON: Record<AppRole, LucideIcon> = {
  reader: BookOpen,
  staff: Newspaper,
  librarian: Library,
  admin: Users,
  super_admin: Shield,
};
