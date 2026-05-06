import HomeClient from "@/app/HomeClient";
import { getBaseUrl } from "@/lib/get-base-url";

async function getUsers(reload?: boolean) {
  const baseUrl = getBaseUrl() ?? "http://localhost:3000";
  const url = new URL("/api/getUsers", baseUrl);
  if (reload) url.searchParams.set("reload", "true");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return [];

  const data = (await res.json()) as { items?: string[]; rows?: string[][] };
  return data.items ?? data.rows?.map((r) => r[0]).filter(Boolean) ?? [];
}

export default function Home() {
  return (
    <div className="w-full max-w-md mx-auto p-6">
      <HomeClient />
    </div>
  );
}
