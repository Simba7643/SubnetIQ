import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Locale = 'en' | 'am' | 'ar' | 'fr' | 'es';
type Preferences = {
  theme: 'system' | 'light' | 'dark';
  locale: Locale;
  showSteps: boolean;
  analyticsConsent: 'unknown' | 'accepted' | 'declined';
  setTheme: (theme: Preferences['theme']) => void;
  setLocale: (locale: Locale) => void;
  setShowSteps: (value: boolean) => void;
  setAnalyticsConsent: (value: Preferences['analyticsConsent']) => void;
};
export const usePreferences = create<Preferences>()(
  persist(
    (set) => ({
      theme: 'system',
      locale: 'en',
      showSteps: true,
      analyticsConsent: 'unknown',
      setTheme: (theme) => set({ theme }),
      setLocale: (locale) => set({ locale }),
      setShowSteps: (showSteps) => set({ showSteps }),
      setAnalyticsConsent: (analyticsConsent) => set({ analyticsConsent }),
    }),
    { name: 'subnetiq-preferences', version: 1 },
  ),
);
