"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertCircle,
  Check,
  LoaderCircle,
  MessageCircle,
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import type { ConversationContact } from "@/lib/conversations/types";
import type { ConnectionCard, UserSearchResult } from "@/lib/profile/types";

type DemoRole = "justin" | "chloe";

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function ContactsPanel({
  role,
  supabaseConfigured,
}: {
  role: DemoRole;
  supabaseConfigured: boolean;
}) {
  const router = useRouter();
  const [contacts, setContacts] = useState<ConversationContact[]>([]);
  const [requests, setRequests] = useState<ConnectionCard[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const headers = useCallback(
    (): Record<string, string> =>
      supabaseConfigured ? {} : { "x-demo-user": role },
    [role, supabaseConfigured],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [contactResponse, connectionResponse] = await Promise.all([
        fetch("/api/conversations", { headers: headers() }),
        fetch("/api/profile/connections", { headers: headers() }),
      ]);
      const contactData = await contactResponse.json();
      const connectionData = await connectionResponse.json();
      if (!contactResponse.ok) throw new Error(contactData.error);
      setContacts(contactData.contacts ?? []);
      if (connectionResponse.ok) {
        setRequests(
          (connectionData.connections ?? []).filter(
            (entry: ConnectionCard) =>
              entry.status === "pending" && entry.direction === "incoming",
          ),
        );
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "People could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function search(event?: FormEvent) {
    event?.preventDefault();
    if (query.trim().length < 2) return;
    setBusyId("search");
    setError(null);
    try {
      const response = await fetch(
        `/api/profile/users?q=${encodeURIComponent(query.trim())}`,
        { headers: headers() },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setResults(data.users ?? []);
      setSearched(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Search failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function updateConnection(
    user: UserSearchResult | ConnectionCard,
    action: "request" | "accept",
  ) {
    const userId = "userId" in user ? user.userId : user.id;
    setBusyId(userId);
    setError(null);
    setNotice(null);
    try {
      const incoming = action === "accept";
      const connectionId =
        "connectionId" in user
          ? user.connectionId
          : "id" in user
            ? user.id
            : null;
      const response = await fetch(
        incoming ? "/api/profile/connections" : "/api/profile/users",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers() },
          body: JSON.stringify(
            incoming ? { id: connectionId, action: "accept" } : { userId },
          ),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setNotice(incoming ? "Friend request accepted." : "Friend request sent.");
      await load();
      if (searched) await search();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Friend request could not be updated.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function message(contact: {
    id: string;
    conversationId?: string | null;
  }) {
    setBusyId(contact.id);
    try {
      let id = contact.conversationId;
      if (!id) {
        const response = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers() },
          body: JSON.stringify({ userId: contact.id }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        id = data.conversationId;
      }
      if (!id) throw new Error("Conversation could not be opened.");
      router.push(
        `/inbox/chats/${id}${supabaseConfigured ? "" : `?demoUser=${role}`}` as Route,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Conversation could not be opened.",
      );
      setBusyId(null);
    }
  }

  return (
    <div className="grid gap-6">
      <section className="grouped-section" aria-labelledby="find-people-title">
        <div>
          <p className="eyebrow">Grow your circle</p>
          <h2 id="find-people-title" className="section-title">
            Find people
          </h2>
          <p className="supporting-text">
            Search by name, username, or email. Kairos only enables messaging
            after a friend request is accepted.
          </p>
        </div>
        <form onSubmit={search} role="search" className="list-toolbar">
          <label className="search-field">
            <Search className="size-4" />
            <span className="sr-only">Search people</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, username, or email"
            />
          </label>
          <button
            type="submit"
            disabled={query.trim().length < 2 || busyId === "search"}
            className="btn btn-primary min-h-11 px-5 text-sm"
          >
            {busyId === "search" ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              "Search"
            )}
          </button>
        </form>
        {searched && (
          <div className="result-list">
            {results.length ? (
              results.map((user) => (
                <article key={user.id} className="person-row">
                  <span className="avatar-mark">{initial(user.name)}</span>
                  <div className="min-w-0 flex-1">
                    <strong>{user.name}</strong>
                    <p>@{user.username}</p>
                  </div>
                  {user.connectionStatus === "accepted" ? (
                    <button
                      type="button"
                      onClick={() => void message(user)}
                      className="btn btn-outline min-h-10 px-3 text-sm"
                    >
                      <MessageCircle className="size-4" />
                      Message
                    </button>
                  ) : user.connectionStatus === "none" ||
                    user.connectionStatus === "pending_incoming" ? (
                    <button
                      type="button"
                      disabled={busyId === user.id}
                      onClick={() =>
                        void updateConnection(
                          user,
                          user.connectionStatus === "pending_incoming"
                            ? "accept"
                            : "request",
                        )
                      }
                      className="btn btn-primary min-h-10 px-3 text-sm"
                    >
                      <UserPlus className="size-4" />
                      {user.connectionStatus === "pending_incoming"
                        ? "Accept"
                        : "Add friend"}
                    </button>
                  ) : (
                    <span className="status-badge">
                      {user.connectionStatus === "pending_outgoing"
                        ? "Request sent"
                        : "Unavailable"}
                    </span>
                  )}
                </article>
              ))
            ) : (
              <p className="empty-row">No Kairos users matched that search.</p>
            )}
          </div>
        )}
      </section>

      {error && (
        <p className="inline-error" role="alert">
          <AlertCircle className="size-4" />
          {error}
        </p>
      )}
      {notice && (
        <p className="inline-success" role="status">
          <Check className="size-4" />
          {notice}
        </p>
      )}

      {requests.length > 0 && (
        <section
          className="raised-panel overflow-hidden"
          aria-labelledby="requests-title"
        >
          <header className="panel-header">
            <h2 id="requests-title" className="section-title">
              Friend requests
            </h2>
          </header>
          <div className="divide-y divide-[var(--outline-soft)]">
            {requests.map((request) => (
              <article key={request.id} className="person-row">
                <span className="avatar-mark">{initial(request.name)}</span>
                <div className="min-w-0 flex-1">
                  <strong>{request.name}</strong>
                  <p>Wants to connect</p>
                </div>
                <button
                  type="button"
                  disabled={busyId === request.userId}
                  onClick={() => void updateConnection(request, "accept")}
                  className="btn btn-primary min-h-10 px-3 text-sm"
                >
                  Accept
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section
        className="raised-panel overflow-hidden"
        aria-labelledby="friends-title"
      >
        <header className="panel-header">
          <div>
            <p className="eyebrow">Accepted connections</p>
            <h2 id="friends-title" className="section-title">
              Friends
            </h2>
          </div>
          <Users className="size-5 text-[var(--muted)]" />
        </header>
        {loading ? (
          <div className="grid gap-1 p-2" role="status">
            <div className="skeleton h-16 rounded-xl" />
            <div className="skeleton h-16 rounded-xl" />
          </div>
        ) : contacts.length ? (
          <div className="divide-y divide-[var(--outline-soft)]">
            {contacts.map((contact) => (
              <article key={contact.id} className="person-row">
                <span className="avatar-mark">{initial(contact.name)}</span>
                <div className="min-w-0 flex-1">
                  <strong>{contact.name}</strong>
                  <p>{contact.email}</p>
                </div>
                <button
                  type="button"
                  disabled={busyId === contact.id}
                  onClick={() => void message(contact)}
                  className="btn btn-outline min-h-10 px-3 text-sm"
                >
                  {busyId === contact.id ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <MessageCircle className="size-4" />
                  )}
                  Message
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Users className="size-7" />
            <h2>No friends yet</h2>
            <p>Search above to send your first request.</p>
          </div>
        )}
      </section>
    </div>
  );
}
