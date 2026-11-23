"use client";

import { api } from "@/lib/api";

export interface CsvImportResult {
  row: number;
  ok: boolean;
  channels?: string;
  scheduledFor?: string;
  created?: number;
  mediaCount?: number;
  error?: string;
}

export interface CsvMediaRef {
  id: string;
  path: string;
}

export async function uploadCsv(
  file: File,
  asDraft = false,
  options?: {
    mediaMap?: Record<number, CsvMediaRef[]>;
    retryRows?: number[];
    batchId?: string;
  },
): Promise<CsvImportResult[]> {
  const form = new FormData();
  form.append("file", file);
  if (asDraft) form.append("asDraft", "true");
  if (options?.mediaMap && Object.keys(options.mediaMap).length > 0) {
    form.append("mediaMap", JSON.stringify(options.mediaMap));
  }
  if (options?.retryRows && options.retryRows.length > 0) {
    form.append("retryRows", JSON.stringify(options.retryRows));
  }
  if (options?.batchId) {
    form.append("batchId", options.batchId);
  }
  return api.upload<CsvImportResult[]>("/posts/csv-import", form);
}
