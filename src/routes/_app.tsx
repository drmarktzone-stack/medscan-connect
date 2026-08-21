import { createFileRoute } from "@tanstack/react-router";
import AppLayout from "@/components/AppLayout";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Navigate } from "@/lib/router-compat";

export const Route = createFileRoute("/_app")({
  component: AppShell,
});

function AppShell() {
  return (
    <ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />}>
      <AppLayout />
    </ProtectedRoute>
  );
}
