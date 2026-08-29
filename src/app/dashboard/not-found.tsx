import { ButtonLink, EmptyState, Page } from "@/components/ui";

// Renders inside the dashboard shell, so the sidebar stays put and the person
// is still in the app. This is what `notFound()` lands on — a deleted script,
// a project id from someone else's link, a research page on a plan without
// research.
export default function DashboardNotFound() {
  return (
    <Page>
      <EmptyState
        title="This page doesn't exist"
        action={<ButtonLink href="/dashboard">Back to Home</ButtonLink>}
      >
        It may have been removed, the link may be someone else&rsquo;s, or your
        plan doesn&rsquo;t include it.
      </EmptyState>
    </Page>
  );
}
