import { Request } from 'express';

export interface PageParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
  offset: number;
}

export interface SortParams {
  sortBy: string;
  order: 'ASC' | 'DESC';
}

/** Coerce an Express query value (string | string[] | ParsedQs) to a plain string. */
export function queryString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** Parse `page` and `limit` query params into safe, bounded pagination values. */
/** Reads a numeric query parameter that may already have been coerced. */
function numericQuery(value: unknown, fallback: number): number {
  const raw: unknown = Array.isArray(value) ? (value[0] as unknown) : value;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') return parseInt(raw, 10);
  return fallback;
}

export function parsePagination(req: Request, defaultLimit = 20, maxLimit = 100): PageParams {
  // Validation middleware replaces req.query with coerced numbers, so accept
  // both the raw string and the parsed value here.
  const pageRaw = numericQuery(req.query.page, 1);
  const limitRaw = numericQuery(req.query.limit, defaultLimit);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, maxLimit) : defaultLimit;
  return { page, limit, offset: (page - 1) * limit };
}

/** Build pagination metadata for a list response. */
export function pageMeta(total: number, params: PageParams): PageMeta {
  return {
    total,
    page: params.page,
    limit: params.limit,
    pages: params.limit > 0 ? Math.ceil(total / params.limit) : 0,
    offset: params.offset,
  };
}

/**
 * Parse `sortBy` and `order` query params against an allow-list. The returned
 * column and direction are safe to interpolate into SQL because `sortBy` is
 * constrained to `allowed` and `order` to a fixed pair of keywords.
 */
export function parseSort(req: Request, allowed: string[], defaultColumn: string): SortParams {
  const requested = queryString(req.query.sortBy);
  const sortBy = allowed.includes(requested) ? requested : defaultColumn;
  const order = queryString(req.query.order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return { sortBy, order };
}
