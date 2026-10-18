"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DisconnectCalendar() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className="btn small" disabled={busy} onClick={async () => {
      if (!confirm("Disconnect your Google Calendar? Existing bookings keep their events.")) return;
      setBusy(true);
      await fetch("/api/v1/calendar/disconnect", { method: "POST" });
      setBusy(false);
      router.refresh();
    }}>Disconnect</button>
  );
}
