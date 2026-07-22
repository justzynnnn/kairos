"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  LoaderCircle,
  MessageSquarePlus,
  Search,
} from "lucide-react";
import type { ConversationContact } from "@/lib/conversations/types";

type DemoRole = "justin" | "chloe";

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function relativeTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function ConversationList({
  supabaseConfigured,
  initialRole,
}: {
  supabaseConfigured: boolean;
  initialRole: DemoRole;
}) {
  const router = useRouter();
  const [role, setRole] = useState<DemoRole>(initialRole);
  const [contacts, setContacts] = useState<ConversationContact[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const headers = useCallback(
    (): Record<string, string> =>
      supabaseConfigured ? {} : { "x-demo-user": role },
    [role, supabaseConfigured],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      fetch("/api/conversations", {
        headers: headers(),
        signal: controller.signal,
      })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          setContacts(data.contacts ?? []);
        })
        .catch((reason) => {
          if (reason instanceof DOMException && reason.name === "AbortError")
            return;
          setError(
            reason instanceof Error
              ? reason.message
              : "Conversations could not be loaded.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [headers]);

  const filtered = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return contacts;
    return contacts.filter((contact) =>
      `${contact.name} ${contact.email} ${contact.lastMessage ?? ""}`
        .toLowerCase()
        .includes(clean),
    );
  }, [contacts, query]);

  async function openConversation(contact: ConversationContact) {
    if (contact.conversationId) {
      router.push(
        `/inbox/chats/${contact.conversationId}${supabaseConfigured ? "" : `?demoUser=${role}`}` as Route,
      );
      return;
    }
    setStartingId(contact.id);
    setError(null);
    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ userId: contact.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      router.push(
        `/inbox/chats/${data.conversationId}${supabaseConfigured ? "" : `?demoUser=${role}`}` as Route,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Conversation could not be opened.",
      );
      setStartingId(null);
    }
  }

  return (
    <div className="content-list">
      {!supabaseConfigured && (
        <section className="preview-account" aria-label="Local preview account">
          <span>Viewing as</span>
          <div className="segmented-control">
            {(["justin", "chloe"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={role === value}
                onClick={() => {
                  setRole(value);
                  router.replace(`/inbox?demoUser=${value}`);
                }}
              >
                {value}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="list-toolbar">
        <label className="search-field">
          <Search aria-hidden="true" className="size-4" />
          <span className="sr-only">Search conversations</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations"
          />
        </label>
        <Link
          href={
            `/inbox/people${supabaseConfigured ? "" : `?demoUser=${role}`}` as Route
          }
          className="btn btn-primary min-h-11 px-4 text-sm"
        >
          <MessageSquarePlus className="size-4" /> New message
        </Link>
      </div>

      {error && (
        <p className="inline-error" role="alert">
          <AlertCircle className="size-4" />
          {error}
        </p>
      )}

      <section
        className="raised-panel overflow-hidden"
        aria-label="Conversations"
      >
        {loading ? (
          <div
            className="grid gap-1 p-2"
            role="status"
            aria-label="Loading conversations"
          >
            {[1, 2, 3].map((item) => (
              <div key={item} className="skeleton h-20 rounded-xl" />
            ))}
          </div>
        ) : filtered.length ? (
          <ul className="divide-y divide-[var(--outline-soft)]">
            {filtered.map((contact) => (
              <li key={contact.id}>
                <button
                  type="button"
                  onClick={() => void openConversation(contact)}
                  className="conversation-row"
                >
                  <span className="avatar-mark">{initial(contact.name)}</span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="flex items-baseline justify-between gap-3">
                      <strong className="truncate text-[var(--navy)]">
                        {contact.name}
                      </strong>
                      <time className="shrink-0 text-xs text-[var(--muted)]">
                        {relativeTime(contact.lastMessageAt)}
                      </time>
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-3">
                      <span className="truncate text-sm text-[var(--muted)]">
                        {contact.lastMessage ?? "Start a conversation"}
                      </span>
                      {contact.unreadCount > 0 && (
                        <span
                          className="unread-badge"
                          aria-label={`${contact.unreadCount} unread messages`}
                        >
                          {Math.min(contact.unreadCount, 99)}
                        </span>
                      )}
                    </span>
                  </span>
                  {startingId === contact.id && (
                    <LoaderCircle className="size-4 animate-spin text-[var(--muted)]" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">
            <MessageSquarePlus className="size-7" />
            <h2>{query ? "No conversations match" : "No conversations yet"}</h2>
            <p>
              {query
                ? "Try another name or message."
                : "Find a friend and start a private conversation."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
