import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/client/components/PageHeader";
import { AdminOnly } from "@/client/components/desk/AdminOnly";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Label } from "@/client/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/client/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { useAction } from "@/client/lib/useAction";
import { ROLE_LABELS } from "@/lib/format";
import { getTeam, setRole } from "@/serverFunctions/desk";

export const Route = createFileRoute("/_desk/team")({
  loader: ({ context }) => (context.me.admin ? getTeam() : null),
  component: Team,
});

type Member = NonNullable<Awaited<ReturnType<typeof getTeam>>>[number];

function Team() {
  const team = Route.useLoaderData();
  if (!team) {
    return (
      <>
        <PageHeader title="Team" />
        <AdminOnly />
      </>
    );
  }
  return (
    <>
      <PageHeader
        title="Team"
        description="People appear here once they've opened the app."
      />
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {team.map((m) => (
              <StaffRow key={`${m.userId}-${m.role}-${m.active}`} m={m} />
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </>
  );
}

function StaffRow({ m }: { m: Member }) {
  const [role, setRoleValue] = useState(m.role);
  const [active, setActive] = useState(m.active);
  const { run, busy } = useAction();
  return (
    <TableRow data-testid={`staff-${m.email}`}>
      <TableCell className="font-medium">{m.email}</TableCell>
      <TableCell>
        <span data-testid="role-current">{ROLE_LABELS[m.role]}</span>
        {m.role === "confirmer" && !m.active ? (
          <span className="text-muted-foreground"> · paused</span>
        ) : null}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-3">
          <NativeSelect
            size="sm"
            aria-label={`Role for ${m.email}`}
            data-testid="role-select"
            value={role}
            onChange={(e) => setRoleValue(e.target.value)}
          >
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {role === "confirmer" ? (
            <div className="flex items-center gap-2">
              <Checkbox
                id={`active-${m.userId}`}
                checked={active}
                onCheckedChange={(on) => setActive(Boolean(on))}
              />
              <Label htmlFor={`active-${m.userId}`}>Takes new orders</Label>
            </div>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            data-testid="role-save"
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  setRole({
                    data: { userId: m.userId, role: role as "none", active },
                  }),
                "Role saved",
              )
            }
          >
            Save
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
