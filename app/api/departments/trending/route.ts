import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("books")
      .select("departments!inner(name)")
      .eq("is_published", true);

    const seen = new Set<string>();
    for (const row of data ?? []) {
      const dept = (row.departments as any)?.name;
      if (dept) seen.add(dept);
    }
    const result = [...seen].sort((a, b) => a.localeCompare(b)).slice(0, 8);

    if (result.length === 0) {
      return NextResponse.json(["Pedagogy", "Mathematics", "Science", "History"]);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching trending departments:", error);
    return NextResponse.json(["Pedagogy", "Mathematics", "Science", "History"]);
  }
}
