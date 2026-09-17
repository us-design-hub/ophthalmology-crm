import { redirect } from "next/navigation";
import { configuredTenant, demoAccounts, pageSession } from "@/server/auth";
import { LoginForm } from "@/components/login-form";
export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (await pageSession()) redirect("/");
  const demo = await demoAccounts();
  return <LoginForm demo={demo} hospitalName={(await configuredTenant()).name}/>;
}
