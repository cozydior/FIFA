import { NextResponse } from "next/server";
import { getSimPreviewTestMode, setSimPreviewTestMode } from "@/lib/appSettings";

export async function GET() {
  try {
    const enabled = await getSimPreviewTestMode();
    return NextResponse.json({ enabled });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { enabled?: boolean };
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "Body must include enabled: boolean" }, { status: 400 });
    }
    await setSimPreviewTestMode(body.enabled);
    return NextResponse.json({ ok: true, enabled: body.enabled });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
