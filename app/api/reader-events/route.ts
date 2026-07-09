import { NextResponse, type NextRequest } from "next/server";

const EVENT_TYPES = new Set([
  "pdf_load_error",
  "pdf_load_slow",
  "pdf_render_error",
  "broken_file_report",
]);

function cleanString(value: unknown, max = 240): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/[\r\n\t]+/g, " ").trim();
  return clean ? clean.slice(0, max) : undefined;
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = cleanString(body.type, 48);
  if (!type || !EVENT_TYPES.has(type)) {
    return NextResponse.json({ error: "Invalid event type" }, { status: 400 });
  }

  const event = {
    evt: "reader",
    type,
    bookId: cleanString(body.bookId, 80),
    file: cleanString(body.file, 180),
    page: typeof body.page === "number" && Number.isFinite(body.page) ? body.page : undefined,
    durationMs:
      typeof body.durationMs === "number" && Number.isFinite(body.durationMs)
        ? Math.round(body.durationMs)
        : undefined,
    message: cleanString(body.message),
    at: new Date().toISOString(),
  };

  console.warn("[reader-event]", JSON.stringify(event));
  return NextResponse.json({ ok: true });
}
