"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PaginationProps {
  pageIndex: number;
  pageSize: number;
  pageCount: number;
  rowCount: number;
  selectedCount: number;
  canPrevious: boolean;
  canNext: boolean;
  onPageChange: (index: number) => void;
  onPageSizeChange: (size: number) => void;
}

const SIZES = [10, 20, 50, 100];

export function TablePagination(p: PaginationProps) {
  const from = p.rowCount === 0 ? 0 : p.pageIndex * p.pageSize + 1;
  const to = Math.min(p.rowCount, (p.pageIndex + 1) * p.pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <p className="tabular-nums">
        {p.selectedCount > 0 ? (
          <span className="text-foreground">{p.selectedCount} selected · </span>
        ) : null}
        {from}–{to} of {p.rowCount}
      </p>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline">Rows</span>
          <Select
            value={String(p.pageSize)}
            onValueChange={(v) => v && p.onPageSizeChange(Number(v))}
          >
            <SelectTrigger size="sm" className="w-18" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="tabular-nums">
          Page {p.pageCount === 0 ? 0 : p.pageIndex + 1} of {p.pageCount}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="First page"
            disabled={!p.canPrevious}
            onClick={() => p.onPageChange(0)}
          >
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            disabled={!p.canPrevious}
            onClick={() => p.onPageChange(p.pageIndex - 1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            disabled={!p.canNext}
            onClick={() => p.onPageChange(p.pageIndex + 1)}
          >
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Last page"
            disabled={!p.canNext}
            onClick={() => p.onPageChange(p.pageCount - 1)}
          >
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
