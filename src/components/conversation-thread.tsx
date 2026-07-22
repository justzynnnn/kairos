"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  ArrowLeft,
  Download,
  FileText,
  LoaderCircle,
  LockKeyhole,
  Paperclip,
  RefreshCw,
  Send,
} from "lucide-react";
import type {
  ConversationMessage,
  ConversationView,
} from "@/lib/conversations/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type DemoRole = "justin" | "chloe";
type OptimisticMessage = ConversationMessage & {
  sendState?: "sending" | "failed";
  nonce?: string;
};

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function clock(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function fileSize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function ConversationThread({
  conversationId,
  supabaseConfigured,
  role,
}: {
  conversationId: string;
  supabaseConfigured: boolean;
  role: DemoRole;
}) {
  const [conversation, setConversation] = useState<ConversationView | null>(
    null,
  );
  const [messages, setMessages] = useState<OptimisticMessage[]>([]);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const firstLoad = useRef(true);
  const preserveHeight = useRef<number | null>(null);

  const headers = useCallback(
    (): Record<string, string> =>
      supabaseConfigured ? {} : { "x-demo-user": role },
    [role, supabaseConfigured],
  );

  const fetchConversation = useCallback(
    async (before?: string, background = false) => {
      if (before) setLoadingOlder(true);
      else if (!background) setLoading(true);
      try {
        const query = before ? `?before=${encodeURIComponent(before)}` : "";
        const response = await fetch(
          `/api/conversations/${conversationId}${query}`,
          { headers: headers() },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        const incoming = data.conversation as ConversationView;
        setConversation(incoming);
        setMessages((current) => {
          const pending = current.filter((message) => message.sendState);
          if (before) {
            const known = new Set(current.map((message) => message.id));
            return [
              ...incoming.messages.filter((message) => !known.has(message.id)),
              ...current,
            ];
          }
          const incomingIds = new Set(
            incoming.messages.map((message) => message.id),
          );
          return [
            ...incoming.messages,
            ...pending.filter((message) => !incomingIds.has(message.id)),
          ];
        });
        setError(null);
        if (!before)
          void fetch(`/api/conversations/${conversationId}/read`, {
            method: "POST",
            headers: headers(),
          });
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Conversation could not be loaded.",
        );
      } finally {
        setLoading(false);
        setLoadingOlder(false);
      }
    },
    [conversationId, headers],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      firstLoad.current = true;
      void fetchConversation();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchConversation]);

  useEffect(() => {
    if (!supabaseConfigured) return;
    const client = createBrowserSupabaseClient();
    const channel = client
      .channel(`conversation-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => void fetchConversation(undefined, true),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_attachments",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => void fetchConversation(undefined, true),
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [conversationId, fetchConversation, supabaseConfigured]);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    if (preserveHeight.current !== null) {
      element.scrollTop += element.scrollHeight - preserveHeight.current;
      preserveHeight.current = null;
      return;
    }
    if (firstLoad.current && messages.length) {
      element.scrollTop = element.scrollHeight;
      firstLoad.current = false;
    }
  }, [messages]);

  async function loadOlder() {
    if (!conversation?.nextCursor || !scroller.current) return;
    preserveHeight.current = scroller.current.scrollHeight;
    await fetchConversation(conversation.nextCursor);
  }

  async function sendMessage(
    text: string,
    selectedFile: File | null,
    existing?: OptimisticMessage,
  ) {
    const clean = text.trim();
    if (!clean && !selectedFile) return;
    const nonce = existing?.nonce ?? crypto.randomUUID();
    const optimisticId = existing?.id ?? `pending-${nonce}`;
    if (!existing) {
      setMessages((current) => [
        ...current,
        {
          id: optimisticId,
          conversationId,
          senderId: null,
          senderName: "You",
          senderKind: "user",
          type: "text",
          body: clean || `Shared ${selectedFile?.name}`,
          isMine: true,
          private: false,
          relatedMeetingId: null,
          createdAt: new Date().toISOString(),
          attachments: [],
          sendState: "sending",
          nonce,
        },
      ]);
      setBody("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      requestAnimationFrame(() => {
        if (scroller.current)
          scroller.current.scrollTop = scroller.current.scrollHeight;
      });
    } else {
      setMessages((current) =>
        current.map((message) =>
          message.id === optimisticId
            ? { ...message, sendState: "sending" }
            : message,
        ),
      );
    }

    try {
      let response: Response;
      if (selectedFile) {
        const form = new FormData();
        form.set("file", selectedFile);
        form.set("body", clean || `Shared ${selectedFile.name}`);
        form.set("clientNonce", nonce);
        response = await fetch(
          `/api/conversations/${conversationId}/attachments`,
          { method: "POST", headers: headers(), body: form },
        );
      } else {
        response = await fetch(
          `/api/conversations/${conversationId}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers() },
            body: JSON.stringify({
              body: clean,
              clientNonce: nonce,
              relatedMeetingId: null,
            }),
          },
        );
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessages((current) =>
        current.filter((message) => message.id !== optimisticId),
      );
      await fetchConversation(undefined, true);
    } catch (reason) {
      setMessages((current) =>
        current.map((message) =>
          message.id === optimisticId
            ? { ...message, sendState: "failed" }
            : message,
        ),
      );
      setError(
        reason instanceof Error ? reason.message : "Message was not sent.",
      );
    }
  }

  if (loading && !conversation) {
    return (
      <div
        className="thread-shell"
        role="status"
        aria-label="Loading conversation"
      >
        <div className="skeleton h-16" />
        <div className="grid flex-1 gap-3 p-5">
          <div className="skeleton h-20 w-2/3 rounded-2xl" />
          <div className="skeleton ml-auto h-14 w-1/2 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="empty-state raised-panel">
        <AlertCircle className="size-7" />
        <h1>Conversation unavailable</h1>
        <p>{error ?? "This thread may have been removed."}</p>
        <Link href="/inbox" className="btn btn-primary min-h-11 px-4">
          Back to chats
        </Link>
      </div>
    );
  }

  return (
    <section
      className="thread-shell"
      aria-label={`Conversation with ${conversation.otherUser.name}`}
    >
      <header className="thread-header">
        <Link
          href={
            `/inbox${supabaseConfigured ? "" : `?demoUser=${role}`}` as Route
          }
          aria-label="Back to chats"
          className="icon-button"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <span className="avatar-mark">
          {initial(conversation.otherUser.name)}
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-display font-semibold text-[var(--navy)]">
            {conversation.otherUser.name}
          </h1>
          <p className="truncate text-xs text-[var(--muted)]">
            {conversation.otherUser.email}
          </p>
        </div>
      </header>

      <div ref={scroller} className="thread-messages" aria-live="polite">
        {conversation.nextCursor && (
          <button
            type="button"
            disabled={loadingOlder}
            onClick={() => void loadOlder()}
            className="load-older"
          >
            {loadingOlder ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : null}
            Load earlier messages
          </button>
        )}
        {messages.length ? (
          messages.map((message) => (
            <article
              key={message.id}
              className={`message-row ${message.senderKind === "system" ? "system" : message.isMine ? "mine" : "theirs"}`}
            >
              {message.senderKind === "system" ? (
                <div className="system-message">
                  <span>Schedule update</span>
                  {message.private && (
                    <small>
                      <LockKeyhole className="size-3" />
                      Private
                    </small>
                  )}
                  <p>{message.body}</p>
                </div>
              ) : (
                <div className="message-bubble">
                  <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                    {message.body}
                  </p>
                  {message.attachments.map((attachment) => (
                    <a
                      key={attachment.id}
                      href={attachment.downloadPath}
                      target="_blank"
                      rel="noreferrer"
                      className="attachment-card"
                    >
                      <FileText className="size-4" />
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate">
                          {attachment.name}
                        </strong>
                        <small>{fileSize(attachment.sizeBytes)}</small>
                      </span>
                      <Download className="size-4" />
                    </a>
                  ))}
                  <span className="message-meta">
                    <time>{clock(message.createdAt)}</time>
                    {message.sendState === "sending" && "Sending…"}
                    {message.sendState === "failed" && (
                      <button
                        type="button"
                        onClick={() =>
                          void sendMessage(message.body, null, message)
                        }
                      >
                        <RefreshCw className="size-3" />
                        Retry
                      </button>
                    )}
                  </span>
                </div>
              )}
            </article>
          ))
        ) : (
          <div className="empty-thread">
            <p>No messages yet. Say hello.</p>
          </div>
        )}
      </div>

      {error && (
        <p className="thread-error" role="alert">
          <AlertCircle className="size-4" />
          {error}
          <button type="button" onClick={() => setError(null)}>
            Dismiss
          </button>
        </p>
      )}
      <div className="thread-composer">
        {file && (
          <div className="selected-file">
            <span>
              {file.name} · {fileSize(file.size)}
            </span>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                if (fileInput.current) fileInput.current.value = "";
              }}
            >
              Remove
            </button>
          </div>
        )}
        <div className="composer-field">
          <label className="icon-button cursor-pointer" title="Attach file">
            <Paperclip className="size-5" />
            <span className="sr-only">Attach file</span>
            <input
              ref={fileInput}
              type="file"
              className="sr-only"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,application/pdf,image/png,image/jpeg,image/webp,text/plain"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <textarea
            aria-label="Write a message"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage(body, file);
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder="Message"
          />
          <button
            type="button"
            aria-label="Send message"
            disabled={!body.trim() && !file}
            onClick={() => void sendMessage(body, file)}
            className="send-button"
          >
            <Send className="size-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
