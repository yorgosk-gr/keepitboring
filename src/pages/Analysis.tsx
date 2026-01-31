import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DecisionLogView } from "@/components/decisions/DecisionLogView";
import { BarChart3, BookOpen } from "lucide-react";

export default function Analysis() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analysis</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Portfolio analytics, risk metrics, and decision tracking
        </p>
      </div>

      <Tabs defaultValue="decisions" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="decisions" className="gap-2">
            <BookOpen className="w-4 h-4" />
            Decision Log
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="decisions" className="mt-6">
          <DecisionLogView />
        </TabsContent>

        <TabsContent value="analytics" className="mt-6">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <BarChart3 className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Portfolio Analytics
            </h2>
            <p className="text-muted-foreground max-w-md">
              Advanced portfolio analytics, risk metrics, and performance attribution
              coming soon.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
