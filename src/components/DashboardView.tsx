import React, { useEffect, useState } from 'react';
import { Pause, Play, RotateCcw, Shield, Timer } from 'lucide-react';
import type { BrowserStats, BrowserTab } from '../types/browser';

interface DashboardViewProps {
  stats: BrowserStats;
  tabs: BrowserTab[];
  focusModeActive: boolean;
  onToggleFocusMode: () => void;
  onCompleteFocusSession: () => void;
  onHibernateAllIdle: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  tabs,
  focusModeActive,
  onToggleFocusMode,
  onCompleteFocusSession,
  onHibernateAllIdle,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);

  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          onCompleteFocusSession();
          return 25 * 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning, onCompleteFocusSession]);

  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const secs = String(secondsLeft % 60).padStart(2, '0');

  const activeRamMb = tabs.reduce((acc, t) => acc + t.memoryMb, 0);
  const sleepingTabsCount = tabs.filter((t) => t.isSleeping).length;
  const maxDayMinutes = Math.max(
    ...stats.dailyLogs.map((d) => d.focusMinutes + d.browsingMinutes),
    1
  );

  const totalFocusMinutes = stats.dailyLogs.reduce((a, b) => a + b.focusMinutes, 0);
  const totalBrowsingMinutes = stats.dailyLogs.reduce((a, b) => a + b.browsingMinutes, 0);
  const focusRatio = Math.round(
    (totalFocusMinutes / Math.max(totalFocusMinutes + totalBrowsingMinutes, 1)) * 100
  );

  return (
    <div className="min-h-full bg-[var(--bg)] text-[var(--fg)] px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--line)] pb-5">
          <div>
            <h1 className="text-2xl font-semibold">Vexora Focus & Browsing Stats</h1>
            <p className="mt-1 text-xs text-[var(--fg2)]">
              Tracked locally across tabs · Hibernation telemetry & Pomodoro focus habits
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onHibernateAllIdle}
              className="rounded-lg border border-[var(--line2)] bg-[var(--panel)] px-3.5 py-2 text-xs font-medium text-[var(--fg)] hover:bg-[var(--hover2)] whitespace-nowrap cursor-pointer"
            >
              Hibernate Idle Tabs
            </button>
            <button
              type="button"
              onClick={onToggleFocusMode}
              className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold text-white whitespace-nowrap cursor-pointer"
              style={{
                background: focusModeActive ? '#16a34a' : 'var(--grad-soft)',
              }}
            >
              <Shield className="w-3.5 h-3.5" />
              {focusModeActive ? 'Distraction Blocker On' : 'Enable Focus Shield'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 border border-[var(--line)] rounded-2xl bg-[var(--panel)] divide-y lg:divide-y-0 lg:divide-x divide-[var(--line)]">
          <div className="p-5">
            <div className="text-xs text-[var(--fg3)]">Deep Work Ratio</div>
            <div className="mt-1 text-2xl font-semibold font-mono tabular-nums vx-grad-text">
              {focusRatio}%
            </div>
            <div className="mt-1 text-xs text-emerald-400 tabular-nums">
              {totalFocusMinutes}m focused this week
            </div>
          </div>
          <div className="p-5">
            <div className="text-xs text-[var(--fg3)]">Active Tab Footprint</div>
            <div className="mt-1 text-2xl font-semibold font-mono tabular-nums">
              {activeRamMb} MB
            </div>
            <div className="mt-1 text-xs text-[var(--fg2)] tabular-nums">
              {sleepingTabsCount} of {tabs.length} tabs hibernated
            </div>
          </div>
          <div className="p-5">
            <div className="text-xs text-[var(--fg3)]">Trackers Blocked</div>
            <div className="mt-1 text-2xl font-semibold font-mono tabular-nums">
              {stats.totalTrackersBlocked}
            </div>
            <div className="mt-1 text-xs text-[var(--fg2)] tabular-nums">
              Across {stats.totalPagesVisited} visited pages
            </div>
          </div>
          <div className="p-5">
            <div className="text-xs text-[var(--fg3)]">Habit Streak</div>
            <div className="mt-1 text-2xl font-semibold font-mono tabular-nums">
              {stats.focusStreakDays} days
            </div>
            <div className="mt-1 text-xs text-[var(--fg2)] tabular-nums">
              {stats.focusSessionsCompleted} Pomodoro sessions
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-5 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Timer className="w-4 h-4 text-[var(--a1)]" />
                  Deep Work Session Timer
                </h2>
                <span className="text-xs text-[var(--fg3)]">25 min block</span>
              </div>
              <div className="my-8 text-center">
                <div className="text-5xl font-semibold font-mono tabular-nums tracking-tight">
                  {mins}:{secs}
                </div>
                <p className="mt-2 text-xs text-[var(--fg2)]">
                  {focusModeActive
                    ? 'Social & distracting domains are automatically paused.'
                    : 'Start timer or enable Focus Shield to block distractions.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTimerRunning((r) => !r)}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold text-white whitespace-nowrap cursor-pointer"
                style={{ background: 'var(--grad-soft)' }}
              >
                {timerRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {timerRunning ? 'Pause Session' : 'Start Focus Block'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTimerRunning(false);
                  setSecondsLeft(25 * 60);
                }}
                title="Reset timer"
                className="rounded-lg border border-[var(--line2)] p-2.5 text-[var(--fg2)] hover:bg-[var(--hover2)] cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
              <h2 className="text-sm font-semibold">Weekly Focus vs. General Browsing</h2>
              <div className="flex items-center gap-4 text-xs text-[var(--fg2)]">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-sm inline-block"
                    style={{ background: 'var(--a2)' }}
                  />
                  Focus (min)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[var(--line2)] inline-block" />
                  General (min)
                </span>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-4 items-end h-44 pt-4">
              {stats.dailyLogs.map((log) => {
                const focusPct = Math.round((log.focusMinutes / maxDayMinutes) * 100);
                const browsePct = Math.round((log.browsingMinutes / maxDayMinutes) * 100);
                return (
                  <div key={log.day} className="flex flex-col items-center h-full justify-end gap-2">
                    <div className="w-full max-w-[52px] flex-1 flex flex-col justify-end gap-1">
                      <div
                        style={{ height: `${Math.max(browsePct, 6)}%` }}
                        className="w-full rounded-t bg-[var(--line2)]"
                        title={`${log.browsingMinutes}m general`}
                      />
                      <div
                        style={{
                          height: `${Math.max(focusPct, 12)}%`,
                          background: 'var(--grad-soft)',
                        }}
                        className="w-full rounded-b"
                        title={`${log.focusMinutes}m focused`}
                      />
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-medium">{log.day}</div>
                      <div className="text-[11px] font-mono tabular-nums text-[var(--fg3)]">
                        {log.focusMinutes}m
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--line)] flex items-center justify-between">
            <h2 className="text-sm font-semibold">Domain Activity & Tracker Ledger</h2>
            <span className="text-xs text-[var(--fg3)]">Sorted by active focus time</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--line)] text-xs text-[var(--fg3)]">
                  <th className="py-3 px-6 font-medium">Domain</th>
                  <th className="py-3 px-4 font-medium">Category</th>
                  <th className="py-3 px-4 font-medium text-right">Visits</th>
                  <th className="py-3 px-4 font-medium text-right">Time Spent</th>
                  <th className="py-3 px-4 font-medium text-right">Trackers Blocked</th>
                  <th className="py-3 px-6 font-medium text-right">Last Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)] text-xs">
                {stats.domainStats.map((row) => (
                  <tr key={row.domain} className="hover:bg-[var(--hover)]">
                    <td className="py-3 px-6 font-mono font-medium">{row.domain}</td>
                    <td className="py-3 px-4 text-[var(--fg2)]">{row.category}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{row.visits}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{row.minutes}m</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-400">
                      {row.trackersBlocked}
                    </td>
                    <td className="py-3 px-6 text-right text-[var(--fg3)]">{row.lastVisitedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
