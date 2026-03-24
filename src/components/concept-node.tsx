// Core concept node component with progressive detail reveal based on semantic zoom.
// The same card is always rendered — more content becomes visible as zoom increases.
// Cluster coloring is handled by the ClusterZone background nodes, NOT by this card.
import { Handle, Position } from '@xyflow/react';
import React, { useContext, useState } from 'react';
import { ImagePlus, Link2, Loader2, RefreshCw, Plus } from 'lucide-react';
import { ViewModeContext } from '../context';

export interface ConceptNodeData {
  title: string;
  concept: string;
  trl: number;
  sourceReliability: 'High' | 'Medium' | 'Low';
  reliabilityScore?: number;
  sourceName?: string;
  themeColor?: string;
  subtopics?: string[];
  onExplore?: (nodeId: string) => void;
}

/**
 * Renders a frosted glass concept node.
 * Single design language across all zoom levels.
 * At low zoom (overview): shows title + "+" button.
 * At high zoom (detail): additionally reveals content, source bar, and depth dots.
 */
export const ConceptNode = ({ id, data, isConnectable }: { id: string; data: ConceptNodeData; isConnectable?: boolean }) => {
  const viewMode = useContext(ViewModeContext);
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const isOverview = viewMode === 'overview';

  const score = data.reliabilityScore ?? (data.sourceReliability === 'High' ? 92 : data.sourceReliability === 'Medium' ? 65 : 30);
  const scoreColor = score >= 80 ? 'bg-[#ccff00]' : score >= 50 ? 'bg-amber-400' : 'bg-red-500';
  const scoreTextColor = score >= 80 ? 'text-[#ccff00]' : score >= 50 ? 'text-amber-400' : 'text-red-500';

  const handleGenerateImage = () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      setImageUrl(`https://source.unsplash.com/400x200/?${encodeURIComponent(data.title)}`);
    }, 1800);
  };

  // In overview mode the card is narrower; in detail mode it expands
  const cardWidth = isOverview ? 'w-[200px]' : (imageUrl ? 'w-[280px]' : 'w-[340px]');

  return (
    <div className={`relative group ${cardWidth} font-sans transition-all duration-500`}>

      {/* 3D stacked depth layers — hidden in overview for cleaner look */}
      {!isOverview && (
        <>
          <div className="absolute inset-0 bg-zinc-900/80 backdrop-blur-md rounded-2xl translate-y-[28px] translate-x-[4px] scale-[0.88] border border-white/20 shadow-[0_16px_32px_rgba(0,0,0,0.9)] pointer-events-none" />
          <div className="absolute inset-0 bg-zinc-800/80 backdrop-blur-lg rounded-2xl translate-y-[14px] translate-x-[2px] scale-[0.94] border border-white/30 shadow-[0_12px_24px_rgba(0,0,0,0.8)] pointer-events-none" />
        </>
      )}

      {/* Main frosted glass panel — neutral, no color on the card itself */}
      <div
        className="relative rounded-2xl bg-zinc-950/75 backdrop-blur-3xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col z-10 transition-all duration-500"
      >

        {/* Header: always visible */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5 bg-white/[0.02]">
          <h3
            className="font-semibold text-gray-100 tracking-tight leading-tight truncate"
            style={{ fontSize: isOverview ? '13px' : '13px' }}
          >
            {data.title}
          </h3>

          {/* Expand/Drill-down button — always accessible */}
          <button
            className="shrink-0 ml-2 w-6 h-6 rounded-full flex items-center justify-center border border-white/10 bg-white/5 hover:bg-white/15 hover:border-white/30 transition-all duration-200 nodrag"
            title="Expand / Explore Subtopics"
            onClick={(e) => {
              e.stopPropagation();
              if (data.onExplore && id) data.onExplore(id);
            }}
          >
            <Plus size={12} className="text-gray-300" />
          </button>
        </div>

        {/* Detail content — only visible when zoomed in */}
        {!isOverview && (
          <>
            {/* Image area */}
            {imageUrl && (
              <div className="w-full h-36 relative group/img overflow-hidden border-b border-white/10 shrink-0">
                <img src={imageUrl} alt={data.title} className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded-md text-[9px] uppercase tracking-widest text-white/80 border border-white/10">
                  Gemini Imagen
                </div>
                <button
                  onClick={handleGenerateImage}
                  className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity text-white hover:text-[#ccff00]"
                >
                  {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                </button>
              </div>
            )}

            {/* Concept text */}
            <div className="px-3 py-3 text-[11px] text-gray-300 leading-relaxed font-light min-h-[44px]">
              {data.concept}
            </div>

            {/* Source + Truth bar */}
            <div className="px-3 pb-3 flex flex-col gap-3">
              <div className="flex items-center gap-1.5 text-[10px] text-indigo-300/70 hover:text-[#ccff00] cursor-pointer transition-colors w-max">
                <Link2 className="w-3 h-3" />
                <span className="truncate max-w-[160px] border-b border-indigo-300/20 hover:border-[#ccff00]/40 pb-px">
                  {data.sourceName ?? 'Database Inference'}
                </span>
              </div>

              <div className="flex flex-col gap-1 w-full">
                <div className="flex justify-between text-[9px] font-mono uppercase tracking-wider">
                  <span className="text-gray-500">Wahrheitsgehalt</span>
                  <span className={scoreTextColor}>{score}%</span>
                </div>
                <div className="w-full h-1 bg-black/60 rounded-full overflow-hidden border border-white/5">
                  <div
                    className={`h-full ${scoreColor} transition-all duration-1000`}
                    style={{ width: `${score}%`, boxShadow: score >= 80 ? '0 0 8px rgba(204,255,0,0.5)' : 'none' }}
                  />
                </div>
              </div>

              {/* Generate image button */}
              {!imageUrl && (
                <button
                  onClick={handleGenerateImage}
                  disabled={isGenerating}
                  className="w-full py-1.5 px-3 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 border border-white/5 hover:border-[#ccff00]/30 transition-all text-[11px] text-gray-400 hover:text-gray-200 flex items-center justify-center gap-2 disabled:opacity-50 nodrag"
                >
                  {isGenerating
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...</>
                    : <><ImagePlus className="w-3.5 h-3.5" /> Generate Image</>
                  }
                </button>
              )}
            </div>


          </>
        )}
      </div>

      {/* React Flow connection handles */}
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="!w-5 !h-5 !bg-zinc-700 !border-2 !border-zinc-900 !rounded-full hover:!bg-[#ccff00] hover:scale-125 transition-all !cursor-crosshair z-[100] nodrag"
        style={{ top: '-12px' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className="!w-5 !h-5 !bg-white !border-2 !border-zinc-900 !rounded-full hover:!bg-[#ccff00] hover:scale-125 transition-all !cursor-crosshair z-[100] nodrag"
        style={{ bottom: '-12px' }}
      />
    </div>
  );
};
