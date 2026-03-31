import Redis from "ioredis";
import { NextResponse } from "next/server";

const redis = new Redis(process.env.REDIS_URL);

const KEY = "analytics:submissions";

// GET — load all submissions
export async function GET() {
  try {
    const raw = await redis.get(KEY);
    const entries = raw ? JSON.parse(raw) : [];
    return NextResponse.json(entries);
  } catch (err) {
    console.error("Failed to load analytics:", err);
    return NextResponse.json([], { status: 500 });
  }
}

// POST — log a new submission
export async function POST(request) {
  try {
    const entry = await request.json();
    const raw = await redis.get(KEY);
    const existing = raw ? JSON.parse(raw) : [];
    existing.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
    await redis.set(KEY, JSON.stringify(existing));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to log submission:", err);
    return NextResponse.json({ error: "Failed to log" }, { status: 500 });
  }
}

// DELETE — reset all analytics
export async function DELETE() {
  try {
    await redis.del(KEY);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to reset analytics:", err);
    return NextResponse.json({ error: "Failed to reset" }, { status: 500 });
  }
}
