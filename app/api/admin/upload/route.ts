import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const ALLOWED_PREFIXES = ["books/", "posts/", "research/", "reports/"];

export async function POST(request: NextRequest) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = createServiceClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const key = (formData.get("key") as string | null)?.trim();
    const target = (formData.get("target") as string) === "public" ? "public" : "private";

    if (!file || file.size === 0) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!key) return NextResponse.json({ error: "No key provided" }, { status: 400 });

    if (key.startsWith("/") || key.startsWith("\\") || key.includes("..")) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }
    if (!ALLOWED_PREFIXES.some((p) => key.startsWith(p))) {
      return NextResponse.json({ error: "File path must start with books/, posts/, research/, or reports/" }, { status: 400 });
    }

    const bucket = target === "public"
      ? process.env.R2_PUBLIC_BUCKET_NAME
      : process.env.R2_BUCKET_NAME;
    if (!bucket) return NextResponse.json({ error: "Missing R2 bucket config" }, { status: 500 });

    const bytes = await file.arrayBuffer();
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: Buffer.from(bytes),
        ContentType: file.type || "application/octet-stream",
      })
    );

    const url =
      target === "public"
        ? `${(process.env.NEXT_PUBLIC_R2_COVERS_URL ?? "").replace(/\/$/, "")}/${key}`
        : key;

    return NextResponse.json({ url });
  } catch (err) {
    console.error("[admin/upload]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
