import { useState, useEffect, useCallback } from "react";
import { FlaskConical, ListChecks, Trophy, ShieldCheck, BarChart3, Beaker } from "lucide-react";
import type { Task, Contender, Run, Page } from "@/types";
import {
  fetchTasksDirect,
  fetchContendersDirect,
  fetchRunsDirect,
  supabase,
} from "@/lib/supabase";
import { Sidebar } from "@/components/Sidebar";
import { TasksPage } from "@/components/TasksPage";
import { RunView } from "@/components/RunView";
import { LeaderboardPage } from "@/components/LeaderboardPage";
import { VerifierPage } from "@/components/VerifierPage";
import { StatsPage } from "@/components/StatsPage";
import { TaskEditor } from "@/components/TaskEditor";

function App() {
  const [page, setPage] = useState<Page>("tasks");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [contenders, setContenders] = useState<Contender[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dailyCapped, setDailyCapped] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [t, c, r] = await Promise.all([
        fetchTasksDirect(),
        fetchContendersDirect(),
        fetchRunsDirect(100),
      ]);
      setTasks(t);
      setContenders(c);
      setRuns(r);
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Subscribe to run changes for live updates
  useEffect(() => {
    const channel = supabase
      .channel("runs-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "runs" }, () => {
        fetchRunsDirect(100).then(setRuns).catch(console.error);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleRunSelected = (runId: string) => {
    setSelectedRunId(runId);
    setPage("runs");
  };

  const handleCloneTask = (task: Task) => {
    setEditingTask(task);
    setShowEditor(true);
  };

  const handleTaskSaved = () => {
    setShowEditor(false);
    setEditingTask(null);
    loadData();
  };

  const selectedRun = runs.find((r) => r.id === selectedRunId) || null;

  const navItems = [
    { id: "tasks" as Page, label: "Tasks", icon: ListChecks },
    { id: "runs" as Page, label: "Run View", icon: Beaker },
    { id: "leaderboard" as Page, label: "Leaderboard", icon: Trophy },
    { id: "verifier" as Page, label: "Verifier", icon: ShieldCheck },
    { id: "stats" as Page, label: "Stats", icon: BarChart3 },
  ];

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      <Sidebar
        page={page}
        navItems={navItems}
        onNavigate={setPage}
        dailyCapped={dailyCapped}
        runCount={runs.length}
      />

      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-gray-400 flex flex-col items-center gap-3">
              <FlaskConical className="h-10 w-10 animate-pulse" />
              <p className="text-sm">Loading benchmark lab...</p>
            </div>
          </div>
        ) : showEditor ? (
          <TaskEditor
            task={editingTask}
            onSave={handleTaskSaved}
            onCancel={() => {
              setShowEditor(false);
              setEditingTask(null);
            }}
          />
        ) : page === "tasks" ? (
          <TasksPage
            tasks={tasks}
            contenders={contenders}
            runs={runs}
            onRunComplete={loadData}
            onCloneTask={handleCloneTask}
            onViewRun={handleRunSelected}
            dailyCapped={dailyCapped}
            setDailyCapped={setDailyCapped}
          />
        ) : page === "runs" ? (
          <RunView
            runs={runs}
            selectedRun={selectedRun}
            onSelectRun={setSelectedRunId}
          />
        ) : page === "leaderboard" ? (
          <LeaderboardPage runs={runs} />
        ) : page === "verifier" ? (
          <VerifierPage />
        ) : page === "stats" ? (
          <StatsPage />
        ) : null}
      </main>
    </div>
  );
}

export default App;
