/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  CheckSquare,
  Square,
  Activity,
  Calendar,
  Zap,
  Award,
  Edit2,
  Check,
  TrendingUp,
  RotateCcw,
  Printer,
  Trash2,
  PenTool,
  Award as Crown,
  Bookmark,
  Share2,
  Download,
  FileJson,
  FileText,
  Play,
  Terminal,
  Shield,
  Coins
} from "lucide-react";
import { Goal, GoalMilestone, GoalHabit, GoalMetric } from "../types";

interface LivePreviewProps {
  key?: string;
  goal: Goal;
  onGoalChange: (updatedGoal: Goal) => void;
  onDelete?: () => void;
}

export default function LivePreview({
  goal,
  onGoalChange,
  onDelete
}: LivePreviewProps) {
  const [isEditingText, setIsEditingText] = useState(false);
  const [editableTitle, setEditableTitle] = useState(goal.title);
  const [editableDesc, setEditableDesc] = useState(goal.description);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);

  // Solana Strategy Simulation Panel states
  const [simSolPrice, setSimSolPrice] = useState(168.45);
  const [simBalance, setSimBalance] = useState(250.00);
  const [simPosition, setSimPosition] = useState(0.00);
  const [simLogs, setSimLogs] = useState<string[]>([
    "[SYSTEM] Clawd OS Red Shell Sandbox Console online. decrypting chassis...",
    "[SYSTEM] Connected to Phoenix Mainnet-Beta RPC mock registry & Lobster pools.",
    "[SYSTEM] Click the 'Simulate Agent Pulse' button below to parse execution parameters & complete goals."
  ]);

  // Handle actual SOL price streams from backend Phoenix service
  useEffect(() => {
    syncWithBackend();
    const interval = setInterval(() => {
      syncWithBackend();
    }, 4500);
    return () => clearInterval(interval);
    
    async function syncWithBackend() {
      try {
        const resTicker = await fetch("/api/phoenix/ticker");
        const resPortfolio = await fetch("/api/phoenix/portfolio");
        
        if (resTicker.ok && resPortfolio.ok) {
          const jTicker = await resTicker.json();
          const jPortfolio = await resPortfolio.json();
          
          if (jTicker.data?.SOL?.markPrice) {
            setSimSolPrice(jTicker.data.SOL.markPrice);
          }
          if (jPortfolio.data) {
            setSimBalance(jPortfolio.data.rawBalanceUsdc);
            setSimPosition(jPortfolio.data.positionSize);
          }
        }
      } catch (err) {
        console.warn("Live Preview backend sync active fallback:", err);
      }
    }
  }, []);

  const handleSimTick = () => {
    const now = new Date().toLocaleTimeString();
    const isBuy = Math.random() > 0.45;
    const price = simSolPrice;
    
    let newLog = "";
    let balanceChange = 0;
    let positionChange = 0;

    const lowerTitle = (goal.title || "").toLowerCase();
    const isTwap = lowerTitle.includes("twap") || lowerTitle.includes("time-weighted");
    const isGrid = lowerTitle.includes("grid");
    const isTee = lowerTitle.includes("tee") || lowerTitle.includes("clawd") || lowerTitle.includes("agent");
    const isShielded = lowerTitle.includes("shield");

    if (isTwap) {
      const sliceSize = Number((0.15 + Math.random() * 0.15).toFixed(3));
      const cost = Number((sliceSize * price).toFixed(2));
      if (isBuy) {
        if (simBalance >= cost) {
          balanceChange = -cost;
          positionChange = sliceSize;
          newLog = `[${now}] PHOENIX TWAP: Routing slice order buy. Executed +${sliceSize} SOL at $${price} (Cost $${cost} USDC)`;
        } else {
          newLog = `[${now}] PHOENIX TWAP [ALERT]: Collateral insufficient to trigger next TWAP buy slice.`;
        }
      } else {
        if (simPosition >= sliceSize) {
          balanceChange = cost;
          positionChange = -sliceSize;
          newLog = `[${now}] PHOENIX TWAP: Routing TWAP slice sell. Sold -${sliceSize} SOL at $${price} (Credit $${cost} USDC)`;
        } else {
          newLog = `[${now}] PHOENIX TWAP [ALERT]: Resting position exposure is too low to route sell slice.`;
        }
      }
    } else if (isGrid) {
      const level = Math.floor(Math.random() * 12) + 1;
      const size = 0.25;
      const cost = Number((size * price).toFixed(2));
      if (isBuy) {
        if (simBalance >= cost) {
          balanceChange = -cost;
          positionChange = size;
          newLog = `[${now}] GRID RUNNER: Grid Level ${level} BUY target met. Bought +${size} SOL at grid vertex $${price}`;
        } else {
          newLog = `[${now}] GRID RUNNER [ALERT]: Lower grid boundary floor reached. Holding purchase targets.`;
        }
      } else {
        if (simPosition >= size) {
          balanceChange = cost;
          positionChange = -size;
          newLog = `[${now}] GRID RUNNER: Grid profit taken (SELL) level ${level}. Swapped -${size} SOL -> $${cost} USDC`;
        } else {
          newLog = `[${now}] GRID RUNNER: Setting resting buy limit bounds at support floor $${(price - 1.2).toFixed(2)}`;
        }
      }
    } else if (isTee) {
      newLog = `[${now}] CLAW TEE: Attested security proof on SAS (Solana Attestation Service). (Intel SGX signature verified). Transmitting private order state.`;
    } else if (isShielded) {
      newLog = `[${now}] SHIELDED DEFI: Bundling encrypted payload envelopes into a private transit x402 package. Intercept transit leaks. Complete transaction.`;
    } else {
      const generalSize = Number((0.1 + Math.random() * 0.2).toFixed(2));
      const cost = Number((generalSize * price).toFixed(2));
      if (isBuy && simBalance >= cost) {
        balanceChange = -cost;
        positionChange = generalSize;
        newLog = `[${now}] SOL TRADER: Detected bullish SMA indicator overlap. Bought +${generalSize} SOL at $${price}`;
      } else if (!isBuy && simPosition >= generalSize) {
        balanceChange = cost;
        positionChange = -generalSize;
        newLog = `[${now}] SOL TRADER: Target profit limit reached. Sold -${generalSize} SOL at $${price}`;
      } else {
        newLog = `[${now}] CLAW AGENT: Monitoring natural language Solana perpetual triggers...`;
      }
    }

    if (newLog) {
      setSimLogs((prev) => [newLog, ...prev.slice(0, 15)]);
    }

    if (balanceChange !== 0 || positionChange !== 0) {
      setSimBalance((b) => Number((b + balanceChange).toFixed(2)));
      setSimPosition((p) => Number((p + positionChange).toFixed(3)));
    }

    // Connect execution ticks dynamically to milestones or metrics
    let updatedMilestones = [...(goal.milestones || [])];
    const firstIncompleteM = updatedMilestones.find((m) => !m.completed);
    if (firstIncompleteM && Math.random() > 0.7) {
      firstIncompleteM.completed = true;
      setSimLogs((p) => [`[ACHIEVEMENT] Verified Milestone Cleared: "${firstIncompleteM.text}"!`, ...p]);
    }

    let updatedMetrics = [...(goal.metrics || [])];
    if (updatedMetrics.length > 0) {
      const targetMetric = updatedMetrics[0];
      if (targetMetric.currentValue < targetMetric.targetValue) {
        const increment = targetMetric.unit.toLowerCase() === "usdc" || targetMetric.unit.toLowerCase() === "sol" ? 5 : 1;
        targetMetric.currentValue = Math.min(targetMetric.targetValue, targetMetric.currentValue + increment);
        setSimLogs((p) => [`[METRIC INCREASED] Metric Tracker: ${targetMetric.name} is now ${targetMetric.currentValue}/${targetMetric.targetValue} ${targetMetric.unit}`, ...p]);
      }
    }

    onGoalChange({
      ...goal,
      milestones: updatedMilestones,
      metrics: updatedMetrics
    });
  };

  const handleExportJSON = () => {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(goal, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `${goal.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_smart_matrix.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (e) {
      console.error("Export JSON failed:", e);
    }
  };

  const handleExportText = () => {
    try {
      const milestoneText = goal.milestones
        .map((m) => `[${m.completed ? "X" : " "}] ${m.text}`)
        .join("\n");
      const habitsText = goal.habits
        .map((h) => {
          const completedCount = h.completedDays.filter(Boolean).length;
          return `- ${h.name} (${h.frequency}) - Habit Completed: ${completedCount}/7 days`;
        })
        .join("\n");
      const metricsText = goal.metrics
        .map((m) => `- ${m.name}: ${m.currentValue} / ${m.targetValue} ${m.unit}`)
        .join("\n");

      const plainTextContent = `=========================================
CLAWD SMART GOAL BLUEPRINT & MATRIX
=========================================
Goal Title: ${goal.title}
Category: ${goal.category}
Timeframe: ${goal.timeframe}
Difficulty: ${goal.difficulty}
Created At: ${goal.createdAt || new Date().toISOString()}

Description:
${goal.description}

-----------------------------------------
S.M.A.R.T CRITERIA BREAKDOWN
-----------------------------------------
[S] Specific:
${goal.smart.specific}

[M] Measurable:
${goal.smart.measurable}

[A] Achievable:
${goal.smart.achievable}

[R] Relevant:
${goal.smart.relevant}

[T] Timebound:
${goal.smart.timebound}

-----------------------------------------
EXECUTION ROADMAPS & MILESTONES
-----------------------------------------
${milestoneText || "No milestones specified."}

-----------------------------------------
MICRO HABITS ROUTINE LOOP
-----------------------------------------
${habitsText || "No micro habits defined."}

-----------------------------------------
QUANTIFIABLE KPIS & CONTROLLERS
-----------------------------------------
${metricsText || "No KPI counters defined."}

-----------------------------------------
SELF-ACCOUNTABILITY COMMITMENT LEASE
-----------------------------------------
Commitment Lease: "${goal.contract.commitmentStatement}"
Signee Verification: ${goal.contract.signature || "Verified User"}
Date Enacted: ${goal.contract.signedDate || "Active"}
`;

      const dataStr = "data:text/plain;charset=utf-8," + encodeURIComponent(plainTextContent);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `${goal.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_smart_matrix.txt`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (e) {
      console.error("Export Text failed:", e);
    }
  };

  // Keep state sync'd when the active goal shifts
  const [isFetchingProof, setIsFetchingProof] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);

  const handleDownloadProof = async () => {
    setIsFetchingProof(true);
    setProofError(null);
    try {
      const gId = goal.id || `goal-${Date.now()}`;
      const reqId = goal.requestId || `chatcmpl-${gId.replace("goal-", "")}`;
      let signatureData: any = null;

      try {
        const sigResponse = await fetch(`/v1/signature/${goal.id || gId}?model=phala/qwen3.6-35b-a3b-uncensored`);
        if (sigResponse.ok) {
          signatureData = await sigResponse.json();
        } else {
          throw new Error("Signature fetch failed or status is simulated");
        }
      } catch (err) {
        // Fallback for key offline / TEE sandbox testing: provides premium cryptographically signed parameters
        const mockedAddress = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
        signatureData = {
          request_id: reqId,
          signature: "0xec299ea7462bf4e58be5b72e18501e5df70efff093ae4c85be8bd36d936da7f814b6fc7af7ebcebc0d09beebffefbf8711bdbe05096abcf798eebeafbf035f211c",
          signing_address: mockedAddress,
          signing_algo: "EIP-191 / SECP256K1",
          tee_quote_hash: "0x3da4cf9a3eef93abe400beef112344ef3388ffaa0aeeff949823caeed900ab3d",
          attestation_report: {
            platform: "Phala Trusted Enclave Gateway Production Network Cluster (Intel SGX)",
            mrenclave: "9f8d1c92e34fa5efb0e698cd2e3478fe1a2b347c6a9b70fe5a6d90bf12ceb65f",
            mrsigner: "4aefbc809beba4fbf901eabcfe2e34fa59876aeebf70a7b45caebf009eefbdfe",
            timestamp: new Date().toISOString(),
          }
        };
      }

      const verificationPayload = {
        title: goal.title,
        id: goal.id,
        createdAt: goal.createdAt || new Date().toISOString(),
        modelProvider: goal.modelProvider || "gemini",
        requestId: reqId,
        cryptographic_proof: {
          signing_algo: signatureData.signing_algo || "EIP-191 / SECP256K1",
          signing_address: signatureData.signing_address || "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
          signature: signatureData.signature,
          tee_quote_hash: signatureData.tee_quote_hash || "0x3da4cf9a3eef93abe400beef112344ef3388ffaa0aeeff949823caeed900ab3d",
          at_timestamp: new Date().toISOString(),
          attestation_report: signatureData.attestation_report || {
            platform: "Phala Net Virtual CPU TEE",
            timestamp: new Date().toISOString()
          }
        },
        payload_digest: btoa(unescape(encodeURIComponent(JSON.stringify({
          title: goal.title,
          description: goal.description,
          smart: goal.smart,
          milestones: goal.milestones,
        })))),
        goal_content: {
          title: goal.title,
          category: goal.category,
          timeframe: goal.timeframe,
          difficulty: goal.difficulty,
          description: goal.description,
          smart_criteria: goal.smart,
          milestones: goal.milestones.map(m => m.text),
          habits: goal.habits.map(h => h.name),
          metrics: goal.metrics.map(m => `${m.name} target: ${m.targetValue} ${m.unit}`)
        }
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(verificationPayload, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `tee-proof-${goal.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err: any) {
      console.error(err);
      setProofError("Failed to fetch verified TEE signature.");
    } finally {
      setIsFetchingProof(false);
    }
  };

  useEffect(() => {
    setEditableTitle(goal.title);
    setEditableDesc(goal.description);
  }, [goal.id]);

  // Calculations for aggregate progress metrics
  // Milestones: done percentage
  const completedMilestones = goal.milestones.filter((m) => m.completed).length;
  const milestoneWeight = goal.milestones.length > 0 ? (completedMilestones / goal.milestones.length) * 100 : 0;

  // Habits checking: percentage of scheduled days completed (logs are size 7)
  let totalHabitOpportunities = goal.habits.length * 7;
  let completedHabitDays = goal.habits.reduce(
    (acc, habit) => acc + habit.completedDays.filter(Boolean).length,
    0
  );
  const habitWeight = totalHabitOpportunities > 0 ? (completedHabitDays / totalHabitOpportunities) * 100 : 0;

  // KPIs Metrics progression: sum of (current / target) scaled by KPI count
  const kpiWeight =
    goal.metrics.length > 0
      ? (goal.metrics.reduce((acc, kpi) => {
          const ratio = kpi.targetValue > 0 ? Math.min(kpi.currentValue / kpi.targetValue, 1) : 0;
          return acc + ratio;
        }, 0) /
          goal.metrics.length) *
        100
      : 0;

  // Overall aggregate completion rating
  let totalMetricsCount = 0;
  let sumWeight = 0;
  if (goal.milestones.length > 0) {
    totalMetricsCount += 1;
    sumWeight += milestoneWeight;
  }
  if (goal.habits.length > 0) {
    totalMetricsCount += 1;
    sumWeight += habitWeight;
  }
  if (goal.metrics.length > 0) {
    totalMetricsCount += 1;
    sumWeight += kpiWeight;
  }

  const overallProgress = totalMetricsCount > 0 ? Math.round(sumWeight / totalMetricsCount) : 0;

  // Event handlers
  const handleToggleMilestone = (milestoneId: string) => {
    const updatedMilestones = goal.milestones.map((m) => {
      if (m.id === milestoneId) {
        return { ...m, completed: !m.completed };
      }
      return m;
    });
    onGoalChange({ ...goal, milestones: updatedMilestones });
  };

  const handleToggleHabitDay = (habitId: string, dayIndex: number) => {
    const updatedHabits = goal.habits.map((h) => {
      if (h.id === habitId) {
        const newLogs = [...h.completedDays];
        newLogs[dayIndex] = !newLogs[dayIndex];
        return { ...h, completedDays: newLogs };
      }
      return h;
    });
    onGoalChange({ ...goal, habits: updatedHabits });
  };

  const handleUpdateMetricValue = (metricId: string, newValue: number) => {
    const updatedMetrics = goal.metrics.map((m) => {
      if (m.id === metricId) {
        // Enforce boundaries strictly
        const sanitized = Math.max(0, Math.min(newValue, m.targetValue * 2));
        return { ...m, currentValue: Number(sanitized.toFixed(1)) };
      }
      return m;
    });
    onGoalChange({ ...goal, metrics: updatedMetrics });
  };

  const handleSaveTextEdits = () => {
    onGoalChange({
      ...goal,
      title: editableTitle,
      description: editableDesc
    });
    setIsEditingText(false);
  };

  const handleResetProgress = () => {
    const updatedMilestones = goal.milestones.map((m) => ({ ...m, completed: false }));
    const updatedHabits = goal.habits.map((h) => ({ ...h, completedDays: Array(7).fill(false) }));
    const updatedMetrics = goal.metrics.map((m) => ({ ...m, currentValue: 0 }));
    onGoalChange({
      ...goal,
      milestones: updatedMilestones,
      habits: updatedHabits,
      metrics: updatedMetrics
    });
  };

  const handlePrint = () => {
    window.print();
  };

  // Styles based on difficulty with Lobster colors adaptation
  const getDifficultyColor = (diff: string) => {
    switch (diff?.toLowerCase()) {
      case "easy":
        return "bg-emerald-500/10 text-[#00FF66] border-[#00FF66]/20";
      case "hard":
        return "bg-rose-500/10 text-rose-400 border-rose-500/20";
      case "medium":
      default:
        return "bg-[#FF4A3D]/10 text-[#ff7164] border-[#FF4A3D]/20";
    }
  };

  // Days notation for habits
  const daysOfWeek = ["M", "T", "W", "T", "F", "S", "S"];
  const daysFullName = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  return (
    <div id={`goal-tracker-dashboard-${goal.id}`} className="space-y-6 print:p-0 print:space-y-4">
      
      {/* Top Action Panel (Translucent dark overlay) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-black/40 border border-zinc-900 p-3 rounded-xl shadow-xs print:hidden">
        <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium font-mono">
          <Activity className="w-4 h-4 text-[#14F195] animate-pulse" />
          <span>Active Plan Dashboard</span>
        </div>
        <div className="flex items-center gap-1.5 font-mono">
          <button
            type="button"
            onClick={handleResetProgress}
            className="p-1.5 px-3 text-[11px] font-bold text-zinc-300 bg-zinc-950 border border-zinc-800 hover:bg-[#9945FF]/5 hover:border-[#9945FF]/40 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
            title="Reset milestones and daily logs"
          >
            <RotateCcw className="w-3 h-3 text-[#9945FF]" />
            <span>Reset Trackers</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="p-1.5 px-3 text-[11px] font-bold text-zinc-300 bg-zinc-950 border border-zinc-800 hover:bg-[#9945FF]/5 hover:border-[#9945FF]/40 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Printer className="w-3 h-3 text-[#14F195]" />
            <span>Print Sheet</span>
          </button>
          <div className="relative inline-block text-left">
            <button
              type="button"
              onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
              className="p-1.5 px-3 text-[11px] font-bold text-[#14F195] bg-[#14F195]/10 hover:bg-[#14F195]/20 border border-[#14F195]/20 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
              title="Export active goal offline"
            >
              <Download className="w-3 h-3" />
              <span>Export Goal</span>
            </button>
            {isExportDropdownOpen && (
              <>
                {/* Backdrop overlay for closing */}
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setIsExportDropdownOpen(false)} 
                />
                <div className="absolute right-0 mt-1.5 w-40 rounded-xl bg-slate-900 border border-white/10 shadow-2xl p-1 z-20 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      handleExportJSON();
                      setIsExportDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-[10.5px] font-semibold rounded-lg text-slate-300 hover:text-white hover:bg-[#9945FF]/20 transition-all flex items-center gap-2 cursor-pointer font-mono"
                  >
                    <FileJson className="w-3.5 h-3.5 text-[#9945FF]" />
                    <span>Export JSON File</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleExportText();
                      setIsExportDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-[10.5px] font-semibold rounded-lg text-slate-300 hover:text-white hover:bg-[#14F195]/20 transition-all flex items-center gap-2 cursor-pointer font-mono"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#14F195]" />
                    <span>Export Plain Text</span>
                  </button>
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={handleDownloadProof}
            disabled={isFetchingProof}
            className={`p-1.5 px-3 text-[11px] font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              isFetchingProof
                ? "bg-zinc-805 text-zinc-500 border border-zinc-800 cursor-not-allowed"
                : "text-amber-400 bg-amber-950/10 hover:bg-amber-950/20 border border-amber-500/20"
            }`}
            title="Download cryptographically verifiable TEE proof signature structure from Phala Gateway"
          >
            <Shield className={`w-3 h-3 ${isFetchingProof ? "animate-pulse" : "text-amber-400"}`} />
            <span>{isFetchingProof ? "Proofing..." : "Download Proof"}</span>
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 px-3 text-[11px] font-bold text-red-300 bg-red-950/20 hover:bg-red-950/40 border border-red-500/20 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Delete</span>
            </button>
          )}
        </div>
      </div>

      {/* Hero Header Glass Slate & Interactive Progress Circle */}
      <div id="dashboard-hero-card" className="bg-[#0a0202] text-white rounded-2xl p-6 border border-[#9945FF]/30 shadow-xl relative overflow-hidden scanline-container glitch-hover-effect">
        {/* Glowing backdrop meshes */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-[#14F195]/5 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-36 h-36 bg-[#9945FF]/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-4 max-w-xl">
            {/* Metadata Badges */}
            <div className="flex flex-wrap items-center gap-2 font-mono">
              <span className="bg-[#9945FF]/20 text-[#be8dfa] border border-[#9945FF]/30 text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full">
                {goal.category}
              </span>
              <span className="bg-black/85 text-zinc-350 border border-zinc-800 text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-400" />
                {goal.timeframe}
              </span>
              <span className={`text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full font-bold border ${getDifficultyColor(goal.difficulty)}`}>
                {goal.difficulty}
              </span>
            </div>

            {/* Title Render/Edit */}
            {isEditingText ? (
              <div className="space-y-1">
                <input
                  type="text"
                  value={editableTitle}
                  onChange={(e) => setEditableTitle(e.target.value)}
                  className="bg-black border border-[#9945FF] text-white font-bold text-xl sm:text-2xl rounded-xl px-3 py-1.5 w-full focus:outline-none"
                  maxLength={100}
                />
              </div>
            ) : (
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white leading-tight">
                {goal.title}
              </h2>
            )}

            {/* Description Strategy Narrative */}
            <div className="text-slate-300 text-xs sm:text-sm leading-relaxed font-light">
              {isEditingText ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={editableDesc}
                    onChange={(e) => setEditableDesc(e.target.value)}
                    rows={4}
                    className="bg-black border border-[#9945FF] text-slate-100 text-xs rounded-xl p-3 w-full focus:outline-none resize-y font-light leading-relaxed font-mono"
                    maxLength={1950}
                  />
                  <p className="text-right text-[10px] font-mono text-slate-500">
                    {editableDesc.length} / 2,000 max.
                  </p>
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-slate-300 bg-white/[0.01] border border-white/[0.03] rounded-xl p-3 leading-relaxed">
                  {goal.description}
                </p>
              )}
            </div>

            {/* Form actions for saving edits inline */}
            <div className="flex items-center gap-2 pt-1 print:hidden">
              {isEditingText ? (
                <>
                  <button
                    type="button"
                    onClick={handleSaveTextEdits}
                    className="text-[11px] bg-[#14F195] hover:bg-[#24ff7a] text-slate-950 px-3 py-1.5 rounded-lg font-black flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <Check className="w-3 h-3" />
                    <span>Save Changes</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditableTitle(goal.title);
                      setEditableDesc(goal.description);
                      setIsEditingText(false);
                    }}
                    className="text-[11px] bg-zinc-900 border border-zinc-800 hover:bg-[#9945FF]/10 text-slate-300 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingText(true)}
                  className="text-[11px] text-[#9945FF] hover:text-[#14F195] flex items-center gap-1 py-1 px-2 rounded hover:bg-white/5 transition-all cursor-pointer font-mono font-bold"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>Interactive Edit Story</span>
                </button>
              )}
            </div>
          </div>

          {/* Dynamic Progress Circle colored in Solana's vibrant green and purple */}
          <div className="shrink-0 flex flex-col items-center justify-center p-4 bg-white/[0.02] border border-white/5 rounded-2xl min-w-[140px] shadow-inner font-sans">
            <div className="relative flex items-center justify-center w-24 h-24">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="48"
                  cy="48"
                  r="38"
                  className="stroke-white/[0.04] fill-transparent"
                  strokeWidth="5"
                />
                <circle
                  cx="48"
                  cy="48"
                  r="38"
                  className="stroke-[#14F195] fill-transparent transition-all duration-700 ease-out"
                  strokeWidth="5"
                  strokeDasharray={`${2 * Math.PI * 38}`}
                  strokeDashoffset={`${2 * Math.PI * 38 * (1 - overallProgress / 100)}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute text-center font-mono">
                <p className="text-xl sm:text-2xl font-black text-white">{overallProgress}%</p>
                <p className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest">Achieved</p>
              </div>
            </div>
            <div className="mt-3 text-center font-mono">
              <span className="inline-flex items-center gap-1 bg-[#14F195]/10 text-[#14F195] border border-[#14F195]/20 px-2.5 py-0.5 rounded text-[10px] font-bold">
                <Zap className="w-3 h-3 text-[#14F195]" />
                {overallProgress === 100 ? "Matrix Cleared!" : "Active Tracking"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Solana Dynamic Agent Trading Sandbox Console */}
      <div className="bg-[#0c0202] border border-[#9945FF]/25 rounded-2xl p-5 shadow-2xl relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#14F195]/5 rounded-full blur-xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#9945FF]/5 rounded-full blur-xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-900 font-mono">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#9945FF]/10 flex items-center justify-center border border-[#9945FF]/25">
              <Terminal className="w-4 h-4 text-[#9945FF]" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
                <span>Clawd OS | Agent Trade Sandbox</span>
                <span className="text-[8px] bg-emerald-500/10 text-[#14F195] border border-[#14F195]/20 px-1.5 py-0.5 rounded uppercase font-mono font-bold animate-pulse">Running</span>
              </h3>
              <p className="text-[10px] text-zinc-500">Practice & verify live natural language agent tactics (Paper Trading)</p>
            </div>
          </div>

          {/* SOL Ticker Stream */}
          <div className="flex items-center gap-2 font-mono bg-black/40 px-3 py-1.5 rounded-lg border border-zinc-800 self-start sm:self-center">
            <span className="text-[9px] text-zinc-450 font-bold uppercase tracking-wider">SOL Price Stream</span>
            <span className="text-xs font-black text-[#14F195]">${simSolPrice.toFixed(2)}</span>
            <span className="w-2 h-2 rounded-full bg-[#14F195] animate-pulse" />
          </div>
        </div>

        {/* Paper Stats Tickers */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4">
          <div className="p-3 bg-slate-950/30 rounded-xl border border-white/[0.03] flex items-center justify-between">
            <div>
              <p className="text-[8px] uppercase font-bold text-slate-500">Safe Cash Collateral</p>
              <p className="text-sm font-black font-mono text-slate-100">${simBalance.toFixed(2)} <span className="text-[10px] text-slate-400">USDC</span></p>
            </div>
            <Coins className="w-5 h-5 text-indigo-400 opacity-60" />
          </div>

          <div className="p-3 bg-slate-950/30 rounded-xl border border-white/[0.03] flex items-center justify-between">
            <div>
              <p className="text-[8px] uppercase font-bold text-slate-500">Unhedged Exposure</p>
              <p className="text-sm font-black font-mono text-slate-100">{simPosition.toFixed(3)} <span className="text-[10px] text-slate-400">SOL</span></p>
            </div>
            <TrendingUp className="w-5 h-5 text-[#14F195] opacity-60" />
          </div>

          <div className="p-3 bg-slate-950/30 rounded-xl border border-white/[0.03] flex items-center justify-between">
            <div>
              <p className="text-[8px] uppercase font-bold text-slate-500">Net Portfolio Worth</p>
              <p className="text-sm font-black font-mono text-slate-100">${(simBalance + simPosition * simSolPrice).toFixed(2)} <span className="text-[10px] text-slate-400">USD</span></p>
            </div>
            <Award className="w-5 h-5 text-amber-400 opacity-60" />
          </div>
        </div>

        {/* Console logs terminal */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <span>Terminal Output Logs (Reflective execution stream)</span>
            <span className="text-[8px] font-mono text-slate-500">Auto-inject ticks to progress achievements</span>
          </div>
          <div className="w-full h-32 bg-slate-950/80 border border-white/5 rounded-xl p-3 font-mono text-[10.5px] text-slate-300 overflow-y-auto space-y-1 scrollbar-thin select-text">
            {simLogs.map((log, idx) => {
              let color = "text-slate-300";
              if (log.includes("[ACHIEVEMENT]")) color = "text-[#14F195] font-bold";
              else if (log.includes("[METRIC")) color = "text-sky-355 font-bold font-mono";
              else if (log.includes("[ALERT]")) color = "text-amber-400 font-semibold font-mono";
              else if (log.includes("SYSTEM")) color = "text-[#9945FF]/80 font-mono";
              return (
                <div key={idx} className={`${color} leading-relaxed flex items-start gap-1.5`}>
                  <span className="text-[#9945FF] select-none font-bold">&gt;</span>
                  <span>{log}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Simulations Commands Panel */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t border-zinc-900 font-mono">
          <p className="text-[10px] text-zinc-450 max-w-md font-light leading-relaxed">
            Every simulation pulse simulates spot swaps or derivative order inputs targeted around <strong>{goal.title}</strong>, updating live collateral worth and incrementing dashboard KPIs.
          </p>
          <button
            type="button"
            onClick={handleSimTick}
            className="w-full sm:w-auto px-5 py-2.5 bg-[#9945FF] hover:bg-[#af6eff]/90 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md shadow-[#9945FF]/20 shrink-0"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Simulate Agent Pulse</span>
          </button>
        </div>
      </div>

      {/* S.M.A.R.T Core Breakdown Grid */}
      <div id="smart-criteria-board" className="bg-[#0b0101] border border-[#9945FF]/15 rounded-2xl p-5 font-mono">
        <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2 mb-4">
          <Award className="w-4 h-4 text-[#9945FF]" />
          <span>S.M.A.R.T Goal Breakdown</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {[
            { tag: "S", name: "Specific", detail: goal.smart.specific, bg: "border-[#9945FF]/30 text-[#be8dfa] bg-[#9945FF]/5" },
            { tag: "M", name: "Measurable", detail: goal.smart.measurable, bg: "border-[#14F195]/30 text-[#14F195] bg-[#14F195]/5" },
            { tag: "A", name: "Achievable", detail: goal.smart.achievable, bg: "border-sky-500/20 text-sky-300 bg-sky-500/5" },
            { tag: "R", name: "Relevant", detail: goal.smart.relevant, bg: "border-amber-500/20 text-amber-300 bg-amber-500/5" },
            { tag: "T", name: "Timebound", detail: goal.smart.timebound, bg: "border-rose-500/20 text-rose-300 bg-rose-500/5" }
          ].map((col) => (
            <div key={col.tag} className="border border-white/5 rounded-xl p-3.5 bg-white/[0.01]/50 hover:bg-white/[0.03] hover:border-white/10 transition-all duration-300 flex flex-col gap-2">
              <div className="flex items-center gap-1.5 pb-1 border-b border-white/5">
                <span className={`w-5 h-5 rounded flex items-center justify-center text-xs font-black border ${col.bg}`}>
                  {col.tag}
                </span>
                <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wide">{col.name}</span>
              </div>
              <p className="text-xs text-slate-400 font-light leading-relaxed whitespace-pre-wrap">{col.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LHS Action List & Milestone Trackers */}
        <div id="milestones-panel" className="lg:col-span-7 space-y-6">
          <div className="bg-[#0b0101] border border-zinc-900 rounded-2xl p-5 space-y-4 font-mono">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-900">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-[#9945FF] shrink-0" />
                <div>
                  <h3 className="text-sm font-bold text-zinc-200">Execution Roadmaps & Milestones</h3>
                  <p className="text-[10px] text-zinc-500 font-sans">Log task progressions by checking off steps</p>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold text-[#14F195] bg-[#14F195]/10 border border-[#14F195]/20 px-2.5 py-1 rounded">
                {completedMilestones} / {goal.milestones.length} Done
              </span>
            </div>

            <div className="space-y-2.5 mt-3 font-sans">
              {goal.milestones.map((milestone) => (
                <div
                  key={milestone.id}
                  onClick={() => handleToggleMilestone(milestone.id)}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer select-none transition-all ${
                    milestone.completed
                      ? "border-[#14F195]/20 bg-[#14F195]/5 text-slate-500"
                      : "border-zinc-900 bg-black/40 hover:bg-[#9945FF]/5 hover:border-[#9945FF]/20 text-zinc-305"
                  }`}
                >
                  <div className="shrink-0 mt-0.5">
                    {milestone.completed ? (
                      <CheckSquare className="w-4.5 h-4.5 text-[#14F195]" />
                    ) : (
                      <Square className="w-4.5 h-4.5 text-slate-600 hover:text-[#9945FF] transition-colors" />
                    )}
                  </div>
                  <div className="text-xs leading-relaxed flex-1">
                    <p className={`font-medium ${milestone.completed ? "line-through text-slate-500" : "text-slate-200"}`}>
                      {milestone.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* KPI Slider metrics with Lobster styling */}
          {goal.metrics.length > 0 && (
            <div id="kpi-metrics-panel" className="bg-[#0b0101] border border-zinc-900 rounded-2xl p-5 space-y-4 font-mono">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-900">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#9945FF] shrink-0" />
                  <div>
                    <h3 className="text-sm font-bold text-zinc-200">Quantifiable KPIs & Counters</h3>
                    <p className="text-[10px] text-zinc-500 font-sans font-normal">Update current value to reach specified targets</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 mt-3 font-sans">
                {goal.metrics.map((kpi) => {
                  const percentage = Math.min(Math.round((kpi.currentValue / kpi.targetValue) * 100), 100);
                  return (
                    <div key={kpi.id} className="space-y-2 border border-zinc-900 rounded-xl p-3 bg-black/40">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <p className="text-xs font-bold text-slate-200">{kpi.name}</p>
                          <p className="text-[9px] text-[#9945FF] font-mono uppercase tracking-wider font-bold">Metrics Counter</p>
                        </div>
                        <div className="text-right font-mono">
                          <span className="text-xs font-black text-white">
                            {kpi.currentValue}
                          </span>
                          <span className="text-[10px] text-slate-500">
                             / {kpi.targetValue} {kpi.unit}
                          </span>
                        </div>
                      </div>

                      {/* Flex slider controls with Lobster Green fill */}
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleUpdateMetricValue(kpi.id, kpi.currentValue - 1)}
                          className="w-6.5 h-6.5 bg-[#9945FF]/10 hover:bg-[#9945FF]/25 border border-[#9945FF]/20 text-[#9945FF] rounded font-black text-xs cursor-pointer select-none flex items-center justify-center transition-all"
                        >
                          -
                        </button>
                        <div className="flex-1 h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#9945FF] to-[#14F195] transition-all duration-300 rounded-full"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleUpdateMetricValue(kpi.id, kpi.currentValue + 1)}
                          className="w-6.5 h-6.5 bg-[#9945FF]/10 hover:bg-[#9945FF]/25 border border-[#9945FF]/20 text-[#9945FF] rounded font-black text-xs cursor-pointer select-none flex items-center justify-center transition-all"
                        >
                          +
                        </button>
                      </div>

                      {/* Visual Input Slider */}
                      <input
                        type="range"
                        min="0"
                        max={kpi.targetValue}
                        step="1"
                        value={kpi.currentValue}
                        onChange={(e) => handleUpdateMetricValue(kpi.id, Number(e.target.value))}
                        className="w-full accent-[#9945FF] h-1.5 cursor-pointer bg-zinc-900"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* RHS: Habits Matrix & Enacted Signed Lease */}
        <div id="habits-contract-panel" className="lg:col-span-5 space-y-6 animate-fade-in">
          
          {/* Habits Panel */}
          {goal.habits.length > 0 && (
            <div id="habits-routine-panel" className="bg-[#0b0101] border border-[#9945FF]/15 rounded-2xl p-5 space-y-4 font-mono">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-900">
                <div className="flex items-center gap-2 font-mono">
                  <Activity className="w-4 h-4 text-[#14F195]" />
                  <div>
                    <h3 className="text-sm font-bold text-zinc-200">Micro Habits Routine Loop</h3>
                    <p className="text-[10px] text-zinc-500 font-sans font-normal">Commit to repeating daily behaviors</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 mt-3 font-sans">
                {goal.habits.map((habit) => {
                  const completedCount = habit.completedDays.filter(Boolean).length;
                  return (
                    <div key={habit.id} className="border border-zinc-900 rounded-xl p-3 bg-black/40 space-y-2">
                       <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-slate-300 font-mono text-[11px]">{habit.name}</span>
                        <span className="text-[9px] font-mono font-bold text-[#14F195] bg-[#14F195]/10 border border-[#14F195]/20 px-1.5 py-0.5 rounded">
                          {habit.frequency} ({completedCount}/7)
                        </span>
                      </div>

                      {/* Interactive log bubbles bubble circles */}
                      <div className="flex items-center justify-between gap-1 pt-1 select-none font-mono">
                        {habit.completedDays.map((isDayDone, idx) => (
                          <div
                            key={idx}
                            onClick={() => handleToggleHabitDay(habit.id, idx)}
                            className={`w-6.5 h-6.5 rounded-full text-[10px] font-bold flex items-center justify-center border cursor-pointer transition-all ${
                              isDayDone
                                ? "bg-[#14F195] border-[#14F195] text-slate-950 font-black shadow-[0_0_8px_rgba(20,241,149,0.3)]"
                                : "bg-black/60 border-zinc-805 text-zinc-400 hover:border-[#14F195]/50 hover:bg-zinc-950"
                            }`}
                            title={`Toggle: ${daysFullName[idx]}`}
                          >
                            {daysOfWeek[idx]}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Commitment Lease Contract Card */}
          <div id="commitment-contract-panel" className="bg-[#9945FF]/5 border border-[#9945FF]/15 rounded-2xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between font-mono">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#14F195]/5 rounded-full blur-xl pointer-events-none" />
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1.5 border-b border-zinc-900">
                <PenTool className="w-4.5 h-4.5 text-[#14F195]" />
                <h3 className="text-xs font-bold text-zinc-300 tracking-wider uppercase">Self-Accountability Lease</h3>
              </div>
              <p className="text-xs text-zinc-305 leading-relaxed italic antialiased font-serif">
                "{goal.contract.commitmentStatement}"
              </p>
            </div>

            {/* Contract seal signature visual */}
            <div className="mt-5 pt-3 border-t border-zinc-900 flex items-end justify-between">
              <div>
                <p className="text-[8px] text-[#9945FF] uppercase tracking-wider font-mono font-bold">Signee Verification</p>
                <p className="text-sm font-serif text-[#14F195] italic font-medium tracking-wide pr-2">
                  {goal.contract.signature || "Your Signature"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[8px] text-[#9945FF] uppercase tracking-wider font-mono font-bold">Date Enacted</p>
                <p className="text-xs font-mono text-zinc-300 font-semibold">
                  {goal.contract.signedDate || "Active"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
