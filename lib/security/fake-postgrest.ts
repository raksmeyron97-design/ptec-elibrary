/**
 * A tiny in-memory stand-in for the PostgREST query builder, for tests.
 *
 * TEST SUPPORT ONLY — nothing in the application imports this. It exists so
 * `incidents.integration.test.ts` can exercise the REAL incident engine
 * (opening, deduplicating, escalating, recovering, notifying) with no network
 * and no database, and so those tests run in ordinary CI rather than only in
 * the e2e job that boots Supabase.
 *
 * It implements exactly the subset of the builder `lib/security/incidents.ts`
 * and `lib/security/notify/telegram.ts` use, and nothing more: a fake that
 * grew to cover unused surface would start passing tests the real client
 * would fail. Where behaviour matters it matches PostgREST:
 *   • `.single()` on zero rows returns an error, `.maybeSingle()` returns null
 *   • a unique-constraint violation returns `{ code: "23505" }`
 *   • `.select()` after insert/update returns the affected rows
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

type Row = Record<string, any>;

export interface UniqueRule {
  table: string;
  /** Columns that together must be unique... */
  columns: string[];
  /** ...but only for rows matching this predicate (a partial index). */
  where?: (row: Row) => boolean;
}

export interface FakeDbOptions {
  /** Tables that should behave as absent (PostgREST error 42P01). */
  missingTables?: string[];
  uniques?: UniqueRule[];
  /** Values returned by rpc(name). A function is called per invocation. */
  rpc?: Record<string, unknown | (() => unknown)>;
}

type Filter = (row: Row) => boolean;

class Query implements PromiseLike<{ data: any; error: any }> {
  private filters: Filter[] = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private limitTo: number | null = null;
  private mode: "select" | "insert" | "update" = "select";
  private payload: Row | Row[] | null = null;
  private wantsSelect = false;
  private singleMode: "one" | "maybe" | null = null;

  constructor(
    private readonly store: FakeDb,
    private readonly table: string,
  ) {}

  /** Column lists are ignored: every test asserts on whole rows. */
  select() {
    this.wantsSelect = true;
    return this;
  }
  insert(payload: Row | Row[]) {
    this.mode = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.mode = "update";
    this.payload = payload;
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((r) => r[column] === value);
    return this;
  }
  is(column: string, value: unknown) {
    this.filters.push((r) => (r[column] ?? null) === value);
    return this;
  }
  in(column: string, values: readonly unknown[]) {
    const set = new Set(values as unknown[]);
    this.filters.push((r) => set.has(r[column]));
    return this;
  }
  gte(column: string, value: string) {
    this.filters.push((r) => String(r[column]) >= value);
    return this;
  }
  order(column: string, opts?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: opts?.ascending ?? true };
    return this;
  }
  limit(n: number) {
    this.limitTo = n;
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }
  single() {
    this.singleMode = "one";
    return this;
  }

  private run(): { data: any; error: any } {
    if (this.store.options.missingTables?.includes(this.table)) {
      return { data: null, error: { code: "42P01", message: `relation "${this.table}" does not exist` } };
    }
    const rows = this.store.table(this.table);

    if (this.mode === "insert") {
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      const created: Row[] = [];
      for (const row of incoming) {
        const withDefaults = this.store.withDefaults(this.table, row);
        const violation = this.store.uniqueViolation(this.table, withDefaults);
        if (violation) {
          return {
            data: null,
            error: { code: "23505", message: `duplicate key value violates unique constraint "${violation}"` },
          };
        }
        rows.push(withDefaults);
        created.push(withDefaults);
      }
      if (!this.wantsSelect) return { data: null, error: null };
      return this.shape(created);
    }

    const matched = rows.filter((r) => this.filters.every((f) => f(r)));

    if (this.mode === "update") {
      for (const row of matched) Object.assign(row, this.payload);
      if (!this.wantsSelect) return { data: null, error: null };
      return this.shape(matched);
    }

    let result = [...matched];
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      result.sort((a, b) => {
        const av = a[column];
        const bv = b[column];
        const cmp = av === bv ? 0 : av > bv ? 1 : -1;
        return ascending ? cmp : -cmp;
      });
    }
    if (this.limitTo !== null) result = result.slice(0, this.limitTo);
    return this.shape(result);
  }

  private shape(rows: Row[]): { data: any; error: any } {
    if (this.singleMode === "one") {
      if (rows.length !== 1) {
        return { data: null, error: { code: "PGRST116", message: "expected exactly one row" } };
      }
      return { data: { ...rows[0] }, error: null };
    }
    if (this.singleMode === "maybe") {
      return { data: rows.length ? { ...rows[0] } : null, error: null };
    }
    return { data: rows.map((r) => ({ ...r })), error: null };
  }

  then<TResult1 = { data: any; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

export class FakeDb {
  private readonly tables = new Map<string, Row[]>();
  private nextId = 1;

  constructor(
    seed: Record<string, Row[]> = {},
    readonly options: FakeDbOptions = {},
  ) {
    for (const [name, rows] of Object.entries(seed)) this.tables.set(name, rows.map((r) => ({ ...r })));
  }

  table(name: string): Row[] {
    let rows = this.tables.get(name);
    if (!rows) {
      rows = [];
      this.tables.set(name, rows);
    }
    return rows;
  }

  rows(name: string): Row[] {
    return this.table(name).map((r) => ({ ...r }));
  }

  withDefaults(table: string, row: Row): Row {
    const out: Row = { ...row };
    if (out.id === undefined) {
      out.id = table === "security_incidents" ? `inc-${this.nextId++}` : this.nextId++;
    }
    if (out.created_at === undefined) out.created_at = new Date().toISOString();
    if (table === "security_incidents") {
      out.alert_count ??= 0;
      out.event_count ??= 0;
      out.risk_score ??= 0;
      out.status ??= "detected";
      out.last_alert_at ??= null;
      out.recovery_alert_at ??= null;
      out.silenced_until ??= null;
      out.parent_incident_id ??= null;
      out.metadata ??= null;
    }
    if (table === "security_events") out.incident_id ??= null;
    return out;
  }

  /** Returns the violated constraint name, or null. */
  uniqueViolation(table: string, candidate: Row): string | null {
    for (const rule of this.options.uniques ?? []) {
      if (rule.table !== table) continue;
      if (rule.where && !rule.where(candidate)) continue;
      const clash = this.table(table).some(
        (existing) =>
          (!rule.where || rule.where(existing)) &&
          rule.columns.every((c) => existing[c] === candidate[c]),
      );
      if (clash) return `${table}_${rule.columns.join("_")}_uq`;
    }
    return null;
  }

  from(table: string) {
    return new Query(this, table);
  }

  async rpc(name: string) {
    const value = this.options.rpc?.[name];
    if (value === undefined) return { data: null, error: { code: "42883", message: `function ${name} does not exist` } };
    return { data: typeof value === "function" ? (value as () => unknown)() : value, error: null };
  }
}

/**
 * Mirrors migration 0127's `security_incidents_live_fingerprint_uq`: at most
 * one incident per fingerprint among statuses that are not recovered/closed.
 * Encoding it here is what makes the dedupe tests meaningful — without it the
 * fake would happily allow what the real database rejects.
 */
export const LIVE_FINGERPRINT_UNIQUE: UniqueRule = {
  table: "security_incidents",
  columns: ["fingerprint"],
  where: (row) => !["recovered", "closed"].includes(row.status),
};
