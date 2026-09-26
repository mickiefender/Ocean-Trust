"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createInitialAdmin } from "./actions";

const initialState = { error: "" };

export default function SetupPage() {
  const [state, action, pending] = useActionState(
    createInitialAdmin,
    initialState,
  );

  if (state.success) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6">
        <section className="w-full space-y-5">
          <h1 className="text-3xl font-semibold">Admin account created</h1>
          <p className="text-sm text-zinc-600">
            Your initial administrator account is ready. Sign in to continue.
          </p>
          <Link className="block rounded bg-black p-3 text-center text-white" href="/login">
            Go to sign in
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6">
      <form action={action} className="w-full space-y-4">
        <h1 className="text-3xl font-semibold">Initial administrator setup</h1>
        <p className="text-sm text-zinc-600">
          This page can be used once to create the first platform administrator.
        </p>
        {state.error && (
          <p className="rounded bg-red-50 p-3 text-sm text-red-700">{state.error}</p>
        )}
        <input className="w-full rounded border p-3" name="firstName" placeholder="First name" required />
        <input className="w-full rounded border p-3" name="lastName" placeholder="Last name" required />
        <input className="w-full rounded border p-3" name="email" type="email" placeholder="Email" required />
        <input className="w-full rounded border p-3" name="password" type="password" minLength={8} placeholder="Password (8+ characters)" required />
        <button className="w-full rounded bg-black p-3 text-white disabled:opacity-50" disabled={pending}>
          {pending ? "Creating account…" : "Create administrator"}
        </button>
      </form>
    </main>
  );
}
