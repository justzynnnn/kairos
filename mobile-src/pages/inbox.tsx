import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  ConnectionCard,
  MeetingCard,
  MobileAttachment,
  MobileAttachmentUrlPayload,
  MobileMeetingPayload,
  MobileMeetingsPayload,
  MobilePeoplePayload,
  MobileUserSearchPayload,
  UserSearchResult,
} from "@/lib/mobile/contracts-types";
import { readLocalSnapshot, writeLocalSnapshot } from "@/lib/mobile/store";
import EmptyState from "../components/empty-state";
import Sheet from "../components/sheet";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import { badgeCount } from "../lib/counts";
import { clockTime, longDate } from "../lib/datetime";
import { useMobileData } from "../lib/data";
import {
  Check,
  ChevronLeft,
  MessagesSquare,
  Paperclip,
  Search,
  Send,
  UserPlus,
  Users,
  X,
} from "../lib/icons";
import { useOnline } from "../lib/online";

type Segment = "chats" | "people" | "meetings";

type ThreadMessage = {
  id: string;
  body: string;
  createdAt: string;
  mine: boolean;
  system: boolean;
  attachments?: MobileAttachment[];
  pending?: boolean;
  failed?: boolean;
};
type Thread = {
  id: string;
  name: string;
  messages: ThreadMessage[];
  nextCursor: string | null;
};

const meetingStates: Record<MeetingCard["state"], string> = {
  draft: "Draft",
  options_sent: "Waiting on you",
  awaiting_sender_confirmation: "Waiting on sender",
  confirmed: "Confirmed",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
};

function optionLabel(startAt: string, endAt: string, timezone: string) {
  const start = new Date(startAt);
  return `${longDate(start, timezone)} · ${clockTime(start, timezone)}–${clockTime(new Date(endAt), timezone)}`;
}

// Value for a datetime-local input, which has no timezone of its own.
function localInputValue(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function Inbox() {
  const auth = useAuth();
  const { data, state, refresh } = useMobileData();
  const online = useOnline();
  const offline = !online || state === "offline";
  const [segment, setSegment] = useState<Segment>("chats");
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [connections, setConnections] = useState<ConnectionCard[]>([]);
  const [meetings, setMeetings] = useState<MeetingCard[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[] | null>(null);
  const [matchOpen, setMatchOpen] = useState(false);
  const [counterFor, setCounterFor] = useState<MeetingCard | null>(null);
  const [chosenOption, setChosenOption] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const peopleKey = auth.user ? "people:" + auth.user.id : "people";
  const meetingsKey = auth.user ? "meetings:" + auth.user.id : "meetings";
  const timezone = data?.viewer.timezone ?? "Asia/Manila";

  const loadThread = useCallback(
    async (id: string) => {
      if (!auth.accessToken || offline) return;
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
    [auth.accessToken, offline],
  );

  const loadPeople = useCallback(async () => {
    if (!auth.accessToken) return;
    try {
      const value = await apiRequest<MobilePeoplePayload>(
        "/api/mobile/people",
        auth.accessToken,
      );
      setConnections(value.connections);
      void writeLocalSnapshot(peopleKey, value.connections);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "People are unavailable.",
      );
    }
  }, [auth.accessToken, peopleKey]);

  const loadMeetings = useCallback(async () => {
    if (!auth.accessToken) return;
    try {
      const value = await apiRequest<MobileMeetingsPayload>(
        "/api/mobile/meetings",
        auth.accessToken,
      );
      setMeetings(value.meetings);
      void writeLocalSnapshot(meetingsKey, value.meetings);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Meetings are unavailable.",
      );
    }
  }, [auth.accessToken, meetingsKey]);

  // Each segment paints its cached copy, then refreshes if there is a
  // connection. Nothing here blocks on the network.
  useEffect(() => {
    let active = true;
    if (segment === "people")
      void readLocalSnapshot<ConnectionCard[]>(peopleKey).then((cached) => {
        if (!active) return;
        if (cached) setConnections(cached);
        if (!offline) void loadPeople();
      });
    if (segment === "meetings")
      void readLocalSnapshot<MeetingCard[]>(meetingsKey).then((cached) => {
        if (!active) return;
        if (cached) setMeetings(cached);
        if (!offline) void loadMeetings();
      });
    return () => {
      active = false;
    };
  }, [loadMeetings, loadPeople, meetingsKey, offline, peopleKey, segment]);

  useEffect(() => {
    if (!selected || offline) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    // Polling only earns its keep while the thread is on screen; a backgrounded
    // app kept re-fetching every five seconds.
    const start = () => {
      if (timer) return;
      timer = setInterval(() => void loadThread(selected), 5_000);
    };
    const visibility = () => {
      if (document.hidden) {
        stop();
        return;
      }
      void loadThread(selected);
      start();
    };
    queueMicrotask(() => void loadThread(selected));
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [loadThread, offline, selected]);

  function fail(reason: unknown, fallback: string) {
    setError(reason instanceof Error ? reason.message : fallback);
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !thread || !auth.accessToken) return;
    const form = new FormData(event.currentTarget);
    const body = String(form.get("body") ?? "").trim();
    if (!body) return;
    event.currentTarget.reset();
    const id = crypto.randomUUID();
    const optimistic: ThreadMessage = {
      id,
      body,
      createdAt: new Date().toISOString(),
      mine: true,
      system: false,
      pending: true,
    };
    setThread({ ...thread, messages: [...thread.messages, optimistic] });
    try {
      const result = await apiRequest<{ message: ThreadMessage }>(
        "/api/mobile/conversations/" + selected,
        auth.accessToken,
        { method: "POST", body: JSON.stringify({ body, clientMessageId: id }) },
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

  async function attach(file: File) {
    if (!selected || !auth.accessToken) return;
    setBusyId("attachment");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("body", "Shared " + file.name);
      form.append("clientNonce", crypto.randomUUID());
      await apiRequest<{ id: string }>(
        "/api/mobile/conversations/" + selected + "/attachments",
        auth.accessToken,
        { method: "POST", body: form },
      );
      await loadThread(selected);
    } catch (reason) {
      fail(reason, "The file could not be sent.");
    } finally {
      setBusyId(null);
    }
  }

  async function openAttachment(attachment: MobileAttachment) {
    if (!auth.accessToken) return;
    setBusyId(attachment.id);
    try {
      const { url } = await apiRequest<MobileAttachmentUrlPayload>(
        "/api/mobile/attachments/" + attachment.id,
        auth.accessToken,
      );
      window.open(url, "_blank");
    } catch (reason) {
      fail(reason, "That file could not be opened.");
    } finally {
      setBusyId(null);
    }
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!auth.accessToken || query.trim().length < 2) return;
    setBusyId("search");
    setError(null);
    try {
      const value = await apiRequest<MobileUserSearchPayload>(
        "/api/mobile/people/search?q=" + encodeURIComponent(query.trim()),
        auth.accessToken,
      );
      setResults(value.users);
    } catch (reason) {
      fail(reason, "Search is unavailable.");
    } finally {
      setBusyId(null);
    }
  }

  async function match(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth.accessToken) return;
    const form = new FormData(event.currentTarget);
    const emails = [
      ...new Set(
        String(form.get("emails") ?? "")
          .split(/[\s,;]+/)
          .map((value) => value.trim())
          .filter((value) => value.includes("@")),
      ),
    ].slice(0, 200);
    if (!emails.length) {
      setError("Paste at least one email address.");
      return;
    }
    setBusyId("match");
    setError(null);
    try {
      const value = await apiRequest<MobileUserSearchPayload>(
        "/api/mobile/people/match",
        auth.accessToken,
        { method: "POST", body: JSON.stringify({ emails }) },
      );
      setResults(value.users);
      setMatchOpen(false);
      setNotice(
        value.users.length
          ? value.users.length + " of them already use Mori."
          : "None of those addresses have a Mori account.",
      );
    } catch (reason) {
      fail(reason, "Those addresses could not be matched.");
    } finally {
      setBusyId(null);
    }
  }

  async function requestFriend(user: UserSearchResult) {
    if (!auth.accessToken) return;
    setBusyId(user.id);
    setError(null);
    try {
      await apiRequest("/api/mobile/people/request", auth.accessToken, {
        method: "POST",
        body: JSON.stringify({ userId: user.id }),
      });
      setResults(
        (current) =>
          current?.map((entry) =>
            entry.id === user.id
              ? { ...entry, connectionStatus: "pending_outgoing" as const }
              : entry,
          ) ?? null,
      );
      setNotice("Request sent to " + user.name + ".");
      await loadPeople();
    } catch (reason) {
      fail(reason, "The request could not be sent.");
    } finally {
      setBusyId(null);
    }
  }

  async function manage(
    connection: ConnectionCard,
    action: "accept" | "remove",
  ) {
    if (!auth.accessToken) return;
    setBusyId(connection.id);
    setError(null);
    try {
      await apiRequest(
        "/api/mobile/people/" + connection.id + "/manage",
        auth.accessToken,
        { method: "POST", body: JSON.stringify({ action }) },
      );
      setNotice(
        action === "accept"
          ? connection.name + " is now a friend."
          : "Request declined.",
      );
      await loadPeople();
    } catch (reason) {
      fail(reason, "That connection could not be updated.");
    } finally {
      setBusyId(null);
    }
  }

  async function openChat(connection: ConnectionCard) {
    if (!auth.accessToken) return;
    setBusyId(connection.id);
    setError(null);
    try {
      const { conversationId } = await apiRequest<{ conversationId: string }>(
        "/api/mobile/conversations",
        auth.accessToken,
        { method: "POST", body: JSON.stringify({ userId: connection.userId }) },
      );
      setSegment("chats");
      setSelected(conversationId);
      void refresh();
    } catch (reason) {
      fail(reason, "That chat could not be opened.");
    } finally {
      setBusyId(null);
    }
  }

  async function respond(
    meeting: MeetingCard,
    action: "send" | "accept" | "decline" | "confirm" | "counter",
    extra: { optionId?: string; counterStart?: string } = {},
  ) {
    if (!auth.accessToken) return;
    setBusyId(meeting.id);
    setError(null);
    try {
      const payload = await apiRequest<MobileMeetingPayload>(
        "/api/mobile/meetings/" + meeting.id + "/respond",
        auth.accessToken,
        { method: "POST", body: JSON.stringify({ action, ...extra }) },
      );
      const next = meetings.map((entry) =>
        entry.id === meeting.id ? payload.meeting : entry,
      );
      setMeetings(next);
      void writeLocalSnapshot(meetingsKey, next);
      setCounterFor(null);
      setNotice(meetingStates[payload.meeting.state] + ".");
      // A confirmed meeting becomes a calendar item.
      if (payload.meeting.state === "confirmed") void refresh();
    } catch (reason) {
      fail(reason, "That meeting response is no longer valid.");
    } finally {
      setBusyId(null);
    }
  }

  if (!data) return null;

  const unread = data.conversationSummaries.reduce(
    (total, conversation) => total + conversation.unreadCount,
    0,
  );
  const incoming = connections.filter(
    (connection) =>
      connection.status === "pending" && connection.direction === "incoming",
  );
  const friends = connections.filter(
    (connection) => connection.status === "accepted",
  );
  const outgoing = connections.filter(
    (connection) =>
      connection.status === "pending" && connection.direction === "outgoing",
  );
  const badges: Record<Segment, number> = {
    chats: unread,
    people: badgeCount(data.pendingConnectionCount) || incoming.length,
    meetings: badgeCount(data.actionableMeetingCount),
  };

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
            <ChevronLeft size={18} strokeWidth={2.5} aria-hidden />
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
              {message.attachments?.map((attachment) => (
                <button
                  key={attachment.id}
                  type="button"
                  className="attachment-chip"
                  disabled={offline || busyId === attachment.id}
                  onClick={() => void openAttachment(attachment)}
                >
                  <Paperclip size={14} strokeWidth={2.5} aria-hidden />
                  {attachment.name}
                </button>
              ))}
              {message.pending && <small> Sending…</small>}
              {message.failed && <small> Not sent</small>}
            </article>
          ))}
        </section>
        <form className="actions" onSubmit={send}>
          <input
            ref={fileInput}
            type="file"
            hidden
            accept="application/pdf,image/png,image/jpeg,image/webp,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void attach(file);
            }}
          />
          <button
            type="button"
            className="secondary"
            aria-label="Attach a file"
            disabled={offline || busyId === "attachment"}
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip size={18} strokeWidth={2.5} aria-hidden />
          </button>
          <label className="field" style={{ flex: 1 }}>
            <span className="eyebrow">Message</span>
            <input name="body" maxLength={4_000} autoComplete="off" />
          </label>
          <button className="primary" disabled={offline}>
            <Send size={18} strokeWidth={2.5} aria-hidden />
            Send
          </button>
        </form>
      </main>
    );

  return (
    <main className="page">
      <header>
        <p className="eyebrow">Chats, people, and meetings</p>
        <h1>Inbox</h1>
      </header>

      <div className="segmented-control" aria-label="Inbox section">
        {(["chats", "people", "meetings"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={segment === value}
            onClick={() => {
              setSegment(value);
              setError(null);
              setNotice(null);
            }}
          >
            {value === "chats"
              ? "Chats"
              : value === "people"
                ? "People"
                : "Meetings"}
            {badges[value] > 0 && (
              <span className="count-badge">{badges[value]}</span>
            )}
          </button>
        ))}
      </div>

      {offline && (
        <div className="notice" role="status">
          Offline. Showing the last sync; replies and responses resume when you
          reconnect.
        </div>
      )}
      {error && <div className="error">{error}</div>}
      {notice && <div className="success">{notice}</div>}

      {segment === "chats" && (
        <section className="panel panel-pad">
          <p className="eyebrow">Conversations</p>
          <div className="list">
            {data.conversationSummaries.length ? (
              data.conversationSummaries.map((conversation) => (
                <button
                  type="button"
                  className="row"
                  key={conversation.id}
                  disabled={offline}
                  onClick={() => setSelected(conversation.id)}
                >
                  <span className="row-time">
                    {clockTime(new Date(conversation.updatedAt), timezone)}
                  </span>
                  <div>
                    <p className="row-title">{conversation.name}</p>
                    <p className="row-meta">
                      {conversation.lastMessage ?? "No messages yet"}
                    </p>
                  </div>
                  {conversation.unreadCount > 0 && (
                    <span className="badge">{conversation.unreadCount}</span>
                  )}
                </button>
              ))
            ) : (
              <EmptyState
                icon={MessagesSquare}
                title="No conversations yet"
                hint="Open one from People to start talking."
                actionLabel="Find people"
                onAction={() => setSegment("people")}
              />
            )}
          </div>
        </section>
      )}

      {segment === "people" && (
        <>
          <section className="panel panel-pad page">
            <p className="eyebrow">Find people</p>
            <form className="actions" onSubmit={search} role="search">
              <label className="field" style={{ flex: 1 }}>
                <span className="eyebrow">Name, username, or email</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  autoComplete="off"
                  autoCapitalize="none"
                />
              </label>
              <button
                className="primary"
                disabled={offline || query.trim().length < 2}
              >
                <Search size={18} strokeWidth={2.5} aria-hidden />
                Search
              </button>
            </form>
            <button
              type="button"
              className="secondary full"
              disabled={offline}
              onClick={() => setMatchOpen(true)}
            >
              Check a list of emails
            </button>
            {results && (
              <div className="list">
                {results.length ? (
                  results.map((user) => (
                    <div className="row settings-row" key={user.id}>
                      <div>
                        <p className="row-title">{user.name}</p>
                        <p className="row-meta">@{user.username}</p>
                      </div>
                      {user.connectionStatus === "none" ? (
                        <button
                          type="button"
                          className="secondary"
                          disabled={offline || busyId === user.id}
                          onClick={() => void requestFriend(user)}
                        >
                          <UserPlus size={16} strokeWidth={2.5} aria-hidden />
                          Add
                        </button>
                      ) : (
                        <span className="badge">
                          {user.connectionStatus === "accepted"
                            ? "Friend"
                            : user.connectionStatus === "pending_outgoing"
                              ? "Requested"
                              : user.connectionStatus === "pending_incoming"
                                ? "Wants to connect"
                                : "Unavailable"}
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="supporting">Nobody matched.</p>
                )}
              </div>
            )}
          </section>

          {incoming.length > 0 && (
            <section className="panel panel-pad">
              <p className="eyebrow">Friend requests</p>
              <div className="list">
                {incoming.map((connection) => (
                  <div className="row settings-row" key={connection.id}>
                    <div>
                      <p className="row-title">{connection.name}</p>
                      <p className="row-meta">Wants to connect</p>
                    </div>
                    <span className="actions">
                      <button
                        type="button"
                        className="secondary"
                        aria-label={"Decline " + connection.name}
                        disabled={offline || busyId === connection.id}
                        onClick={() => void manage(connection, "remove")}
                      >
                        <X size={16} strokeWidth={2.5} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="primary"
                        disabled={offline || busyId === connection.id}
                        onClick={() => void manage(connection, "accept")}
                      >
                        <Check size={16} strokeWidth={2.5} aria-hidden />
                        Accept
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="panel panel-pad">
            <p className="eyebrow">Friends</p>
            <div className="list">
              {friends.length ? (
                friends.map((connection) => (
                  <div className="row settings-row" key={connection.id}>
                    <div>
                      <p className="row-title">{connection.name}</p>
                      <p className="row-meta">{connection.email}</p>
                    </div>
                    <button
                      type="button"
                      className="secondary"
                      disabled={offline || busyId === connection.id}
                      onClick={() => void openChat(connection)}
                    >
                      <MessagesSquare size={16} strokeWidth={2.5} aria-hidden />
                      Message
                    </button>
                  </div>
                ))
              ) : (
                <EmptyState
                  icon={Users}
                  title="No friends yet"
                  hint="Search above to send your first request."
                />
              )}
              {outgoing.map((connection) => (
                <div className="row settings-row" key={connection.id}>
                  <div>
                    <p className="row-title">{connection.name}</p>
                    <p className="row-meta">Request sent</p>
                  </div>
                  <span className="badge pending">Pending</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {segment === "meetings" && (
        <section className="page">
          {meetings.length ? (
            meetings.map((meeting) => {
              const organizer = meeting.participants.find(
                (participant) => participant.role === "organizer",
              );
              const mine = meeting.actorRole;
              const canAnswer =
                mine === "recipient" && meeting.state === "options_sent";
              const canSend = mine === "organizer" && meeting.state === "draft";
              const canConfirm =
                mine === "organizer" &&
                meeting.state === "awaiting_sender_confirmation";
              const picked =
                chosenOption[meeting.id] ??
                meeting.selectedOptionId ??
                meeting.options[0]?.id;
              return (
                <article className="panel panel-pad page" key={meeting.id}>
                  <div>
                    <p className="eyebrow">
                      {mine === "organizer"
                        ? "You proposed"
                        : (organizer?.name ?? "A friend") + " proposed"}
                    </p>
                    <h2>{meeting.title}</h2>
                    <p className="supporting">
                      {meeting.durationMinutes} minutes ·{" "}
                      {meetingStates[meeting.state]}
                    </p>
                  </div>
                  {meeting.options.length > 0 && (
                    <div className="list">
                      {meeting.options.map((option) => (
                        <label className="row settings-row" key={option.id}>
                          <div>
                            <p className="row-title">
                              {optionLabel(
                                option.startAt,
                                option.endAt,
                                meeting.timezone,
                              )}
                            </p>
                            {option.reason && (
                              <p className="row-meta">{option.reason}</p>
                            )}
                          </div>
                          <input
                            type="radio"
                            name={"option-" + meeting.id}
                            checked={picked === option.id}
                            disabled={!canAnswer || offline}
                            onChange={() =>
                              setChosenOption((current) => ({
                                ...current,
                                [meeting.id]: option.id,
                              }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                  )}
                  {(canAnswer || canSend || canConfirm) && (
                    <div className="actions">
                      {canAnswer && (
                        <>
                          <button
                            type="button"
                            className="secondary"
                            disabled={offline || busyId === meeting.id}
                            onClick={() => void respond(meeting, "decline")}
                          >
                            Decline
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            disabled={offline || busyId === meeting.id}
                            onClick={() => setCounterFor(meeting)}
                          >
                            Counter
                          </button>
                          <button
                            type="button"
                            className="primary"
                            disabled={
                              offline || busyId === meeting.id || !picked
                            }
                            onClick={() =>
                              void respond(meeting, "accept", {
                                optionId: picked,
                              })
                            }
                          >
                            Accept
                          </button>
                        </>
                      )}
                      {canSend && (
                        <button
                          type="button"
                          className="primary"
                          disabled={offline || busyId === meeting.id}
                          onClick={() => void respond(meeting, "send")}
                        >
                          Send these options
                        </button>
                      )}
                      {canConfirm && (
                        <button
                          type="button"
                          className="primary"
                          disabled={offline || busyId === meeting.id}
                          onClick={() => void respond(meeting, "confirm")}
                        >
                          Confirm
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })
          ) : (
            <section className="panel panel-pad">
              <EmptyState
                icon={Users}
                title="No meetings yet"
                hint="Ask Mori to find a time with a friend."
              />
            </section>
          )}
        </section>
      )}

      {matchOpen && (
        <Sheet
          title="Check a list of emails"
          description="Addresses are matched against existing accounts and discarded. Mori never reads your contacts."
          onDismiss={() => setMatchOpen(false)}
        >
          <form className="page" onSubmit={match}>
            <label className="field">
              Up to 200 addresses
              <textarea
                name="emails"
                placeholder="ana@example.com, ben@example.com"
              />
            </label>
            <div className="actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setMatchOpen(false)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busyId === "match"}>
                {busyId === "match" ? "Checking…" : "Check"}
              </button>
            </div>
          </form>
        </Sheet>
      )}

      {counterFor && (
        <Sheet
          title="Offer a different time"
          description={counterFor.title}
          onDismiss={() => setCounterFor(null)}
        >
          <form
            className="page"
            onSubmit={(event) => {
              event.preventDefault();
              const value = String(
                new FormData(event.currentTarget).get("counterStart") ?? "",
              );
              const start = new Date(value);
              if (Number.isNaN(start.getTime())) {
                setError("Choose a valid start time.");
                return;
              }
              void respond(counterFor, "counter", {
                counterStart: start.toISOString(),
              });
            }}
          >
            <label className="field">
              New start time
              {/*
                The window is the organizer's; the server rejects anything
                outside it, so the picker refuses it first.
              */}
              <input
                name="counterStart"
                type="datetime-local"
                min={localInputValue(counterFor.rangeStart)}
                max={localInputValue(counterFor.rangeEnd)}
                defaultValue={localInputValue(
                  counterFor.options[0]?.startAt ?? counterFor.rangeStart,
                )}
                required
              />
            </label>
            <p className="supporting">
              {counterFor.durationMinutes} minutes, between{" "}
              {longDate(new Date(counterFor.rangeStart), counterFor.timezone)}{" "}
              and {longDate(new Date(counterFor.rangeEnd), counterFor.timezone)}
              .
            </p>
            <div className="actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setCounterFor(null)}
              >
                Cancel
              </button>
              <button
                className="primary"
                disabled={busyId === counterFor.id || offline}
              >
                Send counter-offer
              </button>
            </div>
          </form>
        </Sheet>
      )}
    </main>
  );
}
