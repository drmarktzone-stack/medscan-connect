import React from "react";
import { Outlet } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import PilotModeBanner from "@/components/PilotModeBanner";
import LocalClinicBanner from "@/components/clinic/LocalClinicBanner";

export default function AppLayout() {
  return (
    <>
      <PilotModeBanner />
      <LocalClinicBanner />
      <main className="pb-28">
        <Outlet />
      </main>
      <BottomNav />
    </>
  );
}
