import type { ReactNode } from "react";

/** The frame of the public store pages: the store's name, then one column. */
export function StoreShell({
  storeName,
  children,
}: {
  storeName: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col">
      <header className="shrink-0 border-b border-border">
        <div className="mx-auto flex h-12 w-full max-w-3xl items-center px-4 md:px-10">
          <a href="/s" className="font-semibold tracking-tight">
            {storeName}
          </a>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <main className="mx-auto w-full max-w-3xl space-y-8 px-4 pt-8 pb-24 md:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
