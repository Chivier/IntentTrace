import {
  SessionImportOutcomeSchema,
  SessionUploadCandidateListSchema,
  type SessionImportOutcome,
  type SessionUploadCandidateList,
  type SessionUploadCandidateRequest,
  type TraceSourceKind,
} from "@intenttrace/schema";

/** Carries the RFC 7807 `code` so a row can report the server's own failure name. */
export class ImportRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ImportRequestError";
  }
}

async function readProblem(response: Response, label: string): Promise<ImportRequestError> {
  try {
    const body = (await response.json()) as { code?: unknown; detail?: unknown };
    const code = typeof body.code === "string" ? body.code : `${label}_${response.status}`;
    const detail = typeof body.detail === "string" ? body.detail : `${label} ${response.status}`;
    return new ImportRequestError(code, detail);
  } catch {
    return new ImportRequestError(`${label}_${response.status}`, `${label} ${response.status}`);
  }
}

export async function inspectCandidates(
  request: SessionUploadCandidateRequest,
  signal?: AbortSignal,
): Promise<SessionUploadCandidateList> {
  const response = await fetch("/api/v1/imports/candidates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    cache: "no-store",
    signal: signal ?? null,
  });
  if (!response.ok) throw await readProblem(response, "candidates");
  return SessionUploadCandidateListSchema.parse(await response.json());
}

export async function uploadSession(
  file: File,
  source: TraceSourceKind | "auto",
  signal?: AbortSignal,
): Promise<SessionImportOutcome> {
  const query = `source=${source}&fileName=${encodeURIComponent(file.name)}`;
  const response = await fetch(`/api/v1/imports/sessions?${query}`, {
    method: "POST",
    // A `.jsonl` File has an empty `type`, so the content type must be explicit.
    headers: { "content-type": "application/octet-stream" },
    body: file,
    cache: "no-store",
    signal: signal ?? null,
  });
  if (!response.ok) throw await readProblem(response, "upload");
  return SessionImportOutcomeSchema.parse(await response.json());
}
