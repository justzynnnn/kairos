import Link from "next/link";
import type { Route } from "next";

const items = [
  ["/inbox", "Chats"],
  ["/inbox/people", "People"],
  ["/inbox/meetings", "Meetings"],
] as const;

export function InboxNav({
  active,
  demoUser,
}: {
  active: "chats" | "people" | "meetings";
  demoUser?: string;
}) {
  return (
    <nav aria-label="Inbox sections" className="section-tabs">
      {items.map(([href, label]) => (
        <Link
          key={href}
          href={(demoUser ? `${href}?demoUser=${demoUser}` : href) as Route}
          aria-current={active === label.toLowerCase() ? "page" : undefined}
          className="section-tab"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
