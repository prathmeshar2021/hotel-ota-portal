import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { BUSINESS } from "@/lib/constants/business";
import GstReportClient from "@/components/admin/GstReportClient";

export const dynamic = "force-dynamic";

export default async function GstReportPage() {
  const ctx = await requireSuperAdmin();
  if (!ctx) redirect("/auth/admin-login");

  return <GstReportClient gstin={BUSINESS.gstin} legalName={BUSINESS.legalName} />;
}
