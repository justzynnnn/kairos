/**
 * iOS-style tab icons for the native shell. SF Symbols themselves are Apple's
 * proprietary font and cannot be redistributed inside a web bundle, so these are
 * original glyphs drawn to the same conventions: a monoline outline for an
 * inactive tab and a solid silhouette for the selected one, which is how a UIKit
 * tab bar signals its current item. Every icon shares one 24-unit grid and reads
 * `currentColor`, so the tab button controls weight and tint the same way it did
 * with the Lucide set this replaced.
 */
import type { ReactElement, ReactNode } from "react";

export type SFIcon = (props: { size?: number; filled?: boolean }) => ReactElement;

function Frame({
  size,
  filled,
  children,
}: {
  size: number;
  filled: boolean;
  children: ReactNode;
}): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const HouseIcon: SFIcon = ({ size = 24, filled = false }) =>
  filled ? (
    <Frame size={size} filled>
      <path
        fillRule="evenodd"
        d="M11.06 3.7a1.5 1.5 0 0 1 1.88 0l6.9 5.53a2 2 0 0 1 .76 1.56V18.5a2.5 2.5 0 0 1-2.5 2.5H15.4v-4.7a1.2 1.2 0 0 0-1.2-1.2H9.8a1.2 1.2 0 0 0-1.2 1.2V21H5.9a2.5 2.5 0 0 1-2.5-2.5v-7.71a2 2 0 0 1 .76-1.56Z"
      />
    </Frame>
  ) : (
    <Frame size={size} filled={false}>
      <path d="M4.4 10.6 12 4.5l7.6 6.1" />
      <path d="M5.9 9.6v8.9a2 2 0 0 0 2 2h8.2a2 2 0 0 0 2-2V9.6" />
      <path d="M9.8 21v-4.9a1.1 1.1 0 0 1 1.1-1.1h2.2a1.1 1.1 0 0 1 1.1 1.1V21" />
    </Frame>
  );

export const CalendarIcon: SFIcon = ({ size = 24, filled = false }) =>
  filled ? (
    <Frame size={size} filled>
      <path
        fillRule="evenodd"
        d="M7 4.4a3.1 3.1 0 0 0-3.1 3.1v10a3.1 3.1 0 0 0 3.1 3.1h10a3.1 3.1 0 0 0 3.1-3.1v-10A3.1 3.1 0 0 0 17 4.4H7Zm.8 8.1a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm4.2 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm4.2 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2ZM7.8 16.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm4.2 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"
      />
      <path
        d="M8 3v2.4M16 3v2.4"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
      />
    </Frame>
  ) : (
    <Frame size={size} filled={false}>
      <rect x="3.9" y="5.4" width="16.2" height="14.7" rx="3.1" />
      <path d="M3.9 9.7h16.2" />
      <path d="M8 3.4v3M16 3.4v3" />
    </Frame>
  );

export const SparklesIcon: SFIcon = ({ size = 24, filled = false }) => {
  const big =
    "M13.2 5.1c.28 3.2 1.72 4.64 4.92 4.92-3.2.28-4.64 1.72-4.92 4.92-.28-3.2-1.72-4.64-4.92-4.92 3.2-.28 4.64-1.72 4.92-4.92Z";
  const small =
    "M6.8 14.1c.16 1.6.94 2.38 2.54 2.54-1.6.16-2.38.94-2.54 2.54-.16-1.6-.94-2.38-2.54-2.54 1.6-.16 2.38-.94 2.54-2.54Z";
  return (
    <Frame size={size} filled={filled}>
      <path d={big} />
      <path d={small} />
    </Frame>
  );
};

export const MessageIcon: SFIcon = ({ size = 24, filled = false }) => {
  const bubble =
    "M12 5.2c-4.42 0-7.8 2.6-7.8 6.1 0 1.98 1.06 3.72 2.86 4.86l-.5 3.02a.62.62 0 0 0 .9.65l3.36-1.7c.38.04.78.06 1.18.06 4.42 0 7.8-2.6 7.8-6.1S16.42 5.2 12 5.2Z";
  return (
    <Frame size={size} filled={filled}>
      <path d={bubble} />
    </Frame>
  );
};

export const PersonIcon: SFIcon = ({ size = 24, filled = false }) =>
  filled ? (
    <Frame size={size} filled>
      <circle cx="12" cy="8.4" r="3.7" />
      <path d="M5.6 19.4c0-3.42 2.98-5.6 6.4-5.6s6.4 2.18 6.4 5.6a1.2 1.2 0 0 1-1.2 1.2H6.8a1.2 1.2 0 0 1-1.2-1.2Z" />
    </Frame>
  ) : (
    <Frame size={size} filled={false}>
      <circle cx="12" cy="8.4" r="3.6" />
      <path d="M5.9 19.7c.3-3.1 2.94-5.1 6.1-5.1s5.8 2 6.1 5.1" />
    </Frame>
  );
