"use client";

import { PieChart, Pie, Cell, Tooltip } from "recharts";

const data = [
  { name: "Food", value: 400 },
  { name: "Rent", value: 800 },
  { name: "Shopping", value: 300 },
];

const COLORS = ["#22c55e", "#ef4444", "#3b82f6"];

export default function ExpenseChart() {
  return (
    <PieChart width={300} height={300}>
      <Pie
        data={data}
        cx="50%"
        cy="50%"
        outerRadius={100}
        dataKey="value"
      >
        {data.map((entry, index) => (
          <Cell key={index} fill={COLORS[index % COLORS.length]} />
        ))}
      </Pie>
      <Tooltip />
    </PieChart>
  );
}