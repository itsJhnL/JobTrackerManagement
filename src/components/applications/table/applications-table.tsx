"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  useTable,
  type ColumnFiltersState,
  type ColumnVisibilityState,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Briefcase,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  archiveApplications,
  bulkUpdateStatus,
  deleteApplications,
} from "@/actions/applications";
import { EmptyState } from "@/components/shared/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ACTIVE_STATUSES,
  APPLICATION_STATUSES,
  APPLICATION_STATUS_COLORS,
  APPLICATION_STATUS_LABELS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  type ApplicationStatus,
} from "@/lib/constants";
import type { ApplicationListItem } from "@/lib/data/applications";
import { cn } from "@/lib/utils";

import { useQuickAdd } from "../quick-add-provider";
import { ApplicationCard } from "../application-card";
import { applicationColumns, defaultColumnVisibility } from "./columns";
import { applicationsTableFeatures } from "./features";
import { TablePagination } from "./pagination";
import {
  ArchivedToggle,
  ColumnVisibilityMenu,
  FacetedFilter,
  RangeFilter,
  SearchInput,
  ViewToggle,
} from "./toolbar";

const EMPTY: ApplicationListItem[] = [];

interface ApplicationsTableProps {
  data?: ApplicationListItem[];
  /** Initial status filter from the URL (?status=applied or ?status=active). */
  initialStatus?: string;
  showingArchived: boolean;
  onToggleArchived: (v: boolean) => void;
}

function initialStatusFilter(value?: string): ApplicationStatus[] {
  if (!value) return [];
  if (value === "active") return [...ACTIVE_STATUSES];
  return (APPLICATION_STATUSES as readonly string[]).includes(value)
    ? [value as ApplicationStatus]
    : [];
}

export function ApplicationsTable({
  data = EMPTY,
  initialStatus,
  showingArchived,
  onToggleArchived,
}: ApplicationsTableProps) {
  const router = useRouter();
  const quickAdd = useQuickAdd();
  const [view, setView] = useState<"table" | "cards">("table");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "updated_at", desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(() => {
    const s = initialStatusFilter(initialStatus);
    return s.length ? [{ id: "status", value: s }] : [];
  });
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>(
    defaultColumnVisibility,
  );
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const table = useTable({
    features: applicationsTableFeatures,
    columns: applicationColumns,
    data,
    getRowId: (row) => row.id,
    globalFilterFn: "includesString",
    enableRowSelection: true,
    autoResetPageIndex: true,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      pagination,
      columnVisibility,
      rowSelection,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
  });

  const statusCol = table.getColumn("status");
  const platformCol = table.getColumn("platform");
  const typeCol = table.getColumn("employment_type");
  const rateCol = table.getColumn("effective_rate");

  const statusSelected = (statusCol?.getFilterValue() as string[] | undefined) ?? [];
  const platformSelected = (platformCol?.getFilterValue() as string[] | undefined) ?? [];
  const typeSelected = (typeCol?.getFilterValue() as string[] | undefined) ?? [];
  const rateRange = (rateCol?.getFilterValue() as
    [number | undefined, number | undefined] | undefined) ?? [undefined, undefined];

  const statusFacets = statusCol?.getFacetedUniqueValues();
  const platformFacets = platformCol?.getFacetedUniqueValues();
  const typeFacets = typeCol?.getFacetedUniqueValues();

  const statusOptions = useMemo(
    () =>
      APPLICATION_STATUSES.map((s) => ({
        value: s,
        label: APPLICATION_STATUS_LABELS[s],
        count: statusFacets?.get(s) ?? 0,
        color: APPLICATION_STATUS_COLORS[s],
      })),
    [statusFacets],
  );
  const platformOptions = useMemo(
    () =>
      [...(platformFacets ?? new Map<string | null, number>())]
        .filter(([v]) => !!v)
        .map(([v, count]) => ({ value: String(v), label: String(v), count }))
        .sort((a, b) => b.count - a.count),
    [platformFacets],
  );
  const typeOptions = useMemo(
    () =>
      EMPLOYMENT_TYPES.map((t) => ({
        value: t,
        label: EMPLOYMENT_TYPE_LABELS[t],
        count: typeFacets?.get(t) ?? 0,
      })),
    [typeFacets],
  );

  const rows = table.getRowModel().rows;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const selectedIds = table.getSelectedRowIds();
  const hasFilters = columnFilters.length > 0 || globalFilter.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={globalFilter} onChange={(v) => table.setGlobalFilter(v)} />
        <FacetedFilter
          title="Status"
          options={statusOptions}
          selected={statusSelected}
          onChange={(v) => statusCol?.setFilterValue(v)}
        />
        <FacetedFilter
          title="Type"
          options={typeOptions}
          selected={typeSelected}
          onChange={(v) => typeCol?.setFilterValue(v)}
        />
        {platformOptions.length > 0 ? (
          <FacetedFilter
            title="Platform"
            options={platformOptions}
            selected={platformSelected}
            onChange={(v) => platformCol?.setFilterValue(v)}
          />
        ) : null}
        <RangeFilter
          title="Rate"
          value={rateRange}
          bounds={rateCol?.getFacetedMinMaxValues()}
          onChange={(v) =>
            rateCol?.setFilterValue(
              v[0] === undefined && v[1] === undefined ? undefined : v,
            )
          }
        />
        <ArchivedToggle checked={showingArchived} onChange={onToggleArchived} />
        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => {
              table.resetColumnFilters(true);
              table.setGlobalFilter("");
            }}
          >
            Reset
            <X className="size-3.5" />
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {view === "table" ? (
            <ColumnVisibilityMenu
              columns={table
                .getAllLeafColumns()
                .filter((c) => c.getCanHide())
                .map((c) => ({
                  id: c.id,
                  label: c.columnDef.meta?.label ?? c.id,
                  visible: c.getIsVisible(),
                }))}
              onToggle={(id, visible) => table.getColumn(id)?.toggleVisibility(visible)}
            />
          ) : null}
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      {/* Bulk actions */}
      {selectedIds.length > 0 ? (
        <BulkActionsBar
          ids={selectedIds}
          onClear={() => table.resetRowSelection(true)}
          onDone={() => {
            table.resetRowSelection(true);
            router.refresh();
          }}
          archived={showingArchived}
        />
      ) : null}

      {/* Content */}
      {data.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={showingArchived ? "No archived applications" : "No applications yet"}
          description={
            showingArchived
              ? "Archived applications will show up here."
              : "Add your first application by hand or paste a job post and let AI fill in the details."
          }
          action={
            !showingArchived ? (
              <Button onClick={() => quickAdd.open()}>Add application</Button>
            ) : undefined
          }
        />
      ) : filteredCount === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No matches"
          description="Try a different search or clear the filters."
          action={
            <Button
              variant="outline"
              onClick={() => {
                table.resetColumnFilters(true);
                table.setGlobalFilter("");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : view === "cards" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <ApplicationCard
              key={row.id}
              application={row.original}
              selected={row.getIsSelected()}
              onSelectedChange={(v) => row.toggleSelected(v)}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <div className="scrollbar-thin overflow-x-auto">
            <Table className="text-sm">
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id} className="bg-muted/40 hover:bg-muted/40">
                    {hg.headers.map((header) => {
                      const meta = header.column.columnDef.meta;
                      const canSort = header.column.getCanSort();
                      const sorted = header.column.getIsSorted();
                      return (
                        <TableHead
                          key={header.id}
                          colSpan={header.colSpan}
                          className={cn(
                            "h-9 text-xs whitespace-nowrap",
                            meta?.className,
                            meta?.align === "end" && "text-right",
                          )}
                        >
                          {header.isPlaceholder ? null : canSort ? (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className={cn(
                                "-ml-1 inline-flex h-7 items-center gap-1 rounded-md px-1 hover:bg-muted hover:text-foreground",
                                meta?.align === "end" && "flex-row-reverse",
                                sorted && "text-foreground",
                              )}
                              aria-label={`Sort by ${meta?.label ?? header.id}`}
                            >
                              <table.FlexRender header={header} />
                              {sorted === "asc" ? (
                                <ArrowUp className="size-3" />
                              ) : sorted === "desc" ? (
                                <ArrowDown className="size-3" />
                              ) : (
                                <ArrowUpDown className="size-3 opacity-40" />
                              )}
                            </button>
                          ) : (
                            <table.FlexRender header={header} />
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={() => router.push(`/applications/${row.original.id}`)}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta;
                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            "py-2",
                            meta?.className,
                            meta?.align === "end" && "text-right",
                          )}
                        >
                          <table.FlexRender cell={cell} />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {data.length > 0 && filteredCount > 0 ? (
        <TablePagination
          pageIndex={pagination.pageIndex}
          pageSize={pagination.pageSize}
          pageCount={table.getPageCount()}
          rowCount={filteredCount}
          selectedCount={selectedIds.length}
          canPrevious={table.getCanPreviousPage()}
          canNext={table.getCanNextPage()}
          onPageChange={(i) => table.setPageIndex(i)}
          onPageSizeChange={(s) => table.setPageSize(s)}
        />
      ) : null}
    </div>
  );
}

function BulkActionsBar({
  ids,
  onClear,
  onDone,
  archived,
}: {
  ids: string[];
  onClear: () => void;
  onDone: () => void;
  archived: boolean;
}) {
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = (
    fn: () => Promise<{ ok: boolean; error?: string; data?: { count: number } }>,
    label: string,
  ) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Something went wrong");
      else {
        toast.success(
          `${label} ${r.data?.count ?? ids.length} application${ids.length === 1 ? "" : "s"}`,
        );
        onDone();
      }
    });

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
      <span className="font-medium tabular-nums">{ids.length} selected</span>
      <Button variant="ghost" size="xs" onClick={onClear} aria-label="Clear selection">
        <X />
      </Button>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" size="sm" disabled={pending} />}
          >
            Set status
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {APPLICATION_STATUSES.map((s) => (
              <DropdownMenuItem
                key={s}
                onClick={() => run(() => bulkUpdateStatus({ ids, status: s }), `Updated`)}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: APPLICATION_STATUS_COLORS[s] }}
                />
                {APPLICATION_STATUS_LABELS[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              () => archiveApplications({ ids }, !archived),
              archived ? "Restored" : "Archived",
            )
          }
        >
          <Archive />
          {archived ? "Restore" : "Archive"}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          disabled={pending}
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 />
          Delete
        </Button>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {ids.length} application{ids.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes them along with their follow-ups, interviews,
              assessments and documents. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setConfirmDelete(false);
                run(() => deleteApplications({ ids }), "Deleted");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
