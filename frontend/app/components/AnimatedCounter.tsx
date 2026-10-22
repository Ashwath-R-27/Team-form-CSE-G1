"use client";

import { useEffect, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}

export default function AnimatedCounter({
  value,
  duration = 0.65,
  className = "",
  prefix = "",
  suffix = "",
}: AnimatedCounterProps) {
  const prefersReducedMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplayValue(value);
      return;
    }

    const controls = animate(displayValue, value, {
      duration,
      ease: "easeOut",
      onUpdate(latest) {
        setDisplayValue(Math.round(latest));
      },
    });

    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, prefersReducedMotion, duration]);

  return (
    <span className={`tabular-nums ${className}`}>
      {prefix}
      {displayValue}
      {suffix}
    </span>
  );
}

