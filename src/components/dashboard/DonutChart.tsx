import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface DonutChartProps {
  title: string;
  data: { name: string; value: number; color: string; target?: number }[];
  isLoading?: boolean;
  showTargetIndicator?: boolean;
}

export function DonutChart({ title, data, isLoading, showTargetIndicator }: DonutChartProps) {
  if (isLoading) {
    return (
      <div className="stat-card">
        <Skeleton className="h-4 w-32 mb-4" />
        <div className="flex items-center gap-4">
          <Skeleton className="w-32 h-32 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  const hasData = data.some(d => d.value > 0);

  if (!hasData) {
    return (
      <div className="stat-card">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">{title}</h3>
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
          No allocation data available
        </div>
      </div>
    );
  }

  return (
    <div className="stat-card">
      <h3 className="text-sm font-medium text-muted-foreground mb-4">{title}</h3>
      <div className="flex items-center gap-4">
        <div className="w-32 h-32">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data.filter(d => d.value > 0)}
                cx="50%"
                cy="50%"
                innerRadius={35}
                outerRadius={55}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {data.filter(d => d.value > 0).map((entry, index) => (
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
                formatter={(value: number) => [`${value.toFixed(1)}%`, ""]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-2">
          {data.map((item) => {
            const isWithinTarget = item.target !== undefined 
              ? Math.abs(item.value - item.target) <= 5 
              : true;
            
            return (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm text-foreground">{item.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {item.value.toFixed(1)}%
                  </span>
                  {showTargetIndicator && item.target !== undefined && (
                    <span className={`text-xs ${isWithinTarget ? "text-primary" : "text-warning"}`}>
                      ({item.target}%)
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
