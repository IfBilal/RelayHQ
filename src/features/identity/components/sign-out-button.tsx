"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="icon-button"
      aria-label="Sign out"
      title="Sign out"
      style={{ color: "#96AFB3" }}
      onClick={async () => {
        await fetch("/api/v1/auth/logout", { method: "POST" });
        router.replace("/login");
        router.refresh();
      }}
    >
      <LogOut className="icon-sm" aria-hidden="true" />
    </button>
  );
}
