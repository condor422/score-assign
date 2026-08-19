import clsx from 'clsx';

/**
 * The logo is a gold mark on maroon, so it is never placed on a light surface
 * without its own dark plate. `variant="lockup"` includes the wordmark and is
 * for sign-in and public pages; `variant="mark"` is the compact header badge.
 */
export function BrandMark({
  variant = 'mark',
  className,
}: {
  variant?: 'mark' | 'lockup';
  className?: string;
}): JSX.Element {
  if (variant === 'lockup') {
    return (
      <img
        src="/brand/scoreassign-logo.png"
        alt="ScoreAssign"
        className={clsx('h-auto w-full max-w-sm rounded-lg', className)}
      />
    );
  }
  return (
    <img
      src="/brand/scoreassign-mark.png"
      alt="ScoreAssign"
      className={clsx('h-9 w-9 rounded-md object-cover', className)}
    />
  );
}
