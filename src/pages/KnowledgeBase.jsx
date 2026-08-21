import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2, Activity, Stethoscope, Loader2, ImageOff, Flag, ScanLine, BookOpen, ChevronLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import CaseForm from "@/components/knowledge/CaseForm";
import SearchFilter from "@/components/knowledge/SearchFilter";
import BulkImport from "@/components/knowledge/BulkImport";
import ClinicHeader from "@/components/clinic/ClinicHeader";
import { useI18n } from "@/lib/i18n";
import { categoryTranslations } from "@/lib/translations";
import { loadBook, bookStats } from "@/lib/medscan/knowledge/bookStore";

const ecgCategories = ["rhythm", "conduction", "ischemic", "chamber_abnormality", "electrolyte", "syndrome", "drug_effect", "other"];
const skinCategories = ["benign", "malignant", "precancerous", "inflammatory", "infectious", "autoimmune", "pigmentation", "vascular", "other"];
const radiologyCategories = ["chest", "abdominal", "musculoskeletal", "neurological", "cardiac", "vascular", "genitourinary", "other"];

function filterCases(cases, query, category, urgentOnly, selectedTags = []) {
  let filtered = cases;
  if (urgentOnly) filtered = filtered.filter((c) => c.urgent);
  if (category) filtered = filtered.filter((c) => c.category === category);
  if (selectedTags.length > 0) {
    filtered = filtered.filter((c) => {
      const cTags = c.tags || [];
      return selectedTags.every((tag) => cTags.includes(tag));
    });
  }
  if (query) {
    const q = query.trim().toLowerCase();
    filtered = filtered.filter((c) =>
      [c.title, c.diagnosis, c.key_features, c.description].filter(Boolean).some((field) => field.toLowerCase().includes(q))
    );
  }
  return filtered;
}

export default function KnowledgeBase() {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState("ecg");
  const [ecgCases, setEcgCases] = useState([]);
  const [skinCases, setSkinCases] = useState([]);
  const [radiologyCases, setRadiologyCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [book, setBook] = useState(null);

  const catLabels = categoryTranslations[lang] || categoryTranslations.he;

  useEffect(() => {
    loadBook()
      .then((rows) => setBook(bookStats(rows)))
      .catch(() => setBook({ chapters: 0, topics: 0, cells: 0 }));
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ecg, skin, radiology] = await Promise.all([
        base44.entities.ECGCase.list("-created_date", 500),
        base44.entities.SkinCase.list("-created_date", 500),
        base44.entities.RadiologyCase.list("-created_date", 500),
      ]);
      setEcgCases(ecg);
      setSkinCases(skin);
      setRadiologyCases(radiology);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleTabChange = (newTab) => {
    setTab(newTab);
    setQuery("");
    setCategory("");
    setUrgentOnly(false);
    setSelectedTags([]);
  };

  const urgentEcgCount = ecgCases.filter((c) => c.urgent).length;
  const urgentSkinCount = skinCases.filter((c) => c.urgent).length;
  const urgentRadiologyCount = radiologyCases.filter((c) => c.urgent).length;
  const filteredEcgCases = filterCases(ecgCases, query, category, urgentOnly, selectedTags);
  const filteredSkinCases = filterCases(skinCases, query, category, urgentOnly, selectedTags);
  const filteredRadiologyCases = filterCases(radiologyCases, query, category, urgentOnly, selectedTags);
  const activeAllCases = tab === "ecg" ? ecgCases : tab === "skin" ? skinCases : radiologyCases;
  const availableTags = Array.from(new Set(activeAllCases.flatMap((c) => c.tags || []))).sort();
  const activeCategories = (tab === "ecg" ? ecgCategories : tab === "skin" ? skinCategories : radiologyCategories).map((v) => ({ value: v, label: catLabels[v] || v }));
  const activeUrgentCount = tab === "ecg" ? urgentEcgCount : tab === "skin" ? urgentSkinCount : urgentRadiologyCount;

  const handleToggleUrgent = async (type, c) => {
    const entityName = { ecg: "ECGCase", skin: "SkinCase", radiology: "RadiologyCase" }[type];
    await base44.entities[entityName].update(c.id, { urgent: !c.urgent });
    loadData();
  };

  const handleDelete = async (type, id) => {
    const entityName = { ecg: "ECGCase", skin: "SkinCase", radiology: "RadiologyCase" }[type];
    await base44.entities[entityName].delete(id);
    loadData();
  };

  const renderCase = (c, type) => (
    <div key={c.id} className={`bg-white rounded-xl border p-4 shadow-sm ${c.urgent ? "border-red-200 ring-1 ring-red-100" : "border-slate-100"}`}>
      <div className="flex items-start gap-3">
        <div className="w-16 h-16 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center shrink-0">
          {c.image_url ? <img src={c.image_url} alt={c.title} className="w-full h-full object-cover" /> : <ImageOff className="w-5 h-5 text-muted-foreground/30" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-foreground truncate">{c.title}</h3>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => handleToggleUrgent(type, c)}
                title={c.urgent ? t("kb.urgent_remove") : t("kb.urgent_add")}
                className={`transition-colors ${c.urgent ? "text-red-500" : "text-muted-foreground/40 hover:text-red-400"}`}
              >
                <Flag className={`w-4 h-4 ${c.urgent ? "fill-current" : ""}`} />
              </button>
              <button onClick={() => handleDelete(type, c.id)} className="text-muted-foreground hover:text-red-500 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-xs text-primary font-medium mt-0.5">{c.diagnosis}</p>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {c.urgent && <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{t("kb.urgent")}</span>}
            {c.category && <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-muted-foreground">{catLabels[c.category] || c.category}</span>}
          </div>
          {c.key_features && <p className="text-xs text-muted-foreground mt-2 leading-relaxed line-clamp-3">{c.key_features}</p>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="clinic-page">
      <ClinicHeader
        title={t("kb.title")}
        icon={BookOpen}
        tone="tool"
        extra={
          <div className="flex items-center gap-2">
            <Button onClick={() => setBulkOpen(!bulkOpen)} size="sm" variant="outline" className="rounded-lg text-xs bg-white/10 text-white border-white/30 hover:bg-white/20">
              <Plus className="w-4 h-4 ml-1" /> {t("kb.import_create")}
            </Button>
            <Button onClick={() => setFormOpen(true)} size="sm" className="rounded-lg text-xs bg-white text-cyan-900 hover:bg-cyan-50">
              <Plus className="w-4 h-4 ml-1" /> {t("kb.add_case")}
            </Button>
          </div>
        }
      />

      <div className="max-w-lg mx-auto px-5 py-6">
        {/* ספר המקור — מעל למקרי ה-Vision, כי הוא המקור לכל הכלים */}
        <Link to="/book" className="block mb-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3
                          hover:border-slate-300 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5 text-slate-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-slate-800">נלסון — הספר</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {book === null
                  ? "טוען…"
                  : book.chapters > 0
                    ? `${book.chapters} פרקים · ${book.topics} נושאים · ${book.cells.toLocaleString()} פריטים`
                    : "עדיין לא נטען — טעינה אחת והוא נשאר"}
              </p>
            </div>
            <ChevronLeft className="w-4 h-4 text-slate-300 shrink-0" />
          </div>
        </Link>

        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList className="grid grid-cols-3 w-full rounded-xl">
            <TabsTrigger value="ecg" className="rounded-xl"><Activity className="w-4 h-4 ml-1.5" /> {t("kb.tab_ecg", { n: ecgCases.length })}</TabsTrigger>
            <TabsTrigger value="skin" className="rounded-xl"><Stethoscope className="w-4 h-4 ml-1.5" /> {t("kb.tab_skin", { n: skinCases.length })}</TabsTrigger>
            <TabsTrigger value="radiology" className="rounded-xl"><ScanLine className="w-4 h-4 ml-1.5" /> {t("kb.tab_radiology", { n: radiologyCases.length })}</TabsTrigger>
          </TabsList>

          {bulkOpen && (
            <div className="mt-4">
              <BulkImport type={tab} target="kb" onSaved={() => { loadData(); setBulkOpen(false); }} />
            </div>
          )}

          {!loading && (ecgCases.length > 0 || skinCases.length > 0 || radiologyCases.length > 0) && (
            <div className="mt-4">
              <SearchFilter
                query={query}
                onQueryChange={setQuery}
                category={category}
                onCategoryChange={setCategory}
                categories={activeCategories}
                urgentOnly={urgentOnly}
                onUrgentOnlyChange={setUrgentOnly}
                urgentCount={activeUrgentCount}
                tags={availableTags}
                selectedTags={selectedTags}
                onSelectedTagsChange={setSelectedTags}
              />
            </div>
          )}

          <TabsContent value="ecg" className="mt-4 space-y-3">
            {loading ? (
              <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-muted-foreground animate-spin" /></div>
            ) : ecgCases.length === 0 ? (
              <EmptyState t={t} />
            ) : filteredEcgCases.length === 0 ? (
              <NoResults t={t} />
            ) : (
              <>
                <p className="text-xs text-muted-foreground">{t("kb.showing", { shown: filteredEcgCases.length, total: ecgCases.length })}</p>
                {filteredEcgCases.map((c) => renderCase(c, "ecg"))}
              </>
            )}
          </TabsContent>

          <TabsContent value="skin" className="mt-4 space-y-3">
            {loading ? (
              <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-muted-foreground animate-spin" /></div>
            ) : skinCases.length === 0 ? (
              <EmptyState t={t} />
            ) : filteredSkinCases.length === 0 ? (
              <NoResults t={t} />
            ) : (
              <>
                <p className="text-xs text-muted-foreground">{t("kb.showing", { shown: filteredSkinCases.length, total: skinCases.length })}</p>
                {filteredSkinCases.map((c) => renderCase(c, "skin"))}
              </>
            )}
          </TabsContent>

          <TabsContent value="radiology" className="mt-4 space-y-3">
            {loading ? (
              <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-muted-foreground animate-spin" /></div>
            ) : radiologyCases.length === 0 ? (
              <EmptyState t={t} />
            ) : filteredRadiologyCases.length === 0 ? (
              <NoResults t={t} />
            ) : (
              <>
                <p className="text-xs text-muted-foreground">{t("kb.showing", { shown: filteredRadiologyCases.length, total: radiologyCases.length })}</p>
                {filteredRadiologyCases.map((c) => renderCase(c, "radiology"))}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <CaseForm type={tab} open={formOpen} onOpenChange={setFormOpen} onSaved={loadData} />
    </div>
  );
}

function EmptyState({ t }) {
  return (
    <div className="text-center py-16">
      <p className="text-sm text-muted-foreground">{t("kb.empty")}</p>
      <p className="text-xs text-muted-foreground/60 mt-1">{t("kb.empty_sub")}</p>
    </div>
  );
}

function NoResults({ t }) {
  return (
    <div className="text-center py-16">
      <p className="text-sm text-muted-foreground">{t("kb.no_results")}</p>
      <p className="text-xs text-muted-foreground/60 mt-1">{t("kb.no_results_sub")}</p>
    </div>
  );
}