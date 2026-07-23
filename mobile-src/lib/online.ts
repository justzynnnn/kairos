import { useEffect, useState } from "react";

/**
 * Whether this phone currently has a connection. Pages that mutate server state
 * use it to disable their controls; it is deliberately separate from the
 * schedule sync's state, which also reports "offline" for a failed request.
 */
export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}
