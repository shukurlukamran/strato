"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  className?: string;
}

export function Tooltip({ content, children, className = "" }: TooltipProps) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elementRef = useRef<HTMLElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const updatePosition = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 5
    });
  };

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    const target = e.currentTarget as HTMLElement;
    elementRef.current = target;
    updatePosition(target);
    
    timeoutRef.current = setTimeout(() => {
      if (elementRef.current) {
        updatePosition(elementRef.current);
        setShow(true);
      }
    }, 2000); // 2 seconds
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setShow(false);
    elementRef.current = null;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (show && elementRef.current) {
      updatePosition(elementRef.current);
    }
  };

  if (!content || content.trim() === '') {
    return <>{children}</>;
  }

  return (
    <>
      <div
        ref={elementRef as any}
        className={`inline-block ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
        style={{ display: 'inline-block', width: 'fit-content' }}
      >
        {children}
      </div>
      {mounted && typeof window !== 'undefined' && show && createPortal(
        <div
          className="fixed z-[9999] max-w-xs rounded-lg border border-white/20 bg-slate-900/95 px-3 py-2 text-xs text-white shadow-xl backdrop-blur-sm whitespace-pre-line"
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
        </div>,
        document.body
      )}
    </>
  );
}
