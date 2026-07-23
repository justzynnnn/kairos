/**
 * The single entry point for iconography in the mobile client. Importing named
 * icons from `lucide-react` is tree-shakeable (the package is `sideEffects:
 * false`), but only if every call site goes through one narrow list — a stray
 * `import * as icons` anywhere would pull the whole set into the launch chunk.
 * Add an icon here before using it, and keep the list to what is rendered.
 */
export {
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  House,
  MessagesSquare,
  Mic,
  Moon,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Square,
  Sun,
  Trash2,
  UserPlus,
  UserRound,
  Users,
  X,
} from "lucide-react";
export type { LucideIcon } from "lucide-react";
