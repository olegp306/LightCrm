import { Download } from "lucide-react";

export function BackupButton() {
  return (
    <a className="backupButton" href="/api/crm/backup" aria-label="Download CRM backup">
      <span>backup</span>
      <Download size={16} strokeWidth={1.9} aria-hidden="true" />
    </a>
  );
}
