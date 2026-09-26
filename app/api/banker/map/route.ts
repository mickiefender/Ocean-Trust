import { NextResponse } from "next/server";
import { loadBankerMapCustomers } from "@/app/banker/portal-actions";

export async function GET() {
  try {
    return NextResponse.json(await loadBankerMapCustomers());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load customer map." },
      { status: 401 },
    );
  }
}
