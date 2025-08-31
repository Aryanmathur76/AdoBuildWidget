<script lang="ts">
import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel
} from "@tanstack/table-core";
import { createRawSnippet } from "svelte";
import DataTableOutcomeButton from "$lib/components/ui/data-table/data-table-outcome-button.svelte";
import * as Table from "$lib/components/ui/table/index.js";
import { Button } from "$lib/components/ui/button/index.js";
import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
import { Input } from "$lib/components/ui/input/index.js";
import { Skeleton } from "$lib/components/ui/skeleton/index.js";
import {
  FlexRender,
  createSvelteTable,
  renderComponent,
  renderSnippet
} from "$lib/components/ui/data-table/index.js";


export interface TestCase {
  id: string | number;
  name: string;
  outcome: string;
  associatedBugs: { id: string | number; title?: string }[];
}

const { testCases = [], maxHeight = "400px", isLoading = false } = $props<{ testCases?: TestCase[]; maxHeight?: string; isLoading?: boolean }>();

const columns: ColumnDef<TestCase>[] = [
  {
    accessorKey: "id",
    header: "ID",
    cell: ({ row }) => row.getValue("id"),
  },
  {
    accessorKey: "name",
    header: "Test Case Name",
    cell: ({ row }) => {
      const name = row.getValue("name");
      const nameSnippet = createRawSnippet<[string]>((getName) => {
        const n = getName();
        return {
          render: () => `<div style='max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' title='${n}'>${n}</div>`
        };
      });
      return renderSnippet(nameSnippet, String(row.getValue("name")));
    },
  },
  {
    accessorKey: "outcome",
    header: ({ column }) =>
      renderComponent(DataTableOutcomeButton, {
        onclick: column.getToggleSortingHandler()
      }),
    cell: ({ row }) => {
      const outcomeSnippet = createRawSnippet<[string]>((getOutcome) => {
        const outcome = getOutcome();
        return {
          render: () => `<div class='capitalize'>${outcome}</div>`
        };
      });
      return renderSnippet(outcomeSnippet, String(row.getValue("outcome")));
    }
  },
  {
    accessorKey: "associatedBugs",
    header: "Associated Bugs",
    cell: ({ row }) => {
      const bugs = row.original.associatedBugs;
      return bugs && bugs.length
        ? bugs.map(bug => bug.title || bug.id).join(", ")
        : "-";
    }
  }
];

let pagination = $state<PaginationState>({ pageIndex: 0, pageSize: 4 });
let sorting = $state<SortingState>([]);
let columnFilters = $state<ColumnFiltersState>([]);
let rowSelection = $state<RowSelectionState>({});
let columnVisibility = $state<VisibilityState>({ associatedBugs: false });

const table = createSvelteTable({
  get data() {
    return testCases;
  },
  columns,
  state: {
    get pagination() {
      return pagination;
    },
    get sorting() {
      return sorting;
    },
    get columnVisibility() {
      return columnVisibility;
    },
    get rowSelection() {
      return rowSelection;
    },
    get columnFilters() {
      return columnFilters;
    }
  },
  getCoreRowModel: getCoreRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  onPaginationChange: (updater) => {
    if (typeof updater === "function") {
      pagination = updater(pagination);
    } else {
      pagination = updater;
    }
  },
  onSortingChange: (updater) => {
    if (typeof updater === "function") {
      sorting = updater(sorting);
    } else {
      sorting = updater;
    }
  },
  onColumnFiltersChange: (updater) => {
    if (typeof updater === "function") {
      columnFilters = updater(columnFilters);
    } else {
      columnFilters = updater;
    }
  },
  onColumnVisibilityChange: (updater) => {
    if (typeof updater === "function") {
      columnVisibility = updater(columnVisibility);
    } else {
      columnVisibility = updater;
    }
  },
  onRowSelectionChange: (updater) => {
    if (typeof updater === "function") {
      rowSelection = updater(rowSelection);
    } else {
      rowSelection = updater;
    }
  }
});
</script>

<div class="w-full max-w-screen-md mx-auto text-xs">
 <div class="flex items-center py-2 gap-2">
  <Input
   placeholder="Filter test case name..."
   value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
   oninput={(e) =>
    table.getColumn("name")?.setFilterValue(e.currentTarget.value)}
   onchange={(e) => {
    table.getColumn("name")?.setFilterValue(e.currentTarget.value);
   }}
   class="max-w-xs"
  />
  <DropdownMenu.Root>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        <Button {...props} variant="outline" size="sm" class="ml-auto">
          Columns <ChevronDownIcon class="ml-2 size-4" />
        </Button>
      {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="end">
      {#each table.getAllColumns().filter((col) => col.getCanHide()) as column (column)}
        <DropdownMenu.CheckboxItem
          class="capitalize"
          bind:checked={
            () => column.getIsVisible(), (v) => column.toggleVisibility(!!v)
          }
        >
          {column.id}
        </DropdownMenu.CheckboxItem>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
 </div>
 <div class="rounded-md border" style="max-height: {maxHeight}; overflow-y: auto;" >
  <Table.Root>
   <Table.Header>
    {#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
     <Table.Row>
      {#each headerGroup.headers as header (header.id)}
       <Table.Head class="[&:has([role=checkbox])]:pl-3 px-2 py-1">
        {#if !header.isPlaceholder}
         <FlexRender
          content={header.column.columnDef.header}
          context={header.getContext()}
         />
        {/if}
       </Table.Head>
      {/each}
     </Table.Row>
    {/each}
   </Table.Header>
   <Table.Body>
    {#if isLoading}
      {#each Array(4) as _, i}
        <Table.Row>
          {#each columns as col}
            <Table.Cell class="[&:has([role=checkbox])]:pl-3 px-2 py-1">
              <Skeleton class="h-4 w-full" />
            </Table.Cell>
          {/each}
        </Table.Row>
      {/each}
    {:else}
      {#each table.getPaginationRowModel().rows as row (row.id)}
        <Table.Row data-state={row.getIsSelected() && "selected"}>
          {#each row.getVisibleCells() as cell (cell.id)}
            <Table.Cell class="[&:has([role=checkbox])]:pl-3 px-2 py-1">
              <FlexRender
                content={cell.column.columnDef.cell}
                context={cell.getContext()}
              />
            </Table.Cell>
          {/each}
        </Table.Row>
      {:else}
        <Table.Row>
          <Table.Cell colspan={columns.length} class="h-12 text-center">
            No results.
          </Table.Cell>
        </Table.Row>
      {/each}
    {/if}
   </Table.Body>
  </Table.Root>
 </div>
 <div class="flex items-center justify-end space-x-2 pt-2">
  <Button
    variant="outline"
    size="sm"
    onclick={() => table.previousPage()}
    disabled={!table.getCanPreviousPage()}
  >
    Previous
  </Button>
  <Button
    variant="outline"
    size="sm"
    onclick={() => table.nextPage()}
    disabled={!table.getCanNextPage()}
  >
    Next
  </Button>
 </div>
</div>
