import HomeClient from "@/app/HomeClient";
import { getUserRows } from "@/lib/users";

async function getUsers(reload?: boolean) {
  try {
    const { rows } = await getUserRows(Boolean(reload));
    return rows.map((row) => `${row[0] ?? ""} ${row[1] ?? ""}`.trim()).filter(Boolean);
  } catch (error) {
    console.error("[Page] Failed to load users", error);
    return [];
  }
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ reload?: string }>;
}) {
  const { reload: reloadParam } = await searchParams;
  const reload = reloadParam === "true";

  const [users] = await Promise.all([getUsers(reload)]);

  return (
    <div className="w-full max-w-md mx-auto p-6">
      <HomeClient namelist={users} />
    </div>
  );
}
