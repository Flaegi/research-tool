// Renders a cartographic territory zone behind a group of related concept nodes.
// Aesthetic: muted map colors with SVG hatching patterns — like biomes on a topographic map.
// No bright colors, no glow. Just subtle territorial demarcation.
import React from 'react';

export interface ClusterZoneData {
  label: string;
  /** Muted cartographic color, e.g. '#6b8f71' */
  color: string;
  /** Pattern style for territory texture */
  pattern?: 'diagonal' | 'dots' | 'crosshatch' | 'waves' | 'none';
  /** Called when the zone is clicked — used for focus-zoom */
  onFocus?: (zoneId: string) => void;
  /** Whether this zone is currently focused */
  isFocused?: boolean;
}

/**
 * A background zone that visually groups related nodes.
 * Clicking the zone signals a focus-zoom request via data.onFocus.
 * Uses SVG fill patterns for cartographic texture.
 */
export const ClusterZone = React.memo(({
  id,
  data,
  selected,
}: {
  id: string;
  data: ClusterZoneData;
  selected?: boolean;
}) => {
  const patternId = `zone-pattern-${id}`;
  const pattern = data.pattern ?? 'diagonal';

  const renderPattern = () => {
    switch (pattern) {
      case 'diagonal':
        return (
          <pattern id={patternId} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="12" stroke={data.color} strokeWidth="1.5" strokeOpacity="0.4" />
          </pattern>
        );
      case 'dots':
        return (
          <pattern id={patternId} width="10" height="10" patternUnits="userSpaceOnUse">
            <circle cx="5" cy="5" r="1.4" fill={data.color} fillOpacity="0.45" />
          </pattern>
        );
      case 'crosshatch':
        return (
          <pattern id={patternId} width="12" height="12" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="12" y2="12" stroke={data.color} strokeWidth="1" strokeOpacity="0.35" />
            <line x1="12" y1="0" x2="0" y2="12" stroke={data.color} strokeWidth="1" strokeOpacity="0.35" />
          </pattern>
        );
      case 'waves':
        return (
          <pattern id={patternId} width="20" height="8" patternUnits="userSpaceOnUse">
            <path d="M0 4 Q5 0 10 4 Q15 8 20 4" fill="none" stroke={data.color} strokeWidth="1" strokeOpacity="0.4" />
          </pattern>
        );
      default:
        return null;
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    // Only trigger focus when clicking the zone background, not child nodes
    if (data.onFocus) {
      e.stopPropagation();
      data.onFocus(id);
    }
  };

  return (
    <div
      className="relative w-full h-full transition-opacity duration-300"
      style={{ borderRadius: '24px' }}
      onClick={handleClick}
    >
      {/* Selection ring */}
      {selected && (
        <div
          className="absolute inset-0 rounded-[20px] pointer-events-none"
          style={{ boxShadow: `0 0 0 2px ${data.color}60` }}
        />
      )}

      {/* Focus highlight ring */}
      {data.isFocused && (
        <div
          className="absolute inset-0 rounded-[20px] pointer-events-none"
          style={{ boxShadow: `0 0 0 3px ${data.color}90, 0 0 24px ${data.color}30` }}
        />
      )}

      {/* SVG fill layer: muted solid tint + pattern overlay */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ borderRadius: '20px' }}
      >
        <defs>
          {renderPattern()}
        </defs>

        {/* Solid muted tint — very low opacity */}
        <rect width="100%" height="100%" fill={data.color} fillOpacity="0.12" rx="20" />

        {/* Pattern texture overlay */}
        {pattern !== 'none' && (
          <rect width="100%" height="100%" fill={`url(#${patternId})`} rx="20" />
        )}

        {/* Dashed border — Hidden as requested (landscape frames removed) */}
        <rect
          width="100%" height="100%"
          fill="none"
          stroke="transparent"
          strokeWidth="0"
          rx="24"
        />
      </svg>

      {/* Territory label — top left, minimal */}
      <div
        className="absolute top-3 left-4 pointer-events-none select-none font-mono uppercase"
        style={{
          fontSize: '9px',
          letterSpacing: '0.14em',
          color: data.color,
          opacity: 0.7,
        }}
      >
      </div>
    </div>
  );
}, (prev, next) => {
  return (
    prev.id === next.id &&
    prev.selected === next.selected &&
    prev.data.label === next.data.label &&
    prev.data.color === next.data.color &&
    prev.data.isFocused === next.data.isFocused
  );
});
