import { redirect } from "next/navigation";
import { configuredTenant, demoAccounts, pageSession } from "@/server/auth";
import { LoginForm } from "@/components/login-form";
export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (await pageSession()) redirect("/");
  const tenant = await configuredTenant();
  const demo = await demoAccounts(tenant);
  return <LoginForm demo={demo} hospitalName={tenant.name}/>;
}
