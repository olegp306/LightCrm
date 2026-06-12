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
  };
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

export function LangGraphSettingsPage() {
  const [activeTab, setActiveTab] = useState<"crm" | "langgraph">("crm");
  const [settings, setSettings] = useState<LangGraphRuntimeSettings | null>(null);
  const [presets, setPresets] = useState<LangGraphRuntimeSettings[]>([]);
  const [crmSettings, setCrmSettings] = useState<CrmSettingsResponse["settings"] | null>(null);
  const [status, setStatus] = useState<"loading" | "saved" | "saving" | "error">("loading");
  const [crmStatus, setCrmStatus] = useState<"loading" | "saved" | "saving" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [crmError, setCrmError] = useState<string | null>(null);
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
              : activePreset?.description ?? settings.description}
          </p>
        </div>
        <span className={`liveStatus ${activeTab === "crm" ? crmStatus : status}`}>
          {(activeTab === "crm" ? crmStatus : status) === "saved" ? "Live" : activeTab === "crm" ? crmStatus : status}
        </span>
      </header>

      <div className="settingsTabs">
        <button className={activeTab === "crm" ? "active" : ""} type="button" onClick={() => setActiveTab("crm")}>
          CRM Settings
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
              <h2>Project People</h2>
              <p>Internal people whose names should not become clients, leads, or offer recipients unless explicitly stated.</p>
            </div>
            <button type="button" onClick={addProjectPerson}>
              Add person
            </button>
          </div>
          <div className="projectPeopleList">
            {settings.projectPeople.map((person, index) => (
              <div className="projectPersonCard" key={`${person.name}-${index}`}>
                <label>
                  <span>Name</span>
                  <input value={person.name} onChange={(event) => patchProjectPerson(index, { name: event.target.value })} />
                </label>
                <label>
                  <span>Role</span>
                  <input value={person.role} onChange={(event) => patchProjectPerson(index, { role: event.target.value })} />
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
