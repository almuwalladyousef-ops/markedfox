import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy · MarkedFox",
  description: "How MarkedFox collects, uses, and deletes your data.",
};

// Written for real customers AND for platform reviewers: Meta App Review,
// TikTok's audit, and Google's OAuth verification each check that a live
// privacy policy names their platform, explains token handling, and gives a
// working deletion path. The Google/YouTube passages below are required
// wording (YouTube API Services ToS III.A, Google API Limited Use) — do not
// trim them for style.

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-faint">Effective date: August 19, 2026</p>

      <div className="prose-invert mt-8 flex flex-col gap-8 text-ink">
        <Section title="Who we are">
          <p>
            MarkedFox (&ldquo;MarkedFox&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is a
            publishing and messaging-automation tool for creators, available at{" "}
            <a className="underline" href="https://markedfox.com">markedfox.com</a>. This
            policy explains what data we collect, why, and how to get it deleted. For
            anything this page does not answer, email{" "}
            <a className="underline" href="mailto:support@markedfox.com">support@markedfox.com</a>.
          </p>
        </Section>

        <Section title="What we collect">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>
              <strong>Account data.</strong> Your email address and password (stored as a
              hash by our authentication provider), and the display name you choose.
            </li>
            <li>
              <strong>Social account connections.</strong> When you connect a social
              account, the platform sends us an access token, your account&apos;s ID and
              username, and — for some platforms — the list of pages or profiles you
              manage. We never see or store your social media passwords.
            </li>
            <li>
              <strong>Content you create.</strong> Posts, captions, schedules, automation
              rules, and any media you upload for publishing.
            </li>
            <li>
              <strong>Usage records.</strong> Counts of actions that have plan limits
              (posts published, DMs sent), kept to enforce your plan and to bill
              correctly.
            </li>
            <li>
              <strong>Messages handled by automations.</strong> When you set up comment
              or DM automation, we process the comments and messages your rules match in
              order to send the replies you configured.
            </li>
          </ul>
        </Section>

        <Section title="How tokens and media are handled">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>
              Access tokens for your connected accounts are encrypted at rest with
              AES-256-GCM. They are used only to perform the actions you set up —
              publishing your posts, reading the comments your rules target, and sending
              the replies you configured. They are deleted the moment you disconnect the
              account (the × beside it on your dashboard) or delete your MarkedFox
              account, and where the platform offers it (X, YouTube, TikTok) we also
              tell the platform to revoke the access you granted.
            </li>
            <li>
              Uploaded media is stored only until it has been published, then deleted
              from our storage automatically. Uploads never attached to any post are
              deleted within days.
            </li>
          </ul>
        </Section>

        <Section title="What we never do">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>We do not sell your data, to anyone, in any form.</li>
            <li>We do not use your data for advertising.</li>
            <li>
              We do not post, message, or take any action on your social accounts other
              than the ones you explicitly set up.
            </li>
            <li>
              We do not use data obtained from connected platforms to train machine
              learning or artificial intelligence models.
            </li>
          </ul>
        </Section>

        <Section title="Platform APIs">
          <p>
            MarkedFox connects to social platforms through their official APIs, and your
            use of each platform through MarkedFox is also governed by that
            platform&apos;s own terms and privacy policy:
          </p>
          <ul className="mt-2 flex list-disc flex-col gap-2 pl-5">
            <li>
              Meta (Instagram, Facebook, Threads) —{" "}
              <a className="underline" href="https://www.facebook.com/privacy/policy" rel="noopener noreferrer">
                Meta Privacy Policy
              </a>
            </li>
            <li>
              TikTok —{" "}
              <a className="underline" href="https://www.tiktok.com/legal/privacy-policy" rel="noopener noreferrer">
                TikTok Privacy Policy
              </a>
            </li>
            <li>
              X —{" "}
              <a className="underline" href="https://x.com/privacy" rel="noopener noreferrer">
                X Privacy Policy
              </a>
            </li>
            <li>
              Snapchat —{" "}
              <a className="underline" href="https://values.snap.com/privacy/privacy-policy" rel="noopener noreferrer">
                Snap Privacy Policy
              </a>
            </li>
            <li>
              Google (YouTube) —{" "}
              <a className="underline" href="https://www.google.com/policies/privacy" rel="noopener noreferrer">
                Google Privacy Policy
              </a>
            </li>
          </ul>
          <p className="mt-3">
            MarkedFox uses YouTube API Services. By connecting a YouTube channel you
            agree to the{" "}
            <a className="underline" href="https://www.youtube.com/t/terms" rel="noopener noreferrer">
              YouTube Terms of Service
            </a>
            . You can revoke MarkedFox&apos;s access to your Google account at any time
            via the{" "}
            <a className="underline" href="https://security.google.com/settings/security/permissions" rel="noopener noreferrer">
              Google security settings page
            </a>
            . MarkedFox&apos;s use of information received from Google APIs adheres to
            the{" "}
            <a
              className="underline"
              href="https://developers.google.com/terms/api-services-user-data-policy"
              rel="noopener noreferrer"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </Section>

        <Section title="Who processes data for us">
          <p>
            We run on a small number of infrastructure providers, each processing data
            only to provide our service: Supabase (database and authentication),
            Cloudflare (DNS, and temporary media storage on R2), and DigitalOcean
            (application server). Payment processing, when you subscribe to a paid plan,
            is handled by Stripe — we never see or store your card number.
          </p>
        </Section>

        <Section title="Data retention and deletion">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>
              <strong>Disconnecting a social account</strong> (the × beside it on your
              dashboard) deletes its stored tokens immediately.
            </li>
            <li>
              <strong>Deleting your MarkedFox account</strong> — Dashboard → Settings →
              Delete account — immediately removes your account data, workspaces,
              connected accounts and their tokens, posts, automation rules, usage
              records, and uploaded media. If you cannot sign in, email{" "}
              <a className="underline" href="mailto:support@markedfox.com">support@markedfox.com</a>{" "}
              from your account&apos;s email address and we will complete the deletion
              within 30 days, confirming when it is done.
            </li>
            <li>
              <strong>Meta users:</strong> removing MarkedFox from your Facebook,
              Instagram, or Threads settings triggers Meta&apos;s deauthorization
              callback, and we delete the stored tokens for those connections
              automatically. A data-deletion request made through Meta also removes the
              publishing history we hold for those accounts, and Meta gives you a
              confirmation code whose status you can check at any time.
            </li>
          </ul>
        </Section>

        <Section title="Cookies">
          <p>
            MarkedFox uses only the cookies required to keep you signed in. There are no
            advertising or cross-site tracking cookies, which is why there is no cookie
            banner.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If this policy changes in a way that matters, we will update the effective
            date above and, for significant changes, notify you by email before they
            take effect.
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
