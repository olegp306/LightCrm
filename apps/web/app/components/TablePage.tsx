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
  calendarFeedEndpoint?: string;
};

type CalendarFeedItem = {
  id: string;
  kind: "reminder" | "event";
  title: string;
  startsAt: string;
  endsAt: string | null;
  status: string | null;
  sourceChannel: string | null;
  related: {
    entity: "lead" | "client" | "coldTarget" | null;
    id: string | null;
  };
};

function rowsWithCalendarItems(rows: CrmTableRow[], feed: CalendarFeedItem[]): CrmTableRow[] {
  const byLeadId = new Map<string, CalendarFeedItem[]>();
  for (const item of feed) {
    if (item.related.entity !== "lead" || !item.related.id) {
      continue;
    }
    byLeadId.set(item.related.id, [...(byLeadId.get(item.related.id) ?? []), item]);
  }
  return rows.map((row) => ({
    ...row,
    values: {
      ...row.values,
      calendar: byLeadId.get(row.id) ?? []
    }
  }));
}

export function TablePage({ endpoint, rows, columns, calendarFeedEndpoint, ...props }: LiveTablePageProps) {
  const [liveRows, setLiveRows] = useState<CrmTableRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    const loadRows = async () => {
      const response = await fetch(endpoint, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Failed to load ${endpoint}`);
      }
      const records = (await response.json()) as ApiRecord[];
      const nextRows = recordsToRows(records, columns);
      if (!calendarFeedEndpoint) {
        return nextRows;
      }
      const calendarResponse = await fetch(calendarFeedEndpoint, { signal: controller.signal });
      if (!calendarResponse.ok) {
        throw new Error(`Failed to load ${calendarFeedEndpoint}`);
      }
      const feed = (await calendarResponse.json()) as CalendarFeedItem[];
      return rowsWithCalendarItems(nextRows, feed);
    };
    loadRows()
      .then((nextRows) => setLiveRows(nextRows))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setFailed(true);
        setLiveRows(rows);
      });

    return () => controller.abort();
  }, [calendarFeedEndpoint, columns, endpoint, rows]);

  const description = useMemo(() => (failed ? `${props.description} Live API unavailable.` : props.description), [
    failed,
    props.description
  ]);

  return <CrmTable {...props} description={description} columns={columns} rows={liveRows ?? rows} />;
}
