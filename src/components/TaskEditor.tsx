import { useState } from "react";
import { Save, X, Plus, Trash2 } from "lucide-react";
import type { Task, CHECKER_LIBRARY } from "@/types";
import { CHECKER_LIBRARY as CHECKER_LIB } from "@/types";
import { createTaskDirect } from "@/lib/supabase";
import { CATEGORIES, DIFFICULTIES } from "@/types";

interface TaskEditorProps {
  task: Task | null;
  onSave: () => void;
  onCancel: () => void;
}

export function TaskEditor({ task, onSave, onCancel }: TaskEditorProps) {
  const [title, setTitle] = useState(task?.title || "");
  const [category, setCategory] = useState<string>(task?.category || "Travel");
  const [difficulty, setDifficulty] = useState<string>(task?.difficulty || "Easy");
  const [instruction, setInstruction] = useState(task?.instruction || "");
  const [constraints, setConstraints] = useState<string[]>(task?.constraints || []);
  const [checkerTemplates, setCheckerTemplates] = useState<string[]>(task?.checker_templates || []);
  const [hasTrap, setHasTrap] = useState(task?.has_trap || false);
  const [newConstraint, setNewConstraint] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clone the fixtures from the source task
  const [fixtures] = useState(task?.fixtures || {
    flights: [],
    calendar: [],
    inbox: [],
    web_pages: [],
    ask_user_reply: "",
  });

  const handleSave = async () => {
    if (!title.trim() || !instruction.trim()) {
      setError("Title and instruction are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createTaskDirect({
        title: title.trim(),
        category,
        difficulty,
        instruction: instruction.trim(),
        constraints,
        fixtures,
        checker_templates: checkerTemplates,
        has_trap: hasTrap,
      });
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save task");
    } finally {
      setSaving(false);
    }
  };

  const addConstraint = () => {
    if (newConstraint.trim()) {
      setConstraints([...constraints, newConstraint.trim()]);
      setNewConstraint("");
    }
  };

  const removeConstraint = (idx: number) => {
    setConstraints(constraints.filter((_, i) => i !== idx));
  };

  const toggleChecker = (name: string) => {
    if (checkerTemplates.includes(name)) {
      setCheckerTemplates(checkerTemplates.filter((c) => c !== name));
    } else {
      setCheckerTemplates([...checkerTemplates, name]);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          {task ? "Clone & Edit Task" : "Create Task"}
        </h2>
        <button
          onClick={onCancel}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <X className="h-5 w-5 text-gray-400" />
        </button>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        {task ? "Editing a clone of an existing task. Fixtures are copied from the source. Checkers are picked from the library." : "Create a new task with custom instructions and constraints."}
      </p>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-5 bg-white rounded-xl border border-gray-200 p-6">
        {/* Title */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1.5">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Book a flight to Denver"
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* Category + Difficulty */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Difficulty</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Instruction */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1.5">User Instruction</label>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={3}
            placeholder="e.g. Book me a nonstop flight to Denver under $300 next Friday."
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* Constraints */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1.5">Constraints (human-readable)</label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newConstraint}
              onChange={(e) => setNewConstraint(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addConstraint()}
              placeholder="e.g. price <= 300"
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              onClick={addConstraint}
              className="px-3 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {constraints.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700">
                {c}
                <button onClick={() => removeConstraint(i)} className="text-gray-400 hover:text-red-500">
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Checker templates */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">Checker Templates</label>
          <p className="text-xs text-gray-400 mb-2">Pick from the library. Checkers verify the run's world state in code.</p>
          <div className="flex flex-wrap gap-2">
            {CHECKER_LIB.map((name) => {
              const active = checkerTemplates.includes(name);
              return (
                <button
                  key={name}
                  onClick={() => toggleChecker(name)}
                  className={`text-xs font-mono px-3 py-1.5 rounded-lg transition-all ${
                    active
                      ? "bg-teal-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Trap toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setHasTrap(!hasTrap)}
            className={`relative w-11 h-6 rounded-full transition-colors ${hasTrap ? "bg-orange-500" : "bg-gray-300"}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${hasTrap ? "translate-x-5" : ""}`} />
          </button>
          <label className="text-sm font-medium text-gray-700">Contains a trap (prompt injection, phishing, layover trap, etc.)</label>
        </div>

        {/* Fixtures note */}
        {task && (
          <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
            <p className="text-xs text-blue-700">
              Fixtures (flights, calendar, inbox, web pages) are copied from the source task. They cannot be edited in this version.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving || !title.trim() || !instruction.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 transition-colors"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Task"}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
