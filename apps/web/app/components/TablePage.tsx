"use client";

import type { CrmTableProps, CrmTableRow } from "@lightcrm/ui";
import { recordsToRows, type ApiRecord } from "@lightcrm/ui";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

const CrmTable = dynamic(() => import("@lightcrm/ui").then((module) => module.CrmTable), {
  ssr: false,
  loading: () => <div className="gridFrame" aria-busy="true" />
});

type LiveTablePageProps = CrmTableProps & {
  endpoint: string;
};

export function TablePage({ endpoint, rows, columns, ...props }: LiveTablePageProps) {
  const [liveRows, setLiveRows] = useState<CrmTableRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    fetch(endpoint, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load ${endpoint}`);
        }
        return response.json() as Promise<ApiRecord[]>;
      })
      .then((records) => setLiveRows(recordsToRows(records, columns)))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setFailed(true);
        setLiveRows(rows);
      });

    return () => controller.abort();
  }, [columns, endpoint, rows]);

  const description = useMemo(() => (failed ? `${props.description} Live API unavailable.` : props.description), [
    failed,
    props.description
  ]);

  return <CrmTable {...props} description={description} columns={columns} rows={liveRows ?? rows} />;
}
