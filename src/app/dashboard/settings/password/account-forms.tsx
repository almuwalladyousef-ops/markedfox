"use client";

import { useActionState, useState } from "react";

import { Busy, Button, cx, inputClass, Notice } from "@/components/ui";
import {
  changePasswordAction,
  updateAvatarAction,
  updateProfileAction,
  type ProfileFormState,
} from "@/lib/account/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/validation";

const EMPTY: ProfileFormState = {};

const label = "text-[13px] font-semibold text-muted";

function Message({ state }: { state: ProfileFormState }) {
  if (!state.message) return null;
  return (
    <Notice tone={state.ok ? "ok" : "danger"} className="text-[13.5px]">
      {state.message}
    </Notice>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, EMPTY);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Message state={state} />
      <label className="block">
        <span className={label}>New password</span>
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          className={cx(inputClass, "mt-2")}
        />
      </label>
      <label className="block">
        <span className={label}>Confirm new password</span>
        <input
          type="password"
          name="confirm_password"
          autoComplete="new-password"
          required
          className={cx(inputClass, "mt-2")}
        />
      </label>
      <Button type="submit" tone="primary" size="sm" className="w-fit" disabled={pending}>
        <Busy busy={pending}>
          {pending ? "Saving…" : "Change password"}
        </Busy>
      </Button>
    </form>
  );
}

export function ProfileForm({
  email,
  displayName,
}: {
  email: string;
  displayName: string;
}) {
  const [state, action, pending] = useActionState(updateProfileAction, EMPTY);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Message state={state} />
      <label className="block">
        <span className={label}>Name</span>
        <input
          name="display_name"
          defaultValue={displayName}
          maxLength={80}
          placeholder="What should we call you?"
          className={cx(inputClass, "mt-2")}
        />
      </label>
      <label className="block">
        <span className={label}>Email</span>
        <input
          type="email"
          name="email"
          defaultValue={email}
          autoComplete="email"
          className={cx(inputClass, "mt-2")}
        />
        <span className="mt-2 block text-[12.5px]/[18px] text-faint">
          Changing this sends a confirmation to the new address. The account
          does not move until that link is clicked — a typo here would otherwise
          lock you out of the inbox that owns your platform tokens.
        </span>
      </label>
      <Button type="submit" tone="primary" size="sm" className="w-fit" disabled={pending}>
        <Busy busy={pending}>
          {pending ? "Saving…" : "Save"}
        </Busy>
      </Button>
    </form>
  );
}

export function AvatarForm({
  workspaceId,
  current,
  uploadsEnabled,
}: {
  workspaceId: string;
  current: string | null;
  uploadsEnabled: boolean;
}) {
  const [state, action, pending] = useActionState(updateAvatarAction, EMPTY);
  const [url, setUrl] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Straight to object storage on a URL the server signs, exactly as the
  // composer does: the bytes never pass through the droplet, which is the only
  // reason a 1 vCPU box can serve uploads at all.
  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/media/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          contentType: file.type,
          sizeBytes: file.size,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        setError(String(body.message ?? "That file was refused."));
        return;
      }
      const { uploadUrl, publicUrl, headers } = body as {
        uploadUrl: string;
        publicUrl: string;
        headers: Record<string, string>;
      };
      const put = await fetch(uploadUrl, { method: "PUT", headers, body: file });
      if (!put.ok) {
        setError(`Upload failed (HTTP ${put.status}).`);
        return;
      }
      setUrl(publicUrl);
    } catch {
      setError("Upload failed — check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form action={action} className="flex flex-col gap-4">
      <Message state={state} />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <input type="hidden" name="avatar_url" value={url} />

      <div className="flex items-center gap-4">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className="h-[72px] w-[72px] shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="h-[72px] w-[72px] shrink-0 rounded-full bg-chip"
          />
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          {uploadsEnabled ? (
            <label className="inline-flex items-center justify-center gap-2 cursor-pointer rounded-md border border-line bg-panel px-3.5 py-2 text-[13px] font-semibold text-ink transition-[border-color] duration-110 hover:border-line-strong">
              <Busy busy={busy}>
                {busy ? "Uploading…" : "Choose a picture"}
              </Busy>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                  event.target.value = "";
                }}
              />
            </label>
          ) : (
            <p className="text-[13.5px] text-warn">
              Object storage is not configured on this deployment, so there is
              nowhere to put the file.
            </p>
          )}
          {url ? (
            <button
              type="button"
              onClick={() => setUrl("")}
              className="text-[13px] text-faint transition-[color] duration-110 hover:text-danger"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>

      <p className="text-[12.5px] text-faint">JPEG, PNG or WebP up to 8MB.</p>

      <Button
        type="submit"
        tone="primary"
        size="sm"
        className="w-fit"
        disabled={pending || busy}
      >
        <Busy busy={pending}>
          {pending ? "Saving…" : "Save picture"}
        </Busy>
      </Button>
    </form>
  );
}
