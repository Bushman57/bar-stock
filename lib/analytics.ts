import {
  dateKeysInclusive,
  isDateKeyInRange,
  rollingDateRange,
  todayDateKey,
  transactionDateKey,
} from "@/lib/dates";
import type { DashboardStats, InventoryItem, Transaction } from "./types";
import { isSalesTransaction } from "./types";
import { isLowStock, isOutOfStock } from "./stock";

export function buildDashboardStats(
  items: InventoryItem[],
  transactions: Transaction[]
): DashboardStats {
  const todayKey = todayDateKey();
  const todayMovements = transactions.filter(
    (tx) => transactionDateKey(tx.timestamp) === todayKey
  ).length;

  return {
    totalItems: items.length,
    lowStockCount: items.filter(isLowStock).length,
    outOfStockCount: items.filter(isOutOfStock).length,
    todayMovements,
  };
}

/**
 * Inclusive app-timezone calendar window.
 * days <= 0 → today only; days = 7 → today and the prior 6 days.
 */
export function filterTransactionsByDays(
  transactions: Transaction[],
  days: number
): Transaction[] {
  const span = days <= 0 ? 1 : days;
  const { from, to } = rollingDateRange(span);
  return transactions.filter((tx) => {
    const day = transactionDateKey(tx.timestamp);
    return isDateKeyInRange(day, from, to);
  });
}

export function groupStockByCategory(items: InventoryItem[]) {
  const grouped = new Map<string, number>();
  for (const item of items) {
    const key = item.category || "Uncategorized";
    grouped.set(key, (grouped.get(key) ?? 0) + item.closingStock);
  }
  return Array.from(grouped.entries()).map(([category, stock]) => ({
    category,
    stock,
  }));
}

export function topConsumedItems(transactions: Transaction[], limit = 10) {
  const totals = new Map<string, { itemName: string; quantity: number }>();
  for (const tx of transactions) {
    if (!isSalesTransaction(tx)) continue;
    const current = totals.get(tx.itemId) ?? {
      itemName: tx.itemName,
      quantity: 0,
    };
    current.quantity += tx.quantity;
    totals.set(tx.itemId, current);
  }

  return Array.from(totals.entries())
    .map(([itemId, data]) => ({ itemId, ...data }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, limit);
}

export function dailyMovementTotals(transactions: Transaction[]) {
  const totals = new Map<string, { in: number; out: number }>();
  for (const tx of transactions) {
    const day = transactionDateKey(tx.timestamp);
    if (!day) continue;
    const current = totals.get(day) ?? { in: 0, out: 0 };
    if (tx.type === "in") current.in += tx.quantity;
    else if (isSalesTransaction(tx)) current.out += tx.quantity;
    totals.set(day, current);
  }

  return Array.from(totals.entries())
    .map(([date, values]) => ({ date, ...values }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type AnalyticsSummary = {
  unitsSold: number;
  unitsReceived: number;
  salesAmount: number;
  profit: number;
};

export type DailyProfitPoint = {
  date: string;
  profit: number;
};

export type TopItemRow = {
  itemId: string;
  itemName: string;
  quantity: number;
  revenue: number;
  profit: number;
};

export type CategoryProfitRow = {
  category: string;
  quantity: number;
  revenue: number;
  profit: number;
};

/** On hand now, and no sales in the selected period. Value is closing × buying price. */
export type DeadStockRow = {
  itemId: string;
  itemName: string;
  units: number;
  value: number;
};

/**
 * Period totals using live Sheet1 prices. Blank buying price counts as 0.
 * Category comes from Sheet1 column C.
 */
export function buildPeriodAnalytics(
  items: InventoryItem[],
  transactions: Transaction[]
): {
  summary: AnalyticsSummary;
  dailyProfit: DailyProfitPoint[];
  topItems: TopItemRow[];
  categoryProfit: CategoryProfitRow[];
  deadStock: DeadStockRow[];
} {
  const byId = new Map(items.map((item) => [item.itemId, item]));
  const summary: AnalyticsSummary = {
    unitsSold: 0,
    unitsReceived: 0,
    salesAmount: 0,
    profit: 0,
  };
  const profitByDay = new Map<string, number>();
  const byItem = new Map<string, TopItemRow>();
  const byCategory = new Map<string, CategoryProfitRow>();
  const soldQty = new Map<string, number>();

  for (const tx of transactions) {
    if (tx.type === "in") {
      summary.unitsReceived += tx.quantity;
      continue;
    }
    if (!isSalesTransaction(tx)) continue;

    const item = byId.get(tx.itemId);
    const price = item?.price ?? 0;
    const buy = item?.buyingPrice ?? 0;
    const revenue = tx.quantity * price;
    const rowProfit = tx.quantity * (price - buy);
    const category = item?.category?.trim() || "Uncategorized";

    summary.unitsSold += tx.quantity;
    summary.salesAmount += revenue;
    summary.profit += rowProfit;
    soldQty.set(tx.itemId, (soldQty.get(tx.itemId) ?? 0) + tx.quantity);

    const day = transactionDateKey(tx.timestamp);
    if (day) {
      profitByDay.set(day, (profitByDay.get(day) ?? 0) + rowProfit);
    }

    const current = byItem.get(tx.itemId) ?? {
      itemId: tx.itemId,
      itemName: tx.itemName || item?.itemName || tx.itemId,
      quantity: 0,
      revenue: 0,
      profit: 0,
    };
    current.quantity += tx.quantity;
    current.revenue += revenue;
    current.profit += rowProfit;
    if (tx.itemName) current.itemName = tx.itemName;
    byItem.set(tx.itemId, current);

    const categoryRow = byCategory.get(category) ?? {
      category,
      quantity: 0,
      revenue: 0,
      profit: 0,
    };
    categoryRow.quantity += tx.quantity;
    categoryRow.revenue += revenue;
    categoryRow.profit += rowProfit;
    byCategory.set(category, categoryRow);
  }

  return {
    summary,
    dailyProfit: Array.from(profitByDay.entries())
      .map(([date, profit]) => ({ date, profit }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    topItems: Array.from(byItem.values()),
    categoryProfit: Array.from(byCategory.values()).sort(
      (a, b) => b.profit - a.profit
    ),
    deadStock: items
      .filter(
        (item) =>
          item.closingStock > 0 && (soldQty.get(item.itemId) ?? 0) <= 0
      )
      .map((item) => ({
        itemId: item.itemId,
        itemName: item.itemName,
        units: item.closingStock,
        value: item.closingStock * (item.buyingPrice ?? 0),
      }))
      .sort((a, b) => b.value - a.value || b.units - a.units),
  };
}

export type StockInLine = {
  itemId: string;
  itemName: string;
  quantity: number;
  userEmail: string;
  notes: string;
};

export type StockInDay = {
  date: string;
  units: number;
  lines: StockInLine[];
};

/** Most recent calendar days that have stock-in rows, newest first. */
export function recentStockInDays(
  transactions: Transaction[],
  limit = 5
): StockInDay[] {
  const byDay = new Map<string, StockInLine[]>();
  for (const tx of transactions) {
    if (tx.type !== "in" || tx.quantity === 0) continue;
    const date = transactionDateKey(tx.timestamp);
    if (!date) continue;
    const lines = byDay.get(date) ?? [];
    lines.push({
      itemId: tx.itemId,
      itemName: tx.itemName || tx.itemId,
      quantity: tx.quantity,
      userEmail: tx.userEmail?.trim() || "Unknown",
      notes: tx.notes?.trim() ?? "",
    });
    byDay.set(date, lines);
  }

  return Array.from(byDay.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, limit)
    .map(([date, lines]) => ({
      date,
      units: lines.reduce((sum, line) => sum + line.quantity, 0),
      lines: lines.sort((a, b) => a.itemName.localeCompare(b.itemName)),
    }));
}

export function itemMovementTotals(transactions: Transaction[]) {
  const totals = new Map<string, { itemName: string; in: number; out: number }>();
  for (const tx of transactions) {
    const current = totals.get(tx.itemId) ?? {
      itemName: tx.itemName,
      in: 0,
      out: 0,
    };
    if (tx.type === "in") current.in += tx.quantity;
    else if (isSalesTransaction(tx)) current.out += tx.quantity;
    totals.set(tx.itemId, current);
  }

  return Array.from(totals.entries())
    .map(([itemId, values]) => ({
      itemId,
      itemName: values.itemName,
      in: values.in,
      out: values.out,
      net: values.in - values.out,
    }))
    .sort((a, b) => b.in + b.out - (a.in + a.out));
}

export type DailyStockItem = {
  itemId: string;
  itemName: string;
  stockIn: number;
  /** Sales (from close / legacy out). */
  sales: number;
};

/** Per-item aggregates for a single calendar day (YYYY-MM-DD). */
export function itemDailyMovement(
  transactions: Transaction[],
  dateKey: string
): DailyStockItem[] {
  const totals = new Map<
    string,
    {
      itemName: string;
      stockIn: number;
      sales: number;
    }
  >();

  for (const tx of transactions) {
    if (!tx.timestamp || transactionDateKey(tx.timestamp) !== dateKey) continue;

    const current = totals.get(tx.itemId) ?? {
      itemName: tx.itemName,
      stockIn: 0,
      sales: 0,
    };

    if (tx.type === "in") {
      current.stockIn += tx.quantity;
    } else if (isSalesTransaction(tx)) {
      current.sales += tx.quantity;
    }

    totals.set(tx.itemId, current);
  }

  return Array.from(totals.entries())
    .map(([itemId, values]) => ({
      itemId,
      itemName: values.itemName,
      stockIn: values.stockIn,
      sales: values.sales,
    }))
    .sort((a, b) => a.itemName.localeCompare(b.itemName));
}

export type UserActivitySeries = {
  users: string[];
  points: Array<Record<string, string | number>>;
};

/**
 * Count of transactions per userEmail per calendar day.
 * Window matches filterTransactionsByDays (inclusive app-timezone days).
 */
export function userActivityByDay(
  transactions: Transaction[],
  days: number
): UserActivitySeries {
  const span = days <= 0 ? 1 : days;
  const { from, to } = rollingDateRange(span);
  const dayKeys = dateKeysInclusive(from, to);

  const usersSet = new Set<string>();
  const counts = new Map<string, Map<string, number>>();

  for (const day of dayKeys) {
    counts.set(day, new Map());
  }

  for (const tx of transactions) {
    if (!tx.timestamp) continue;
    const day = transactionDateKey(tx.timestamp);
    if (!counts.has(day)) continue;
    const user = tx.userEmail?.trim() || "Unknown";
    usersSet.add(user);
    const dayMap = counts.get(day)!;
    dayMap.set(user, (dayMap.get(user) ?? 0) + 1);
  }

  const users = Array.from(usersSet).sort((a, b) => a.localeCompare(b));
  const points = dayKeys.map((date) => {
    const row: Record<string, string | number> = { date };
    const dayMap = counts.get(date)!;
    for (const user of users) {
      row[user] = dayMap.get(user) ?? 0;
    }
    return row;
  });

  return { users, points };
}
