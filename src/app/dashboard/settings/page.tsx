import { redirect } from "next/navigation";

// Settings has no landing screen of its own: an empty pane beside a full menu
// is a wasted click. Connected accounts is where people arrive for.
export default function SettingsIndex() {
  redirect("/dashboard/settings/accounts");
}
