import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ApiError, api } from '../lib/api';
import { useSession } from '../auth/SessionContext';
import type { Board, BoardAssignment, BoardPart, RunStats, RunWarning, Season } from '../lib/types';

const POOL_ID = 'pool';

interface DragData {
  assignmentId: string | null;
  musicianId: string;
  musicianName: string;
}

function MusicianChip({
  label,
  dragId,
  data,
  locked,
  confirmation,
  readOnly,
}: {
  label: string;
  dragId: string;
  data: DragData;
  locked?: boolean;
  confirmation?: BoardAssignment['confirmation'];
  readOnly: boolean;
}): JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    data,
    disabled: readOnly,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={clsx(
        'flex touch-none items-center gap-2 rounded-md border px-2 py-1.5 text-sm',
        readOnly ? 'cursor-default' : 'cursor-grab',
        isDragging ? 'opacity-30' : 'bg-white',
        locked ? 'border-amber-400' : 'border-slate-300',
      )}
    >
      <span className="flex-1 truncate">{label}</span>
      {locked ? <span title="Locked">🔒</span> : null}
      {confirmation === 'accepted' ? <span title="Confirmed">✓</span> : null}
      {confirmation === 'declined' ? <span title="Declined">✕</span> : null}
    </div>
  );
}

function PartColumn({
  part,
  onLock,
  onRemove,
  readOnly,
}: {
  part: BoardPart;
  onLock(assignment: BoardAssignment): void;
  onRemove(assignment: BoardAssignment): void;
  readOnly: boolean;
}): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: part.id, disabled: readOnly });
  const short = part.assignments.length < part.minPlayers;

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'w-64 shrink-0 rounded-lg border p-3',
        isOver ? 'border-ink bg-slate-50' : 'border-slate-200 bg-white',
      )}
    >
      <div className="mb-2">
        <p className="text-sm font-semibold">
          {part.instrumentName} {part.partLabel}
        </p>
        <p className="hint">{part.songTitle}</p>
        <p className="mt-1 flex items-center gap-2">
          <span className="badge bg-slate-100 text-slate-700">{part.difficulty}</span>
          <span
            className={clsx(
              'badge',
              short ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800',
            )}
          >
            {part.assignments.length}/{part.maxPlayers}
          </span>
        </p>
      </div>
      <div className="space-y-2">
        {part.assignments.map((assignment) => (
          <div key={assignment.id} className="group">
            <MusicianChip
              dragId={assignment.id}
              label={assignment.musicianName}
              locked={assignment.locked}
              confirmation={assignment.confirmation}
              readOnly={readOnly}
              data={{
                assignmentId: assignment.id,
                musicianId: assignment.musicianId,
                musicianName: assignment.musicianName,
              }}
            />
            {readOnly ? null : (
              <div className="mt-0.5 hidden gap-2 px-1 text-xs text-slate-500 group-hover:flex">
                <button type="button" className="underline" onClick={() => onLock(assignment)}>
                  {assignment.locked ? 'Unlock' : 'Lock'}
                </button>
                <button type="button" className="underline" onClick={() => onRemove(assignment)}>
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
        {part.assignments.length === 0 ? (
          <p className="rounded border border-dashed border-slate-300 px-2 py-3 text-center text-xs text-slate-400">
            {readOnly ? 'Nobody assigned' : 'Drop a musician here'}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Pool({ board, readOnly }: { board: Board; readOnly: boolean }): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: POOL_ID, disabled: readOnly });

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'w-64 shrink-0 rounded-lg border p-3',
        isOver ? 'border-ink bg-slate-50' : 'border-slate-200 bg-slate-100',
      )}
    >
      <p className="mb-2 text-sm font-semibold">Unassigned ({board.unassigned.length})</p>
      <div className="space-y-2">
        {board.unassigned.map((musician) => (
          <MusicianChip
            key={musician.id}
            dragId={`pool-${musician.id}`}
            label={musician.name}
            readOnly={readOnly}
            data={{ assignmentId: null, musicianId: musician.id, musicianName: musician.name }}
          />
        ))}
        {board.unassigned.length === 0 ? <p className="hint">Everyone has a part.</p> : null}
      </div>
    </div>
  );
}

export function AssignmentBoardPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { can } = useSession();
  const canEdit = can('assignment.write');
  const [dragging, setDragging] = useState<DragData | null>(null);
  const [notice, setNotice] = useState<{ tone: 'warn' | 'info' | 'error'; text: string } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const seasons = useQuery({ queryKey: ['seasons'], queryFn: () => api<Season[]>('/seasons') });
  const seasonId = seasons.data?.[0]?.id ?? null;

  const board = useQuery({
    queryKey: ['board', seasonId],
    queryFn: () => api<Board>(`/seasons/${seasonId}/board`),
    enabled: Boolean(seasonId),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['board', seasonId] });
  };

  const describe = (warnings: RunWarning[]): void => {
    setNotice(
      warnings.length > 0
        ? { tone: 'warn', text: warnings.map((w) => w.message).join(' · ') }
        : null,
    );
  };

  const run = useMutation({
    mutationFn: () =>
      api<{ runId: string; stats: RunStats; warnings: RunWarning[] }>(`/seasons/${seasonId}/runs`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: (result) => {
      invalidate();
      setNotice(
        result.warnings.length > 0
          ? { tone: 'warn', text: `${result.warnings.length} warning(s) — see below.` }
          : { tone: 'info', text: 'Every part is filled.' },
      );
    },
    onError: (error) =>
      setNotice({ tone: 'error', text: error instanceof ApiError ? error.message : 'Run failed' }),
  });

  const move = useMutation({
    mutationFn: (input: { assignmentId: string; partId: string; musicianId: string }) =>
      api<{ warnings: RunWarning[] }>(`/assignments/${input.assignmentId}`, {
        method: 'PATCH',
        body: { partId: input.partId, musicianId: input.musicianId },
      }),
    onSuccess: (result) => {
      invalidate();
      describe(result.warnings);
    },
    onError: (error) =>
      setNotice({ tone: 'error', text: error instanceof ApiError ? error.message : 'Move failed' }),
  });

  const place = useMutation({
    mutationFn: (input: { partId: string; musicianId: string }) =>
      api<{ warnings: RunWarning[] }>(`/seasons/${seasonId}/assignments`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: (result) => {
      invalidate();
      describe(result.warnings);
    },
    onError: (error) =>
      setNotice({ tone: 'error', text: error instanceof ApiError ? error.message : 'Could not place' }),
  });

  const remove = useMutation({
    mutationFn: (assignmentId: string) => api(`/assignments/${assignmentId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const lock = useMutation({
    mutationFn: (input: { assignmentId: string; locked: boolean }) =>
      api(`/assignments/${input.assignmentId}/lock`, {
        method: 'POST',
        body: { locked: input.locked },
      }),
    onSuccess: invalidate,
  });

  const notify = useMutation({
    mutationFn: () => api<{ notified: number }>(`/seasons/${seasonId}/notify`, { method: 'POST' }),
    onSuccess: (result) =>
      setNotice({ tone: 'info', text: `Emailed ${result.notified} musician(s) their parts.` }),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, BoardPart[]>();
    for (const part of board.data?.parts ?? []) {
      const bucket = map.get(part.songTitle) ?? [];
      bucket.push(part);
      map.set(part.songTitle, bucket);
    }
    return [...map.entries()];
  }, [board.data]);

  function handleDragStart(event: DragStartEvent): void {
    setDragging((event.active.data.current as DragData | undefined) ?? null);
  }

  function handleDragEnd(event: DragEndEvent): void {
    setDragging(null);
    const data = event.active.data.current as DragData | undefined;
    const target = event.over?.id ? String(event.over.id) : null;
    if (!data || !target) return;

    if (target === POOL_ID) {
      if (data.assignmentId) remove.mutate(data.assignmentId);
      return;
    }
    if (data.assignmentId) {
      move.mutate({ assignmentId: data.assignmentId, partId: target, musicianId: data.musicianId });
    } else {
      place.mutate({ partId: target, musicianId: data.musicianId });
    }
  }

  if (!seasonId) return <p className="hint">Loading season…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Assignments</h1>
          <p className="hint">
            {canEdit
              ? 'Nothing is assigned until you run it. Drag a card to move a musician; locked cards survive a re-run.'
              : 'A read-only view of who is playing what.'}
          </p>
        </div>
        <div className="flex gap-2">
          {can('assignment.run') ? (
            <button
              className="btn-primary"
              type="button"
              disabled={run.isPending}
              onClick={() => run.mutate()}
            >
              {run.isPending ? 'Assigning…' : 'Assign parts now'}
            </button>
          ) : null}
          {can('assignment.notify') ? (
            <button
              className="btn-secondary"
              type="button"
              disabled={notify.isPending}
              onClick={() => notify.mutate()}
            >
              Email parts
            </button>
          ) : null}
        </div>
      </div>

      {notice ? (
        <div
          className={clsx(
            'rounded-md border px-4 py-2 text-sm',
            notice.tone === 'error' && 'border-red-300 bg-red-50 text-red-800',
            notice.tone === 'warn' && 'border-amber-300 bg-amber-50 text-amber-900',
            notice.tone === 'info' && 'border-slate-300 bg-white text-slate-700',
          )}
        >
          {notice.text}
        </div>
      ) : null}

      {board.data?.lastRun ? (
        <div className="card">
          <p className="text-sm font-semibold">Last run</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
            <div>
              <dt className="hint">Parts filled</dt>
              <dd>
                {board.data.lastRun.stats.partsFilled}/{board.data.lastRun.stats.partsTotal}
              </dd>
            </div>
            <div>
              <dt className="hint">Musicians placed</dt>
              <dd>
                {board.data.lastRun.stats.musiciansAssigned}/{board.data.lastRun.stats.musiciansConsidered}
              </dd>
            </div>
            <div>
              <dt className="hint">Parts per musician</dt>
              <dd>
                {board.data.lastRun.stats.minAssignmentsPerMusician}–
                {board.data.lastRun.stats.maxAssignmentsPerMusician} (avg{' '}
                {board.data.lastRun.stats.avgAssignmentsPerMusician})
              </dd>
            </div>
            <div>
              <dt className="hint">Got first choice</dt>
              <dd>{board.data.lastRun.stats.topPreferenceSatisfiedPct}%</dd>
            </div>
          </dl>
          {board.data.lastRun.warnings.length > 0 ? (
            <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm text-amber-800">
              {board.data.lastRun.warnings.map((warning, index) => (
                <li key={`${warning.code}-${index}`}>{warning.message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {board.data ? (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            <Pool board={board.data} readOnly={!canEdit} />
            {grouped.map(([songTitle, parts]) => (
              <div key={songTitle} className="flex gap-4">
                {parts.map((part) => (
                  <PartColumn
                    key={part.id}
                    part={part}
                    onLock={(assignment) =>
                      lock.mutate({ assignmentId: assignment.id, locked: !assignment.locked })
                    }
                    onRemove={(assignment) => remove.mutate(assignment.id)}
                    readOnly={!canEdit}
                  />
                ))}
              </div>
            ))}
            {board.data.parts.length === 0 ? (
              <p className="hint self-center">Add songs and parts first.</p>
            ) : null}
          </div>
          <DragOverlay>
            {dragging ? (
              <div className="rounded-md border border-ink bg-white px-2 py-1.5 text-sm shadow-lg">
                {dragging.musicianName}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : null}
    </div>
  );
}
