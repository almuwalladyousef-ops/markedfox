import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service · MarkedFox",
  description: "The terms that govern your use of MarkedFox.",
};

// Companion to /privacy and checked by the same platform reviewers. Plain
// language on purpose: these terms are read by individual creators, not
// procurement departments.

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-faint">Effective date: August 19, 2026</p>

      <div className="mt-8 flex flex-col gap-8 text-ink">
        <Section title="1. The service">
          <p>
            MarkedFox lets you publish and schedule content to social platforms you
            connect, and automate replies to comments and direct messages on those
            platforms. By creating an account you agree to these terms. If you do not
            agree, do not use MarkedFox.
          </p>
        </Section>

        <Section title="2. Your account">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>You must provide a real email address and keep your password secure.</li>
            <li>
              You are responsible for everything published or sent through your account
              and the automations you configure.
            </li>
            <li>One person or entity per account; you may organize work into workspaces.</li>
          </ul>
        </Section>

        <Section title="3. Connected platforms">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>
              You may only connect social accounts you own or are authorized to manage.
            </li>
            <li>
              Your use of each connected platform through MarkedFox must comply with that
              platform&apos;s own terms, community guidelines, and automation policies.
              MarkedFox uses only official platform APIs.
            </li>
            <li>
              Platforms can change or revoke API access at any time; if a platform
              restricts what its API allows, MarkedFox&apos;s features for that platform
              change with it.
            </li>
            <li>
              Connecting a YouTube channel means you also agree to the{" "}
              <a className="underline" href="https://www.youtube.com/t/terms" rel="noopener noreferrer">
                YouTube Terms of Service
              </a>
              .
            </li>
          </ul>
        </Section>

        <Section title="4. Acceptable use">
          <p>You agree not to use MarkedFox to:</p>
          <ul className="mt-2 flex list-disc flex-col gap-2 pl-5">
            <li>send spam or messages people did not reasonably opt into receiving;</li>
            <li>publish content that is illegal or infringes someone else&apos;s rights;</li>
            <li>
              evade a platform&apos;s enforcement actions, rate limits, or automation
              rules;
            </li>
            <li>probe, disrupt, or overload the service itself.</li>
          </ul>
          <p className="mt-2">
            We may suspend or terminate accounts that do any of the above.
          </p>
        </Section>

        <Section title="5. Plans and billing">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>
              Paid plans bill monthly or annually through Stripe and renew automatically
              until canceled. Canceling stops the next renewal; your plan stays active
              until the end of the period you paid for.
            </li>
            <li>
              Plan limits are enforced in the product. Where a plan says
              &ldquo;unlimited&rdquo;, that applies to platforms that cost nothing per
              post; X posts always carry a monthly cap because X charges per post, and
              external links in X posts are blocked on every plan.
            </li>
            <li>
              If a payment fails and retries fail, your account moves to the Free plan
              and its limits apply. Your data is not deleted.
            </li>
          </ul>
        </Section>

        <Section title="6. Your content">
          <p>
            Your content stays yours. You give us only the permission needed to operate
            the service: storing your posts and media, and transmitting them to the
            platforms you target. Uploaded media is deleted from our storage after
            publishing.
          </p>
        </Section>

        <Section title="7. Termination">
          <p>
            You can delete your account at any time (see the{" "}
            <a className="underline" href="/privacy">Privacy Policy</a> for how, and what
            gets removed). We may terminate accounts that violate these terms, and will
            say why when we do.
          </p>
        </Section>

        <Section title="8. Disclaimers">
          <p>
            MarkedFox is provided &ldquo;as is&rdquo;. We work to keep it reliable, but
            we do not guarantee uninterrupted service, and we are not responsible for
            actions the platforms take against your accounts, for changes to their APIs,
            or for content you or your automations publish. To the maximum extent
            permitted by law, our total liability for any claim is limited to the amount
            you paid us in the twelve months before the claim.
          </p>
        </Section>

        <Section title="9. Changes to these terms">
          <p>
            If these terms change materially, we will update the effective date above
            and notify you by email before the changes apply. Continuing to use
            MarkedFox after that means you accept the new terms.
          </p>
        </Section>

        <Section title="10. Contact">
          <p>
            Questions about these terms:{" "}
            <a className="underline" href="mailto:support@markedfox.com">
              support@markedfox.com
            </a>
            .
          </p>
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <div className="mt-3 text-sm leading-relaxed">{children}</div>
    </section>
  );
}
