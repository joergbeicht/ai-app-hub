/** Gemeinsames Layout der IAM-Verwaltungsseiten (Benutzer, Gruppen, Rollen). */
export const IAM_ADMIN_STYLES = `
  :host {
    display: block;
  }
  .tab-subtitle {
    margin: 0 0 1.25rem;
    color: var(--text-secondary);
    font-size: 0.9rem;
  }
  .toolbar {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }
  .toolbar-search {
    flex: 1 1 260px;
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    margin-bottom: 1rem;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: 8px;
  }
  .panel-title {
    margin: 0 0 0.25rem;
    font-weight: 500;
  }
  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.5rem;
  }
  .form-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .state-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: var(--text-secondary);
  }
  .state-row--error {
    color: var(--error-500, #d32f2f);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .row {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: 8px;
  }
  .row-main {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .row-info {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
  }
  .row-title {
    font-weight: 500;
  }
  .row-meta {
    color: var(--text-secondary);
    font-size: 0.85rem;
    overflow-wrap: anywhere;
  }
  .row-actions {
    display: flex;
    gap: 0.25rem;
    align-items: center;
    flex: 0 0 auto;
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary-500) 16%, transparent);
    color: var(--primary-400);
  }
  .badge--muted {
    background: color-mix(in srgb, var(--text-secondary) 16%, transparent);
    color: var(--text-secondary);
  }
  .badge--warn {
    background: color-mix(in srgb, var(--error-500, #d32f2f) 16%, transparent);
    color: var(--error-500, #d32f2f);
  }
  .badge button {
    display: inline-flex;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .badge mat-icon {
    width: 14px;
    height: 14px;
    font-size: 14px;
  }
  .detail {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border-primary);
  }
  .detail-section-title {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-secondary);
  }
  .inline-form {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .inline-form mat-form-field {
    flex: 1 1 220px;
  }
  mat-form-field {
    width: 100%;
  }
`;
