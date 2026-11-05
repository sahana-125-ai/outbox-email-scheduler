import type { Request } from "express";

export interface Pagination {
  page: number;
  limit: number;
  skip: number;
}

export function getPagination(
  query: Request["query"],
  defaultLimit = 20,
  maxLimit = 100
): Pagination {
  const parsedPage = Number(query.page);
  const parsedLimit = Number(query.limit);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.min(Math.floor(parsedLimit), maxLimit)
    : defaultLimit;
  return { page, limit, skip: (page - 1) * limit };
}

export function paginationMeta(pagination: Pagination, total: number) {
  return {
    page: pagination.page,
    limit: pagination.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / pagination.limit))
  };
}
