import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function BackButton({ to = "/", className = "" }) {
  const { dir } = useI18n();
  return (
    <Link to={to} className={`hover:opacity-80 transition-opacity ${className || "text-muted-foreground hover:text-foreground"}`}>
      {dir === "rtl" ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
    </Link>
  );
}