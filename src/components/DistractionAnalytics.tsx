import { useMemo, useState } from 'react';
import { calendarDateAtLocalNoon, localSessionDate } from '../../shared/sessionDate';
import {
  createDogEvent,
  deleteDogEvent,
  updateDogEvent,
  useDogEvents,
} from '../data/store';
import {
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
}: {
  dogId: string;
  reports: TrainingReport[];
  templates: DistractionTemplate[];
}) {
  const events = useDogEvents(dogId);
  const summaries = useMemo(() => summarizeDistractions(reports), [reports]);
  const summaryRows = summaries.map((summary) => ({
    ...summary,
    title:
      templates.find((template) => template.id === summary.distractionId)?.title ??
      'Unknown distraction',
  }));
  const [selectedId, setSelectedId] = useState('');
  const effectiveSelectedId = summaryRows.some((summary) => summary.distractionId === selectedId)
    ? selectedId
    : (summaryRows[0]?.distractionId ?? '');
  const points = useMemo(
    () => distractionTimeline(reports, effectiveSelectedId),
    [effectiveSelectedId, reports],
  );
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
                onClick={() => setSelectedId(summary.distractionId)}
                className={`rounded-xl border p-3 text-left ${
                  effectiveSelectedId === summary.distractionId
                    ? 'border-sky-400 bg-sky-50 dark:bg-sky-950/30'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {summary.title}
                </span>
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
