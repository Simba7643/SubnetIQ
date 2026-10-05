import en from '../locales/en.json';
import am from '../locales/am.json';
import ar from '../locales/ar.json';
import fr from '../locales/fr.json';
import es from '../locales/es.json';
import { usePreferences } from './preferences';
const dictionaries = { en, am, ar, fr, es };
export function useTranslations() {
  const locale = usePreferences((state) => state.locale);
  return dictionaries[locale] ?? en;
}
