import { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { CommandPalette } from "@/components/common/CommandPalette";
import { OnboardingModal } from "@/components/onboarding/OnboardingModal";
import { useSettings } from "@/hooks/useSettings";
import { useIsMobile } from "@/hooks/use-mobile";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { settings, completeOnboarding, isLoading } = useSettings();
  const isMobile = useIsMobile();

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <AppHeader />
        <main className={`flex-1 p-4 sm:p-6 overflow-auto ${isMobile ? 'pb-20' : ''}`}>
          {children}
        </main>
        
        {/* Footer */}
        <footer className="border-t border-border py-4 px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>KeepItBoring v1.0</span>
            <span className="italic">Process over outcomes. Stay humble.</span>
          </div>
        </footer>
      </div>
      
      {/* Global Command Palette */}
      <CommandPalette />
      
      {/* Onboarding Modal */}
      {!isLoading && !settings.onboardingCompleted && (
        <OnboardingModal 
          open={!settings.onboardingCompleted} 
          onComplete={completeOnboarding} 
        />
      )}
    </div>
  );
}
