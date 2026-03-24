// Renders a cartographic territory zone behind a group of related concept nodes.
// Aesthetic: muted map colors with SVG hatching patterns — like biomes on a topographic map.
// No bright colors, no glow. Just subtle territorial demarcation.

export interface ClusterZoneData {
  label: string;
  /** Muted cartographic color, e.g. '#6b8f71' */
  color: string;
  /** Pattern style for territory texture */
  pattern?: 'diagonal' | 'dots' | 'crosshatch' | 'waves' | 'none';
}

// Unique pattern ID helper (avoids SVG defs conflicts between multiple zones)
let _counter = 0;

/**
 * A non-interactive background zone that visually groups related nodes.
 * Uses SVG fill patterns for cartographic texture. Colors are muted, like map biomes.
 */
export const ClusterZone = ({ data, selected }: { data: ClusterZoneData; selected?: boolean }) => {
  const patternId = `zone-pattern-${data.label.replace(/\s/g, '-').toLowerCase()}`;
  const fillId = `zone-fill-${data.label.replace(/\s/g, '-').toLowerCase()}`;
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

  return (
    <div className="relative w-full h-full" style={{ borderRadius: '20px', overflow: 'hidden' }}>
      {/* Selection ring */}
      {selected && (
        <div
          className="absolute inset-0 rounded-[20px] pointer-events-none"
          style={{ boxShadow: `0 0 0 2px ${data.color}60` }}
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

        {/* Dashed border — like a map region boundary */}
        <rect
          width="100%" height="100%"
          fill="none"
          stroke={data.color}
          strokeOpacity="0.35"
          strokeWidth="1.5"
          strokeDasharray="6 4"
          rx="20"
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
        {data.label}
      </div>
    </div>
  );
};
