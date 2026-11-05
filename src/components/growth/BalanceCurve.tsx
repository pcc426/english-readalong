"use client";

import { useId } from "react";

import type { GrowthBalance } from "./types";

export function BalanceCurve({
  balances,
  checkInDates,
}: {
  balances: GrowthBalance[];
  checkInDates: string[];
}) {
  const gradientId = `growth-curve-fill-${useId().replace(/:/g, "")}`;
  if (balances.length === 0) return null;
  const width = 720;
  const height = 240;
  const pad = { left: 48, right: 18, top: 18, bottom: 30 };
  const max = Math.max(...balances.map((item) => item.balance), 1);
  const niceMax = Math.ceil(max / 100) * 100;
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const x = (index: number) =>
    pad.left + (index / Math.max(balances.length - 1, 1)) * innerWidth;
  const y = (value: number) =>
    pad.top + innerHeight - (value / niceMax) * innerHeight;
  const line = balances
    .map(
      (item, index) =>
        `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(
          item.balance
        ).toFixed(1)}`
    )
    .join(" ");
  const area = `${line} L${x(balances.length - 1).toFixed(1)},${
    pad.top + innerHeight
  } L${pad.left},${pad.top + innerHeight} Z`;
  const checkSet = new Set(checkInDates);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) =>
    Math.round(niceMax * ratio)
  );

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-2 w-full"
      role="img"
      aria-label="当月星星余额曲线"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {ticks.map((value) => (
        <g key={value}>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(value)}
            y2={y(value)}
            stroke="#e2e8f0"
            strokeDasharray={value === 0 ? "0" : "4 6"}
          />
          <text
            x={pad.left - 10}
            y={y(value) + 4}
            textAnchor="end"
            className="fill-slate-500"
            fontSize="11"
          >
            {value}
          </text>
        </g>
      ))}
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke="#10b981"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {balances.map((item, index) =>
        checkSet.has(item.date) ? (
          <circle
            key={item.date}
            cx={x(index)}
            cy={y(item.balance)}
            r="4"
            fill="white"
            stroke="#10b981"
            strokeWidth="2.5"
          />
        ) : null
      )}
      {[1, 5, 10, 15, 20, 25, 30]
        .filter((day) => day <= balances.length)
        .map((day) => (
          <text
            key={day}
            x={x(day - 1)}
            y={height - 8}
            textAnchor="middle"
            className="fill-slate-500"
            fontSize="11"
          >
            {day}
          </text>
        ))}
    </svg>
  );
}
