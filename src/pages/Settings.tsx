import { Settings as SettingsIcon } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { ApiConfigSection } from "@/components/settings/ApiConfigSection";
import { PhilosophyModeSection } from "@/components/settings/PhilosophyModeSection";
import { NotificationSection } from "@/components/settings/NotificationSection";
import { DataManagementSection } from "@/components/settings/DataManagementSection";
import { StorageDashboardSection } from "@/components/settings/StorageDashboardSection";

import { Skeleton } from "@/components/ui/skeleton";

export default function Settings() {
  const {
    settings,
    isLoading,
    updateSettings,
    exportAllData,
    exportDecisionLog,
    clearAllAlerts,
    resetToDefaultRules,
    deleteAllData,
  } = useSettings();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="space-y-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stat-card space-y-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <SettingsIcon className="w-5 h-5 text-primary" />
          </div>
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure your preferences and manage your data
        </p>
      </div>

      <div className="space-y-6">
        <ApiConfigSection />

        <PhilosophyModeSection
          currentMode={settings.portfolioMode}
          onModeChange={(mode) => updateSettings({ portfolioMode: mode })}
        />
        
        <StorageDashboardSection />
        
        
        <NotificationSection 
          settings={settings} 
          onUpdate={updateSettings} 
        />
        
        <DataManagementSection
          onExportAll={exportAllData}
          onExportDecisions={exportDecisionLog}
          onClearAlerts={clearAllAlerts}
          onResetRules={resetToDefaultRules}
          onDeleteAll={deleteAllData}
        />
      </div>
    </div>
  );
}
