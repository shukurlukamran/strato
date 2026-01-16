"use client";

import { useState, useEffect, useRef } from "react";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  className?: string;
}

export function Tooltip({ content, children, className = "" }: TooltipProps) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const elementRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      setPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 5
      });
      setShow(true);
    }, 3000); // 3 seconds
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setShow(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (show) {
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      setPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 5
      });
    }
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (!content || content.trim() === '') {
    return <>{children}</>;
  }

  return (
    <div
      ref={elementRef}
      className={`relative inline-block ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    >
      {children}
      {show && (
        <div
          className="fixed z-50 max-w-xs rounded-lg border border-white/20 bg-slate-900/95 px-3 py-2 text-xs text-white shadow-xl backdrop-blur-sm whitespace-pre-line"
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
            transform: 'translate(-50%, -100%)',
            pointerEvents: 'none',
            marginTop: '-8px'
          }}
        >
          {content}
          <div
            className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-4 border-transparent border-t-slate-900/95"
            style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
          />
        </div>
      )}
    </div>
  );
}
