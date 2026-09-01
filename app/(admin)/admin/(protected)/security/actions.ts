"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { logAdminAction } from "@/app/actions/audit";
import { logSecurityEvent } from "@/lib/security-log";
import {
  canTransition,
  statusForAction,
  type IncidentStatus,
  type OperatorAction,
} from "@/lib/security/incident-policy";

/**
 * Operator actions on a security incident.
 *
 * ── Authorization ───────────────────────────────────────────────────────────
 * `requireAdmin()` — which also enforces MFA (AAL2) for every admin-panel role
 * and honours the emergency lockdown switch. That is the entire reason
 * incident control lives here and not in a Telegram bot: this surface already
 * has authentication, a second factor, per-role permissions and an audit
 * trail, and a chat message has none of them (decision D2).
 *
 * ── Audit ───────────────────────────────────────────────────────────────────
 * Every action writes to `admin_audit_log` (who, what, when, target, result)
 * AND emits a security event, so an operator silencing an incident is itself
 * visible in the security stream. The incident detail page reads the audit
 * rows back, so the response history sits beside the evidence.
 */

export type ActionResult = { success: boolean; error?: string };

/** Silence windows an operator can choose. Bounded on purpose: an indefinite
 *  mute is how an incident gets forgotten, and the catalog's hygiene rule 3
 *  says never mute a channel ad hoc. */
export const SILENCE_OPTIONS = [
  { minutes: 60, label: "1 hour" },
  { minutes: 240, label: "4 hours" },
  { minutes: 1440, label: "24 hours" },
] as const;

const MAX_SILENCE_MINUTES = 1440;
const MAX_NOTE_LENGTH = 500;

/** The service-role client `requireAdmin()` hands back. */
type AdminClient = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

async function loadIncident(supabase: AdminClient, reference: string) {
  const { data, error } = await supabase
    .from("security_incidents")
    .select("id,reference,status,severity,title")
    .eq("reference", reference)
    .maybeSingle();
  if (error || !data) return null;
  return data as { id: string; reference: string; status: IncidentStatus; severity: number; title: string };
}

async function transition(
  reference: string,
  action: Exclude<OperatorAction, "silence">,
  note?: string,
): Promise<ActionResult> {
  const { supabase, userId } = await requireAdmin();
  const incident = await loadIncident(supabase, reference);
  if (!incident) return { success: false, error: "Incident not found" };

  const next = statusForAction(action);
  if (!canTransition(incident.status, next)) {
    // The state machine is the authority, not the UI. A stale page must not be
    // able to push an incident backwards through its lifecycle.
    return {
      success: false,
      error: `Cannot move an incident from "${incident.status}" to "${next}".`,
    };
  }

  const cleanNote = note?.trim().slice(0, MAX_NOTE_LENGTH) || null;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: next };
  if (next === "acknowledged") {
    patch.acknowledged_at = now;
    patch.acknowledged_by = userId;
  }
  if (next === "closed") {
    patch.closed_at = now;
    if (cleanNote) patch.resolution = cleanNote;
  }

  const { error } = await supabase.from("security_incidents").update(patch).eq("id", incident.id);
  if (error) return { success: false, error: error.message };

  await logAdminAction(userId, `security_incident.${action}`, "security_incidents", incident.id, {
    reference: incident.reference,
    from: incident.status,
    to: next,
    ...(cleanNote ? { note: cleanNote } : {}),
  });

  logSecurityEvent({
    type: "privilege_change",
    where: "/admin/security/incidents",
    userId,
    actorType: "admin",
    target: incident.reference,
    result: "success",
    detail: `incident ${action}: ${incident.status} -> ${next}`,
    metadata: { incidentAction: action, reference: incident.reference, from: incident.status, to: next },
  });

  revalidatePath("/admin/security");
  revalidatePath("/admin/security/incidents");
  revalidatePath(`/admin/security/incidents/${reference}`);
  return { success: true };
}

export async function acknowledgeIncident(reference: string): Promise<ActionResult> {
  return transition(reference, "acknowledge");
}

export async function investigateIncident(reference: string): Promise<ActionResult> {
  return transition(reference, "investigate");
}

export async function mitigateIncident(reference: string): Promise<ActionResult> {
  return transition(reference, "mitigate");
}

export async function resolveIncident(reference: string, resolution?: string): Promise<ActionResult> {
  return transition(reference, "resolve", resolution);
}

/**
 * Suppress notifications for one incident for a bounded period.
 *
 * Silencing does NOT stop detection or recording: the incident keeps updating
 * and keeps collecting evidence, so nothing is lost and the window cannot hide
 * an escalation from the record. It only stops the phone buzzing while
 * somebody is already working the problem.
 */
export async function silenceIncident(
  reference: string,
  minutes: number,
): Promise<ActionResult> {
  const { supabase, userId } = await requireAdmin();
  const incident = await loadIncident(supabase, reference);
  if (!incident) return { success: false, error: "Incident not found" };

  const bounded = Math.min(Math.max(1, Math.floor(minutes)), MAX_SILENCE_MINUTES);
  const until = new Date(Date.now() + bounded * 60_000).toISOString();

  const { error } = await supabase
    .from("security_incidents")
    .update({ silenced_until: until })
    .eq("id", incident.id);
  if (error) return { success: false, error: error.message };

  await logAdminAction(userId, "security_incident.silence", "security_incidents", incident.id, {
    reference: incident.reference,
    minutes: bounded,
    until,
  });

  logSecurityEvent({
    type: "privilege_change",
    where: "/admin/security/incidents",
    userId,
    actorType: "admin",
    target: incident.reference,
    result: "success",
    detail: `incident silenced for ${bounded} minutes`,
    metadata: { incidentAction: "silence", reference: incident.reference, minutes: bounded },
  });

  revalidatePath("/admin/security");
  revalidatePath(`/admin/security/incidents/${reference}`);
  return { success: true };
}

export async function unsilenceIncident(reference: string): Promise<ActionResult> {
  const { supabase, userId } = await requireAdmin();
  const incident = await loadIncident(supabase, reference);
  if (!incident) return { success: false, error: "Incident not found" };

  const { error } = await supabase
    .from("security_incidents")
    .update({ silenced_until: null })
    .eq("id", incident.id);
  if (error) return { success: false, error: error.message };

  await logAdminAction(userId, "security_incident.unsilence", "security_incidents", incident.id, {
    reference: incident.reference,
  });
  revalidatePath(`/admin/security/incidents/${reference}`);
  return { success: true };
}
