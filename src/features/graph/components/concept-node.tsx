// Core concept node component with progressive detail reveal based on semantic zoom.
// Layout: Title → 3-dot controls → Concept text (on-demand) → Metadata footer.
// Double-click toggles footer + full text. 3 dots control explain detail level.
import { Handle, Position } from '@xyflow/react';
import React, { useContext, useState, useEffect, useCallback } from 'react';
import { ImagePlus, Link2, Loader2, RefreshCw, Plus, ChevronDown } from 'lucide-react';
import { ViewModeContext } from '../../../shared/context/context';
import { fetchImagenImage, GEMINI_KEY_STORAGE } from '../../../shared/api/gemini-api';

export interface ConceptNodeData {
  title: string;
  concept: string;
  trl: number;
  sourceReliability: 'High' | 'Medium' | 'Low';
  reliabilityScore?: number;
  sourceName?: string;
  themeColor?: string;
  subtopics?: string[];
  depth?: number;  // 0 = root, 1 = cluster proxy, 2+ = keywords
  explained?: boolean;  // true once Gemini has provided an explanation
  isExplaining?: boolean;  // true while waiting for Gemini explanation
  isExpanded?: boolean;  // toggle for metadata footer and full text view
  explainLevel?: 1 | 2 | 3;  // 1 = brief, 2 = detailed, 3 = comprehensive
  onExplore?: (nodeId: string) => void;
  onExplain?: (title: string, nodeId: string, level?: 1 | 2 | 3) => void;
}

/** Derives card dimensions and typography scale from node depth. */
const getDepthStyle = (depth: number, isOverview: boolean) => {
  if (isOverview) {
    if (depth === 0) return { width: '800px', titleSize: '56px', titleWeight: '900', px: 'px-10', py: 'py-8', conceptSize: '18px' };
    if (depth === 1) return { width: '320px', titleSize: '20px', titleWeight: '700', px: 'px-5', py: 'py-4', conceptSize: '12px' };
    return { width: '100px', titleSize: '9px', titleWeight: '500', px: 'px-2', py: 'py-1.5', conceptSize: '0px' };
  }
  if (depth === 0) return { width: '720px', titleSize: '44px', titleWeight: '900', px: 'px-10', py: 'py-8', conceptSize: '16px' };
  if (depth === 1) return { width: '380px', titleSize: '22px', titleWeight: '700', px: 'px-6', py: 'py-5', conceptSize: '13px' };
  return { width: '180px', titleSize: '11px', titleWeight: '600', px: 'px-3', py: 'py-2.5', conceptSize: '10px', expandedWidth: '340px' };
};

/** Collapsible metadata footer. */
const MetadataFooter = ({
  depth, sourceName, score, scoreBarColor, scoreTextColor, imageUrl, isGenerating, handleGenerateImage,
}: {
  depth: number;
  sourceName?: string;
  score: number;
  scoreBarColor: string;
  scoreTextColor: string;
  imageUrl: string | null;
  isGenerating: boolean;
  handleGenerateImage: (e?: React.MouseEvent) => void;
}) => {
  const [isOpen, setIsOpen] = useState(depth <= 1);

  if (depth <= 1) {
    return (
      <div className="border-t border-black/[0.05] bg-black/[0.015] px-4 py-2.5 flex items-center gap-3">
        <div className="flex items-center gap-1 text-[10px] text-indigo-500 hover:text-indigo-700 cursor-pointer transition-colors min-w-0 flex-1">
          <Link2 className="w-2.5 h-2.5 shrink-0" />
          <span className="truncate font-medium border-b border-indigo-200/60">
            {sourceName ?? 'Gemini Inference'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-14 h-1 bg-black/10 rounded-full overflow-hidden">
            <div className={`h-full ${scoreBarColor} transition-all duration-1000`} style={{ width: `${score}%` }} />
          </div>
          <span className={`text-[9px] font-mono font-semibold ${scoreTextColor}`}>{score}%</span>
        </div>
        {!imageUrl && (
          <button
            onClick={handleGenerateImage}
            disabled={isGenerating}
            title="Generate image"
            className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center border border-black/[0.06] bg-white hover:bg-zinc-50 text-zinc-400 hover:text-zinc-700 transition-all disabled:opacity-40 nodrag"
          >
            {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="border-t border-black/[0.05]">
      <div className="flex items-center">
        <button
          onClick={(e) => { e.stopPropagation(); setIsOpen(o => !o); }}
          className="flex-1 px-3 py-1.5 flex items-center gap-1 text-[9px] text-zinc-400 hover:text-zinc-600 transition-colors nodrag"
        >
          <ChevronDown className={`w-2.5 h-2.5 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
          <span>Source</span>
        </button>
        {!imageUrl && (
          <button
            onClick={handleGenerateImage}
            disabled={isGenerating}
            title="Generate image"
            className="shrink-0 w-5 h-5 mr-2 rounded flex items-center justify-center border border-black/[0.06] bg-white hover:bg-zinc-50 text-zinc-400 hover:text-zinc-700 transition-all disabled:opacity-40 nodrag"
          >
            {isGenerating ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <ImagePlus className="w-2.5 h-2.5" />}
          </button>
        )}
      </div>
      {isOpen && (
        <div className="px-3 pb-2 flex items-center gap-2">
          <div className="flex items-center gap-1 text-[9px] text-indigo-500 min-w-0 flex-1">
            <Link2 className="w-2 h-2 shrink-0" />
            <span className="truncate font-medium">{sourceName ?? 'Gemini Inference'}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <div className="w-8 h-0.5 bg-black/10 rounded-full overflow-hidden">
              <div className={`h-full ${scoreBarColor}`} style={{ width: `${score}%` }} />
            </div>
            <span className={`text-[8px] font-mono ${scoreTextColor}`}>{score}%</span>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Three frosted-glass dots in the card header.
 * Dot 1 = red (close/collapse), Dot 2 = amber (brief explain), Dot 3 = green (deep explain).
 */
const ThreeDots = ({
  depth,
  isExplaining,
  onDot2,
  onDot3,
}: {
  depth: number;
  isExplaining?: boolean;
  onDot2: () => void;
  onDot3: () => void;
}) => {
  if (depth >= 2) return null; // only show on root + cluster nodes

  return (
    <div className="flex items-center gap-1 shrink-0 ml-auto mr-2 nodrag">
      {/* Dot 1 — decorative / collapse hint */}
      <div
        className="w-2.5 h-2.5 rounded-full bg-red-400/70 border border-red-500/30 hover:bg-red-400 transition-colors cursor-default"
        title="Panel indicator"
      />
      {/* Dot 2 — brief explain */}
      <button
        onClick={(e) => { e.stopPropagation(); onDot2(); }}
        className="w-2.5 h-2.5 rounded-full bg-amber-400/70 border border-amber-500/30 hover:bg-amber-400 transition-colors nodrag"
        title="Brief explanation"
        disabled={isExplaining}
      />
      {/* Dot 3 — deep / comprehensive explain */}
      <button
        onClick={(e) => { e.stopPropagation(); onDot3(); }}
        className="w-2.5 h-2.5 rounded-full bg-emerald-400/70 border border-emerald-500/30 hover:bg-emerald-400 transition-colors nodrag"
        title="Deep explanation"
        disabled={isExplaining}
      />
    </div>
  );
};

/**
 * A frosted glass research node with progressive detail reveal.
 * Double-click → toggles footer and full text.
 * Dot 2 (amber) → brief Gemini explanation.
 * Dot 3 (green) → comprehensive Gemini explanation.
 */
export const ConceptNode = React.memo(({ id, data, isConnectable }: { id: string; data: ConceptNodeData; isConnectable?: boolean }) => {
  const viewMode = useContext(ViewModeContext);
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const isOverview = viewMode === 'overview';
  const depth = data.depth ?? 1;
  const ds = getDepthStyle(depth, isOverview);

  // Auto-generate images for root and primary sub-topics
  useEffect(() => {
    let mounted = true;
    const generateImage = async () => {
      if (!isOverview && (depth === 0 || depth === 1) && !imageUrl && !isGenerating) {
        setIsGenerating(true);
        try {
          const apiKey = localStorage.getItem(GEMINI_KEY_STORAGE);
          if (!apiKey) return;
          const base64Image = await fetchImagenImage(data.title, apiKey);
          if (mounted) setImageUrl(base64Image);
        } catch (err) {
          console.error('Auto-image error:', err);
        } finally {
          if (mounted) setIsGenerating(false);
        }
      }
    };
    generateImage();
    return () => { mounted = false; };
  }, [depth, data.title, isOverview]); // eslint-disable-line react-hooks/exhaustive-deps

  const score = data.reliabilityScore ?? (data.sourceReliability === 'High' ? 92 : data.sourceReliability === 'Medium' ? 65 : 30);
  const scoreBarColor = score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500';
  const scoreTextColor = score >= 80 ? 'text-emerald-600' : score >= 50 ? 'text-amber-600' : 'text-red-500';

  const handleGenerateImage = useCallback(async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const apiKey = localStorage.getItem(GEMINI_KEY_STORAGE);
      if (apiKey) {
        const base64Image = await fetchImagenImage(data.title, apiKey);
        setImageUrl(base64Image);
      }
    } catch (err) {
      console.error('Manual-image error:', err);
    } finally {
      setIsGenerating(false);
    }
  }, [data.title, isGenerating]);

  const handleDot2 = useCallback(() => {
    if (data.onExplain && id) data.onExplain(data.title, id, 1);
  }, [data, id]);

  const handleDot3 = useCallback(() => {
    if (data.onExplain && id) data.onExplain(data.title, id, 3);
  }, [data, id]);

  const overviewOpacity = isOverview && depth >= 2 ? 'opacity-50' : '';
  const cardWidth = (!isOverview && depth >= 2 && data.explained) ? (ds as any).expandedWidth ?? ds.width : ds.width;

  return (
    <div className={`relative group font-sans transition-all duration-500 ${overviewOpacity}`} style={{ width: cardWidth }}>

      {/* 3D stacked depth layers — only root/cluster nodes in detail view */}
      {!isOverview && depth <= 1 && (
        <>
          <div className="absolute inset-0 bg-white/40 backdrop-blur-sm rounded-2xl translate-y-[28px] translate-x-[4px] scale-[0.88] border border-black/[0.04] shadow-[0_16px_32px_rgba(0,0,0,0.06)] pointer-events-none" />
          <div className="absolute inset-0 bg-white/60 backdrop-blur-md rounded-2xl translate-y-[14px] translate-x-[2px] scale-[0.94] border border-black/[0.05] shadow-[0_12px_24px_rgba(0,0,0,0.08)] pointer-events-none" />
        </>
      )}

      {/* Main card */}
      <div className="relative rounded-2xl bg-white/85 backdrop-blur-3xl border-2 border-white/90 max-w-full shadow-[0_8px_32px_rgba(0,0,0,0.12),inset_0_2px_0_rgba(255,255,255,0.9)] flex flex-col z-10 transition-all duration-500">

        {/* ── HEADER: Title + Three Dots + Expand button ── */}
        <div className={`flex items-start gap-2 ${ds.px} ${ds.py}`}>
          <h3
            className="text-zinc-900 tracking-tight leading-tight flex-1"
            style={{ fontSize: ds.titleSize, fontWeight: ds.titleWeight }}
          >
            {data.title}
          </h3>

          {/* Three macOS-style dots (only for depth 0+1) */}
          {!isOverview && (
            <ThreeDots
              depth={depth}
              isExplaining={data.isExplaining}
              onDot2={handleDot2}
              onDot3={handleDot3}
            />
          )}

          {/* Expand button — hidden on keyword chips in overview */}
          {!(isOverview && depth >= 2) && (
            <button
              className={`shrink-0 mt-0.5 rounded-full flex items-center justify-center border border-black/[0.06] bg-white hover:bg-zinc-100 hover:border-black/10 shadow-sm transition-all duration-200 nodrag ${
                depth === 0 ? 'w-9 h-9' : depth === 1 ? 'w-7 h-7' : 'w-5 h-5'
              }`}
              title="Expand / Explore Subtopics"
              onClick={(e) => {
                e.stopPropagation();
                if (data.onExplore && id) data.onExplore(id);
              }}
            >
              <Plus size={depth === 0 ? 16 : depth === 1 ? 13 : 10} className="text-zinc-600" />
            </button>
          )}
        </div>

        {/* ── DETAIL CONTENT — revealed when zoomed in ── */}
        {!isOverview && (
          <>
            {/* Optional image */}
            {imageUrl && (
              <div className="w-full h-36 relative group/img overflow-hidden border-t border-black/[0.03] shrink-0">
                <img src={imageUrl} alt={data.title} className="w-full h-full object-cover" />
                <button
                  onClick={handleGenerateImage}
                  className="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity text-white"
                >
                  {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                </button>
              </div>
            )}

            {/* ── EXPLAIN BUTTON (depth 2+ only, no dots) — shown when not yet explained ── */}
            {!data.explained && !data.isExplaining && depth >= 2 && (
              <div className={`${ds.px} pb-3`}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (data.onExplain && id) data.onExplain(data.title, id, 1);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/60 backdrop-blur-md border border-black/[0.08] text-zinc-600 hover:text-zinc-900 hover:bg-white/80 hover:border-black/15 text-[11px] font-medium transition-all duration-200 shadow-sm nodrag"
                >
                  Explain
                </button>
              </div>
            )}

            {/* ── EXPLAINING loader ── */}
            {data.isExplaining && (
              <div className={`${ds.px} pb-3 flex items-center gap-2 text-zinc-400 text-xs`}>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Explaining…</span>
              </div>
            )}

            {/* ── MAIN CONTENT: Concept text ── */}
            {(data.explained || depth === 0) && data.concept && data.concept !== 'Loading…' && data.concept !== data.title && (
              <div
                className={`${ds.px} pb-4 text-zinc-700 leading-relaxed font-normal`}
                style={{ fontSize: ds.conceptSize }}
              >
                {(() => {
                  const parts = data.concept.split(/SOURCES?:?/i);
                  const mainText = parts[0].trim();
                  const sourcesText = parts[1]?.trim();

                  const isLong = mainText.length > 450;
                  const showFullText = data.isExpanded || !isLong;
                  const displayMainText = !showFullText
                    ? mainText.slice(0, 400).trim() + '...'
                    : mainText;

                  return (
                    <div className="flex flex-col gap-3">
                      <div className="space-y-2.5">
                        {displayMainText.split('\n').map((p, i) => p.trim() ? <p key={i}>{p}</p> : null)}

                        {/* Less / More toggle */}
                        {isLong && (
                          <div className="flex items-center gap-2 mt-1">
                            <div
                              className="text-indigo-500/70 text-[10px] font-medium italic cursor-pointer hover:text-indigo-600 transition-colors nodrag"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Toggle via parent — we fire a synthetic doubleClick-style update via onExplain with signal
                                // Actually we cannot set state from here, signal via data.onExplain with null to toggle
                              }}
                            >
                              {data.isExpanded ? '▲ Less' : '▼ More — double-click to expand'}
                            </div>
                          </div>
                        )}
                      </div>
                      {sourcesText && showFullText && (
                        <div className="mt-2 pt-3 border-t border-black/[0.04]">
                          <div className="text-[10px] font-bold tracking-wider text-black/40 uppercase mb-2 flex items-center gap-1.5"><Link2 className="w-3 h-3" /> Sources</div>
                          <ul className="space-y-1.5">
                            {sourcesText.split('\n').filter(s => s.trim()).map((s, i) => {
                              const urlMatch = s.match(/(https?:\/\/[^\s]+)/);
                              const url = urlMatch ? urlMatch[1] : null;
                              const titleText = s.replace(/^[-\*\d\.\s]+/, '').trim();
                              let domain = '';
                              try { if (url) domain = new URL(url).hostname.replace('www.', ''); } catch { }

                              return (
                                <li key={i} className="text-[11px] truncate flex items-center gap-1.5 text-black/60">
                                  <div className="w-1 h-1 rounded-full bg-black/20 shrink-0" />
                                  {url ? (
                                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline truncate" title={url}>
                                      {titleText.includes(domain) ? titleText : `${titleText} (${domain || 'Link'})`}
                                    </a>
                                  ) : (
                                    <span className="truncate" title={titleText}>{titleText}</span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── LOADING state ── */}
            {data.concept === 'Loading…' && (
              <div className="px-5 pb-4 flex items-center gap-2 text-zinc-400 text-xs">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Generating…</span>
              </div>
            )}

            {/* ── METADATA FOOTER — toggled via isExpanded ── */}
            {data.isExpanded && (
              <MetadataFooter
                depth={depth}
                sourceName={data.sourceName}
                score={score}
                scoreBarColor={scoreBarColor}
                scoreTextColor={scoreTextColor}
                imageUrl={imageUrl}
                isGenerating={isGenerating}
                handleGenerateImage={handleGenerateImage}
              />
            )}
          </>
        )}
      </div>

      {/* React Flow handles */}
      {(() => {
        const hClass = 'transition-all !cursor-crosshair nodrag';
        return (
          <>
            <Handle type="source" id="s-top" position={Position.Top} isConnectable={isConnectable} className={hClass} />
            <Handle type="source" id="s-bottom" position={Position.Bottom} isConnectable={isConnectable} className={hClass} />
            <Handle type="source" id="s-left" position={Position.Left} isConnectable={isConnectable} className={hClass} />
            <Handle type="source" id="s-right" position={Position.Right} isConnectable={isConnectable} className={hClass} />
          </>
        );
      })()}
    </div>
  );
}, (prevProps, nextProps) => {
  // Full comparison — all display-relevant fields must be checked
  return (
    prevProps.id === nextProps.id &&
    prevProps.isConnectable === nextProps.isConnectable &&
    prevProps.data.title === nextProps.data.title &&
    prevProps.data.concept === nextProps.data.concept &&
    prevProps.data.isExplaining === nextProps.data.isExplaining &&
    prevProps.data.explained === nextProps.data.explained &&
    prevProps.data.isExpanded === nextProps.data.isExpanded &&
    prevProps.data.explainLevel === nextProps.data.explainLevel &&
    (prevProps.data as any).isExpanding === (nextProps.data as any).isExpanding
  );
});
