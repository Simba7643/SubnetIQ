import { create } from 'zustand';

export const useLearningProgress = create<{ reviewed: string[]; toggle: (id: string) => void }>(
  (set) => ({
    reviewed: [],
    toggle: (id) =>
      set((state) => ({
        reviewed: state.reviewed.includes(id)
          ? state.reviewed.filter((value) => value !== id)
          : [...state.reviewed, id],
      })),
  }),
);
