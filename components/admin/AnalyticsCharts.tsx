"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  AnalyticsSummary,
  CategoryProfitRow,
  DeadStockRow,
  StockInDay,
  TopItemRow,
} from "@/lib/analytics";
import { useIsMobile } from "@/lib/use-media-query";
import { formatNumber } from "@/lib/utils";

type RankBy = "profit" | "units";

interface AnalyticsChartsProps {
  summary: AnalyticsSummary;
  categoryProfit: CategoryProfitRow[];
  recentStockIn: StockInDay[];
  deadStock: DeadStockRow[];
  topItems: TopItemRow[];
}

function formatDayLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function StockAddedCard({ days }: { days: StockInDay[] }) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selected = days.find((day) => day.date === selectedDate) ?? null;

  function toggleDay(date: string) {
    setSelectedDate((current) => (current === date ? null : date));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stock added</CardTitle>
        <CardDescription>Last 5 days that received stock. Select a day to see what was added, and select it again to close.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {days.length === 0 ? (
          <p className="text-sm text-slate-500">No stock has been added yet.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {days.map((day) => {
                  const active = day.date === selected?.date;
                  return (
                    <TableRow
                      key={day.date}
                      className={
                        active
                          ? "cursor-pointer bg-emerald-50 hover:bg-emerald-50"
                          : "cursor-pointer"
                      }
                      tabIndex={0}
                      onClick={() => toggleDay(day.date)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleDay(day.date);
                        }
                      }}
                      aria-selected={active}
                    >
                      <TableCell className="font-medium">{formatDayLabel(day.date)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(day.units)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {day.lines.length}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {selected && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">
                  Added on {formatDayLabel(selected.date)}
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Added by</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selected.lines.map((line, index) => (
                      <TableRow key={`${line.itemId}-${index}`}>
                        <TableCell>{line.itemName}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(line.quantity)}
                        </TableCell>
                        <TableCell className="max-w-[10rem] truncate">
                          {line.userEmail}
                        </TableCell>
                        <TableCell>{line.notes || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-xl font-semibold text-slate-900">{value}</p>
      </CardContent>
    </Card>
  );
}

export function AnalyticsCharts({
  summary,
  categoryProfit,
  recentStockIn,
  deadStock,
  topItems,
}: AnalyticsChartsProps) {
  const isMobile = useIsMobile();
  const [rankBy, setRankBy] = useState<RankBy>("profit");

  const ranked = useMemo(() => {
    const sorted = [...topItems].sort((a, b) =>
      rankBy === "profit" ? b.profit - a.profit : b.quantity - a.quantity
    );
    return sorted.slice(0, 10);
  }, [topItems, rankBy]);

  const chartHeight = Math.max(420, ranked.length * 44);
  const deadRanked = deadStock.slice(0, 10);
  const deadByValue = deadRanked.some((row) => row.value > 0);
  const deadValue = deadStock.reduce((sum, row) => sum + row.value, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Units sold" value={formatNumber(summary.unitsSold)} />
        <SummaryCard label="Stock in" value={formatNumber(summary.unitsReceived)} />
        <SummaryCard label="Sales amount" value={formatNumber(summary.salesAmount)} />
        <SummaryCard label="Profit" value={formatNumber(summary.profit)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <StockAddedCard days={recentStockIn} />

        <Card>
          <CardHeader>
            <CardTitle>Dead stock</CardTitle>
            <CardDescription>
              Still on hand, no sales in this period
              {deadStock.length
                ? ` · ${deadStock.length} items · ${formatNumber(deadValue)} tied up`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent
            className="h-64 sm:h-80"
            style={
              deadRanked.length
                ? { height: Math.max(320, deadRanked.length * 44) }
                : undefined
            }
          >
            {deadRanked.length === 0 ? (
              <p className="flex h-full items-center text-sm text-slate-500">
                Every item with stock sold something in this period.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={deadRanked}
                  layout="vertical"
                  margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis
                    type="category"
                    dataKey="itemName"
                    width={isMobile ? 108 : 140}
                    interval={0}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      formatNumber(Number(value)),
                      name,
                    ]}
                  />
                  <Bar
                    dataKey={deadByValue ? "value" : "units"}
                    name={deadByValue ? "Value tied up" : "Units on hand"}
                    fill="#9f1239"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>
              {rankBy === "profit" ? "Top items by profit" : "Top items by units sold"}
            </CardTitle>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={rankBy === "profit" ? "default" : "outline"}
                onClick={() => setRankBy("profit")}
              >
                Profit
              </Button>
              <Button
                type="button"
                size="sm"
                variant={rankBy === "units" ? "default" : "outline"}
                onClick={() => setRankBy("units")}
              >
                Units sold
              </Button>
            </div>
          </CardHeader>
          <CardContent style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={ranked}
                layout="vertical"
                margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis
                  type="category"
                  dataKey="itemName"
                  width={isMobile ? 128 : 210}
                  interval={0}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip />
                <Bar
                  dataKey={rankBy === "profit" ? "profit" : "quantity"}
                  name={rankBy === "profit" ? "Profit" : "Units"}
                  fill={rankBy === "profit" ? "#1d4ed8" : "#b45309"}
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Profit by category</CardTitle>
          </CardHeader>
          <CardContent style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={categoryProfit}
                layout="vertical"
                margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis
                  type="category"
                  dataKey="category"
                  width={isMobile ? 128 : 180}
                  interval={0}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip />
                <Bar dataKey="profit" name="Profit" fill="#047857" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
