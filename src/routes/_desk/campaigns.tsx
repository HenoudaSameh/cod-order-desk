import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { CopyButton } from "@/client/components/CopyButton";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { AdminOnly } from "@/client/components/desk/AdminOnly";
import { Field } from "@/client/components/desk/Field";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
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
import { formatDA } from "@/lib/format";
import { createCampaign, getCampaigns, setSpend } from "@/serverFunctions/desk";

const currentMonth = () => new Date().toISOString().slice(0, 7);
const search = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/_desk/campaigns")({
  validateSearch: search,
  loaderDeps: ({ search }) => ({ month: search.month ?? currentMonth() }),
  loader: ({ context, deps }) =>
    context.me.admin ? getCampaigns({ data: deps }) : null,
  component: Campaigns,
});

type Data = NonNullable<Awaited<ReturnType<typeof getCampaigns>>>;

function Campaigns() {
  const data = Route.useLoaderData();
  const navigate = Route.useNavigate();
  if (!data) {
    return (
      <>
        <PageHeader title="Campaigns" />
        <AdminOnly />
      </>
    );
  }
  return (
    <>
      <PageHeader
        title="Campaigns"
        actions={
          <>
            <Input
              type="month"
              aria-label="Month"
              className="w-44"
              value={data.month}
              onChange={(e) =>
                e.target.value &&
                navigate({ search: { month: e.target.value } })
              }
            />
            <NewCampaign />
          </>
        }
      />
      {data.campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Create one to get a store link that credits its orders to it."
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Spend this month (DA)</TableHead>
                <TableHead>Delivered</TableHead>
                <TableHead>Cost per delivered order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.campaigns.map((c) => (
                <CampaignRow
                  key={`${c.id}-${data.month}-${c.spend}`}
                  c={c}
                  month={data.month}
                  best={data.bestId === c.id}
                  storeUrl={data.storeUrl}
                />
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </>
  );
}

function CampaignRow({
  c,
  month,
  best,
  storeUrl,
}: {
  c: Data["campaigns"][number];
  month: string;
  best: boolean;
  storeUrl: string;
}) {
  const [spend, setSpendValue] = useState(String(c.spend));
  const { run, busy } = useAction();
  const link = `${storeUrl}?c=${c.code}`;
  return (
    <TableRow data-testid={`campaign-${c.code}`}>
      <TableCell>
        <div className="flex items-center gap-2 font-medium">
          {c.name}
          <Badge variant="outline">{c.code}</Badge>
          {best ? (
            <Badge variant="success" data-testid="best-campaign">
              Best
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <span className="truncate">{link}</span>
          <CopyButton value={link} successMessage="Link copied" />
        </div>
      </TableCell>
      <TableCell>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () =>
                setSpend({
                  data: { campaignId: c.id, month, amount: Number(spend) },
                }),
              "Spend saved",
            );
          }}
        >
          <Input
            aria-label={`Spend for ${c.code}`}
            data-testid={`spend-${c.code}`}
            type="number"
            min={0}
            className="w-28"
            value={spend}
            onChange={(e) => setSpendValue(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            type="submit"
            data-testid={`spend-save-${c.code}`}
            disabled={busy}
          >
            Save
          </Button>
        </form>
      </TableCell>
      <TableCell data-testid={`delivered-${c.code}`}>{c.delivered}</TableCell>
      <TableCell data-testid={`cpd-${c.code}`}>
        {c.costPerDelivered === null ? "—" : formatDA(c.costPerDelivered)}
      </TableCell>
    </TableRow>
  );
}

function NewCampaign() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const { run, busy } = useAction();
  return (
    <>
      <Button data-testid="new-campaign" onClick={() => setOpen(true)}>
        <Plus /> New campaign
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New campaign</DialogTitle>
          </DialogHeader>
          <form
            id="campaign-form"
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await run(
                  () => createCampaign({ data: { code, name } }),
                  "Campaign created",
                )
              ) {
                setOpen(false);
                setCode("");
                setName("");
              }
            }}
          >
            <Field label="Name" htmlFor="campaign-name">
              <Input
                id="campaign-name"
                data-testid="campaign-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Link code" htmlFor="campaign-code">
              <Input
                id="campaign-code"
                data-testid="campaign-code"
                required
                placeholder="SPRING"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              type="submit"
              form="campaign-form"
              data-testid="campaign-save"
              disabled={busy}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
