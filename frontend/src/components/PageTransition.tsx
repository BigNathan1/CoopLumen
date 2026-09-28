'use client';

/**
 * PageTransition
 *
 * Wraps page content and plays a CSS `@keyframes page-enter` animation
 * whenever the pathname changes. This gives every route-level render a
 * consistent fade-and-rise entrance without requiring a third-party animation
 * library or a client-side router intercept.
 *
 * Usage — drop it around the `{children}` slot in a layout:
 *
 *   <PageTransition>{children}</PageTransition>
 *
 * The animation is automatically suppressed for users who prefer reduced
 * motion (`prefers-reduced-motion: reduce`).
 */

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import styles from './PageTransition.module.css';

export interface PageTransitionProps {
  /** Page content to animate in. */
  children: React.ReactNode;
  /**
   * Optional class name forwarded to the wrapper element so a parent can
   * adjust layout without coupling to this component's internal markup.
   */
  className?: string;
}

export function PageTransition({ children, className }: PageTransitionProps) {
  const pathname = usePathname();
  const wrapperRef = useRef<HTMLDivElement>(null);

  /*
   * When the route changes, reset the animation so it plays again on the new
   * page. We do this by briefly removing the class and re-adding it on the
   * next animation frame — the same "restart animation" technique used by
   * skeleton shimmers and progress bars elsewhere in this design system.
   *
   * We also restore `will-change: auto` after the animation completes to
   * release the compositor layer once it is no longer needed (preventing the
   * common mistake of leaving `will-change` set permanently).
   */
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    // Force a style recalculation so removing + re-adding the class actually
    // restarts the animation rather than being batched away.
    el.classList.remove(styles.wrapper);
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- intentional reflow
    el.offsetHeight; // read a layout property to flush the style update
    el.classList.add(styles.wrapper);

    function handleAnimationEnd() {
      if (el) el.style.willChange = 'auto';
    }

    el.addEventListener('animationend', handleAnimationEnd, { once: true });
    return () => {
      el.removeEventListener('animationend', handleAnimationEnd);
    };
  }, [pathname]);

  return (
    /*
     * `aria-live` is intentionally absent. Page transitions are a visual
     * effect; screen readers navigate pages through their own announcement
     * mechanism and do not need a live region here.
     *
     * The element has no interactive role, so it does not receive focus and
     * does not disturb the natural focus order of the page it wraps.
     */
    <div
      ref={wrapperRef}
      className={[styles.wrapper, className].filter(Boolean).join(' ')}
      data-testid="page-transition"
    >
      {children}
    </div>
  );
}
