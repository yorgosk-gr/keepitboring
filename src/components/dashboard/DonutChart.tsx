import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface DonutChartProps {
  title: string;
  data: { name: string; value: number; color: string }[];
}

export function DonutChart({ title, data }: DonutChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="stat-card">
      <h3 className="text-sm font-medium text-muted-foreground mb-4">{title}</h3>
      <div className="flex items-center gap-4">
        <div className="w-32 h-32">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={35}
                outerRadius={55}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(217 33% 17%)",
                  border: "1px solid hsl(217 33% 25%)",
                  borderRadius: "8px",
                  color: "hsl(210 40% 98%)",
                }}
                formatter={(value: number) => [`${value}%`, ""]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-2">
          {data.map((item) => (
            <div key={item.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm text-foreground">{item.name}</span>
              </div>
              <span className="text-sm font-medium text-foreground">
                {item.value}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
