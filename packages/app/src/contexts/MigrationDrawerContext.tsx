import { createContext, useContext, useState, ReactNode } from 'react';

interface MigrationDrawerContextType {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const MigrationDrawerContext = createContext<MigrationDrawerContextType | null>(null);

export const MigrationDrawerProvider = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  return (
    <MigrationDrawerContext.Provider
      value={{ open, openDrawer: () => setOpen(true), closeDrawer: () => setOpen(false) }}
    >
      {children}
    </MigrationDrawerContext.Provider>
  );
};

export const useMigrationDrawer = (): MigrationDrawerContextType => {
  const ctx = useContext(MigrationDrawerContext);
  if (!ctx) {
    // In production this should never happen — MigrationDrawerProvider is
    // mounted in App.tsx above all routes. In unit tests that render Layout
    // without the full provider tree, return a safe no-op so tests don't crash.
    if (import.meta.env.DEV) {
      console.warn(
        '[MigrationDrawer] useMigrationDrawer called outside MigrationDrawerProvider. ' +
        'Returning no-op. Wrap your component tree with <MigrationDrawerProvider>.',
      );
    }
    return { open: false, openDrawer: () => {}, closeDrawer: () => {} };
  }
  return ctx;
};
