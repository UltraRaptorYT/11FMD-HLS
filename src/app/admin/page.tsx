import { isAdminAuthenticated } from "@/lib/admin-auth";
import AdminDashboard from "./AdminDashboard";
import AdminLogin from "./AdminLogin";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const authenticated = await isAdminAuthenticated();

  return authenticated ? <AdminDashboard /> : <AdminLogin />;
}
