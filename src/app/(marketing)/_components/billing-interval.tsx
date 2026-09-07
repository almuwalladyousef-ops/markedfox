"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// "Monthly or yearly?" asked once per page, not once per component.
//
// The landing page carries two of these controls: the stack calculator half
// way down, and the plan grid at the bottom. They each held their own
// useState, with different defaults — the calculator opened on yearly and the
// grid on monthly — so the page contradicted itself before anybody touched it,
// and setting one did nothing to the other. The owner pressed Monthly on one
// and found the other still showing yearly, which is exactly what it did.
//
// One piece of state, two controls onto it. A provider rather than props
// because the two live in different halves of a long server-rendered page and
// threading a setter between them would mean making that page a client
// component.
//
// Default is monthly: it is the number somebody compares against whatever they
// pay today, and the yearly saving reads as a discount from it rather than as
// the price that quietly went up when they switched.

export type BillingInterval = "monthly" | "yearly";

type Store = {
  readonly interval: BillingInterval;
  readonly setInterval: (next: BillingInterval) => void;
};

const Context = createContext<Store | null>(null);

export function BillingIntervalProvider({
  children,
  initial = "monthly",
}: {
  children: ReactNode;
  initial?: BillingInterval;
}) {
  const [interval, setInterval] = useState<BillingInterval>(initial);
  return (
    <Context.Provider value={{ interval, setInterval }}>
      {children}
    </Context.Provider>
  );
}

/**
 * The shared answer when a provider is above, and a private one when it is
 * not.
 *
 * /pricing renders the grid on its own, with no calculator to agree with, and
 * it must keep working there — a hook that threw without a provider would make
 * the shared case a trap for whoever adds the next page. So the fallback is a
 * real, working local state rather than an error.
 */
export function useBillingInterval(): Store {
  const shared = useContext(Context);
  const [local, setLocal] = useState<BillingInterval>("monthly");
  return shared ?? { interval: local, setInterval: setLocal };
}
