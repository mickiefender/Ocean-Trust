"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function PerformanceChart({ data }: { data: { name: string; target: number; collected: number }[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="name" axisLine={false} tickLine={false} />
          <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `₵${Number(value).toLocaleString()}`} />
          <Tooltip formatter={(value) => money(Number(value))} />
          <Bar dataKey="target" fill="#cbd5e1" radius={[5, 5, 0, 0]} name="Target" />
          <Bar dataKey="collected" fill="#2563eb" radius={[5, 5, 0, 0]} name="Collected" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function money(value: number) {
  return `GH₵${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
