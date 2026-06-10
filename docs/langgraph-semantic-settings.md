# LangGraph Semantic Settings

`semanticMode` enables meaning-first orchestration. When it is on, CRM intake goes through the semantic LangGraph pipeline instead of the legacy rule fallback.

`prompts.systemRole` defines the AI Chief of Staff role.
`prompts.intentClassifier` controls semantic intent classification.
`prompts.entityExtractor` controls explicit field extraction with evidence.
`prompts.targetResolver` controls existing lead, client, project, or task resolution.
`prompts.validationGuard` controls anti-hallucination, duplicate, and safety checks.
`prompts.actionPlanner` controls action planning after validation.

`taxonomy.intents` lists allowed business intents.
`taxonomy.entityFields` lists CRM fields the extractor may return.
`taxonomy.requiredFieldsByAction` defines mandatory fields per action.

`thresholds.autoExecute` is the minimum confidence for automatic actions.
`thresholds.askConfirmation` is the lower bound below which clarification is required.
`thresholds.duplicateCandidate` is the score at which similar records should block auto-create.

`confirmationPolicy.requireConfirmationForWrites` forces human review for all writes.
`confirmationPolicy.requireConfirmationForDuplicateCandidates` blocks auto-create when similar records exist.
`confirmationPolicy.allowAutoCreateLead` allows `create_lead` when validation approves it.
`confirmationPolicy.allowAutoCreateReminder` allows `create_reminder` when validation approves it.

Legacy phrase arrays are kept only for migration compatibility when `semanticMode` is explicitly disabled. They are not part of the semantic runtime controls.
