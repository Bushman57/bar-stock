import { NextResponse } from "next/server";
import {
  buildDashboardStats,
  buildPeriodAnalytics,
  dailyMovementTotals,
  filterTransactionsByDays,
  recentStockInDays,
  itemMovementTotals,
  topConsumedItems,
  userActivityByDay,
} from "@/lib/analytics";
import { requireAdmin } from "@/lib/auth/api-auth";
import { getInventoryItems, getTransactions } from "@/lib/sheets";
import { isLowStock } from "@/lib/stock";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const days = Number(searchParams.get("days") ?? 30);

    const [items, transactions] = await Promise.all([
      getInventoryItems(),
      getTransactions(),
    ]);

    const filtered = filterTransactionsByDays(transactions, days);
    const period = buildPeriodAnalytics(items, filtered);

    return NextResponse.json({
      stats: buildDashboardStats(items, transactions),
      lowStockItems: items.filter(isLowStock),
      categoryProfit: period.categoryProfit,
      topConsumed: topConsumedItems(filtered),
      dailyMovement: dailyMovementTotals(filtered),
      recentStockIn: recentStockInDays(transactions),
      dailyProfit: period.dailyProfit,
      deadStock: period.deadStock,
      topItems: period.topItems,
      summary: period.summary,
      itemMovement: itemMovementTotals(filtered),
      userActivity: userActivityByDay(filtered, days),
      transactions: filtered,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("GET /api/analytics", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load analytics" },
      { status: 500 }
    );
  }
}
