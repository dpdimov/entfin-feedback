import { kv } from "@vercel/kv";
import { NextResponse } from "next/server";

const KV_KEY = "analytics:submissions";

// GET — load all submissions
export async function GET() {
  try {
    const entries = await kv.get(KV_KEY);
    return NextResponse.json(entries || []);
  } catch (err) {
    console.error("Failed to load analytics:", err);
    return NextResponse.json([], { status: 500 });
  }
}

// POST — log a new submission
export async function POST(request) {
  try {
    const entry = await request.json();
    const existing = (await kv.get(KV_KEY)) || [];
    existing.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
    await kv.set(KV_KEY, existing);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to log submission:", err);
    return NextResponse.json({ error: "Failed to log" }, { status: 500 });
  }
}

// DELETE — reset all analytics
export async function DELETE() {
  try {
    await kv.del(KV_KEY);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to reset analytics:", err);
    return NextResponse.json({ error: "Failed to reset" }, { status: 500 });
  }
}
