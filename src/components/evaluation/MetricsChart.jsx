import React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function MetricsChart({ runs }) {
  if (!runs || runs.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-muted-foreground">אין נתוני הערכה עדיין</p>
        <p className="text-xs text-muted-foreground/60 mt-1">הרץ הערכה ראשונה כדי לראות מגמות</p>
      </div>
    );
  }

  const data = [...runs].reverse().map((r, i) => ({
    name: `הרצה ${i + 1}`,
    דיוק: r.accuracy,
    רגישות: r.sensitivity,
    סגוליות: r.specificity,
  }));

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h4 className="text-sm font-bold text-foreground mb-4">מדדי דיוק לאורך זמן</h4>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="דיוק" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="רגישות" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="סגוליות" stroke="#14b8a6" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}