/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface GoalSmart {
  specific: string;
  measurable: string;
  achievable: string;
  relevant: string;
  timebound: string;
}

export interface GoalMilestone {
  id: string;
  text: string;
  completed: boolean;
  date?: string;
}

export interface GoalHabit {
  id: string;
  name: string;
  frequency: string; // e.g., "Daily", "3x/week"
  completedDays: boolean[]; // Array representing 7 days [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
}

export interface GoalMetric {
  id: string;
  name: string;
  targetValue: number;
  currentValue: number;
  unit: string;
}

export interface GoalContract {
  signature: string;
  signedDate: string;
  commitmentStatement: string;
}

export interface Goal {
  id: string;
  title: string;
  category: string;
  timeframe: string;
  difficulty: "Easy" | "Medium" | "Hard" | string;
  description: string; // Core summary, kept under 2,000 characters
  smart: GoalSmart;
  milestones: GoalMilestone[];
  habits: GoalHabit[];
  metrics: GoalMetric[];
  contract: GoalContract;
  createdAt: string;
  requestId?: string;
  modelProvider?: string;
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  content: string; // Extracted text or Base64 data depending on mimeType
  charCount: number; // Contribution of character count to budget limit
}
