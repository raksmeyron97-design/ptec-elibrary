"use client"
 
;
/* eslint-disable react-hooks/exhaustive-deps */


import { useState, useEffect } from "react";
import { X, Edit2, Trash2, Plus, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { addDepartment, updateDepartment, deleteDepartment } from "@/app/(admin)/admin/(protected)/actions";

interface Department {
  id: string;
  name: string;
}

export default function ManageDepartmentsModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add state
  const [newDeptName, setNewDeptName] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const supabase = createClient();

  // Fetch departments when modal opens
  useEffect(() => {
    if (isOpen) {
      loadDepartments();
    }
  }, [isOpen]);

  async function loadDepartments() {
    setIsLoading(true);
    setError(null);
    const { data, error } = await supabase.from("departments").select("id, name").order("name", { ascending: true });
    if (error) {
      setError("Failed to load departments.");
    } else {
      setDepartments(data || []);
    }
    setIsLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newDeptName.trim();
    if (!name) return;
    setIsAdding(true);
    setError(null);

    try {
      const res = await addDepartment(name);
      if (res.error) throw new Error(res.error);
      setNewDeptName("");
      await loadDepartments();
      window.dispatchEvent(new CustomEvent("ptec:departments-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add department");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const name = editName.trim();
    if (!name) return;

    setIsEditing(true);
    setError(null);

    try {
      const res = await updateDepartment(editingId, name);
      if (res.error) throw new Error(res.error);
      setEditingId(null);
      setEditName("");
      await loadDepartments();
      window.dispatchEvent(new CustomEvent("ptec:departments-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update department");
    } finally {
      setIsEditing(false);
    }
  }

  async function handleDelete(id: string, currentName: string) {
    if (!confirm(`Are you sure you want to delete the department "${currentName}"?`)) return;

    setError(null);
    try {
      const res = await deleteDepartment(id);
      if (res.error) throw new Error(res.error);
      await loadDepartments();
      window.dispatchEvent(new CustomEvent("ptec:departments-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete department");
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold bg-brand text-white shadow-sm hover:bg-brand-hover rounded-lg transition-all"
      >
        <Plus className="w-4 h-4" /> Manage Departments
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-bg-surface rounded-2xl shadow-xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-5 border-b border-divider">
              <h2 className="text-xl font-bold text-text-heading">Manage Departments</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-text-muted hover:text-text-body hover:bg-paper rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto">
              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
                  {error}
                </div>
              )}

              {/* Add form */}
              <form onSubmit={handleAdd} className="mb-6 flex gap-2">
                <input
                  type="text"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  placeholder="New department name..."
                  className="flex-1 h-10 rounded-lg border border-divider px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-focus-ring/15 transition-all"
                  disabled={isAdding}
                />
                <button
                  type="submit"
                  disabled={!newDeptName.trim() || isAdding}
                  className="h-10 px-4 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
                </button>
              </form>

              {/* List */}
              {isLoading ? (
                <div className="flex justify-center py-8 text-brand">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : departments.length === 0 ? (
                <div className="text-center py-8 text-text-muted text-sm">
                  No departments found.
                </div>
              ) : (
                <ul className="space-y-2">
                  {departments.map((dept) => (
                    <li key={dept.id} className="flex items-center justify-between p-3 rounded-lg border border-divider bg-paper hover:border-brand/30 transition-colors">
                      {editingId === dept.id ? (
                        <form onSubmit={handleEdit} className="flex flex-1 gap-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="flex-1 h-8 rounded border border-brand px-2 text-sm outline-none focus:ring-2 focus:ring-brand/20"
                            autoFocus
                            disabled={isEditing}
                          />
                          <button
                            type="submit"
                            disabled={isEditing || !editName.trim()}
                            className="h-8 px-3 rounded bg-brand text-white text-xs font-semibold hover:bg-brand-hover disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEditingId(null); setEditName(""); }}
                            disabled={isEditing}
                            className="h-8 px-3 rounded border border-divider text-text-body text-xs font-semibold hover:bg-bg-surface"
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <>
                          <span className="text-sm font-medium text-text-body">{dept.name}</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { setEditingId(dept.id); setEditName(dept.name); }}
                              className="p-1.5 text-text-muted hover:text-brand hover:bg-brand/10 rounded transition-colors"
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(dept.id, dept.name)}
                              className="p-1.5 text-text-muted hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
