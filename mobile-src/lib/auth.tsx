import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  clearLocalAccountData,
  deleteSecureValue,
  getSecureValue,
  setSecureValue,
} from "@/lib/mobile/store";
import { mobileConfig } from "./config";

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string; email?: string };
};

type AuthState = {
  loading: boolean;
  accessToken: string | null;
  user: TokenResponse["user"] | null;
  error: string | null;
  notice: string | null;
  signIn(email: string, password: string): Promise<void>;
  signUp(fullName: string, email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);
const sessionKey = "auth-session-v2";
const legacyRefreshKey = "auth-refresh-token";
// Below this much remaining life a stored access token is treated as spent, so
// a refresh that is already in flight cannot be beaten by an expiring request.
const expiryGuardSeconds = 90;

type StoredSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: TokenResponse["user"];
};

function toStoredSession(session: TokenResponse): StoredSession {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: Math.floor(Date.now() / 1_000) + session.expires_in,
    user: session.user,
  };
}

function toSession(stored: StoredSession): TokenResponse {
  return {
    access_token: stored.access_token,
    refresh_token: stored.refresh_token,
    expires_in: Math.max(0, stored.expires_at - Math.floor(Date.now() / 1_000)),
    user: stored.user,
  };
}

function parseStoredSession(raw: string | null): StoredSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredSession>;
    if (
      typeof value.access_token === "string" &&
      typeof value.refresh_token === "string" &&
      typeof value.expires_at === "number" &&
      value.user?.id
    )
      return value as StoredSession;
  } catch {
    // A corrupt record is indistinguishable from no record.
  }
  return null;
}

async function authFetch(input: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (reason) {
    if (controller.signal.aborted)
      throw new Error("The connection timed out. Check your connection.");
    throw reason;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function tokenRequest(
  grantType: "password" | "refresh_token",
  body: Record<string, string>,
) {
  const response = await authFetch(
    mobileConfig.supabaseUrl + "/auth/v1/token?grant_type=" + grantType,
    {
      method: "POST",
      headers: {
        apikey: mobileConfig.supabaseKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const data = (await response.json().catch(() => null)) as
    | (Partial<TokenResponse> & { msg?: string; error_description?: string })
    | null;
  if (!response.ok || !data?.access_token || !data.refresh_token || !data.user)
    throw new Error(
      data?.error_description ||
        data?.msg ||
        "The session could not be started.",
    );
  return data as TokenResponse;
}

async function signupRequest(
  fullName: string,
  email: string,
  password: string,
) {
  const response = await authFetch(
    mobileConfig.supabaseUrl + "/auth/v1/signup",
    {
      method: "POST",
      headers: {
        apikey: mobileConfig.supabaseKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        data: { full_name: fullName.trim() || email.split("@")[0] },
      }),
    },
  );
  const data = (await response.json().catch(() => null)) as
    | (Partial<TokenResponse> & {
        user?: TokenResponse["user"];
        msg?: string;
        error_description?: string;
      })
    | null;
  if (!response.ok)
    throw new Error(
      data?.error_description || data?.msg || "Account creation failed.",
    );
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(mobileConfig.ready);
  const [session, setSession] = useState<TokenResponse | null>(null);
  const [error, setError] = useState<string | null>(
    mobileConfig.ready
      ? null
      : "This build is missing its Mori and Supabase configuration.",
  );
  const [notice, setNotice] = useState<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const acceptSession = useCallback(async (next: TokenResponse) => {
    await setSecureValue(sessionKey, JSON.stringify(toStoredSession(next)));
    setSession(next);
    setError(null);
    setNotice(null);
  }, []);

  const signOutLocally = useCallback(async () => {
    await deleteSecureValue(sessionKey);
    await deleteSecureValue(legacyRefreshKey);
    setSession(null);
  }, []);

  const storedSession = useCallback(
    async () => parseStoredSession(await getSecureValue(sessionKey)),
    [],
  );

  const refresh = useCallback(async () => {
    const stored = await storedSession();
    const token =
      stored?.refresh_token ?? (await getSecureValue(legacyRefreshKey));
    if (!token) {
      setSession(null);
      return;
    }
    try {
      await acceptSession(
        await tokenRequest("refresh_token", { refresh_token: token }),
      );
      await deleteSecureValue(legacyRefreshKey);
    } catch {
      await signOutLocally();
    }
  }, [acceptSession, signOutLocally, storedSession]);

  // Cold start: hydrate from the Keychain and paint. The network is only
  // involved when the stored access token is spent or absent, so a warm launch
  // reaches the shell without waiting on Supabase.
  useEffect(() => {
    if (!mobileConfig.ready) return;
    let active = true;
    void (async () => {
      try {
        const stored = await storedSession();
        if (!active) return;
        if (
          stored &&
          stored.expires_at - Math.floor(Date.now() / 1_000) >
            expiryGuardSeconds
        ) {
          setSession(toSession(stored));
          return;
        }
        await refresh();
      } catch {
        // A Keychain that will not answer is the same as a signed-out phone;
        // fall through to the sign-in screen rather than stranding the gate.
        if (active) setSession(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refresh, storedSession]);

  useEffect(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    if (!session) return;
    refreshTimer.current = setTimeout(
      () => void refresh(),
      Math.max(30_000, (session.expires_in - 90) * 1_000),
    );
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [refresh, session]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      accessToken: session?.access_token ?? null,
      user: session?.user ?? null,
      error,
      notice,
      async signIn(email, password) {
        setError(null);
        setNotice(null);
        try {
          await acceptSession(
            await tokenRequest("password", { email, password }),
          );
        } catch (reason) {
          const message =
            reason instanceof Error ? reason.message : "Sign in failed.";
          setError(message);
          throw reason;
        }
      },
      async signUp(fullName, email, password) {
        setError(null);
        setNotice(null);
        try {
          const result = await signupRequest(fullName, email, password);
          if (
            result?.access_token &&
            result.refresh_token &&
            result.expires_in &&
            result.user
          ) {
            await acceptSession(result as TokenResponse);
            return;
          }
          setNotice(
            "Check your email to verify the account, then return here and sign in.",
          );
        } catch (reason) {
          const message =
            reason instanceof Error
              ? reason.message
              : "Account creation failed.";
          setError(message);
          throw reason;
        }
      },
      async signOut() {
        if (session?.access_token)
          await authFetch(mobileConfig.supabaseUrl + "/auth/v1/logout", {
            method: "POST",
            headers: {
              apikey: mobileConfig.supabaseKey,
              Authorization: "Bearer " + session.access_token,
            },
          }).catch(() => null);
        await clearLocalAccountData();
        await signOutLocally();
      },
    }),
    [acceptSession, error, loading, notice, session, signOutLocally],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is missing.");
  return value;
}

export function SignIn() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    setFormError(null);
    if (mode === "sign-up" && password !== String(form.get("confirmation"))) {
      setFormError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "sign-in")
        await auth.signIn(String(form.get("email")), password);
      else
        await auth.signUp(
          String(form.get("fullName")),
          String(form.get("email")),
          password,
        );
    } catch {
      // AuthProvider has already converted the failure into user-facing state.
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth">
      <div className="brand">
        <span className="brand-mark">M</span>
        Mori
      </div>
      <section className="auth-card">
        <div className="segmented-control" aria-label="Authentication mode">
          <button
            type="button"
            aria-pressed={mode === "sign-in"}
            onClick={() => {
              setMode("sign-in");
              setFormError(null);
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            aria-pressed={mode === "sign-up"}
            onClick={() => {
              setMode("sign-up");
              setFormError(null);
            }}
          >
            Create account
          </button>
        </div>
        <div>
          <p className="eyebrow">Mori</p>
          <h1>{mode === "sign-in" ? "Welcome back" : "Protect your time"}</h1>
          <p className="supporting">
            {mode === "sign-in"
              ? "Your session is kept in this phone's Keychain."
              : "Your schedule starts private."}
          </p>
        </div>
        {auth.error && <div className="error">{auth.error}</div>}
        {formError && <div className="error">{formError}</div>}
        {auth.notice && <div className="success">{auth.notice}</div>}
        <form className="page" onSubmit={submit}>
          {mode === "sign-up" && (
            <label className="field">
              Name
              <input
                name="fullName"
                autoComplete="name"
                maxLength={80}
                required
              />
            </label>
          )}
          <label className="field">
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label className="field">
            Password
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={
                mode === "sign-in" ? "current-password" : "new-password"
              }
              minLength={8}
              required
            />
          </label>
          {mode === "sign-up" && (
            <label className="field">
              Confirm password
              <input
                name="confirmation"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
          )}
          <label className="check-row">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
            />
            Show password
          </label>
          <button
            className="primary full"
            disabled={busy || !mobileConfig.ready}
          >
            {busy
              ? "Please wait…"
              : mode === "sign-in"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>
      </section>
    </main>
  );
}
