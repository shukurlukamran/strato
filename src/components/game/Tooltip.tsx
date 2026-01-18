"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  content: string | React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Tooltip({ content, children, className = "" }: TooltipProps) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0, align: 'center' as 'left' | 'center' | 'right' });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elementRef = useRef<HTMLElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
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
    const centerX = rect.left + rect.width / 2;
    const viewportWidth = window.innerWidth;
    const tooltipMaxWidth = 320; // max-w-xs = 20rem = 320px
    const padding = 16; // Minimum padding from screen edges
    
    let x = centerX;
    let align: 'left' | 'center' | 'right' = 'center';
    
    // Check if tooltip would overflow left
    if (centerX - tooltipMaxWidth / 2 < padding) {
      x = rect.left + padding;
      align = 'left';
    }
    // Check if tooltip would overflow right
    else if (centerX + tooltipMaxWidth / 2 > viewportWidth - padding) {
      x = rect.right - padding;
      align = 'right';
    }
    
    setPosition({
      x,
      y: rect.top - 5,
      align
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

  if (!content || (typeof content === 'string' && content.trim() === '')) {
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
          ref={tooltipRef}
          className={`fixed z-[9999] max-w-xs rounded-lg border border-white/20 bg-slate-900/95 px-3 py-2 text-xs text-white shadow-xl backdrop-blur-sm ${typeof content === 'string' ? 'whitespace-pre-line' : ''}`}
          style={{
            left: position.align === 'left' ? `${position.x}px` : position.align === 'right' ? `${position.x}px` : `${position.x}px`,
            top: `${position.y}px`,
            transform: position.align === 'left' 
              ? 'translate(0, -100%)' 
              : position.align === 'right' 
              ? 'translate(-100%, -100%)' 
              : 'translate(-50%, -100%)',
            pointerEvents: 'none',
            marginTop: '-8px'
          }}
        >
          {content}
          <div
            className="absolute top-full h-0 w-0 border-4 border-transparent border-t-slate-900/95"
            style={{
              left: position.align === 'left' ? '16px' : position.align === 'right' ? 'calc(100% - 16px)' : '50%',
              transform: position.align === 'left' || position.align === 'right' ? 'none' : 'translateX(-50%)',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
            }}
          />
        </div>,
        document.body
      )}
    </>
  );
}
