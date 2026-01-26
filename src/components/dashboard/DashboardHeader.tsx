import { AppHeader } from '@/components/ui/AppHeader';

interface DashboardHeaderProps {
  userEmail?: string | null;
}

export function DashboardHeader({ userEmail }: DashboardHeaderProps) {
  return (
    <AppHeader 
      showStats={false}
      showSettings={false}
      userEmail={userEmail}
    />
  );
}
