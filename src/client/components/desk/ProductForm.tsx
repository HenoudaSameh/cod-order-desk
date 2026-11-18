import { useState } from "react";
import { Field } from "@/client/components/desk/Field";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Switch } from "@/client/components/ui/switch";
import { Textarea } from "@/client/components/ui/textarea";

export interface ProductValues {
  name: string;
  description: string;
  price: number;
  costPrice: number;
  published: boolean;
}

/** The product fields, shared by the create dialog and the product page. */
export function ProductForm({
  id,
  initial,
  onSubmit,
}: {
  id: string;
  initial: ProductValues;
  onSubmit: (values: ProductValues) => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <form
      id={id}
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      <div className="sm:col-span-2">
        <Field label="Name" htmlFor={`${id}-name`}>
          <Input
            id={`${id}-name`}
            data-testid="product-name"
            required
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
          />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Description" htmlFor={`${id}-description`}>
          <Textarea
            id={`${id}-description`}
            data-testid="product-description"
            value={v.description}
            onChange={(e) => setV({ ...v, description: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Selling price (DA)" htmlFor={`${id}-price`}>
        <Input
          id={`${id}-price`}
          data-testid="product-price"
          type="number"
          min={0}
          required
          value={v.price}
          onChange={(e) => setV({ ...v, price: Number(e.target.value) })}
        />
      </Field>
      <Field label="Cost price (DA)" htmlFor={`${id}-cost`}>
        <Input
          id={`${id}-cost`}
          data-testid="product-cost"
          type="number"
          min={0}
          required
          value={v.costPrice}
          onChange={(e) => setV({ ...v, costPrice: Number(e.target.value) })}
        />
      </Field>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Switch
          id={`${id}-published`}
          data-testid="product-published"
          checked={v.published}
          onCheckedChange={(published) => setV({ ...v, published })}
        />
        <Label htmlFor={`${id}-published`}>Shown in the store</Label>
      </div>
    </form>
  );
}
