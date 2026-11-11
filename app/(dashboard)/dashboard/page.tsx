import { LastTabRedirect } from "@/components/nav/LastTabRedirect";

// Kept so existing links (login, after saving, Back) still work.
export default function DashboardPage() {
  return <LastTabRedirect />;
}
