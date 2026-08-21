declare module "@/lib/medscan/doctorped/index.js" {
  export function runDoctorPedAI(input?: Record<string, unknown>): any;
  export function computeDose(input?: Record<string, unknown>): any;
  export function listToolboxModules(): Array<{ id: string; route: string; title_he: string; i18n_key: string }>;
}