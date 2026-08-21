"use client";

import { useTransition } from "react";
import { updateUserRole } from "@/app/crm/actions";

export function UserRoleSelect({ profileId, role }: { profileId: string; role: "admin" | "asesor" }) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      defaultValue={role}
      disabled={isPending}
      onChange={(e) =>
        startTransition(() => updateUserRole(profileId, e.target.value as "admin" | "asesor"))
      }
      className="rounded-md border border-slate-300 px-2 py-1 text-sm"
    >
      <option value="asesor">Asesor</option>
      <option value="admin">Admin</option>
    </select>
  );
}
