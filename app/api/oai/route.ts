// app/api/oai/route.ts
// OAI-PMH v2.0 endpoint (https://www.openarchives.org/OAI/openarchivesprotocol.html)
// so aggregators like BASE, CORE, and OpenAIRE can harvest the collection.
//
// Read-only and anonymous by design: it exposes only published, publicly
// licensed items (the license filter lives in lib/oai/records.ts). The two
// halves of the implementation are split like lib/seo/citation.ts:
//   lib/oai/xml.ts     — pure XML/DC/token builders (unit-tested)
//   lib/oai/records.ts — server-only Supabase fetch + row mapping
//
// Lists paginate with a stateless resumptionToken (base64url JSON of the
// original request args + offset) over a deterministic ordering
// (datestamp, setSpec, localId), so tokens stay valid across serverless
// instances with no token table.

import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { logSecurityEvent } from "@/lib/security-log";
import { SITE_URL } from "@/lib/seo/site";
import { getOrgIdentity, getSiteConfig } from "@/lib/system-settings/config";
import {
  OAI_METADATA_PREFIX,
  OAI_PAGE_SIZE,
  OAI_SETS,
  OaiError,
  buildErrorXml,
  buildHeader,
  buildOaiIdentifier,
  buildOaiPmhXml,
  buildRecordXml,
  buildRequestTag,
  buildResumptionTokenTag,
  decodeResumptionToken,
  encodeResumptionToken,
  escapeXml,
  isOaiDateTimeGranularity,
  oaiDomain,
  parseOaiDateArg,
  parseOaiIdentifier,
  type OaiSetSpec,
  type ResumptionState,
} from "@/lib/oai/xml";
import { computeEarliestDatestamp, fetchOaiRecords, getOaiRecord } from "@/lib/oai/records";

export const dynamic = "force-dynamic";

const BASE_URL = `${SITE_URL}/api/oai`;

const XML_HEADERS = { "Content-Type": "text/xml; charset=utf-8" } as const;

// Identify/ListMetadataFormats/ListSets are static-ish — let the CDN absorb
// validator re-probes. List/GetRecord responses stay uncached so an active
// harvest always sees live data.
const CACHEABLE_HEADERS = {
  ...XML_HEADERS,
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
} as const;

const VERB_ARGS: Record<string, { required: string[]; optional: string[] }> = {
  Identify: { required: [], optional: [] },
  ListMetadataFormats: { required: [], optional: ["identifier"] },
  ListSets: { required: [], optional: ["resumptionToken"] },
  GetRecord: { required: ["identifier", "metadataPrefix"], optional: [] },
  ListIdentifiers: { required: ["metadataPrefix"], optional: ["from", "until", "set"] },
  ListRecords: { required: ["metadataPrefix"], optional: ["from", "until", "set"] },
};

function getClientIP(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip")?.trim() ??
    req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ??
    "unknown"
  );
}

/** Extracts request args, rejecting any argument that appears more than once. */
function extractArgs(searchParams: URLSearchParams): Record<string, string> {
  const args: Record<string, string> = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    if (values.length > 1) throw new OaiError("badArgument", `Argument '${key}' appears more than once`);
    args[key] = values[0];
  }
  return args;
}

/** Validates the argument set for a verb per the OAI-PMH argument tables. */
function validateArgs(verb: string, args: Record<string, string>): void {
  const spec = VERB_ARGS[verb];
  const isListVerb = verb === "ListIdentifiers" || verb === "ListRecords";

  if (isListVerb && "resumptionToken" in args) {
    // resumptionToken is an exclusive argument.
    const extras = Object.keys(args).filter((k) => k !== "verb" && k !== "resumptionToken");
    if (extras.length > 0) {
      throw new OaiError("badArgument", `resumptionToken is exclusive; unexpected argument(s): ${extras.join(", ")}`);
    }
    return;
  }

  const legal = new Set(["verb", ...spec.required, ...spec.optional]);
  for (const key of Object.keys(args)) {
    if (!legal.has(key)) throw new OaiError("badArgument", `Illegal argument '${key}' for verb ${verb}`);
  }
  for (const key of spec.required) {
    if (!(key in args)) throw new OaiError("badArgument", `Missing required argument '${key}'`);
  }
}

function requireOaiDc(metadataPrefix: string): void {
  if (metadataPrefix !== OAI_METADATA_PREFIX) {
    throw new OaiError("cannotDisseminateFormat", `Metadata format '${metadataPrefix}' is not supported; only ${OAI_METADATA_PREFIX} is available`);
  }
}

interface ListFilters {
  metadataPrefix: string;
  from?: string;
  until?: string;
  set?: OaiSetSpec;
  offset: number;
}

/** Resolves list arguments (fresh request or resumption token) into validated filters. */
function resolveListFilters(verb: "ListIdentifiers" | "ListRecords", args: Record<string, string>): ListFilters {
  if ("resumptionToken" in args) {
    const state = decodeResumptionToken(args.resumptionToken);
    if (!state || state.verb !== verb) {
      throw new OaiError("badResumptionToken", "The resumptionToken is invalid or has expired");
    }
    return { metadataPrefix: state.metadataPrefix, from: state.from, until: state.until, set: state.set, offset: state.offset };
  }

  requireOaiDc(args.metadataPrefix);

  if (args.from && args.until && isOaiDateTimeGranularity(args.from) !== isOaiDateTimeGranularity(args.until)) {
    throw new OaiError("badArgument", "from and until must use the same granularity");
  }

  let set: OaiSetSpec | undefined;
  if (args.set !== undefined) {
    const known = OAI_SETS.find((s) => s.setSpec === args.set);
    // An unknown set matches nothing — per the spec that is noRecordsMatch,
    // not badArgument (the argument itself is well-formed).
    if (!known) throw new OaiError("noRecordsMatch", `Set '${args.set}' matches no records`);
    set = known.setSpec;
  }

  return { metadataPrefix: args.metadataPrefix, from: args.from, until: args.until, set, offset: 0 };
}

/** Parses the from/until strings of validated filters into Dates (throws badArgument). */
function parseDateRange(filters: ListFilters): { from?: Date; until?: Date } {
  let from: Date | undefined;
  let until: Date | undefined;
  if (filters.from !== undefined) {
    from = parseOaiDateArg(filters.from, "start") ?? undefined;
    if (!from) throw new OaiError("badArgument", `Illegal 'from' date: ${filters.from}`);
  }
  if (filters.until !== undefined) {
    until = parseOaiDateArg(filters.until, "end") ?? undefined;
    if (!until) throw new OaiError("badArgument", `Illegal 'until' date: ${filters.until}`);
  }
  if (from && until && from > until) {
    throw new OaiError("badArgument", "'from' must not be later than 'until'");
  }
  return { from, until };
}

// ── Verb handlers ────────────────────────────────────────────────────────

async function handleIdentify(): Promise<string> {
  const [earliest, cfg, org] = await Promise.all([
    computeEarliestDatestamp(),
    getSiteConfig(),
    getOrgIdentity(),
  ]);
  const domain = oaiDomain();
  return (
    "<Identify>" +
    `<repositoryName>${escapeXml(org.siteName)}</repositoryName>` +
    `<baseURL>${escapeXml(BASE_URL)}</baseURL>` +
    "<protocolVersion>2.0</protocolVersion>" +
    `<adminEmail>${escapeXml(cfg.email)}</adminEmail>` +
    `<earliestDatestamp>${escapeXml(earliest)}</earliestDatestamp>` +
    "<deletedRecord>no</deletedRecord>" +
    "<granularity>YYYY-MM-DDThh:mm:ssZ</granularity>" +
    "<description>" +
    '<oai-identifier xmlns="http://www.openarchives.org/OAI/2.0/oai-identifier" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/oai-identifier http://www.openarchives.org/OAI/2.0/oai-identifier.xsd">' +
    "<scheme>oai</scheme>" +
    `<repositoryIdentifier>${escapeXml(domain)}</repositoryIdentifier>` +
    "<delimiter>:</delimiter>" +
    `<sampleIdentifier>${escapeXml(buildOaiIdentifier("thesis", "sample-thesis-slug"))}</sampleIdentifier>` +
    "</oai-identifier>" +
    "</description>" +
    "</Identify>"
  );
}

async function handleListMetadataFormats(args: Record<string, string>): Promise<string> {
  if (args.identifier !== undefined) {
    const parsed = parseOaiIdentifier(args.identifier);
    const record = parsed ? await getOaiRecord(parsed.setSpec, parsed.localId) : null;
    if (!record) throw new OaiError("idDoesNotExist", `Unknown identifier: ${args.identifier}`);
  }
  return (
    "<ListMetadataFormats>" +
    "<metadataFormat>" +
    `<metadataPrefix>${OAI_METADATA_PREFIX}</metadataPrefix>` +
    "<schema>http://www.openarchives.org/OAI/2.0/oai_dc.xsd</schema>" +
    "<metadataNamespace>http://www.openarchives.org/OAI/2.0/oai_dc/</metadataNamespace>" +
    "</metadataFormat>" +
    "</ListMetadataFormats>"
  );
}

function handleListSets(args: Record<string, string>): string {
  // The full set list always fits in one response, so we never issue set
  // tokens — any incoming one is by definition stale/invalid.
  if (args.resumptionToken !== undefined) {
    throw new OaiError("badResumptionToken", "The resumptionToken is invalid or has expired");
  }
  const sets = OAI_SETS.map(
    (s) => `<set><setSpec>${escapeXml(s.setSpec)}</setSpec><setName>${escapeXml(s.setName)}</setName></set>`,
  ).join("");
  return `<ListSets>${sets}</ListSets>`;
}

async function handleGetRecord(args: Record<string, string>): Promise<string> {
  const publisherName = (await getOrgIdentity()).institutionName;
  requireOaiDc(args.metadataPrefix);
  const parsed = parseOaiIdentifier(args.identifier);
  if (!parsed) throw new OaiError("idDoesNotExist", `Unknown or illegal identifier: ${args.identifier}`);
  const record = await getOaiRecord(parsed.setSpec, parsed.localId);
  if (!record) throw new OaiError("idDoesNotExist", `Unknown identifier: ${args.identifier}`);
  return `<GetRecord>${buildRecordXml(record, publisherName)}</GetRecord>`;
}

async function handleList(verb: "ListIdentifiers" | "ListRecords", args: Record<string, string>): Promise<string> {
  const publisherName = (await getOrgIdentity()).institutionName;
  const filters = resolveListFilters(verb, args);
  const range = parseDateRange(filters);

  const all = await fetchOaiRecords({ set: filters.set, from: range.from, until: range.until });
  if (all.length === 0) {
    throw new OaiError("noRecordsMatch", "The combination of arguments results in an empty list");
  }
  if (filters.offset >= all.length) {
    // A stale offset (records deleted/unpublished since the token was minted).
    throw new OaiError("badResumptionToken", "The resumptionToken is invalid or has expired");
  }

  const page = all.slice(filters.offset, filters.offset + OAI_PAGE_SIZE);
  const items = page
    .map((record) => (verb === "ListRecords" ? buildRecordXml(record, publisherName) : buildHeader(record)))
    .join("");

  const nextOffset = filters.offset + page.length;
  let tokenTag = "";
  if (nextOffset < all.length) {
    const state: ResumptionState = {
      verb,
      metadataPrefix: filters.metadataPrefix,
      from: filters.from,
      until: filters.until,
      set: filters.set,
      offset: nextOffset,
    };
    tokenTag = buildResumptionTokenTag(encodeResumptionToken(state), filters.offset, all.length);
  } else if (filters.offset > 0) {
    // Per the spec, the response that completes a paginated list must carry
    // an empty resumptionToken element.
    tokenTag = buildResumptionTokenTag("", filters.offset, all.length);
  }

  return `<${verb}>${items}${tokenTag}</${verb}>`;
}

// ── Entry point ──────────────────────────────────────────────────────────

async function handleOaiRequest(request: NextRequest, searchParams: URLSearchParams): Promise<NextResponse> {
  const ip = getClientIP(request);
  const { limit, windowMs } = ratePolicy("oai");
  const rl = await rateLimit(`oai:${ip}`, limit, windowMs);
  if (!rl.success) {
    logSecurityEvent({ type: "rate_limited", where: "/api/oai", ip });
    // OAI-PMH flow control (spec §3.1.2.2): 503 + Retry-After, not an OAI error.
    return new NextResponse("Rate limit exceeded — retry later", {
      status: 503,
      headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) },
    });
  }

  let verb: string | null = null;
  let args: Record<string, string> = {};
  try {
    args = extractArgs(searchParams);
    verb = args.verb ?? null;
    if (!verb || !(verb in VERB_ARGS)) {
      throw new OaiError("badVerb", verb ? `Illegal verb: ${verb}` : "Missing verb argument");
    }
    validateArgs(verb, args);

    let body: string;
    switch (verb) {
      case "Identify":
        body = await handleIdentify();
        break;
      case "ListMetadataFormats":
        body = await handleListMetadataFormats(args);
        break;
      case "ListSets":
        body = handleListSets(args);
        break;
      case "GetRecord":
        body = await handleGetRecord(args);
        break;
      default:
        body = await handleList(verb as "ListIdentifiers" | "ListRecords", args);
    }

    const cacheable = verb === "Identify" || verb === "ListMetadataFormats" || verb === "ListSets";
    const xml = buildOaiPmhXml(buildRequestTag(BASE_URL, verb, args), body);
    return new NextResponse(xml, { status: 200, headers: cacheable ? CACHEABLE_HEADERS : XML_HEADERS });
  } catch (e) {
    if (e instanceof OaiError) {
      // OAI protocol errors are HTTP 200 with an <error> element (spec §3.6).
      const xml = buildErrorXml(BASE_URL, verb, args, [e]);
      return new NextResponse(xml, { status: 200, headers: XML_HEADERS });
    }
    console.error("[oai] unexpected error:", e instanceof Error ? e.message : e);
    return new NextResponse("Internal server error", { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  return handleOaiRequest(request, searchParams);
}

// The OAI-PMH spec requires repositories to accept POST with
// application/x-www-form-urlencoded arguments as well as GET.
export async function POST(request: NextRequest) {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(await request.text());
  } catch {
    params = new URLSearchParams();
  }
  return handleOaiRequest(request, params);
}
