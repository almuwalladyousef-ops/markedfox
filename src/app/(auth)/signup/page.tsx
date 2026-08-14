import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getUser } from "@/lib/auth/session";

import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your account · MarkedFox" };

export default async function SignupPage() {
  const user = await getUser();
  if (user) redirect("/dashboard");

  return <SignupForm />;
}
