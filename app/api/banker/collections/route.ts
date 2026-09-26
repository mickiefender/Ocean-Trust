import { NextResponse } from "next/server";
import { loadBankerCollections } from "@/app/banker/portal-actions";

export async function GET() {
  try {
    return NextResponse.json(await loadBankerCollections());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load collections." },
      { status: 401 },
    );
  }
}
