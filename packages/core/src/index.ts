export { createCrmService } from "./commands";
export { createCrmBackupModel } from "./backup";
export { evaluateCommercialOfferReadiness } from "./offers";
export { MemoryCrmRepository } from "./memory-repository";
export type { CreateCrmBackupModelInput, CrmBackupCellValue, CrmBackupModel, CrmBackupRow, CrmBackupSheet } from "./backup";
export type { CrmCollection, CrmRepository, CrmRepositorySnapshot } from "./repository";
export type { FeeTableRow, OfferLeadFacts, OfferReadiness } from "./offers";
export type * from "./types";
