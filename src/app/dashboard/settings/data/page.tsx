import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardTitle } from "@/components/ui";

import { DeleteAccountForm } from "../delete-account-form";
import { ExportButton } from "./export-button";
import { Pane } from "../pane";

export const metadata: Metadata = { title: "Manage my data · MarkedFox" };

export default function DataPane() {
  return (
    <Pane
      title="Manage my data"
      blurb="What MarkedFox holds, where it holds it, and how to get it back or destroy it."
    >
      <Card className="px-6 py-5">
        <CardTitle>Where your data lives</CardTitle>
        <ul className="mt-4 flex list-disc flex-col gap-2.5 pl-5 text-[14px]/[21px] text-pretty text-muted">
          <li>
            <span className="text-ink">Connected accounts and their tokens</span>{" "}
            — encrypted in the database, one row per account. Disconnecting an
            account deletes its tokens immediately.
          </li>
          <li>
            <span className="text-ink">Uploaded media</span> — object storage,
            deleted automatically once the post that used it is done with it.
            Nothing you upload is kept as a library.
          </li>
          <li>
            <span className="text-ink">Everything else</span> — workspaces,
            posts, automation rules, research, and usage records, in the same
            database, scoped to your account by the database itself rather than
            by a filter this app remembered to apply. See the{" "}
            <Link href="/privacy" className="text-accent underline">
              privacy policy
            </Link>
            .
          </li>
        </ul>
      </Card>

      <Card className="px-6 py-5">
        <CardTitle hint="a JSON file, downloaded in your browser">
          Export my data
        </CardTitle>
        <p className="mt-2.5 text-[14px]/[21px] text-pretty text-muted">
          Your workspaces, connected account names, posts, automation rules and
          research, as one file. Tokens are never included — an exported access
          token is a credential in a downloads folder.
        </p>
        <div className="mt-4">
          <ExportButton />
        </div>
      </Card>

      <section className="rounded-2xl border border-[rgba(220,38,38,.35)] bg-danger-soft px-6 py-5">
        <h3 className="font-display text-[16.5px] font-bold text-danger">
          Delete account
        </h3>
        <p className="mt-2.5 text-[14px]/[21px] text-pretty text-muted">
          Permanently deletes your MarkedFox account and everything in it:
          workspaces, connected accounts and their tokens, posts (scheduled ones
          will not go out), automation rules, and uploaded media. Where a
          platform offers it, we also ask the platform to revoke the access you
          granted. This cannot be undone.
        </p>
        <DeleteAccountForm />
      </section>
    </Pane>
  );
}
