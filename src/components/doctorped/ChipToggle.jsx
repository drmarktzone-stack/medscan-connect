import React from "react";

export default function ChipToggle({ options, selected, onToggle, multi = true }) {
  const isOn = (id) => (multi ? selected.includes(id) : selected === id);
  const click = (id) => {
    if (!multi) {
      onToggle(selected === id ? '' : id);
      return;
    }
    onToggle(isOn(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const id = opt.id ?? opt;
        const label = opt.label ?? opt;
        const on = isOn(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => click(id)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              on ? "bg-cyan-700 text-white border-cyan-700" : "bg-white text-slate-700 border-slate-200"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
