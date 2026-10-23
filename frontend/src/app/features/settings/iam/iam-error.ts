import { HttpErrorResponse } from '@angular/common/http';
import { IAM_PROBLEM_CODES, type IamProblemCode } from '../../../core/models/iam.model';

/** Übersetzungs-Key für einen IAM-Fehler; unbekannte Fehler fallen auf `fallbackKey` zurück. */
export function iamErrorKey(error: unknown, fallbackKey: string): string {
  const code = problemCode(error);
  return code ? `settings.iam.errors.${code}` : fallbackKey;
}

function problemCode(error: unknown): IamProblemCode | null {
  if (!(error instanceof HttpErrorResponse) || typeof error.error !== 'object' || !error.error) {
    return null;
  }
  const code: unknown = (error.error as { code?: unknown }).code;
  return IAM_PROBLEM_CODES.find((known) => known === code) ?? null;
}
