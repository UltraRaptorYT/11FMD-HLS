import { NextResponse } from "next/server";
import { getUserRows } from "@/lib/users";

export async function GET(request: Request) {
  try {
    const forceReload =
      new URL(request.url).searchParams.get("reload") === "true";
    const data = await getUserRows(forceReload);
    return NextResponse.json(data);
  } catch (error) {
    console.error("[getUsers]", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 },
    );
  }
}
