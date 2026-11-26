"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { LocalStore } from "@/lib/store/local";
import { SupabaseStore, supabase, supabaseConfigured } from "@/lib/store/supabase";
import { Console } from "./Console";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="login">
      <div className="card login-card">
        <div className="logo big">K</div>
        <h1>UTM Console</h1>
        <p className="muted">KK Create · AI Course & Creator Bootcamp</p>
        {children}
      </div>
    </div>
  );
}

function TeamApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const store = useMemo(() => new SupabaseStore(), []);

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setAllowed(null); return; }
    supabase().rpc("is_allowed").then(({ data, error: e }) => {
      if (e) setError(e.message);
      setAllowed(data === true);
    });
  }, [session]);

  const signIn = async () => {
    setError(null);
    const { error: e } = await supabase().auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    if (e) setError(e.message);
  };
  const signOut = () => supabase().auth.signOut();

  if (!ready) return <div className="center muted">Loading…</div>;
  if (!session) {
    return (
      <Shell>
        <button className="btn primary big" onClick={signIn}>Sign in with Google</button>
        {error && <p className="small warn-text">{error}</p>}
      </Shell>
    );
  }
  if (allowed === null) return <div className="center muted">Checking access…</div>;
  if (!allowed) {
    return (
      <Shell>
        <p>{session.user.email} isn&apos;t on the team list yet.</p>
        <p className="small muted">Ask an admin to add it to <span className="mono">allowed_emails</span> in Supabase.</p>
        {error && <p className="small warn-text">{error}</p>}
        <button className="btn" onClick={signOut}>Sign out</button>
      </Shell>
    );
  }
  const meta = session.user.user_metadata as { full_name?: string; name?: string };
  return (
    <Console
      store={store}
      user={{ email: session.user.email ?? "", name: meta.full_name ?? meta.name ?? "" }}
      onSignOut={signOut}
      getToken={async () => (await supabase().auth.getSession()).data.session?.access_token ?? null}
    />
  );
}

export function App() {
  const local = useMemo(() => (supabaseConfigured ? null : new LocalStore()), []);
  if (local) return <Console store={local} user={null} getToken={async () => null} />;
  return <TeamApp />;
}
