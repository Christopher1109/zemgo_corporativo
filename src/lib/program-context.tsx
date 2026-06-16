import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Program = {
  id: string;
  code: string;
  name: string;
  insurance_branch: string;
  color_primary: string;
  color_secondary: string;
  color_accent: string;
  billing_note: string | null;
};

type ProgramContextValue = {
  programs: Program[];
  activeProgram: Program | null;
  setActiveProgramId: (id: string) => void;
  isLoading: boolean;
};

const ProgramContext = createContext<ProgramContextValue | null>(null);
const STORAGE_KEY = "hope.activeProgramId";

export function ProgramProvider({ children }: { children: ReactNode }) {
  const { data: programs = [], isLoading } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("programs")
        .select("id,code,name,insurance_branch,color_primary,color_secondary,color_accent,billing_note")
        .eq("is_active", true)
        .order("code");
      if (error) throw error;
      return data as Program[];
    },
  });

  const [activeId, setActiveId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY);
  });

  useEffect(() => {
    if (!activeId && programs.length > 0) {
      const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      const initial = stored && programs.find((p) => p.id === stored) ? stored : programs[0].id;
      setActiveId(initial);
    }
  }, [programs, activeId]);

  const activeProgram = useMemo(
    () => programs.find((p) => p.id === activeId) ?? null,
    [programs, activeId],
  );

  // Apply theme as CSS variables on documentElement
  useEffect(() => {
    if (!activeProgram || typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--primary", activeProgram.color_primary);
    root.style.setProperty("--primary-foreground", "#ffffff");
    root.style.setProperty("--ring", activeProgram.color_primary);
    root.style.setProperty("--sidebar-primary", activeProgram.color_primary);
    root.style.setProperty("--sidebar-primary-foreground", "#ffffff");
    root.style.setProperty("--sidebar-ring", activeProgram.color_primary);
    root.style.setProperty("--program-primary", activeProgram.color_primary);
    root.style.setProperty("--program-secondary", activeProgram.color_secondary);
    root.style.setProperty("--program-accent", activeProgram.color_accent);
  }, [activeProgram]);

  const setActiveProgramId = (id: string) => {
    setActiveId(id);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
  };

  return (
    <ProgramContext.Provider value={{ programs, activeProgram, setActiveProgramId, isLoading }}>
      {children}
    </ProgramContext.Provider>
  );
}

export function useProgram() {
  const ctx = useContext(ProgramContext);
  if (!ctx) throw new Error("useProgram must be used within ProgramProvider");
  return ctx;
}
