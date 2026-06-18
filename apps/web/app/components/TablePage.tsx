"use client";

import type { CrmTableProps, CrmTableRow } from "@lightcrm/ui";
import { recordsToRows, type ApiRecord } from "@lightcrm/ui";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

const CrmTable = dynamic(() => import("@lightcrm/ui").then((module) => module.CrmTable), {
  ssr: false,
  loading: () => <div className="gridFrame" aria-busy="true" />
});

type LiveTablePageProps = CrmTableProps & {
  endpoint: string;
  calendarFeedEndpoint?: string;
  offerGenerateEndpoint?: string;
  outreachStartEndpoint?: string;
  outreachAdvanceEndpoint?: string;
  outreachDraftEndpoint?: string;
};

type CrmSettingsResponse = {
  settings?: {
    commercialOffers?: {
      activeTemplate?: {
        placeholders?: string[];
      } | null;
      activeFeeTable?: {
        rows?: CrmTableProps["offerFeeRows"];
      } | null;
    };
    outreachCampaigns?: {
      campaigns?: CrmTableProps["outreachCampaigns"];
    };
  };
  commercialOffers?: {
    activeTemplate?: {
      placeholders?: string[];
    } | null;
    activeFeeTable?: {
      rows?: CrmTableProps["offerFeeRows"];
    } | null;
  };
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

function rowsWithCalendarItems(
  rows: CrmTableRow[],
  feed: CalendarFeedItem[],
  relatedEntity: CalendarFeedItem["related"]["entity"]
): CrmTableRow[] {
  const byRelatedId = new Map<string, CalendarFeedItem[]>();
  for (const item of feed) {
    if (item.related.entity !== relatedEntity || !item.related.id) {
      continue;
    }
    byRelatedId.set(item.related.id, [...(byRelatedId.get(item.related.id) ?? []), item]);
  }
  return rows.map((row) => ({
    ...row,
    values: {
      ...row.values,
      calendar: byRelatedId.get(row.id) ?? []
    }
  }));
}

function calendarRelatedEntity(archiveEntity: CrmTableProps["archiveEntity"]): CalendarFeedItem["related"]["entity"] {
  if (archiveEntity === "lead" || archiveEntity === "client" || archiveEntity === "coldTarget") {
    return archiveEntity;
  }
  return "lead";
}

function TablePageLoading() {
  return <div className="gridFrame" aria-busy="true" />;
}

function LiveTablePage({ endpoint, rows: _sampleRows, columns, calendarFeedEndpoint, ...props }: LiveTablePageProps) {
  const [liveRows, setLiveRows] = useState<CrmTableRow[] | null>(null);
  const [offerTemplateFields, setOfferTemplateFields] = useState<string[]>([]);
  const [offerFeeRows, setOfferFeeRows] = useState<CrmTableProps["offerFeeRows"]>([]);
  const [outreachCampaigns, setOutreachCampaigns] = useState<CrmTableProps["outreachCampaigns"]>([]);
  const [failed, setFailed] = useState(false);
  const [initialFocusRef, setInitialFocusRef] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    setInitialFocusRef(searchParams.get("record") ?? searchParams.get("leadId"));
  }, [searchParams]);

  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    const loadRows = async () => {
      const response = await fetch(endpoint, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Failed to load ${endpoint}`);
      }
      const records = (await response.json()) as ApiRecord[];
      const nextRows = recordsToRows(records, columns).map((row, index) => {
        const offerFields = records[index]?.offerFields;
        if (!offerFields || typeof offerFields !== "object" || Array.isArray(offerFields)) {
          return row;
        }
        return {
          ...row,
          values: {
            ...row.values,
            ...Object.fromEntries(
              Object.entries(offerFields)
                .filter(([, value]) => typeof value === "string" || typeof value === "number")
                .map(([key, value]) => [`offerFields.${key}`, String(value)])
            )
          }
        };
      });
      if (!calendarFeedEndpoint) {
        return nextRows;
      }
      const calendarResponse = await fetch(calendarFeedEndpoint, { signal: controller.signal });
      if (!calendarResponse.ok) {
        throw new Error(`Failed to load ${calendarFeedEndpoint}`);
      }
      const feed = (await calendarResponse.json()) as CalendarFeedItem[];
      return rowsWithCalendarItems(nextRows, feed, calendarRelatedEntity(props.archiveEntity));
    };
    loadRows()
      .then((nextRows) => setLiveRows(nextRows))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setFailed(true);
        setLiveRows([]);
      });

    return () => controller.abort();
  }, [calendarFeedEndpoint, columns, endpoint]);

  useEffect(() => {
    if (!props.offerGenerateEndpoint && !props.outreachStartEndpoint) {
      setOfferTemplateFields([]);
      setOfferFeeRows([]);
      setOutreachCampaigns([]);
      return;
    }
    const controller = new AbortController();
    fetch("/api/crm/settings", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          return [];
        }
        const settings = (await response.json()) as CrmSettingsResponse;
        setOutreachCampaigns(settings.settings?.outreachCampaigns?.campaigns ?? []);
        setOfferFeeRows(
          settings.settings?.commercialOffers?.activeFeeTable?.rows ?? settings.commercialOffers?.activeFeeTable?.rows ?? []
        );
        return settings.settings?.commercialOffers?.activeTemplate?.placeholders ?? settings.commercialOffers?.activeTemplate?.placeholders ?? [];
      })
      .then((placeholders) => {
        setOfferTemplateFields(placeholders);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setOfferTemplateFields([]);
        setOfferFeeRows([]);
        setOutreachCampaigns([]);
      });
    return () => controller.abort();
  }, [props.offerGenerateEndpoint, props.outreachStartEndpoint]);

  const activeRows = liveRows ?? [];
  const initialFocusRowId = useMemo(() => {
    if (!initialFocusRef) {
      return null;
    }
    const normalized = initialFocusRef.trim().toLowerCase();
    const match = activeRows.find((row) => {
      const code = row.values.code;
      return row.id.toLowerCase() === normalized || (typeof code === "string" && code.toLowerCase() === normalized);
    });
    return match?.id ?? initialFocusRef;
  }, [activeRows, initialFocusRef]);

  const description = useMemo(() => (failed ? `${props.description} Live API unavailable.` : props.description), [
    failed,
    props.description
  ]);

  return (
    <CrmTable
      {...props}
      description={description}
      columns={columns}
      rows={activeRows}
      initialFocusRowId={initialFocusRowId}
      offerTemplateFields={offerTemplateFields}
      offerFeeRows={offerFeeRows}
      outreachCampaigns={outreachCampaigns}
    />
  );
}

export function TablePage(props: LiveTablePageProps) {
  return (
    <Suspense fallback={<TablePageLoading />}>
      <LiveTablePage {...props} />
    </Suspense>
  );
}
