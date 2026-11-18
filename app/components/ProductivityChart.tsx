"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const data = [
  { day: "Mon", tasks: 2 },
  { day: "Tue", tasks: 5 },
  { day: "Wed", tasks: 3 },
  { day: "Thu", tasks: 6 },
  { day: "Fri", tasks: 4 },
  { day: "Sat", tasks: 7 },
  { day: "Sun", tasks: 5 },
];

export default function ProductivityChart() {
  return (
    <div className="chart-panel">
      <h2 className="chart-title">Weekly Productivity</h2>

      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <XAxis dataKey="day" stroke="#888" />
          <YAxis stroke="#888" />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="tasks"
            stroke="#6366f1"
            strokeWidth={3}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
