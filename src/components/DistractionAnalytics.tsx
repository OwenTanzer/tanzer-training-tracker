import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom';
import { calendarDateAtLocalNoon, localSessionDate } from '../../shared/sessionDate';
import {
  createDogEvent,
  deleteDogEvent,
  updateDogEvent,
  useDogEvents,
} from '../data/store';
import {
  distractionLabel,
  reportsForDistraction,
  distractionSeverityRank,
  distractionTimeline,
  observedSeverityLabels,
  summarizeDistractions,
  type DistractionTimelinePoint,
} from '../lib/distractionAnalytics';
import {
  DISTRACTION_SEVERITIES,
  type DistractionSeverity,
  type DistractionTemplate,
  type DogEvent,
  type Location,
  type TrainingReport,
} from '../types';
import { PencilIcon, TrashIcon } from './icons';

const CHART_WIDTH = 680;
const CHART_HEIGHT = 260;
const CHART_MARGIN = { top: 28, right: 18, bottom: 42, left: 82 };
const SEVERITY_COLORS: Record<DistractionSeverity, string> = {
  Absent: '#94a3b8',
  Mild: '#38bdf8',
  Moderate: '#f59e0b',
  Severe: '#ef4444',
};

type DistractionEntry = {
  kind: 'category' | 'detail';
  dogId: string;
  categoryId: string;
  categoryKey?: string;
};

// Browser history cannot remove an entry in the middle of the stack. When a
// detail is closed, skip its dismissed category on later Back/Forward visits.
const dismissedCategoryKeys = new Set<string>();

function displayDate(date: string): string {
  return calendarDateAtLocalNoon(date).toLocaleDateString();
}

function DistractionTimelineChart({
  points,
  events,
}: {
  points: DistractionTimelinePoint[];
  events: DogEvent[];
}) {
  const allDates = [...points.map((point) => point.date), ...events.map((event) => event.eventDate)];
  if (points.length === 0) return null;

  const dateValues = allDates.map((date) => calendarDateAtLocalNoon(date).getTime());
  const minDate = Math.min(...dateValues);
  const maxDate = Math.max(...dateValues);
  const plotWidth = CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right;
  const plotHeight = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom;
  const x = (date: string) => {
    if (minDate === maxDate) return CHART_MARGIN.left + plotWidth / 2;
    return (
      CHART_MARGIN.left +
      ((calendarDateAtLocalNoon(date).getTime() - minDate) / (maxDate - minDate)) * plotWidth
    );
  };
  const y = (severity: DistractionSeverity) =>
    CHART_MARGIN.top + ((3 - distractionSeverityRank(severity)) / 3) * plotHeight;
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.date)} ${y(point.severity)}`)
    .join(' ');

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 p-2 dark:border-gray-700">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="min-w-[600px] w-full"
        role="img"
        aria-label="Selected distraction severity over time with contextual dog events"
      >
        {DISTRACTION_SEVERITIES.map((severity) => {
          const lineY = y(severity);
          return (
            <g key={severity}>
              <line
                x1={CHART_MARGIN.left}
                x2={CHART_WIDTH - CHART_MARGIN.right}
                y1={lineY}
                y2={lineY}
                stroke="currentColor"
                className="text-gray-200 dark:text-gray-700"
              />
              <text
                x={CHART_MARGIN.left - 10}
                y={lineY + 4}
                textAnchor="end"
                className="fill-gray-500 text-[11px]"
              >
                {severity}
              </text>
            </g>
          );
        })}
        {events.map((event, index) => {
          const eventX = x(event.eventDate);
          const labelY = CHART_MARGIN.top + 10 + (index % 3) * 13;
          return (
            <g key={event.id}>
              <line
                x1={eventX}
                x2={eventX}
                y1={CHART_MARGIN.top}
                y2={CHART_HEIGHT - CHART_MARGIN.bottom}
                stroke="#8b5cf6"
                strokeDasharray="4 3"
              />
              <text x={eventX + 3} y={labelY} className="fill-violet-600 text-[10px]">
                {event.label.length > 22 ? `${event.label.slice(0, 19)}...` : event.label}
              </text>
            </g>
          );
        })}
        <path d={path} fill="none" stroke="#0284c7" strokeWidth="2.5" />
        {points.map((point, index) => (
          <circle
            key={`${point.reportId}-${point.date}-${index}`}
            cx={x(point.date)}
            cy={y(point.severity)}
            r="4.5"
            fill={SEVERITY_COLORS[point.severity]}
            stroke="white"
            strokeWidth="1.5"
          >
            <title>{`${displayDate(point.date)}: ${point.severity}`}</title>
          </circle>
        ))}
        <text
          x={CHART_MARGIN.left}
          y={CHART_HEIGHT - 12}
          textAnchor="start"
          className="fill-gray-500 text-[10px]"
        >
          {displayDate(allDates[dateValues.indexOf(minDate)])}
        </text>
        <text
          x={CHART_WIDTH - CHART_MARGIN.right}
          y={CHART_HEIGHT - 12}
          textAnchor="end"
          className="fill-gray-500 text-[10px]"
        >
          {displayDate(allDates[dateValues.indexOf(maxDate)])}
        </text>
      </svg>
    </div>
  );
}

export function DistractionAnalytics({
  dogId,
  reports,
  templates,
  locations,
  renderReport,
  onLeaveDetails,
}: {
  dogId: string;
  reports: TrainingReport[];
  templates: DistractionTemplate[];
  locations: Location[];
  renderReport: (report: TrainingReport) => ReactNode;
  onLeaveDetails: () => void;
}) {
  const events = useDogEvents(dogId);
  const dogReports = useMemo(() => reports.filter((report) => report.dogId === dogId), [reports, dogId]);
  const summaries = useMemo(() => summarizeDistractions(dogReports), [dogReports]);
  const summaryRows = summaries.map((summary) => ({
    ...summary,
    title: distractionLabel(templates, summary.distractionId),
  }));
  const [selectedId, setSelectedId] = useState('');
  const effectiveSelectedId = summaryRows.some((summary) => summary.distractionId === selectedId)
    ? selectedId
    : (summaryRows[0]?.distractionId ?? '');
  const points = useMemo(
    () => distractionTimeline(dogReports, effectiveSelectedId),
    [effectiveSelectedId, dogReports],
  );
  // URL state gives browser/phone Back the same list → summary behavior as
  // the visible controls, without changing the application's routes or store.
  const [searchParams, setSearchParams] = useSearchParams();
  const routeLocation = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const entry = (routeLocation.state as { distractionEntry?: DistractionEntry } | null)?.distractionEntry;
  const categoryId = searchParams.get('distraction');
  const reportId = searchParams.get('distractionLog');
  const historyIndex = window.history.state?.idx as number | undefined;
  const previousHistoryIndex = useRef(historyIndex);
  useEffect(() => {
    const previous = previousHistoryIndex.current;
    previousHistoryIndex.current = historyIndex;
    if (categoryId !== null && navigationType === 'POP' && dismissedCategoryKeys.has(routeLocation.key)) {
      navigate(typeof previous === 'number' && typeof historyIndex === 'number' && historyIndex > previous ? 1 : -1);
    }
  }, [categoryId, historyIndex, routeLocation.key, navigate, navigationType]);
  const matchingReports = useMemo(
    () => categoryId === null ? [] : reportsForDistraction(dogReports, dogId, categoryId),
    [dogReports, dogId, categoryId],
  );
  const detailReport = matchingReports.find((report) => report.id === reportId);
  const detailVisible = categoryId !== null && detailReport !== undefined;
  const previousDetail = useRef({ dogId, categoryId, reportId, detailVisible });
  useEffect(() => {
    const previous = previousDetail.current;
    if (previous.reportId && (
      previous.reportId !== reportId || previous.categoryId !== categoryId ||
      previous.dogId !== dogId || (previous.detailVisible && !detailVisible)
    )) {
      onLeaveDetails();
    }
    previousDetail.current = { dogId, categoryId, reportId, detailVisible };
  }, [dogId, categoryId, reportId, detailVisible, onLeaveDetails]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (categoryId !== null && !dismissedCategoryKeys.has(routeLocation.key)) {
      if (!dialog?.open) dialog?.showModal();
      if (dialog) dialog.scrollTop = 0;
      headingRef.current?.focus();
    } else if (dialog?.open) {
      dialog.close();
    }
  }, [categoryId, reportId, routeLocation.key]);

  function openCategory(id: string) {
    onLeaveDetails();
    setSelectedId(id);
    const next = new URLSearchParams(searchParams);
    next.set('distraction', id);
    next.delete('distractionLog');
    setSearchParams(next, { state: { distractionEntry: { kind: 'category', dogId, categoryId: id } satisfies DistractionEntry } });
  }

  function closeLogs() {
    onLeaveDetails();
    if (entry?.kind === 'category' && entry.dogId === dogId && entry.categoryId === categoryId) {
      dismissedCategoryKeys.add(routeLocation.key);
    }
    if (reportId && entry?.kind === 'detail' && entry.dogId === dogId && entry.categoryId === categoryId && entry.categoryKey) {
      dismissedCategoryKeys.add(entry.categoryKey);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('distraction');
    next.delete('distractionLog');
    setSearchParams(next, { replace: true, state: null });
  }

  function backToMatches() {
    onLeaveDetails();
    if (entry?.kind === 'detail' && entry.dogId === dogId && entry.categoryId === categoryId && entry.categoryKey && !dismissedCategoryKeys.has(entry.categoryKey)) {
      navigate(-1);
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete('distractionLog');
    setSearchParams(next, { replace: true, state: null });
  }

  const [newEventDate, setNewEventDate] = useState(localSessionDate);
  const [newEventLabel, setNewEventLabel] = useState('');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingEventDate, setEditingEventDate] = useState('');
  const [editingEventLabel, setEditingEventLabel] = useState('');

  function handleAddEvent(e: React.FormEvent) {
    e.preventDefault();
    if (createDogEvent(dogId, newEventDate, newEventLabel)) {
      setNewEventLabel('');
    }
  }

  function beginEdit(event: DogEvent) {
    setEditingEventId(event.id);
    setEditingEventDate(event.eventDate);
    setEditingEventLabel(event.label);
  }

  function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingEventId) return;
    if (updateDogEvent(editingEventId, editingEventDate, editingEventLabel)) {
      setEditingEventId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
          Distraction trends
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          Summaries use an observed ordinal distribution and median category, never a decimal
          average. Only explicitly logged observations appear; missing categories are not treated
          as Absent.
        </p>
      </div>

      {summaryRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-400 dark:border-gray-700">
          No distraction observations have been logged for this dog yet.
        </p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {summaryRows.map((summary) => (
              <button
                key={summary.distractionId}
                type="button"
                onClick={() => openCategory(summary.distractionId)}
                aria-haspopup="dialog"
                className={`rounded-xl border p-3 text-left ${
                  effectiveSelectedId === summary.distractionId
                    ? 'border-sky-400 bg-sky-50 dark:bg-sky-950/30'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {summary.title}
                </span>
                <span className="mt-1 block text-sm text-sky-600 dark:text-sky-400">View matching logs →</span>
                <span className="mt-1 block text-xs text-gray-500">
                  Median observed response: {summary.medianSeverity} - {summary.observations}{' '}
                  {summary.observations === 1 ? 'observation' : 'observations'}
                </span>
                <span className="mt-1 block text-xs text-gray-400">
                  {observedSeverityLabels(summary.distribution)}
                </span>
                <span className="mt-2 flex h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  {DISTRACTION_SEVERITIES.map((severity) => {
                    const count = summary.distribution[severity];
                    return count > 0 ? (
                      <span
                        key={severity}
                        title={`${severity}: ${count}`}
                        style={{
                          width: `${(count / summary.observations) * 100}%`,
                          backgroundColor: SEVERITY_COLORS[severity],
                        }}
                      />
                    ) : null;
                  })}
                </span>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
              Timeline category
              <select
                value={effectiveSelectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm normal-case tracking-normal text-gray-900 dark:border-gray-600 dark:text-gray-100"
              >
                {summaryRows.map((summary) => (
                  <option key={summary.distractionId} value={summary.distractionId}>
                    {summary.title}
                  </option>
                ))}
              </select>
            </label>
            <DistractionTimelineChart points={points} events={events} />
          </div>
        </>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby="distraction-logs-heading"
        onCancel={(event) => { event.preventDefault(); closeLogs(); }}
        className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl border border-gray-200 bg-white p-4 text-gray-900 shadow-xl backdrop:bg-black/50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={reportId ? backToMatches : closeLogs}
              className="min-h-11 rounded-md px-3 py-2 text-sm font-medium text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-gray-800">
              {reportId ? '← Back to matching logs' : '← Back to summary'}
            </button>
            <button type="button" onClick={closeLogs}
              className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600">Close</button>
          </div>
          <div>
            <h2 id="distraction-logs-heading" ref={headingRef} tabIndex={-1} className="break-words text-lg font-semibold">
              {categoryId !== null ? distractionLabel(templates, categoryId) : 'Distraction logs'}
            </h2>
            <p className="text-sm text-gray-500">{matchingReports.length} matching {matchingReports.length === 1 ? 'log' : 'logs'} · Newest first</p>
          </div>
          {reportId ? (
            detailReport ? <ul className="space-y-2 break-words">{renderReport(detailReport)}</ul> :
              <p role="status">This log is no longer available in this category. Return to matching logs to see current results.</p>
          ) : matchingReports.length === 0 ? (
            <p role="status" className="rounded-lg border border-dashed border-gray-300 p-4 text-sm dark:border-gray-600">
              No training logs for this dog record this category. Unlogged categories are not counted as Absent. Return to the summary to choose another category.
            </p>
          ) : (
            <ul className="space-y-3">
              {matchingReports.map((report) => {
                const location = locations.find((item) => item.id === report.locationId);
                return <li key={report.id} className="space-y-2 break-words rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <p className="font-medium"><time dateTime={report.sessionDate}>{displayDate(report.sessionDate)}</time> · {report.phase}</p>
                  <p className="text-sm">Recorded severity: {report.distractions.filter((item) => item.distractionId === categoryId).map((item) => item.severity).join(', ')}</p>
                  {location && <p className="text-sm text-gray-500">Location: {location.name}</p>}
                  {report.redFlag && <p className="text-sm text-red-500">🚩 Red flagged</p>}
                  <p className="whitespace-pre-wrap text-sm">{report.notes || 'No session notes recorded.'}</p>
                  <button type="button" onClick={() => {
                    onLeaveDetails();
                    const next = new URLSearchParams(searchParams);
                    next.set('distractionLog', report.id);
                    setSearchParams(next, { state: { distractionEntry: { kind: 'detail', dogId, categoryId: categoryId!, categoryKey: entry?.kind === 'category' && entry.dogId === dogId && entry.categoryId === categoryId ? routeLocation.key : undefined } satisfies DistractionEntry } });
                  }} className="min-h-11 rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700">
                    Open full log details
                  </button>
                </li>;
              })}
            </ul>
          )}
        </div>
      </dialog>

      <div className="space-y-2 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
        <div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Contextual dog events
          </h3>
          <p className="text-xs text-gray-500">
            Add dated context such as surgery, medication changes, or foster-home visits.
          </p>
        </div>
        <form onSubmit={handleAddEvent} className="flex flex-wrap gap-2">
          <input
            type="date"
            required
            value={newEventDate}
            onChange={(e) => setNewEventDate(e.target.value)}
            className="rounded-md border border-gray-300 bg-transparent px-2 py-1.5 text-sm dark:border-gray-600"
          />
          <input
            required
            value={newEventLabel}
            onChange={(e) => setNewEventLabel(e.target.value)}
            placeholder="Event label"
            className="min-w-[180px] flex-1 rounded-md border border-gray-300 bg-transparent px-3 py-1.5 text-sm dark:border-gray-600"
          />
          <button
            type="submit"
            className="rounded-md bg-violet-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-600"
          >
            Add event
          </button>
        </form>
        <ul className="space-y-1">
          {events.map((event) => (
            <li key={event.id}>
              {editingEventId === event.id ? (
                <form onSubmit={saveEdit} className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    required
                    value={editingEventDate}
                    onChange={(e) => setEditingEventDate(e.target.value)}
                    className="rounded-md border border-gray-300 bg-transparent px-2 py-1 text-sm dark:border-gray-600"
                  />
                  <input
                    required
                    value={editingEventLabel}
                    onChange={(e) => setEditingEventLabel(e.target.value)}
                    className="min-w-[160px] flex-1 rounded-md border border-gray-300 bg-transparent px-2 py-1 text-sm dark:border-gray-600"
                  />
                  <button type="submit" className="text-sm text-sky-500 hover:underline">
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingEventId(null)}
                    className="text-sm text-gray-400 hover:underline"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2 py-1.5 text-sm dark:bg-gray-800/60">
                  <span>
                    <span className="font-medium">{event.label}</span>{' '}
                    <span className="text-xs text-gray-500">{displayDate(event.eventDate)}</span>
                  </span>
                  <span className="flex gap-1">
                    <button
                      type="button"
                      title="Edit event"
                      onClick={() => beginEdit(event)}
                      className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      title="Delete event"
                      onClick={() => {
                        if (window.confirm(`Delete "${event.label}"?`)) deleteDogEvent(event.id);
                      }}
                      className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                    >
                      <TrashIcon />
                    </button>
                  </span>
                </div>
              )}
            </li>
          ))}
          {events.length === 0 && (
            <li className="text-xs text-gray-400">No contextual events added yet.</li>
          )}
        </ul>
      </div>
    </section>
  );
}
