import { useEffect, useId, useRef, useState } from 'react';
import { helpText, type HelpTopic } from '../lib/help';

/**
 * Inline help for controls whose meaning is not obvious from their label.
 * Opens on hover and on focus or click, so it works with a keyboard and on
 * touch, and closes on Escape or an outside click.
 */
export function HelpTip({ topic }: { topic: HelpTopic }): JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onClick = (event: MouseEvent): void => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <span
      className="relative inline-flex"
      ref={wrapper}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`Help: ${helpText[topic].title}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        className="grid h-4 w-4 place-items-center rounded-full border border-gold-700 text-[10px] font-bold leading-none text-gold-800 hover:bg-gold-100 focus:outline-none focus:ring-2 focus:ring-maroon-700"
        onClick={() => setOpen((prev) => !prev)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-6 z-20 w-64 -translate-x-1/2 rounded-md bg-maroon-900 px-3 py-2 text-xs font-normal normal-case leading-relaxed text-gold-50 shadow-brand"
        >
          <span className="block font-semibold text-gold-400">{helpText[topic].title}</span>
          {helpText[topic].body}
        </span>
      ) : null}
    </span>
  );
}
