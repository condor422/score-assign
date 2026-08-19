import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { ApiError, api } from '../../lib/api';
import { HelpTip } from '../../components/HelpTip';
import type { Instrument } from '../../lib/types';

interface RowProps {
  instrument: Instrument;
  onRename(name: string): void;
  onToggleActive(active: boolean): void;
  busy: boolean;
}

function InstrumentRow({ instrument, onRename, onToggleActive, busy }: RowProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: instrument.id,
  });
  const [name, setName] = useState(instrument.name);
  const dirty = name.trim() !== instrument.name;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(
        'flex flex-wrap items-center gap-3 rounded-md border bg-white px-3 py-2',
        isDragging ? 'border-maroon-700 shadow-brand' : 'border-maroon-100',
        instrument.active === false && 'opacity-60',
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded px-1 text-gold-700 hover:bg-gold-100"
        aria-label={`Reorder ${instrument.name}`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <input
        className="input max-w-xs"
        aria-label={`Name for ${instrument.name}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      {instrument.active === false ? <span className="badge-brand">Retired</span> : null}
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={!dirty || busy}
          onClick={() => onRename(name.trim())}
        >
          Save name
        </button>
        <button
          type="button"
          className={instrument.active === false ? 'btn-secondary' : 'btn-danger'}
          disabled={busy}
          onClick={() => onToggleActive(instrument.active === false)}
        >
          {instrument.active === false ? 'Restore' : 'Retire'}
        </button>
      </div>
    </li>
  );
}

/** Per-tenant instrumentation: add, rename, reorder and retire. */
export function InstrumentsTab(): JSX.Element {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const instruments = useQuery({
    queryKey: ['instruments', 'all'],
    queryFn: () => api<Instrument[]>('/instruments?includeInactive=true'),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['instruments'] });
  };
  const fail = (caught: unknown, fallback: string): void =>
    setError(caught instanceof ApiError ? caught.message : fallback);

  const add = useMutation({
    mutationFn: () => api('/instruments', { method: 'POST', body: { name: newName.trim() } }),
    onSuccess: () => {
      setNewName('');
      setError(null);
      invalidate();
    },
    onError: (caught) => fail(caught, 'Could not add that instrument'),
  });

  const update = useMutation({
    mutationFn: (input: { id: string; name?: string; active?: boolean }) =>
      api(`/instruments/${input.id}`, {
        method: 'PATCH',
        body: input.name !== undefined ? { name: input.name } : { active: input.active },
      }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (caught) => fail(caught, 'Could not update that instrument'),
  });

  const reorder = useMutation({
    mutationFn: (instrumentIds: string[]) =>
      api('/instruments/reorder', { method: 'POST', body: { instrumentIds } }),
    onSuccess: invalidate,
    onError: (caught) => fail(caught, 'Could not save that order'),
  });

  function handleDragEnd(event: DragEndEvent): void {
    const list = instruments.data ?? [];
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = list.map((i) => i.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    reorder.mutate(arrayMove(ids, from, to));
  }

  const busy = update.isPending || reorder.isPending;
  const list = instruments.data ?? [];

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <form
        className="card flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          add.mutate();
        }}
      >
        <div className="flex-1">
          <label className="label" htmlFor="instrument-name">
            Add an instrument
            <HelpTip topic="instrumentRetire" />
          </label>
          <input
            id="instrument-name"
            className="input"
            placeholder="Contra-alto flute"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            required
          />
          <p className="hint">
            This list drives the intake form, part entry and every instrument picker.
          </p>
        </div>
        <button className="btn-primary" type="submit" disabled={add.isPending || !newName.trim()}>
          Add
        </button>
      </form>

      <div className="card space-y-3">
        <p className="hint">
          Drag to change the order players and parts are listed in. Retiring keeps history intact.
        </p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={list.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {list.map((instrument) => (
                <InstrumentRow
                  key={instrument.id}
                  instrument={instrument}
                  busy={busy}
                  onRename={(name) => update.mutate({ id: instrument.id, name })}
                  onToggleActive={(active) => update.mutate({ id: instrument.id, active })}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        {list.length === 0 ? <p className="hint">No instruments yet.</p> : null}
      </div>
    </div>
  );
}
