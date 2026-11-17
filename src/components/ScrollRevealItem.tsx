import React, { useRef, useState, useEffect } from 'react';

interface ScrollRevealItemProps {
  children: React.ReactNode;
  isFirstVisit?: boolean;
  index?: number;
  className?: string;
  delayMultiplier?: number;
  maxDelay?: number;
  resetSignal?: string | number;
  isActive?: boolean;
}

export const ScrollRevealItem: React.FC<ScrollRevealItemProps> = ({
  children,
  isFirstVisit = true,
  index = 0,
  className = '',
  delayMultiplier = 120,
  maxDelay = 1400,
  resetSignal,
  isActive = true,
}) => {
  const [hasAppeared, setHasAppeared] = useState(false);
  const [isResetting, setIsResetting] = useState(true);
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isFirstVisit) {
      setIsResetting(false);
      setHasAppeared(true);
      return;
    }

    if (!isActive) {
      setIsResetting(true);
      setHasAppeared(false);
      return;
    }

    let cancelled = false;
    let observer: IntersectionObserver | null = null;
    let raf1 = 0;
    let raf2 = 0;

    setIsResetting(true);
    setHasAppeared(false);

    raf1 = requestAnimationFrame(() => {
      if (cancelled) return;
      raf2 = requestAnimationFrame(() => {
        if (cancelled) return;
        setIsResetting(false);

        observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                setHasAppeared(true);
                if (elementRef.current && observer) {
                  observer.unobserve(elementRef.current);
                }
              }
            });
          },
          {
            root: null,
            rootMargin: '40px 0px -10px 0px',
            threshold: 0.01,
          }
        );

        if (elementRef.current) {
          observer.observe(elementRef.current);
        }
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      if (observer) {
        observer.disconnect();
      }
    };
  }, [isFirstVisit, isActive, resetSignal]);

  // Calculate stagger delay based on item index (modulo to avoid excessive delays on long lists)
  const staggerDelay = Math.min((index % 12) * delayMultiplier, maxDelay);

  return (
    <div
      ref={elementRef}
      className={className}
      style={{
        opacity: hasAppeared ? 1 : 0,
        transform: hasAppeared ? 'translateY(0)' : 'translateY(36px)',
        transition: isResetting
          ? 'none'
          : `opacity 0.75s cubic-bezier(0.22, 1, 0.36, 1) ${staggerDelay}ms, transform 0.75s cubic-bezier(0.22, 1, 0.36, 1) ${staggerDelay}ms`,
        willChange: hasAppeared ? 'auto' : 'opacity, transform',
      }}
    >
      {children}
    </div>
  );
};
