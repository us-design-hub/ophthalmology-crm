import { AccountGate } from "@/components/account-password";
import { ClinicalWorkspace } from "@/components/clinical-workspace";
import { SessionProvider } from "@/components/session-provider";
import { pageSession } from "@/server/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export default async function Page() {
  const session = await pageSession();
  if (!session) redirect("/login");
  return <SessionProvider user={session.user}><AccountGate><ClinicalWorkspace /></AccountGate></SessionProvider>;
}
