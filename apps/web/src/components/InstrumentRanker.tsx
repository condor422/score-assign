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
import type { Instrument } from '../lib/types';

interface Props {
  instruments: Instrument[];
  /** Chosen instrument ids, most preferred first. */
  value: string[];
  onChange(next: string[]): void;
}

function Row({ instrument, rank }: { instrument: Instrument; rank: number }): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: instrument.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(
        'flex items-center gap-3 rounded-md border bg-white px-3 py-2',
        isDragging ? 'border-ink shadow-md' : 'border-slate-300',
      )}
    >
      <span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-xs font-semibold text-white">
        {rank}
      </span>
      <span className="flex-1 text-sm">{instrument.name}</span>
      {/* The whole row is not draggable so the remove button stays clickable. */}
      <button
        type="button"
        className="cursor-grab touch-none rounded px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        aria-label={`Reorder ${instrument.name}`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
    </li>
  );
}

/**
 * Drag-to-rank instrument picker: musicians tick the instruments they are
 * willing to play, then order them so the top row is their first choice.
 */
export function InstrumentRanker({ instruments, value, onChange }: Props): JSX.Element {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const byId = new Map(instruments.map((i) => [i.id, i]));
  const chosen = value.map((id) => byId.get(id)).filter((i): i is Instrument => Boolean(i));
  const available = instruments.filter((i) => !value.includes(i.id));

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = value.indexOf(String(active.id));
    const to = value.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onChange(arrayMove(value, from, to));
  }

  return (
    <div className="space-y-3">
      {available.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {available.map((instrument) => (
            <button
              key={instrument.id}
              type="button"
              className="btn-secondary"
              onClick={() => onChange([...value, instrument.id])}
            >
              + {instrument.name}
            </button>
          ))}
        </div>
      ) : null}

      {chosen.length === 0 ? (
        <p className="hint">Add each instrument you are willing to play.</p>
      ) : (
        <>
          <p className="hint">
            Drag to order these — the top instrument is your first choice. Use the handle, or focus it and
            press the arrow keys.
          </p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={value} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2">
                {chosen.map((instrument, index) => (
                  <Row key={instrument.id} instrument={instrument} rank={index + 1} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          <div className="flex flex-wrap gap-2">
            {chosen.map((instrument) => (
              <button
                key={instrument.id}
                type="button"
                className="text-xs text-slate-500 underline"
                onClick={() => onChange(value.filter((id) => id !== instrument.id))}
              >
                Remove {instrument.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
