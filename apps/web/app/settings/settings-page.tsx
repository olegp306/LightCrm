"use client";

import type { CrmIntent, LangGraphRuntimeSettings } from "@lightcrm/orchestrator";
import { useEffect, useMemo, useRef, useState } from "react";

type SettingsResponse = {
  settings: LangGraphRuntimeSettings;
  presets: LangGraphRuntimeSettings[];
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

function phraseText(values: string[]) {
  return values.join("\n");
}

function parsePhrases(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function LangGraphSettingsPage() {
  const [settings, setSettings] = useState<LangGraphRuntimeSettings | null>(null);
  const [presets, setPresets] = useState<LangGraphRuntimeSettings[]>([]);
  const [status, setStatus] = useState<"loading" | "saved" | "saving" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
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
    if (!settings) {
      return;
    }
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    const controller = new AbortController();
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
          setSettings(payload.settings);
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

  return (
    <section className="settingsSurface">
      <header className="settingsHeader">
        <div>
          <h1>LangGraph Settings</h1>
          <p>{activePreset?.description ?? settings.description}</p>
        </div>
        <span className={`liveStatus ${status}`}>{status === "saved" ? "Live" : status}</span>
      </header>

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
        <section className="settingsPanel">
          <h2>Runtime</h2>
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
          <h2>Language</h2>
          <label>
            <span>New lead phrases</span>
            <textarea
              rows={5}
              value={phraseText(settings.extraNewLeadPhrases)}
              onChange={(event) => patchSettings({ extraNewLeadPhrases: parsePhrases(event.target.value) })}
            />
          </label>
          <label>
            <span>Mail analysis phrases</span>
            <textarea
              rows={5}
              value={phraseText(settings.mailAnalysisPhrases)}
              onChange={(event) => patchSettings({ mailAnalysisPhrases: parsePhrases(event.target.value) })}
            />
          </label>
          <label>
            <span>Reminder phrases</span>
            <textarea
              rows={5}
              value={phraseText(settings.reminderPhrases)}
              onChange={(event) => patchSettings({ reminderPhrases: parsePhrases(event.target.value) })}
            />
          </label>
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
    </section>
  );
}
