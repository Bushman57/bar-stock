import { NextResponse } from "next/server";
import { requireClerkOrAdmin } from "@/lib/auth/api-auth";
import {
  appendTransactions,
  applyStockInBatch,
  getInventoryItems,
} from "@/lib/sheets";
import { validateStockIn } from "@/lib/stock";
import type { Transaction } from "@/lib/types";

type InBatchEntry = {
  itemId: string;
  quantity: number;
};

export async function POST(request: Request) {
  try {
    const { email, uid } = await requireClerkOrAdmin(request);
    const body = (await request.json()) as {
      entries?: InBatchEntry[];
      notes?: string;
    };
    const entries = body.entries;

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        { error: "entries array is required." },
        { status: 400 }
      );
    }

    if (entries.length > 200) {
      return NextResponse.json(
        { error: "Too many entries in one batch (max 200)." },
        { status: 400 }
      );
    }

    const items = await getInventoryItems();
    const byId = new Map(items.map((item) => [item.itemId, item]));
    const userEmail = email ?? uid;
    const timestamp = new Date().toISOString();
    const notes = body.notes?.trim() ?? "";

    const prepared: Array<{ itemId: string; quantity: number }> = [];
    const errors: string[] = [];
    const seen = new Set<string>();

    for (const entry of entries) {
      if (!entry?.itemId) {
        errors.push("Each entry needs itemId.");
        continue;
      }
      if (seen.has(entry.itemId)) {
        errors.push(`Duplicate itemId in batch: ${entry.itemId}`);
        continue;
      }
      seen.add(entry.itemId);

      const item = byId.get(entry.itemId);
      if (!item) {
        errors.push(`Item not found: ${entry.itemId}`);
        continue;
      }

      const quantity = Number(entry.quantity);
      const validationError = validateStockIn(quantity);
      if (validationError) {
        errors.push(`${item.itemName}: ${validationError}`);
        continue;
      }

      prepared.push({ itemId: entry.itemId, quantity });
    }

    if (errors.length) {
      return NextResponse.json(
        { error: errors[0], errors },
        { status: 400 }
      );
    }

    const applied = await applyStockInBatch(
      prepared.map((row) => ({
        item: byId.get(row.itemId)!,
        quantity: row.quantity,
      }))
    );

    const transactions: Transaction[] = applied.map((item, index) => ({
      timestamp,
      itemId: item.itemId,
      itemName: item.itemName,
      type: "in" as const,
      quantity: prepared[index].quantity,
      userEmail,
      notes,
      destination: "",
      opening: null,
      add: null,
      closing: null,
    }));

    await appendTransactions(transactions);

    return NextResponse.json({
      count: applied.length,
      items: applied,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("POST /api/stock/in-batch", error);
    const message =
      error instanceof Error ? error.message : "Failed to save stock in batch";
    const isQuota = /quota|rate.?limit|429|RESOURCE_EXHAUSTED/i.test(message);
    return NextResponse.json(
      { error: message },
      { status: isQuota ? 429 : 500 }
    );
  }
}
