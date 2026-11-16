"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchInventory, submitStockInBatch } from "@/lib/api-client";
import { calculateTotalStock } from "@/lib/stock";
import { formatNumber } from "@/lib/utils";
import type { InventoryItem } from "@/lib/types";

type StockInLine = {
  itemId: string;
  quantity: string;
};

export function StockMovementForm() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [lines, setLines] = useState<StockInLine[]>([]);
  const [notes, setNotes] = useState("");
  const [resultsOpen, setResultsOpen] = useState(false);
  const quantityRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchInventory()
      .then(setItems)
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Failed to load inventory")
      )
      .finally(() => setLoading(false));
  }, []);

  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return items
      .filter(
        (item) =>
          item.itemName.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query)
      )
      .slice(0, 8);
  }, [items, search]);

  const selected = items.find((item) => item.itemId === selectedId) ?? null;
  const listedIds = useMemo(() => new Set(lines.map((line) => line.itemId)), [lines]);

  const preview = useMemo(() => {
    return lines
      .map((line) => {
        const item = items.find((entry) => entry.itemId === line.itemId);
        if (!item) return null;
        const qty = Number(line.quantity);
        if (!Number.isFinite(qty) || qty <= 0) return null;
        const newAdd = item.stockIn + qty;
        const newTotal = calculateTotalStock(item.openingStock, newAdd);
        return { item, quantity: qty, newAdd, newTotal };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
  }, [items, lines]);

  function chooseItem(item: InventoryItem) {
    const existing = lines.find((line) => line.itemId === item.itemId);
    setSelectedId(item.itemId);
    setSearch(item.itemName);
    setQuantity(existing?.quantity ?? "");
    setResultsOpen(false);
    requestAnimationFrame(() => {
      quantityRef.current?.focus();
      quantityRef.current?.select();
    });
  }

  function addToList() {
    if (!selected) {
      toast.error("Search and select one item first.");
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Enter a quantity greater than zero.");
      return;
    }

    setLines((current) => {
      const existing = current.find((line) => line.itemId === selected.itemId);
      if (existing) {
        return current.map((line) =>
          line.itemId === selected.itemId ? { ...line, quantity: String(qty) } : line
        );
      }
      return [...current, { itemId: selected.itemId, quantity: String(qty) }];
    });
    setSearch("");
    setSelectedId(null);
    setQuantity("");
  }

  function removeLine(itemId: string) {
    setLines((current) => current.filter((line) => line.itemId !== itemId));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!preview.length) {
      toast.error("Add at least one item to the list.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitStockInBatch({
        entries: preview.map((row) => ({
          itemId: row.item.itemId,
          quantity: row.quantity,
        })),
        notes,
      });
      const updatedById = new Map(result.items.map((item) => [item.itemId, item]));
      setItems((current) =>
        current.map((item) => updatedById.get(item.itemId) ?? item)
      );
      setLines([]);
      setNotes("");
      toast.success(
        `Stock in saved for ${result.count} item${result.count === 1 ? "" : "s"}.`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Stock in failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-slate-500">Loading inventory…</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record Stock In</CardTitle>
        <CardDescription>
          Search one item, enter the quantity, and add it to the list. Remove a line if it
          was entered wrong, then save.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="stock-in-search">Item</Label>
            <Input
              id="stock-in-search"
              placeholder="Search by item or category"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setSelectedId(null);
                setResultsOpen(true);
              }}
              onFocus={() => {
                if (search.trim()) setResultsOpen(true);
              }}
              autoComplete="off"
            />
            {resultsOpen && search.trim() && (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                {matches.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-slate-500">No matching item.</p>
                ) : (
                  <ul>
                    {matches.map((item) => {
                      const active = item.itemId === selectedId;
                      const total = calculateTotalStock(item.openingStock, item.stockIn);
                      return (
                        <li key={item.itemId}>
                          <button
                            type="button"
                            className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                              active ? "bg-emerald-50" : ""
                            }`}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => chooseItem(item)}
                          >
                            <span>
                              <span className="font-medium text-slate-900">{item.itemName}</span>
                              <span className="mt-0.5 block text-xs text-slate-500">
                                Open {formatNumber(item.openingStock)} · ADD{" "}
                                {formatNumber(item.stockIn)} · Total {formatNumber(total)}
                                {listedIds.has(item.itemId) ? " · already on the list" : ""}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs font-medium text-slate-600">
                              {active ? "Selected" : "Select"}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-2 sm:w-40">
              <Label htmlFor="stock-in-qty">Quantity</Label>
              <Input
                ref={quantityRef}
                id="stock-in-qty"
                type="number"
                min="0"
                step="any"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addToList();
                  }
                }}
                placeholder="Enter quantity"
              />
            </div>
            <Button type="button" onClick={addToList} disabled={!selected}>
              {selected && listedIds.has(selected.itemId) ? "Update list" : "Add to list"}
            </Button>
          </div>

          {selected && (
            <p className="text-sm text-slate-600">
              Adding <span className="font-medium text-slate-900">{selected.itemName}</span>
            </p>
          )}

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900">
              List — {preview.length} item{preview.length === 1 ? "" : "s"}
            </p>
            {preview.length === 0 ? (
              <p className="text-sm text-slate-500">No items added yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty in</TableHead>
                    <TableHead className="text-right">New ADD</TableHead>
                    <TableHead className="text-right">New total</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((row) => (
                    <TableRow key={row.item.itemId}>
                      <TableCell className="font-medium">{row.item.itemName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.quantity)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.newAdd)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.newTotal)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeLine(row.item.itemId)}
                        >
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="stock-in-notes">Notes (optional)</Label>
            <Input
              id="stock-in-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="e.g. delivery from supplier"
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={submitting || preview.length === 0}
          >
            {submitting ? "Saving…" : "Save stock in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
