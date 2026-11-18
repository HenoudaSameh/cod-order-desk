import { createFileRoute } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/client/components/PageHeader";
import { AdminOnly } from "@/client/components/desk/AdminOnly";
import { Field } from "@/client/components/desk/Field";
import { Section } from "@/client/components/desk/Panel";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
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
import { wilayaName } from "@/lib/wilayas";
import {
  addCallStatus,
  getSettings,
  removeCallStatus,
  saveSettings,
} from "@/serverFunctions/desk";

export const Route = createFileRoute("/_desk/settings")({
  loader: ({ context }) => (context.me.admin ? getSettings() : null),
  component: Settings,
});

type Data = NonNullable<Awaited<ReturnType<typeof getSettings>>>;
const toInput = (n: number | null) => (n === null ? "" : String(n));
const toFee = (s: string) =>
  s.trim() === "" ? null : Math.max(0, Math.round(Number(s)));

function Settings() {
  const data = Route.useLoaderData();
  if (!data) {
    return (
      <>
        <PageHeader title="Settings" />
        <AdminOnly />
      </>
    );
  }
  return (
    <>
      <PageHeader title="Settings" />
      <StoreSettings data={data} />
      <CallStatuses data={data} />
    </>
  );
}

function StoreSettings({ data }: { data: Data }) {
  const [storeName, setStoreName] = useState(data.storeName);
  const [fees, setFees] = useState(
    data.fees.map((f) => ({
      wilaya: f.wilaya,
      home: toInput(f.homeFee),
      office: toInput(f.officeFee),
      ret: toInput(f.returnFee || null),
    })),
  );
  const { run, busy } = useAction();
  const update = (i: number, key: "home" | "office" | "ret", value: string) =>
    setFees((all) => all.map((f, j) => (j === i ? { ...f, [key]: value } : f)));

  return (
    <form
      className="space-y-10"
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          () =>
            saveSettings({
              data: {
                storeName,
                fees: fees.map((f) => ({
                  wilaya: f.wilaya,
                  homeFee: toFee(f.home),
                  officeFee: toFee(f.office),
                  returnFee: toFee(f.ret) ?? 0,
                })),
              },
            }),
          "Settings saved",
        );
      }}
    >
      <Section title="Store">
        <Card>
          <CardContent className="max-w-sm">
            <Field label="Store name" htmlFor="store-name">
              <Input
                id="store-name"
                data-testid="store-name"
                required
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
              />
            </Field>
          </CardContent>
        </Card>
      </Section>
      <Section
        title="Delivery fees (DA)"
        actions={
          <Button type="submit" data-testid="save-settings" disabled={busy}>
            Save settings
          </Button>
        }
      >
        <p className="text-sm text-muted-foreground">
          Provinces with no fee can't be picked in the store.
        </p>
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Province</TableHead>
                <TableHead>To the door</TableHead>
                <TableHead>Courier office</TableHead>
                <TableHead>Return cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fees.map((f, i) => (
                <TableRow key={f.wilaya}>
                  <TableCell>{wilayaName(f.wilaya)}</TableCell>
                  {(["home", "office", "ret"] as const).map((key) => (
                    <TableCell key={key}>
                      <Input
                        type="number"
                        min={0}
                        className="w-28"
                        aria-label={`${wilayaName(f.wilaya)} ${key === "home" ? "door" : key === "office" ? "office" : "return"} fee`}
                        data-testid={`fee-${key === "ret" ? "return" : key}-${f.wilaya}`}
                        value={f[key]}
                        onChange={(e) => update(i, key, e.target.value)}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      </Section>
    </form>
  );
}

function CallStatuses({ data }: { data: Data }) {
  const [label, setLabel] = useState("");
  const { run, busy } = useAction();
  return (
    <Section title="Call outcomes">
      <Card>
        <CardContent className="space-y-4">
          <ul
            data-testid="call-statuses"
            className="flex flex-wrap gap-2 text-sm"
          >
            <li>
              <Badge variant="outline">No answer</Badge>
            </li>
            <li>
              <Badge variant="outline">Call back on…</Badge>
            </li>
            {data.callStatuses.map((s) => (
              <li key={s.id}>
                <Badge variant="outline">
                  {s.label}
                  <button
                    type="button"
                    aria-label={`Remove ${s.label}`}
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      run(() => removeCallStatus({ data: { id: s.id } }))
                    }
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(() => addCallStatus({ data: { label } })))
                setLabel("");
            }}
          >
            <Input
              aria-label="New outcome"
              placeholder="Wrong number"
              data-testid="call-status-input"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="max-w-xs"
            />
            <Button
              type="submit"
              variant="outline"
              data-testid="add-call-status"
              disabled={busy}
            >
              Add
            </Button>
          </form>
        </CardContent>
      </Card>
    </Section>
  );
}
