"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { error } = await createClient().auth.updateUser({ password });
    if (error) setMessage(error.message);
    else {
      setMessage("Password updated. Redirecting to sign in…");
      setTimeout(() => router.replace("/login"), 1200);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6">
      {!ready ? <p>Checking reset link…</p> : (
        <form onSubmit={submit} className="w-full space-y-5">
          <h1 className="text-3xl font-semibold">Choose a new password</h1>
          {message && <p className="rounded bg-blue-50 p-3 text-sm">{message}</p>}
          <input className="w-full rounded border p-3" type="password" minLength={8} required placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="w-full rounded bg-black p-3 text-white">Update password</button>
        </form>
      )}
    </main>
  );
}
