/**
 * Typed errors thrown by the service layer, and their conversion to a result
 * that Server Actions and Route Handlers can return to the client.
 *
 * Messages are user-facing (English, rule 1) and never carry internal details.
 */
import { z } from "zod";

export type ServiceErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict";

const HTTP_STATUS: Record<ServiceErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  validation: 400,
  conflict: 409,
};

export abstract class ServiceError extends Error {
  abstract readonly code: ServiceErrorCode;

  get httpStatus(): number {
    return HTTP_STATUS[this.code];
  }
}

export class UnauthenticatedError extends ServiceError {
  readonly code = "unauthenticated";
  constructor(message = "Please sign in to continue.") {
    super(message);
  }
}

/** REQ-PERM-01: the action is not allowed for this user. */
export class ForbiddenError extends ServiceError {
  readonly code = "forbidden";
  constructor(message = "You do not have permission to do this.") {
    super(message);
  }
}

export class NotFoundError extends ServiceError {
  readonly code = "not_found";
  constructor(what = "Item") {
    super(`${what} not found.`);
  }
}

/** Field name → messages, as produced by `z.flattenError`. */
export type FieldErrors = Record<string, string[] | undefined>;

export class ValidationError extends ServiceError {
  readonly code = "validation";
  constructor(
    message = "Please check the highlighted fields.",
    readonly fieldErrors: FieldErrors = {},
  ) {
    super(message);
  }

  static fromZod(error: z.ZodError): ValidationError {
    const { formErrors, fieldErrors } = z.flattenError(error);
    return new ValidationError(formErrors[0], fieldErrors);
  }
}

export type ConflictInfo = {
  /** Display name of whoever made the last change, when known. */
  changedBy: string | null;
  changedAt: Date | null;
};

/**
 * Optimistic concurrency (ARQ-04, REQ-RT-04): the row changed since it was
 * read. The UI formats the time in the project time zone and reloads the row.
 */
export class ConflictError extends ServiceError {
  readonly code = "conflict";
  constructor(
    readonly entity: "tag" | "issue",
    readonly info: ConflictInfo,
  ) {
    super(`This ${entity} was changed by someone else. Data refreshed — please review.`);
  }
}

// ---------------------------------------------------------------------------
// Results for the client

export type ActionError = {
  code: ServiceErrorCode | "internal";
  message: string;
  fieldErrors?: FieldErrors;
  conflict?: { entity: "tag" | "issue"; changedBy: string | null; changedAt: string | null };
};

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

export function toActionError(error: unknown): ActionError {
  if (error instanceof ValidationError) {
    return { code: error.code, message: error.message, fieldErrors: error.fieldErrors };
  }
  if (error instanceof ConflictError) {
    return {
      code: error.code,
      message: error.message,
      conflict: {
        entity: error.entity,
        changedBy: error.info.changedBy,
        changedAt: error.info.changedAt?.toISOString() ?? null,
      },
    };
  }
  if (error instanceof ServiceError) {
    return { code: error.code, message: error.message };
  }
  // Unexpected: log on the server, show a generic message to the user.
  console.error(describeForLog(error));
  return { code: "internal", message: "Something went wrong. Please try again." };
}

/**
 * Error chain as text for the server log. Drizzle appends the query
 * parameters to its messages, and those may hold hashes or tokens (rule 9),
 * so they are cut off.
 */
export function describeForLog(error: unknown): string {
  const lines: string[] = [];
  for (let e = error; e !== undefined && e !== null; e = (e as Error).cause) {
    if (!(e instanceof Error)) {
      lines.push(`non-error thrown: ${typeof e}`);
      break;
    }
    const message = e.message.split("\nparams:")[0];
    const code = "code" in e && typeof e.code === "string" ? ` [${e.code}]` : "";
    lines.push(`${e.name}${code}: ${message}`);
  }
  return lines.join("\n  caused by ");
}

/** Runs a service call and turns thrown errors into an `ActionResult`. */
export async function toActionResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
