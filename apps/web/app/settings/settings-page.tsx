"use client";

import type { CrmIntent, CrmOrchestrationResult, LangGraphRuntimeSettings, SemanticIntent } from "@lightcrm/orchestrator";
import { useEffect, useMemo, useRef, useState } from "react";

type SettingsResponse = {
  settings: LangGraphRuntimeSettings;
  presets: LangGraphRuntimeSettings[];
};

type CrmSettingsResponse = {
  settings: {
    commercialOffers: {
      activeTemplate: null | {
        fileName: string;
        uploadedAt: string;
        placeholders: string[];
      };
      activeFeeTable: null | {
        fileName: string;
        uploadedAt: string;
        year: number;
        source: "parsed" | "fallback";
        rows: Array<{
          bgfFrom: number;
          bgfTo: number;
          wohnflaecheLabel: string;
          lp1_3Net: number;
          lp4Net: number;
          totalNet: number;
          vat: number;
          totalGross: number;
        }>;
      };
      vatRate: number;
      offerValidityDays: number;
      autoGenerateWhenReady: boolean;
    };
    outreachCampaigns: {
      campaigns: OutreachCampaignSettings[];
    };
  };
};

type CreateOutreachCampaignResponse = CrmSettingsResponse & {
  campaign: OutreachCampaignSettings;
};

type OutreachCampaignSettings = {
  id: string;
  name: string;
  status: "active" | "draft" | "archived";
  summary: string;
  goal: string;
  prompt: string;
  touchpoints: Array<{
    id: string;
    touchNumber: number;
    dayOffset: number;
    channel: "email" | "linkedin" | "phone";
    title: string;
    action: string;
    templateId?: string;
  }>;
  templates: Array<{
    id: string;
    subject: string;
    body: string;
  }>;
};

const intentOptions: CrmIntent[] = [
  "create_new_lead",
  "update_existing_lead",
  "create_contact",
  "update_contact",
  "create_reminder",
  "create_meeting",
  "generate_offer",
  "delete_or_undo",
  "clarification",
  "unknown"
];

const nodeLabels: Record<keyof LangGraphRuntimeSettings["enabledNodes"], string> = {
  normalizeMessage: "Normalize",
  extractFacts: "Facts",
  classifyIntent: "Intent",
  resolveEntities: "Entities",
  riskCheck: "Risk",
  decideAction: "Action"
};

function listText(values: string[]) {
  return values.join("\n");
}

function parseLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function stableSettingsJson(value: LangGraphRuntimeSettings) {
  return JSON.stringify(value);
}

function traceRouteLabel(result: CrmOrchestrationResult | null): string {
  const route = result?.trace?.map((event) => event.node).filter(Boolean) ?? [];
  return route.length > 0 ? route.join(" -> ") : "trace route is empty";
}

function traceDecisionLabel(result: CrmOrchestrationResult | null): string {
  if (!result) {
    return "No decision yet";
  }
  return `${result.intent} / ${result.risk} / ${traceActionLabel(result)}`;
}

function traceActionLabel(result: CrmOrchestrationResult | null): string {
  if (!result || result.actions.length === 0) {
    return "no action";
  }
  return result.actions.map((action) => action.type).join(" + ");
}

function traceDetailsText(details: Record<string, string | number | boolean | null> | undefined): string | null {
  if (!details) {
    return null;
  }
  const values = Object.entries(details).flatMap(([key, value]) => {
    if (value === null || value === "") {
      return [];
    }
    return `${key}: ${String(value)}`;
  });
  return values.length > 0 ? values.join(" · ") : null;
}

type ProjectPerson = LangGraphRuntimeSettings["projectPeople"][number];
type OfferReadinessField = LangGraphRuntimeSettings["offerReadiness"]["fields"][number];

export function LangGraphSettingsPage() {
  const [activeTab, setActiveTab] = useState<"crm" | "outreach" | "langgraph">("crm");
  const [settings, setSettings] = useState<LangGraphRuntimeSettings | null>(null);
  const [presets, setPresets] = useState<LangGraphRuntimeSettings[]>([]);
  const [crmSettings, setCrmSettings] = useState<CrmSettingsResponse["settings"] | null>(null);
  const [status, setStatus] = useState<"loading" | "saved" | "saving" | "error">("loading");
  const [crmStatus, setCrmStatus] = useState<"loading" | "saved" | "saving" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [crmError, setCrmError] = useState<string | null>(null);
  const [newCampaignMetaprompt, setNewCampaignMetaprompt] = useState("");
  const [campaignCreateStatus, setCampaignCreateStatus] = useState<"idle" | "running" | "saved" | "error">("idle");
  const [campaignCreateNotice, setCampaignCreateNotice] = useState<string | null>(null);
  const [traceText, setTraceText] = useState(
    "Новый лид из WhatsApp: дом 140 м2. Напомни через две недели подготовить e-mail."
  );
  const [traceResult, setTraceResult] = useState<CrmOrchestrationResult | null>(null);
  const [traceStatus, setTraceStatus] = useState<"idle" | "running" | "error">("idle");
  const [traceError, setTraceError] = useState<string | null>(null);
  const firstLoad = useRef(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/crm/orchestrator/settings")
      .then(async (response) => {
        const payload = (await response.json()) as SettingsResponse & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Settings load failed");
        }
        if (!cancelled) {
          setSettings(payload.settings);
          setPresets(payload.presets);
          setStatus("saved");
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Settings load failed");
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/crm/settings")
      .then(async (response) => {
        const payload = (await response.json()) as CrmSettingsResponse & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "CRM settings load failed");
        }
        if (!cancelled) {
          setCrmSettings(payload.settings);
          setCrmStatus("saved");
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setCrmError(reason instanceof Error ? reason.message : "CRM settings load failed");
          setCrmStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settings) {
      return;
    }
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    const controller = new AbortController();
    const snapshot = stableSettingsJson(settings);
    const timeout = window.setTimeout(() => {
      setStatus("saving");
      fetch("/api/crm/orchestrator/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
        signal: controller.signal
      })
        .then(async (response) => {
          const payload = (await response.json()) as SettingsResponse & { error?: string };
          if (!response.ok) {
            throw new Error(payload.error ?? "Settings save failed");
          }
          if (stableSettingsJson(payload.settings) !== snapshot) {
            setSettings(payload.settings);
          }
          setPresets(payload.presets);
          setError(null);
          setStatus("saved");
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted) {
            setError(reason instanceof Error ? reason.message : "Settings save failed");
            setStatus("error");
          }
        });
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [settings]);

  const activePreset = useMemo(
    () => presets.find((preset) => preset.id === settings?.id),
    [presets, settings?.id]
  );

  function patchSettings(value: Partial<LangGraphRuntimeSettings>) {
    setSettings((current) =>
      current
        ? {
            ...current,
            ...value,
            id: value.id ?? "custom",
            enabledNodes: {
              ...current.enabledNodes,
              ...(value.enabledNodes ?? {})
            }
          }
        : current
    );
  }

  function toggleIntent(intent: CrmIntent) {
    if (!settings) {
      return;
    }
    patchSettings({
      forceReviewIntents: settings.forceReviewIntents.includes(intent)
        ? settings.forceReviewIntents.filter((value) => value !== intent)
        : [...settings.forceReviewIntents, intent]
    });
  }

  function patchPrompts(value: Partial<LangGraphRuntimeSettings["prompts"]>) {
    if (!settings) {
      return;
    }
    patchSettings({
      prompts: {
        ...settings.prompts,
        ...value
      }
    });
  }

  function patchTaxonomy(value: Partial<LangGraphRuntimeSettings["taxonomy"]>) {
    if (!settings) {
      return;
    }
    patchSettings({
      taxonomy: {
        ...settings.taxonomy,
        ...value,
        requiredFieldsByAction: {
          ...settings.taxonomy.requiredFieldsByAction,
          ...(value.requiredFieldsByAction ?? {})
        }
      }
    });
  }

  function patchThresholds(value: Partial<LangGraphRuntimeSettings["thresholds"]>) {
    if (!settings) {
      return;
    }
    patchSettings({
      thresholds: {
        ...settings.thresholds,
        ...value
      }
    });
  }

  function patchConfirmationPolicy(value: Partial<LangGraphRuntimeSettings["confirmationPolicy"]>) {
    if (!settings) {
      return;
    }
    patchSettings({
      confirmationPolicy: {
        ...settings.confirmationPolicy,
        ...value
      }
    });
  }

  function patchTgIntakePolicy(value: Partial<LangGraphRuntimeSettings["tgIntakePolicy"]>) {
    if (!settings) {
      return;
    }
    patchSettings({
      tgIntakePolicy: {
        ...settings.tgIntakePolicy,
        ...value
      }
    });
  }

  function patchOfferReadiness(value: Partial<Omit<LangGraphRuntimeSettings["offerReadiness"], "fields">>) {
    if (!settings) {
      return;
    }
    patchSettings({
      offerReadiness: {
        ...settings.offerReadiness,
        ...value
      }
    });
  }

  function patchOfferField(index: number, value: Partial<OfferReadinessField>) {
    if (!settings) {
      return;
    }
    patchSettings({
      offerReadiness: {
        ...settings.offerReadiness,
        fields: settings.offerReadiness.fields.map((field, fieldIndex) =>
          fieldIndex === index ? { ...field, ...value } : field
        )
      }
    });
  }

  function patchProjectPerson(index: number, value: Partial<ProjectPerson>) {
    if (!settings) {
      return;
    }
    patchSettings({
      projectPeople: settings.projectPeople.map((person, personIndex) =>
        personIndex === index ? { ...person, ...value } : person
      )
    });
  }

  function addProjectPerson() {
    if (!settings) {
      return;
    }
    patchSettings({
      projectPeople: [
        ...settings.projectPeople,
        {
          name: "",
          aliases: [],
          role: "operator",
          description: "Internal project person. Do not treat as a client unless explicitly stated."
        }
      ]
    });
  }

  function removeProjectPerson(index: number) {
    if (!settings) {
      return;
    }
    patchSettings({
      projectPeople: settings.projectPeople.filter((_, personIndex) => personIndex !== index)
    });
  }

  async function uploadCrmFile(endpoint: string, file: File | null) {
    if (!file) {
      return;
    }
    setCrmStatus("saving");
    const body = new FormData();
    body.set("file", file);
    try {
      const response = await fetch(endpoint, { method: "POST", body });
      const payload = (await response.json()) as CrmSettingsResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "CRM settings upload failed");
      }
      setCrmSettings(payload.settings);
      setCrmError(null);
      setCrmStatus("saved");
    } catch (reason) {
      setCrmError(reason instanceof Error ? reason.message : "CRM settings upload failed");
      setCrmStatus("error");
    }
  }

  async function patchCrmCommercialOffers(
    value: Partial<CrmSettingsResponse["settings"]["commercialOffers"]>
  ) {
    if (!crmSettings) {
      return;
    }
    const optimistic = {
      ...crmSettings,
      commercialOffers: {
        ...crmSettings.commercialOffers,
        ...value
      }
    };
    setCrmSettings(optimistic);
    setCrmStatus("saving");
    try {
      const response = await fetch("/api/crm/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commercialOffers: value })
      });
      const payload = (await response.json()) as CrmSettingsResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "CRM settings save failed");
      }
      setCrmSettings(payload.settings);
      setCrmError(null);
      setCrmStatus("saved");
    } catch (reason) {
      setCrmSettings(crmSettings);
      setCrmError(reason instanceof Error ? reason.message : "CRM settings save failed");
      setCrmStatus("error");
    }
  }

  async function patchCrmOutreachCampaign(campaignId: string, value: Partial<OutreachCampaignSettings>) {
    if (!crmSettings) {
      return;
    }
    const optimistic = {
      ...crmSettings,
      outreachCampaigns: {
        ...crmSettings.outreachCampaigns,
        campaigns: crmSettings.outreachCampaigns.campaigns.map((campaign) =>
          campaign.id === campaignId ? { ...campaign, ...value } : campaign
        )
      }
    };
    setCrmSettings(optimistic);
    setCrmStatus("saving");
    try {
      const response = await fetch("/api/crm/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outreachCampaigns: optimistic.outreachCampaigns })
      });
      const payload = (await response.json()) as CrmSettingsResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Outreach campaign save failed");
      }
      setCrmSettings(payload.settings);
      setCrmError(null);
      setCrmStatus("saved");
    } catch (reason) {
      setCrmSettings(crmSettings);
      setCrmError(reason instanceof Error ? reason.message : "Outreach campaign save failed");
      setCrmStatus("error");
    }
  }

  async function createOutreachCampaignFromMetaprompt() {
    const metaprompt = newCampaignMetaprompt.trim();
    if (!metaprompt) {
      setCampaignCreateNotice("Paste a metaprompt first.");
      setCampaignCreateStatus("error");
      return;
    }
    setCampaignCreateStatus("running");
    setCampaignCreateNotice(null);
    setCrmError(null);
    try {
      const response = await fetch("/api/crm/outreach-campaigns/from-metaprompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metaprompt })
      });
      const payload = (await response.json()) as CreateOutreachCampaignResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Campaign creation failed");
      }
      setCrmSettings(payload.settings);
      setNewCampaignMetaprompt("");
      setCampaignCreateStatus("saved");
      setCampaignCreateNotice(`Created ${payload.campaign.name}`);
      setCrmStatus("saved");
    } catch (reason) {
      setCampaignCreateStatus("error");
      setCampaignCreateNotice(reason instanceof Error ? reason.message : "Campaign creation failed");
    }
  }

  async function runTracePreview() {
    if (!traceText.trim()) {
      return;
    }
    setTraceStatus("running");
    setTraceError(null);
    try {
      const response = await fetch("/api/crm/orchestrator/dry-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: traceText,
          sourceChannel: "telegram",
          author: "operator",
          settings
        })
      });
      const payload = (await response.json()) as CrmOrchestrationResult & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Trace preview failed");
      }
      setTraceResult(payload);
      setTraceStatus("idle");
    } catch (reason) {
      setTraceError(reason instanceof Error ? reason.message : "Trace preview failed");
      setTraceStatus("error");
    }
  }

  if (!settings) {
    return (
      <section className="settingsSurface">
        <header className="settingsHeader">
          <div>
            <h1>LangGraph Settings</h1>
            <p>Loading runtime profile.</p>
          </div>
        </header>
      </section>
    );
  }

  const feeRows = crmSettings?.commercialOffers.activeFeeTable?.rows ?? [];
  const templatePlaceholders = crmSettings?.commercialOffers.activeTemplate?.placeholders ?? [];

  return (
    <section className="settingsSurface">
      <header className="settingsHeader">
        <div>
          <h1>Settings</h1>
          <p>
            {activeTab === "crm"
              ? "Commercial offer templates, fee tables, and CRM workflow defaults."
              : activeTab === "outreach"
                ? "Outreach campaign metaprompts, cadence summaries, and launch defaults."
              : activePreset?.description ?? settings.description}
          </p>
        </div>
        <span className={`liveStatus ${activeTab === "crm" || activeTab === "outreach" ? crmStatus : status}`}>
          {(activeTab === "crm" || activeTab === "outreach" ? crmStatus : status) === "saved"
            ? "Live"
            : activeTab === "crm" || activeTab === "outreach"
              ? crmStatus
              : status}
        </span>
      </header>

      <div className="settingsTabs">
        <button className={activeTab === "crm" ? "active" : ""} type="button" onClick={() => setActiveTab("crm")}>
          CRM Settings
        </button>
        <button
          className={activeTab === "outreach" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("outreach")}
        >
          Outreach Campaigns
        </button>
        <button
          className={activeTab === "langgraph" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("langgraph")}
        >
          LangGraph Settings
        </button>
      </div>

      {activeTab === "crm" ? (
        <>
          {crmError ? <div className="settingsError">{crmError}</div> : null}
          <div className="settingsGrid">
            <section className="settingsPanel">
              <h2>Commercial Offer Template</h2>
              <label>
                <span>DOCX template</span>
                <input
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  type="file"
                  onChange={(event) => uploadCrmFile("/api/crm/settings/offer-template", event.target.files?.[0] ?? null)}
                />
              </label>
              <div className="settingsSummary">
                <strong>{crmSettings?.commercialOffers.activeTemplate?.fileName ?? "No template uploaded"}</strong>
                <span>{templatePlaceholders.length} placeholders detected</span>
              </div>
              <div className="placeholderGrid">
                {templatePlaceholders.map((placeholder) => (
                  <span key={placeholder}>{placeholder}</span>
                ))}
              </div>
            </section>

            <section className="settingsPanel">
              <h2>Honorartabelle</h2>
              <label>
                <span>Fee table PDF / text</span>
                <input
                  accept=".pdf,.txt,.csv"
                  type="file"
                  onChange={(event) => uploadCrmFile("/api/crm/settings/fee-table", event.target.files?.[0] ?? null)}
                />
              </label>
              <div className="settingsSummary">
                <strong>{crmSettings?.commercialOffers.activeFeeTable?.fileName ?? "No fee table uploaded"}</strong>
                <span>
                  {feeRows.length} rows · {crmSettings?.commercialOffers.activeFeeTable?.source ?? "fallback"}
                </span>
              </div>
              <div className="feePreview">
                {feeRows.slice(0, 6).map((row) => (
                  <div key={`${row.bgfFrom}-${row.bgfTo}`}>
                    <span>
                      {row.bgfFrom}-{row.bgfTo} m2
                    </span>
                    <strong>{row.totalGross.toLocaleString("de-DE")} EUR gross</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="settingsPanel wide">
              <h2>Offer Automation Plan</h2>
              <label className="switchRow">
                <input
                  checked={crmSettings?.commercialOffers.autoGenerateWhenReady ?? false}
                  type="checkbox"
                  onChange={(event) => patchCrmCommercialOffers({ autoGenerateWhenReady: event.target.checked })}
                />
                <span>Auto-generate offer when numbers are ready</span>
              </label>
              <label>
                <span>Offer validity days</span>
                <input
                  min="1"
                  type="number"
                  value={crmSettings?.commercialOffers.offerValidityDays ?? 90}
                  onChange={(event) =>
                    patchCrmCommercialOffers({ offerValidityDays: Math.max(1, Number(event.target.value) || 90) })
                  }
                />
              </label>
              <div className="versionPlanGrid">
                <div>
                  <strong>V0.1 now</strong>
                  <span>Settings split, template parsing, fee table activation, lead readiness.</span>
                </div>
                <div>
                  <strong>V0.2 next</strong>
                  <span>Generate DOCX from template and save it into lead documents.</span>
                </div>
                <div>
                  <strong>V0.3 next</strong>
                  <span>TG command/button to download the generated commercial offer.</span>
                </div>
                <div>
                  <strong>V1.0 later</strong>
                  <span>Offer history, manual overrides, non-standard pricing workflows, sent/follow-up states.</span>
                </div>
              </div>
            </section>
          </div>
        </>
      ) : activeTab === "outreach" ? (
        <>
          {crmError ? <div className="settingsError">{crmError}</div> : null}
          <div className="settingsGrid">
            <section className="settingsPanel wide outreachCampaignPanel">
              <div className="settingsPanelHeader">
                <div>
                  <h2>Create campaign from metaprompt</h2>
                  <p>Paste a full outreach metaprompt. The LLM will turn it into campaign summary, touchpoints, and email templates.</p>
                </div>
                <span className="settingsPill">LLM</span>
              </div>
              <label>
                <span>New campaign metaprompt</span>
                <textarea
                  rows={8}
                  value={newCampaignMetaprompt}
                  onChange={(event) => {
                    setNewCampaignMetaprompt(event.target.value);
                    if (campaignCreateStatus !== "running") {
                      setCampaignCreateStatus("idle");
                      setCampaignCreateNotice(null);
                    }
                  }}
                  placeholder="Paste the full campaign metaprompt here..."
                />
              </label>
              <div className="settingsActions">
                <button
                  type="button"
                  onClick={() => void createOutreachCampaignFromMetaprompt()}
                  disabled={campaignCreateStatus === "running" || !newCampaignMetaprompt.trim()}
                >
                  {campaignCreateStatus === "running" ? "Creating..." : "Create campaign"}
                </button>
                {campaignCreateNotice ? (
                  <span className={campaignCreateStatus === "error" ? "settingsInlineError" : "settingsInlineNotice"}>
                    {campaignCreateNotice}
                  </span>
                ) : null}
              </div>
            </section>
            {(crmSettings?.outreachCampaigns.campaigns ?? []).map((campaign) => (
              <section className="settingsPanel wide outreachCampaignPanel" key={campaign.id}>
                <div className="settingsPanelHeader">
                  <div>
                    <h2>{campaign.name}</h2>
                    <p>{campaign.goal}</p>
                  </div>
                  <span className="settingsPill">{campaign.status}</span>
                </div>
                <label>
                  <span>Short summary</span>
                  <textarea
                    rows={3}
                    value={campaign.summary}
                    onChange={(event) => {
                      setCrmSettings((current) =>
                        current
                          ? {
                              ...current,
                              outreachCampaigns: {
                                ...current.outreachCampaigns,
                                campaigns: current.outreachCampaigns.campaigns.map((item) =>
                                  item.id === campaign.id ? { ...item, summary: event.target.value } : item
                                )
                              }
                            }
                          : current
                      );
                    }}
                    onBlur={(event) => patchCrmOutreachCampaign(campaign.id, { summary: event.target.value })}
                  />
                </label>
                <div className="outreachTouchGrid">
                  {campaign.touchpoints.map((touch) => (
                    <article key={touch.id}>
                      <span>D+{touch.dayOffset}</span>
                      <strong>{touch.touchNumber}. {touch.title}</strong>
                      <small>{touch.channel} · {touch.action}</small>
                    </article>
                  ))}
                </div>
                <label>
                  <span>Metaprompt</span>
                  <textarea
                    rows={10}
                    value={campaign.prompt}
                    onChange={(event) => {
                      setCrmSettings((current) =>
                        current
                          ? {
                              ...current,
                              outreachCampaigns: {
                                ...current.outreachCampaigns,
                                campaigns: current.outreachCampaigns.campaigns.map((item) =>
                                  item.id === campaign.id ? { ...item, prompt: event.target.value } : item
                                )
                              }
                            }
                          : current
                      );
                    }}
                    onBlur={(event) => patchCrmOutreachCampaign(campaign.id, { prompt: event.target.value })}
                  />
                </label>
              </section>
            ))}
          </div>
        </>
      ) : (
        <>
          {error ? <div className="settingsError">{error}</div> : null}
          <div className="presetGrid">
        {presets.map((preset) => (
          <button
            className={`presetCard ${preset.id === settings.id ? "active" : ""}`}
            key={preset.id}
            onClick={() => setSettings(preset)}
            type="button"
          >
            <span>{preset.name}</span>
            <strong>{percent(preset.confidenceThreshold)}</strong>
            <small>{preset.description}</small>
          </button>
        ))}
          </div>

          <div className="settingsGrid">
        <section className="settingsPanel wide">
          <h2>Trace Chat</h2>
          <label>
            <span>Test message</span>
            <textarea rows={4} value={traceText} onChange={(event) => setTraceText(event.target.value)} />
          </label>
          <div className="tracePreviewToolbar">
            <button type="button" onClick={runTracePreview} disabled={traceStatus === "running" || !traceText.trim()}>
              {traceStatus === "running" ? "Running" : "Run trace"}
            </button>
            <span>
              {traceResult
                ? `${traceResult.intent} · ${traceResult.risk} · ${traceActionLabel(traceResult)}`
                : "No trace yet"}
            </span>
          </div>
          {traceError ? <div className="settingsError">{traceError}</div> : null}
          <div className="traceDecisionCard">
            <div>
              <span>Decision</span>
              <strong>{traceDecisionLabel(traceResult)}</strong>
            </div>
            <div>
              <span>Actions</span>
              <strong>{traceActionLabel(traceResult)}</strong>
            </div>
            <div>
              <span>Graph route</span>
              <strong>{traceRouteLabel(traceResult)}</strong>
            </div>
            {traceResult?.actions[0]?.reason ? <p>{traceResult.actions[0].reason}</p> : null}
          </div>
          <div className="traceChat" aria-label="LangGraph readable trace">
            {(traceResult?.trace ?? []).map((event) => {
              const detailsText = traceDetailsText(event.details);
              return (
                <article className={`traceBubble ${event.status}`} key={event.id}>
                  <div>
                    <strong>{event.titleRu}</strong>
                    <span>{event.node}</span>
                  </div>
                  <p>{event.messageRu}</p>
                  {detailsText ? <small>{detailsText}</small> : null}
                </article>
              );
            })}
            {traceResult && (traceResult.trace?.length ?? 0) === 0 ? (
              <article className="traceBubble review">
                <div>
                  <strong>Trace пока пустой</strong>
                  <span>legacy</span>
                </div>
                <p>Ответ получен, но узлы не вернули подробный trace.</p>
              </article>
            ) : null}
          </div>
        </section>

        <section className="settingsPanel">
          <h2>Runtime</h2>
          <label className="switchRow">
            <input
              checked={settings.semanticMode}
              type="checkbox"
              onChange={(event) => patchSettings({ semanticMode: event.target.checked })}
            />
            <span>Semantic mode</span>
          </label>
          <label>
            <span>Name</span>
            <input value={settings.name} onChange={(event) => patchSettings({ name: event.target.value })} />
          </label>
          <label>
            <span>Model</span>
            <input value={settings.model} onChange={(event) => patchSettings({ model: event.target.value })} />
          </label>
          <label>
            <span>Temperature {settings.temperature.toFixed(2)}</span>
            <input
              max="2"
              min="0"
              step="0.01"
              type="range"
              value={settings.temperature}
              onChange={(event) => patchSettings({ temperature: Number(event.target.value) })}
            />
          </label>
          <label>
            <span>Confidence {percent(settings.confidenceThreshold)}</span>
            <input
              max="1"
              min="0"
              step="0.01"
              type="range"
              value={settings.confidenceThreshold}
              onChange={(event) => patchSettings({ confidenceThreshold: Number(event.target.value) })}
            />
          </label>
        </section>

        <section className="settingsPanel">
          <h2>Gates</h2>
          <label>
            <span>Auto execute {percent(settings.thresholds.autoExecute)}</span>
            <input
              max="1"
              min="0"
              step="0.01"
              type="range"
              value={settings.thresholds.autoExecute}
              onChange={(event) => patchThresholds({ autoExecute: Number(event.target.value) })}
            />
          </label>
          <label>
            <span>Ask confirmation {percent(settings.thresholds.askConfirmation)}</span>
            <input
              max="1"
              min="0"
              step="0.01"
              type="range"
              value={settings.thresholds.askConfirmation}
              onChange={(event) => patchThresholds({ askConfirmation: Number(event.target.value) })}
            />
          </label>
          <label>
            <span>Duplicate candidate {percent(settings.thresholds.duplicateCandidate)}</span>
            <input
              max="1"
              min="0"
              step="0.01"
              type="range"
              value={settings.thresholds.duplicateCandidate}
              onChange={(event) => patchThresholds({ duplicateCandidate: Number(event.target.value) })}
            />
          </label>
          <label className="switchRow">
            <input
              checked={settings.confirmationPolicy.requireConfirmationForWrites}
              type="checkbox"
              onChange={(event) => patchConfirmationPolicy({ requireConfirmationForWrites: event.target.checked })}
            />
            <span>Confirm all writes</span>
          </label>
          <label className="switchRow">
            <input
              checked={settings.confirmationPolicy.requireConfirmationForDuplicateCandidates}
              type="checkbox"
              onChange={(event) =>
                patchConfirmationPolicy({ requireConfirmationForDuplicateCandidates: event.target.checked })
              }
            />
            <span>Confirm duplicate candidates</span>
          </label>
          <label className="switchRow">
            <input
              checked={settings.confirmationPolicy.allowAutoCreateLead}
              type="checkbox"
              onChange={(event) => patchConfirmationPolicy({ allowAutoCreateLead: event.target.checked })}
            />
            <span>Allow semantic lead creation</span>
          </label>
          <label className="switchRow">
            <input
              checked={settings.confirmationPolicy.allowAutoCreateReminder}
              type="checkbox"
              onChange={(event) => patchConfirmationPolicy({ allowAutoCreateReminder: event.target.checked })}
            />
            <span>Allow semantic reminders</span>
          </label>
          <label className="switchRow">
            <input
              checked={settings.autoCreateLead}
              type="checkbox"
              onChange={(event) => patchSettings({ autoCreateLead: event.target.checked })}
            />
            <span>Auto-create leads</span>
          </label>
          <label className="switchRow">
            <input
              checked={settings.autoCreateReminder}
              type="checkbox"
              onChange={(event) => patchSettings({ autoCreateReminder: event.target.checked })}
            />
            <span>Auto-create reminders</span>
          </label>
          <label className="switchRow">
            <input
              checked={settings.reviewNameOnlyUpdates}
              type="checkbox"
              onChange={(event) => patchSettings({ reviewNameOnlyUpdates: event.target.checked })}
            />
            <span>Review name-only updates</span>
          </label>
          <div className="intentGrid">
            {intentOptions.map((intent) => (
              <label className="intentPill" key={intent}>
                <input
                  checked={settings.forceReviewIntents.includes(intent)}
                  type="checkbox"
                  onChange={() => toggleIntent(intent)}
                />
                <span>{intent}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="settingsPanel wide">
          <div className="settingsPanelHeader">
            <div>
              <h2>TG Intake Policy</h2>
              <p>Controls how TG bundles, files, and ambiguous messages become CRM writes.</p>
            </div>
          </div>
          <div className="settingsFieldGrid">
            <label>
              <span>Action strictness</span>
              <select
                value={settings.tgIntakePolicy.actionStrictness}
                onChange={(event) =>
                  patchTgIntakePolicy({
                    actionStrictness: event.target.value as LangGraphRuntimeSettings["tgIntakePolicy"]["actionStrictness"]
                  })
                }
              >
                <option value="preview_first">Preview first</option>
                <option value="strong_evidence">Auto create only with strong evidence</option>
                <option value="auto_create_drafts">Auto create needs-data drafts</option>
              </select>
            </label>
            <label>
              <span>Bundle wait, ms</span>
              <input
                min="0"
                step="100"
                type="number"
                value={settings.tgIntakePolicy.bundleWaitMs}
                onChange={(event) => patchTgIntakePolicy({ bundleWaitMs: Math.max(0, Number(event.target.value) || 0) })}
              />
            </label>
          </div>
          <div className="settingsChecklist">
            <label className="switchRow">
              <input
                checked={settings.tgIntakePolicy.alwaysShowUndoForWrites}
                type="checkbox"
                onChange={(event) => patchTgIntakePolicy({ alwaysShowUndoForWrites: event.target.checked })}
              />
              <span>Always show undo for write results</span>
            </label>
            <label className="switchRow">
              <input
                checked={settings.tgIntakePolicy.analyzeAttachmentsBeforeAction}
                type="checkbox"
                onChange={(event) => patchTgIntakePolicy({ analyzeAttachmentsBeforeAction: event.target.checked })}
              />
              <span>Analyze attachments before action</span>
            </label>
            <label className="switchRow">
              <input
                checked={settings.tgIntakePolicy.neverCreateFromAttachmentOnly}
                type="checkbox"
                onChange={(event) => patchTgIntakePolicy({ neverCreateFromAttachmentOnly: event.target.checked })}
              />
              <span>Never create from attachment-only intake</span>
            </label>
            <label className="switchRow">
              <input
                checked={settings.tgIntakePolicy.requireMeaningfulAttachmentContent}
                type="checkbox"
                onChange={(event) => patchTgIntakePolicy({ requireMeaningfulAttachmentContent: event.target.checked })}
              />
              <span>Require meaningful file content before write</span>
            </label>
          </div>
        </section>

        <section className="settingsPanel wide">
          <div className="settingsPanelHeader">
            <div>
              <h2>Offer Readiness</h2>
              <p>Fields LangGraph should look for before commercial offer numbers and documents are considered ready.</p>
            </div>
          </div>
          <div className="settingsChecklist">
            <label className="switchRow">
              <input
                checked={settings.offerReadiness.analyzeLeadForOfferReadiness}
                type="checkbox"
                onChange={(event) => patchOfferReadiness({ analyzeLeadForOfferReadiness: event.target.checked })}
              />
              <span>Analyze lead for offer readiness</span>
            </label>
            <label className="switchRow">
              <input
                checked={settings.offerReadiness.extractOfferFieldsFromAttachments}
                type="checkbox"
                onChange={(event) => patchOfferReadiness({ extractOfferFieldsFromAttachments: event.target.checked })}
              />
              <span>Extract offer fields from attachments</span>
            </label>
            <label className="switchRow">
              <input
                checked={settings.offerReadiness.autoUpdateLeadWithConfidentFields}
                type="checkbox"
                onChange={(event) => patchOfferReadiness({ autoUpdateLeadWithConfidentFields: event.target.checked })}
              />
              <span>Auto-update lead with confident offer fields</span>
            </label>
            <label className="switchRow">
              <input
                checked={settings.offerReadiness.autoGenerateWhenPriceReady}
                type="checkbox"
                onChange={(event) => patchOfferReadiness({ autoGenerateWhenPriceReady: event.target.checked })}
              />
              <span>Auto-generate offer when price is ready</span>
            </label>
            <label className="switchRow">
              <input
                checked={settings.offerReadiness.requireEvidenceForOfferFields}
                type="checkbox"
                onChange={(event) => patchOfferReadiness({ requireEvidenceForOfferFields: event.target.checked })}
              />
              <span>Require evidence for offer fields</span>
            </label>
          </div>
          <div className="offerFieldList">
            {settings.offerReadiness.fields.map((field, index) => (
              <div className="offerFieldCard" key={field.key}>
                <div className="offerFieldHeader">
                  <strong>{field.label}</strong>
                  <span>{field.key}</span>
                </div>
                <div className="settingsFieldGrid">
                  <label>
                    <span>Aliases</span>
                    <textarea
                      rows={3}
                      value={listText(field.aliases)}
                      onChange={(event) => patchOfferField(index, { aliases: parseLines(event.target.value) })}
                    />
                  </label>
                  <label>
                    <span>Sources</span>
                    <textarea
                      rows={3}
                      value={listText(field.sources)}
                      onChange={(event) => patchOfferField(index, { sources: parseLines(event.target.value) })}
                    />
                  </label>
                </div>
                <div className="settingsFieldGrid compact">
                  <label>
                    <span>Confidence {percent(field.confidenceThreshold)}</span>
                    <input
                      max="1"
                      min="0"
                      step="0.01"
                      type="range"
                      value={field.confidenceThreshold}
                      onChange={(event) => patchOfferField(index, { confidenceThreshold: Number(event.target.value) })}
                    />
                  </label>
                  <label className="switchRow">
                    <input
                      checked={field.required}
                      type="checkbox"
                      onChange={(event) => patchOfferField(index, { required: event.target.checked })}
                    />
                    <span>Required</span>
                  </label>
                  <label className="switchRow">
                    <input
                      checked={field.autoFill}
                      type="checkbox"
                      onChange={(event) => patchOfferField(index, { autoFill: event.target.checked })}
                    />
                    <span>Auto-fill</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="settingsPanel wide">
          <div className="settingsPanelHeader">
            <div>
              <h2>Project People</h2>
              <p>Internal people whose names should not become clients, leads, or offer recipients unless explicitly stated.</p>
            </div>
            <button type="button" onClick={addProjectPerson}>
              Add person
            </button>
          </div>
          <div className="projectPeopleList">
            {settings.projectPeople.map((person, index) => (
              <div className="projectPersonCard" key={`project-person-${index}`}>
                <label>
                  <span>Name</span>
                  <input value={person.name} onChange={(event) => patchProjectPerson(index, { name: event.target.value })} />
                </label>
                <label>
                  <span>Role</span>
                  <input value={person.role} onChange={(event) => patchProjectPerson(index, { role: event.target.value })} />
                </label>
                <label className="wide">
                  <span>Alternative names</span>
                  <textarea
                    rows={2}
                    value={listText(person.aliases ?? [])}
                    placeholder={"One name per line: Katya\nKatia Korsak\nWhatsApp display name"}
                    onChange={(event) => patchProjectPerson(index, { aliases: parseLines(event.target.value) })}
                  />
                </label>
                <label className="wide">
                  <span>Description</span>
                  <textarea
                    rows={3}
                    value={person.description}
                    onChange={(event) => patchProjectPerson(index, { description: event.target.value })}
                  />
                </label>
                <button type="button" className="quietDangerButton" onClick={() => removeProjectPerson(index)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="settingsPanel wide">
          <h2>Semantic Prompts</h2>
          {(
            [
              ["systemRole", "System role"],
              ["intentClassifier", "Intent classifier"],
              ["entityExtractor", "Entity extractor"],
              ["targetResolver", "Target resolver"],
              ["validationGuard", "Validation guard"],
              ["actionPlanner", "Action planner"]
            ] as Array<[keyof LangGraphRuntimeSettings["prompts"], string]>
          ).map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <textarea rows={5} value={settings.prompts[key]} onChange={(event) => patchPrompts({ [key]: event.target.value })} />
            </label>
          ))}
        </section>

        <section className="settingsPanel wide">
          <h2>Taxonomy</h2>
          <div className="settingsFieldGrid">
            <label>
              <span>Allowed intents</span>
              <textarea
                rows={8}
                value={listText(settings.taxonomy.intents)}
                onChange={(event) => patchTaxonomy({ intents: parseLines(event.target.value) as SemanticIntent[] })}
              />
            </label>
            <label>
              <span>Entity fields</span>
              <textarea
                rows={8}
                value={listText(settings.taxonomy.entityFields)}
                onChange={(event) => patchTaxonomy({ entityFields: parseLines(event.target.value) })}
              />
            </label>
          </div>
          <div className="requiredFieldsGrid">
            {Object.entries(settings.taxonomy.requiredFieldsByAction).map(([action, fields]) => (
              <label key={action}>
                <span>{action}</span>
                <input
                  value={fields.join(", ")}
                  onChange={(event) =>
                    patchTaxonomy({
                      requiredFieldsByAction: {
                        [action]: event.target.value
                          .split(",")
                          .map((field) => field.trim())
                          .filter(Boolean)
                      }
                    })
                  }
                />
              </label>
            ))}
          </div>
        </section>

        <section className="settingsPanel wide">
          <h2>Graph Nodes</h2>
          <div className="nodeGrid">
            {(Object.keys(settings.enabledNodes) as Array<keyof LangGraphRuntimeSettings["enabledNodes"]>).map((node) => (
              <label className="nodeToggle" key={node}>
                <input
                  checked={settings.enabledNodes[node]}
                  type="checkbox"
                  onChange={(event) =>
                    patchSettings({
                      enabledNodes: {
                        ...settings.enabledNodes,
                        [node]: event.target.checked
                      }
                    })
                  }
                />
                <span>{nodeLabels[node]}</span>
              </label>
            ))}
          </div>
        </section>
          </div>
        </>
      )}
    </section>
  );
}
