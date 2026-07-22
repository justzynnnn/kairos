import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useMobileData } from "../lib/data";

type Thread = {
  id: string;
  name: string;
  messages: Array<{
    id: string;
    body: string;
    createdAt: string;
    mine: boolean;
    system: boolean;
    pending?: boolean;
    failed?: boolean;
  }>;
  nextCursor: string | null;
};

export default function Inbox() {
  const auth = useAuth();
  const { data, state } = useMobileData();
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadThread = useCallback(
    async (id: string) => {
      if (!auth.accessToken || state === "offline") return;
      try {
        const value = await apiRequest<Thread>(
          "/api/mobile/conversations/" + id,
          auth.accessToken,
        );
        setThread(value);
        setError(null);
      } catch (reason) {
        setError(
          reason instanceof Error ? reason.message : "Thread unavailable.",
        );
      }
    },
    [auth.accessToken, state],
  );

  useEffect(() => {
    if (!selected || state === "offline") return;
    queueMicrotask(() => void loadThread(selected));
    const timer = setInterval(() => void loadThread(selected), 5_000);
    return () => clearInterval(timer);
  }, [loadThread, selected, state]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !thread || !auth.accessToken) return;
    const form = new FormData(event.currentTarget);
    const body = String(form.get("body") ?? "").trim();
    if (!body) return;
    event.currentTarget.reset();
    const id = crypto.randomUUID();
    const optimistic = {
      id,
      body,
      createdAt: new Date().toISOString(),
      mine: true,
      system: false,
      pending: true,
    };
    setThread({ ...thread, messages: [...thread.messages, optimistic] });
    try {
      const result = await apiRequest<{ message: Thread["messages"][number] }>(
        "/api/mobile/conversations/" + selected,
        auth.accessToken,
        {
          method: "POST",
          body: JSON.stringify({ body, clientMessageId: id }),
        },
      );
      setThread((current) =>
        current
          ? {
              ...current,
              messages: current.messages.map((message) =>
                message.id === id ? result.message : message,
              ),
            }
          : current,
      );
    } catch {
      setThread((current) =>
        current
          ? {
              ...current,
              messages: current.messages.map((message) =>
                message.id === id
                  ? { ...message, pending: false, failed: true }
                  : message,
              ),
            }
          : current,
      );
    }
  }
  if (!data) return null;
  if (selected)
    return (
      <main className="page">
        <header className="actions" style={{ justifyContent: "flex-start" }}>
          <button
            className="secondary"
            onClick={() => {
              setSelected(null);
              setThread(null);
            }}
          >
            Back
          </button>
          <div>
            <p className="eyebrow">Conversation</p>
            <h1 style={{ fontSize: 22, margin: 0 }}>
              {thread?.name ?? "Loading…"}
            </h1>
          </div>
        </header>
        {error && <div className="error">{error}</div>}
        <section className="page" aria-live="polite">
          {thread?.messages.map((message) => (
            <article
              key={message.id}
              className={"chat-bubble " + (message.mine ? "mine" : "")}
            >
              {message.body}
              {message.pending && <small> Sending…</small>}
              {message.failed && <small> Not sent</small>}
            </article>
          ))}
        </section>
        <form className="actions" onSubmit={send}>
          <label className="field" style={{ flex: 1 }}>
            <span className="eyebrow">Message</span>
            <input name="body" maxLength={4_000} autoComplete="off" />
          </label>
          <button className="primary" disabled={state === "offline"}>
            Send
          </button>
        </form>
      </main>
    );
  return (
    <main className="page">
      <header>
        <p className="eyebrow">Online conversations</p>
        <h1>Inbox</h1>
        <p className="supporting">
          Message bodies and attachments are never kept in the offline store.
        </p>
      </header>
      {state === "offline" && (
        <div className="notice">
          Conversation summaries are cached. Reconnect to open a thread.
        </div>
      )}
      <section className="panel panel-pad">
        <p className="eyebrow">Conversations</p>
        <div className="list">
          {data.conversationSummaries.length ? (
            data.conversationSummaries.map((conversation) => (
              <button
                type="button"
                className="row"
                key={conversation.id}
                disabled={state === "offline"}
                style={{
                  width: "100%",
                  textAlign: "left",
                  borderTop: 0,
                  borderRight: 0,
                  borderLeft: 0,
                  background: "transparent",
                }}
                onClick={() => setSelected(conversation.id)}
              >
                <span className="brand-mark">
                  {conversation.name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <p className="row-title">{conversation.name}</p>
                  <p className="row-meta">
                    {conversation.lastMessage ?? "Start the conversation"}
                  </p>
                </div>
                {conversation.unreadCount > 0 && (
                  <span className="badge">{conversation.unreadCount}</span>
                )}
              </button>
            ))
          ) : (
            <p className="supporting">No conversations yet.</p>
          )}
        </div>
      </section>
      <section className="panel panel-pad">
        <p className="eyebrow">Meeting coordination</p>
        <div className="list">
          {data.meetingSummaries.length ? (
            data.meetingSummaries.map((meeting) => (
              <article className="row" key={meeting.id}>
                <span className="row-time">Meet</span>
                <div>
                  <p className="row-title">{meeting.title}</p>
                  <p className="row-meta">
                    {meeting.state.replaceAll("_", " ")}
                  </p>
                </div>
              </article>
            ))
          ) : (
            <p className="supporting">No active meeting requests.</p>
          )}
        </div>
      </section>
    </main>
  );
}
