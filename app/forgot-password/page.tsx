"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) setError(error.message);
    else setMessage("If an account exists for that email, a reset link has been sent.");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6">
      <form onSubmit={submit} className="w-full space-y-5">
        <h1 className="text-3xl font-semibold">Reset password</h1>
        {message && <p className="rounded bg-green-50 p-3 text-sm text-green-700">{message}</p>}
        {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <input className="w-full rounded border p-3" type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="w-full rounded bg-black p-3 text-white">Send reset link</button>
        <Link href="/login" className="block text-center text-sm underline">Back to sign in</Link>
      </form>
    </main>
  );
}
