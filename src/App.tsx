// Main application — node-based research environment.
// Visualizes a research conversation as an interactive knowledge map.
// ClusterZone nodes define territories; ConceptNode cards show research items.
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Activity, Sparkles, Sun, Moon, Save, Layers, FolderOpen, Settings, X, Key } from 'lucide-react';
import { fetchClustersFromGemini, fetchSubTopicsFromGemini, fetchExplanation, fetchSynergyFromGemini, GEMINI_KEY_STORAGE } from './shared/api/gemini-api';
import { useTheme } from 'next-themes';
import { ViewModeContext } from './shared/context/context';
import {
  ReactFlow, Background, applyNodeChanges, applyEdgeChanges, addEdge,
  Connection, Edge, NodeChange, EdgeChange, ReactFlowProvider, useReactFlow,
  MarkerType, Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ConceptNode } from './features/graph/components/concept-node';
import { ClusterZone } from './features/graph/components/cluster-zone';

// ----- Constants -----

const STORAGE_KEY = 'research-tool-graph-v1';

/** Muted cartographic palette — like map biomes, no neon */
const CLUSTER_PALETTE: Array<{ color: string; pattern: 'diagonal' | 'dots' | 'crosshatch' | 'waves' | 'none' }> = [
  { color: '#6b8f71', pattern: 'diagonal' },    // moss green
  { color: '#7b8fa1', pattern: 'dots' },         // steel blue
  { color: '#8f7b6b', pattern: 'crosshatch' },   // terracotta
  { color: '#8a7f9e', pattern: 'waves' },        // lavender
  { color: '#9e8a6b', pattern: 'none' },         // sandstone
];

/** Neutral map-road edge style — no color, no glow, no animation */
const MAP_EDGE_STYLE: Partial<Edge> = {
  style: { stroke: 'rgba(26,26,26,0.35)', strokeWidth: 1.5 },
  animated: false,
};

/**
 * Picks the best source/target handle pair based on relative positions.
 * Routes edges to the nearest cardinal side for clean visual connections.
 * All handles are type='source' with connectionMode='loose', so we use s-* IDs.
 */
const pickHandles = (
  srcPos: { x: number; y: number },
  tgtPos: { x: number; y: number },
): { sourceHandle: string; targetHandle: string } => {
  const dx = tgtPos.x - srcPos.x;
  const dy = tgtPos.y - srcPos.y;
  const angle = Math.atan2(dy, dx);
  if (angle > -Math.PI / 4 && angle <= Math.PI / 4) {
    return { sourceHandle: 's-right', targetHandle: 's-left' };
  } else if (angle > Math.PI / 4 && angle <= (3 * Math.PI) / 4) {
    return { sourceHandle: 's-bottom', targetHandle: 's-top' };
  } else if (angle > -(3 * Math.PI) / 4 && angle <= -Math.PI / 4) {
    return { sourceHandle: 's-top', targetHandle: 's-bottom' };
  } else {
    return { sourceHandle: 's-left', targetHandle: 's-right' };
  }
};

/** Base spawn radius — scales down with depth so deeper clusters are tighter */
const BASE_SPAWN_RADIUS = 500;
/** Padding around the bounding box of children for zone sizing */
const ZONE_PADDING = 280;

// ----- Collision & Layout Physics -----

/**
 * Resolves overlaps between rectangular nodes.
 * Pushes nodes apart if they intersect.
 */
const resolveCollisions = (nodes: any[], padding = 40): any[] => {
  const newNodes = nodes.map(n => ({ ...n }));
  let changed = false;

  // Relaxation passes
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < newNodes.length; i++) {
      for (let j = i + 1; j < newNodes.length; j++) {
        const n1 = newNodes[i];
        const n2 = newNodes[j];

        // Only resolve collisions between siblings or top-level nodes
        if (n1.parentId !== n2.parentId) continue;

        const w1 = (n1.measured?.width || n1.style?.width || (n1.type === 'clusterZone' ? 500 : 340)) + padding;
        const h1 = (n1.measured?.height || n1.style?.height || (n1.type === 'clusterZone' ? 400 : 200)) + padding;
        const w2 = (n2.measured?.width || n2.style?.width || (n2.type === 'clusterZone' ? 500 : 340)) + padding;
        const h2 = (n2.measured?.height || n2.style?.height || (n2.type === 'clusterZone' ? 400 : 200)) + padding;

        const x1 = n1.position.x;
        const y1 = n1.position.y;
        const x2 = n2.position.x;
        const y2 = n2.position.y;

        const overlapX = Math.max(0, Math.min(x1 + w1, x2 + w2) - Math.max(x1, x2));
        const overlapY = Math.max(0, Math.min(y1 + h1, y2 + h2) - Math.max(y1, y2));

        if (overlapX > 0 && overlapY > 0) {
          changed = true;
          // Determine push vector
          const pushX = overlapX / 2;
          const pushY = overlapY / 2;

          // Push apart along the axis of least overlap
          if (overlapX < overlapY) {
            if (x1 < x2) {
              if (!n1.dragging) n1.position.x -= pushX * 0.8;
              if (!n2.dragging) n2.position.x += pushX * 0.8;
            } else {
              if (!n1.dragging) n1.position.x += pushX * 0.8;
              if (!n2.dragging) n2.position.x -= pushX * 0.8;
            }
          } else {
            if (y1 < y2) {
              if (!n1.dragging) n1.position.y -= pushY * 0.8;
              if (!n2.dragging) n2.position.y += pushY * 0.8;
            } else {
              if (!n1.dragging) n1.position.y += pushY * 0.8;
              if (!n2.dragging) n2.position.y -= pushY * 0.8;
            }
          }
        }
      }
    }
    if (!changed) break;
  }
  return newNodes;
};

/**
 * Updates a ClusterZone's dimensions to strictly encapsulate all its child nodes.
 * If children are outside the (0,0) top-left, shifts the zone and re-adjusts children.
 */
const updateClusterZoneBounds = (nodes: any[]): any[] => {
  const zones = nodes.filter(n => n.type === 'clusterZone');
  let nextNodes = [...nodes];

  zones.forEach(zone => {
    const children = nextNodes.filter(n => n.parentId === zone.id);
    if (children.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    children.forEach(c => {
      const w = c.measured?.width || c.style?.width || 340;
      const h = c.measured?.height || c.style?.height || 200;
      minX = Math.min(minX, c.position.x);
      minY = Math.min(minY, c.position.y);
      maxX = Math.max(maxX, c.position.x + w);
      maxY = Math.max(maxY, c.position.y + h);
    });

    const padding = 60;
    const targetW = maxX + padding;
    const targetH = maxY + padding;

    // Apply new dimensions to zone
    nextNodes = nextNodes.map(n => {
      if (n.id === zone.id) {
        let newPosX = n.position.x;
        let newPosY = n.position.y;

        // If child is at negative relative pos, shift zone and children
        if (minX < padding) {
          const shift = padding - minX;
          newPosX -= shift;
          // Apply shift to children later
        }
        if (minY < padding) {
          const shift = padding - minY;
          newPosY -= shift;
        }

        return {
          ...n,
          position: { x: newPosX, y: newPosY },
          style: { ...n.style, width: Math.max(zone.style?.width || 500, targetW), height: Math.max(zone.style?.height || 400, targetH) }
        };
      }
      return n;
    });

    // Re-adjust children if we shifted the zone
    if (minX < padding || minY < padding) {
      const shiftX = minX < padding ? padding - minX : 0;
      const shiftY = minY < padding ? padding - minY : 0;
      nextNodes = nextNodes.map(n => {
        if (n.parentId === zone.id) {
          return { ...n, position: { x: n.position.x + shiftX, y: n.position.y + shiftY } };
        }
        return n;
      });
    }
  });

  return nextNodes;
};

// ----- Knowledge Graph Data -----

/** Represents a thematic cluster with a label and its keyword nodes */
interface ClusterDef {
  label: string;
  keywords: string[];
}

/**
 * Returns 5-7 thematic clusters for a given root research topic.
 * Each cluster has a label (the territory name) and 2-4 keyword nodes.
 * Mimics InfraNodus-style semantic clustering.
 */
const getInitialClusters = (topic: string): ClusterDef[] => {
  const t = topic.toLowerCase();

  const db: Record<string, ClusterDef[]> = {
    quantum: [
      { label: 'Foundations', keywords: ['Wave-Particle Duality', 'Superposition', 'Measurement Problem'] },
      { label: 'Computing', keywords: ['Qubit Architecture', 'Error Correction', 'Quantum Advantage'] },
      { label: 'Entanglement', keywords: ['Bell Inequalities', 'Decoherence', 'Teleportation'] },
      { label: 'Applications', keywords: ['Cryptography', 'Sensing', 'Simulation'] },
      { label: 'Open Problems', keywords: ['Quantum Gravity', 'Many-Worlds', 'Interpretations'] },
    ],
    ai: [
      { label: 'Architecture', keywords: ['Transformers', 'Diffusion Models', 'State Space Models'] },
      { label: 'Training', keywords: ['RLHF', 'Pretraining at Scale', 'Fine-tuning'] },
      { label: 'Interpretability', keywords: ['Sparse Autoencoders', 'Mechanistic Interp', 'Circuit Analysis'] },
      { label: 'Risks & Alignment', keywords: ['Deceptive Alignment', 'Value Learning', 'Mesa-Optimization'] },
      { label: 'Embodiment', keywords: ['Robotics Integration', 'World Models', 'Sensorimotor Loop'] },
    ],
    climate: [
      { label: 'Drivers', keywords: ['CO₂ Forcing', 'Methane Feedback', 'Albedo Effects'] },
      { label: 'Tipping Points', keywords: ['AMOC Collapse', 'Ice Sheet Dynamics', 'Permafrost Thaw'] },
      { label: 'Interventions', keywords: ['Carbon Capture', 'Solar Geoengineering', 'Reforestation'] },
      { label: 'Policy', keywords: ['Carbon Markets', 'Just Transition', 'Paris Agreement'] },
      { label: 'Impacts', keywords: ['Biodiversity Loss', 'Sea Level Rise', 'Extreme Weather'] },
    ],
    biology: [
      { label: 'Genomics', keywords: ['CRISPR', 'Epigenetics', 'Gene Regulation'] },
      { label: 'Systems', keywords: ['Proteomics', 'Metabolomics', 'Interactome'] },
      { label: 'Evolution', keywords: ['Horizontal Gene Transfer', 'Niche Construction', 'Convergence'] },
      { label: 'Synthetic', keywords: ['Biofoundries', 'Minimal Cells', 'Xenobiology'] },
      { label: 'Microbiome', keywords: ['Gut-Brain Axis', 'Dysbiosis', 'Phage Therapy'] },
    ],
    design: [
      { label: 'Theory', keywords: ['Affordances', 'Material Semiotics', 'Embodiment'] },
      { label: 'Process', keywords: ['Systems Thinking', 'Prototyping', 'Iteration'] },
      { label: 'Social', keywords: ['Participatory Design', 'Co-creation', 'Decolonial Practice'] },
      { label: 'Digital', keywords: ['UX Research', 'Speculative Design', 'AI-Assisted Design'] },
    ],
    neuro: [
      { label: 'Theories', keywords: ['Predictive Coding', 'Global Workspace', 'Integrated Information'] },
      { label: 'Plasticity', keywords: ['Synaptic Pruning', 'Neurogenesis', 'Hebbian Learning'] },
      { label: 'Networks', keywords: ['Default Mode', 'Salience Network', 'Connectome'] },
      { label: 'Disorders', keywords: ['Neurodegeneration', 'Psychiatric Comorbidity', 'Biomarkers'] },
    ],
    space: [
      { label: 'Exploration', keywords: ['Crewed Mars Mission', 'Lunar Gateway', 'Deep Space Nav'] },
      { label: 'Astrophysics', keywords: ['Dark Matter', 'Gravitational Waves', 'Exoplanet Atmospheres'] },
      { label: 'Propulsion', keywords: ['Ion Drives', 'Solar Sails', 'Nuclear Thermal'] },
      { label: 'Cosmology', keywords: ['Inflation Theory', 'Dark Energy', 'CMB Anisotropy'] },
    ],
    consciousness: [
      { label: 'Theories', keywords: ['Global Workspace', 'IIT', 'Higher-Order Thought'] },
      { label: 'Hard Problem', keywords: ['Qualia', 'Phenomenal Binding', 'Explanatory Gap'] },
      { label: 'Neural Basis', keywords: ['NCC', 'Thalamo-Cortical Loop', 'Recurrent Processing'] },
      { label: 'Altered States', keywords: ['Psychedelics', 'Dreaming', 'Meditation'] },
    ],
  };

  const matchKey = Object.keys(db).find(k => t.includes(k));
  if (matchKey) return db[matchKey];

  // Generic fallback clusters
  return [
    { label: 'Foundations', keywords: ['Core Principles', 'Historical Roots', 'Key Definitions'] },
    { label: 'Methods', keywords: ['Research Approaches', 'Measurement', 'Methodology'] },
    { label: 'Applications', keywords: ['Practical Uses', 'Case Studies', 'Industry Impact'] },
    { label: 'Open Questions', keywords: ['Unsolved Problems', 'Controversies', 'Frontiers'] },
    { label: 'Connections', keywords: ['Adjacent Fields', 'Interdisciplinary Links', 'Analogies'] },
  ];
};

/**
 * Returns 3-4 deeper sub-topics when a user explores a specific cluster keyword.
 */
const expandKeyword = (topic: string): string[] => {
  const t = topic.toLowerCase();
  if (t.includes('crispr')) return ['Base Editing', 'Prime Editing', 'Epigenome Editing', 'Delivery Vectors'];
  if (t.includes('transformer')) return ['Attention Mechanism', 'Positional Encoding', 'KV Cache', 'Flash Attention'];
  if (t.includes('carbon')) return ['Direct Air Capture', 'BECCS', 'Ocean Alkalinity', 'Biochar'];
  if (t.includes('qubit')) return ['Superconducting', 'Photonic', 'Topological', 'Trapped Ion'];
  if (t.includes('dark matter')) return ['WIMP Candidates', 'Axions', 'Primordial Black Holes', 'Modified Gravity'];
  const words = topic.split(/[ —]/g).filter(Boolean);
  const root = words[0] || topic;
  return [`${root} Mechanisms`, `${root} Evidence`, `${root} Critique`, `${root} Applications`];
};

/**
 * Returns 2-3 smart explore directions for a node — shown as chips after expansion.
 */
const getSuggestedDirections = (topic: string): string[] => {
  const t = topic.toLowerCase();
  if (t.includes('quantum') || t.includes('qubit')) return ['Measure effects', 'Compare models', 'Find applications'];
  if (t.includes('ai') || t.includes('model') || t.includes('transformer')) return ['Trace limitations', 'Compare architectures', 'Find edge cases'];
  if (t.includes('climate') || t.includes('carbon')) return ['Scale projections', 'Policy links', 'Opposing views'];
  if (t.includes('bio') || t.includes('gene') || t.includes('crispr')) return ['Clinical trials', 'Ethical implications', 'Evolutionary roots'];
  return ['Zoom out', 'Find contradictions', 'Historical perspective'];
};

const generateNodeConcept = (title: string): string => {
  return `Research node exploring the structural and conceptual dimensions of "${title}". Click + to dive deeper and generate sub-hypotheses.`;
};

// ----- Persistence helpers -----

/**
 * Saves the current graph state to localStorage.
 * Strips functions from node data before serialization.
 */
const saveGraph = (nodes: any[], edges: any[]) => {
  const stripped = nodes.map(n => ({
    ...n,
    data: { ...n.data, onExplore: undefined },
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes: stripped, edges }));
};

/**
 * Loads graph state from localStorage.
 * Returns null if nothing is stored.
 */
const loadGraph = (): { nodes: any[]; edges: any[] } | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

// ----- Node Types -----

const nodeTypes = {
  concept: ConceptNode,
  clusterZone: ClusterZone,
};

// ----- Toast notification -----

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-zinc-900 border border-white/10 text-sm text-gray-300 shadow-xl backdrop-blur-xl animate-fade-in pointer-events-none">
      {message}
    </div>
  );
}

// ----- Editor Canvas -----

function EditorCanvas() {
  const [viewMode, setViewMode] = useState<'detailed' | 'overview'>('detailed');
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [isResearching, setIsResearching] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState<string>(
    () => localStorage.getItem(GEMINI_KEY_STORAGE) ?? ''
  );
  const [apiKeyInput, setApiKeyInput] = useState('');
  /** Zone ID currently focused for zoom-in isolation. Null = full map view. */
  const [focusedZoneId, setFocusedZoneId] = useState<string | null>(null);
  const clusterIndexRef = useRef(0);

  const { theme, setTheme } = useTheme();
  const { fitView, setViewport } = useReactFlow();

  // NOTE: rehydration is done inline in handleLoad — see below

  /**
   * Explain a node — calls Gemini at the requested detail level.
   * Level 1 = brief (dot 2), 2 = standard (auto), 3 = deep (dot 3).
   */
  const handleExplain = useCallback(async (title: string, nodeId: string, level: 1 | 2 | 3 = 2) => {
    setNodes(nds => nds.map(n =>
      n.id === nodeId
        ? { ...n, data: { ...n.data, isExplaining: true, explainLevel: level } }
        : n
    ));

    try {
      const explanation = await fetchExplanation(title, apiKey, level);
      setNodes(nds => nds.map(n =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, concept: explanation, explained: true, isExplaining: false, isExpanded: true, explainLevel: level } }
          : n
      ));
    } catch (err: any) {
      console.error('Explain error:', err);
      setNodes(nds => nds.map(n =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, isExplaining: false } }
          : n
      ));
      setToast(`Explain failed: ${err?.message?.slice(0, 50) ?? 'unknown'}`);
    }
  }, [apiKey]);

  /**
   * Drill-down expand — calls Gemini for real sub-topics, anchors them inside a new zone.
   * Falls back to generic labels if no API key is set.
   */
  const handleExplore = useCallback(async (nodeId: string) => {
    setNodes((nds) => {
      const parentNode = nds.find(n => n.id === nodeId);
      if (!parentNode) return nds;
      return nds.map(n => n.id === nodeId
        ? { ...n, data: { ...n.data, isExpanding: true, onExplore: handleExplore, onExplain: handleExplain } }
        : n
      );
    });

    // A6: Root node → add more clusters via fetchClustersFromGemini
    setNodes((nds) => {
      const parentNode = nds.find(n => n.id === nodeId);
      if (!parentNode) return nds;
      const parentDepth: number = parentNode.data.depth ?? 1;
      const parentTitle: string = parentNode.data.title;

      if (parentDepth === 0 && apiKey) {
        // Async: fetch more clusters and add them to the graph
        fetchClustersFromGemini(parentTitle, apiKey)
          .then(clusters => {
            setNodes(current => {
              const existingZones = current.filter(n => n.type === 'clusterZone').length;
              const newNodes: any[] = [];
              const newEdges: any[] = [];

              clusters.forEach((cluster, ci) => {
                const paletteEntry = CLUSTER_PALETTE[(existingZones + ci) % CLUSTER_PALETTE.length];
                const angle = (2 * Math.PI / clusters.length) * ci + existingZones * 0.5;
                const radius = 700 + existingZones * 200;
                const cx = radius * Math.cos(angle);
                const cy = radius * Math.sin(angle);
                const zoneId = `zone-expand-${Date.now()}-${ci}`;

                const kwPositions = cluster.keywords.map((_, ki) => {
                  const kwAngle = angle + ((ki - 1) * 0.4);
                  return { x: cx + 140 * Math.cos(kwAngle), y: cy + 140 * Math.sin(kwAngle) };
                });

                const allX = [...kwPositions.map(p => p.x), cx];
                const allY = [...kwPositions.map(p => p.y), cy];
                const zW = Math.max((Math.max(...allX) - Math.min(...allX)) + ZONE_PADDING, 400);
                const zH = Math.max((Math.max(...allY) - Math.min(...allY)) + ZONE_PADDING, 300);
                const zL = (Math.min(...allX) + Math.max(...allX)) / 2 - zW / 2;
                const zT = (Math.min(...allY) + Math.max(...allY)) / 2 - zH / 2;

                newNodes.push({
                  id: zoneId, type: 'clusterZone',
                  position: { x: zL, y: zT },
                  style: { width: zW, height: zH, zIndex: -1 },
                  data: { label: cluster.label, color: paletteEntry.color, pattern: paletteEntry.pattern, onFocus: handleFocusZone },
                  selectable: true, draggable: true,
                });

                const proxyId = `proxy-exp-${Date.now()}-${ci}`;
                newNodes.push({
                  id: proxyId, type: 'concept', parentId: zoneId, zIndex: 10,
                  position: { x: cx - zL, y: cy - zT },
                  data: { title: cluster.label, concept: `Thematic cluster: ${cluster.keywords.join(', ')}`, trl: 8, sourceReliability: 'High' as const, depth: 1, onExplore: handleExplore, onExplain: handleExplain },
                });

                cluster.keywords.forEach((kw, ki) => {
                  const kwId = `kw-exp-${Date.now()}-${ci}-${ki}`;
                  newNodes.push({
                    id: kwId, type: 'concept', parentId: zoneId, zIndex: 10,
                    position: { x: kwPositions[ki].x - zL, y: kwPositions[ki].y - zT },
                    data: { title: kw, concept: `Keyword in "${cluster.label}" cluster.`, trl: 7, sourceReliability: 'High' as const, depth: 2, onExplore: handleExplore, onExplain: handleExplain },
                  });
                  newEdges.push({ id: `edge-${proxyId}-${kwId}`, source: proxyId, target: kwId, ...MAP_EDGE_STYLE, style: { stroke: 'rgba(26,26,26,0.32)', strokeWidth: 1.2, strokeDasharray: '4 4' } });
                });

                newEdges.push({ id: `edge-root-${proxyId}`, source: nodeId, target: proxyId, ...MAP_EDGE_STYLE });
              });

              setEdges(eds => [...eds, ...newEdges]);
              // Add zone nodes first, then children
              const zones = newNodes.filter(n => n.type === 'clusterZone');
              const children = newNodes.filter(n => n.type !== 'clusterZone');
              return [...zones, ...children, ...current.map(n => n.id === nodeId ? { ...n, data: { ...n.data, isExpanding: false, onExplore: handleExplore, onExplain: handleExplain } } : n)];
            });
            setToast(`+${clusters.length} new clusters ✓`);
            setTimeout(() => fitView({ duration: 800, padding: 0.12 }), 100);
          })
          .catch(err => {
            console.error('Expand root error:', err);
            setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, isExpanding: false } } : n));
          });
        return nds; // return unchanged, async will update
      }

      // A5: Sub-topic → find existing zone or create new one, add children to it
      const existingZoneId = parentNode.parentId;
      const paletteEntry = CLUSTER_PALETTE[clusterIndexRef.current % CLUSTER_PALETTE.length];
      clusterIndexRef.current += 1;
      const spawnRadius = BASE_SPAWN_RADIUS * Math.pow(0.65, parentDepth);

      const placeholders = ['Sub-topic 1', 'Sub-topic 2', 'Sub-topic 3', 'Sub-topic 4'];
      const angleStep = (2 * Math.PI) / placeholders.length;
      const angleOffset = -Math.PI / 2;

      // For A5: when node has a parentId, compute positions relative to node within the same zone
      const nodeAbsX = parentNode.position.x;
      const nodeAbsY = parentNode.position.y;

      if (existingZoneId) {
        // A5: Add children to the SAME zone.
        // Positions must be relative to the zone's top-left corner.
        const existingZone = nds.find(n => n.id === existingZoneId);
        const zoneX = existingZone?.position?.x ?? 0;
        const zoneY = existingZone?.position?.y ?? 0;
        const zoneW = Number(existingZone?.style?.width ?? 500);
        const zoneH = Number(existingZone?.style?.height ?? 460);

        // The center of the zone in zone-local coords is approx half w/h
        const localCx = zoneW / 2 + spawnRadius * 0.35 * Math.cos(angleOffset + Math.PI * (clusterIndexRef.current % 2));
        const localCy = zoneH / 2 + spawnRadius * 0.35 * Math.sin(angleOffset + Math.PI * (clusterIndexRef.current % 2));

        const childNodes = placeholders.map((title, i) => ({
          id: `node-${Date.now()}-${i}`,
          type: 'concept',
          parentId: existingZoneId,
          zIndex: 10,
          position: {
            // Zone-local positions spread around the local center
            x: localCx + spawnRadius * 0.45 * Math.cos(angleOffset + angleStep * i),
            y: localCy + spawnRadius * 0.45 * Math.sin(angleOffset + angleStep * i),
          },
          data: {
            title,
            concept: 'Loading…',
            trl: Math.max(1, 8 - parentDepth * 2),
            sourceReliability: (parentDepth <= 1 ? 'High' : parentDepth === 2 ? 'Medium' : 'Low') as any,
            depth: parentDepth + 1,
            onExplore: handleExplore,
            onExplain: handleExplain,
          },
        }));

        // Edge directions from source node to children (absolute coords for handle picking)
        setEdges((eds) => [
          ...eds,
          ...childNodes.map((child) => {
            const childAbsPos = { x: zoneX + child.position.x, y: zoneY + child.position.y };
            const handles = pickHandles(
              { x: nodeAbsX + zoneX, y: nodeAbsY + zoneY },
              childAbsPos,
            );
            return {
              id: `edge-${nodeId}-${child.id}`,
              source: nodeId,
              target: child.id,
              ...MAP_EDGE_STYLE,
              ...handles,
            };
          }),
        ]);

        // Async: fetch real sub-topics from Gemini
        if (apiKey) {
          fetchSubTopicsFromGemini(parentTitle, apiKey)
            .then((subTopics) => {
              setNodes(current =>
                current.map(n => {
                  const idx = childNodes.findIndex(c => c.id === n.id);
                  if (idx === -1) return n;
                  const sub = subTopics[idx];
                  if (!sub) return n;
                  return { ...n, data: { ...n.data, title: sub.title, concept: sub.concept } };
                })
              );
            })
            .catch(err => console.error('fetchSubTopicsFromGemini error:', err));
        }

        // Expand zone to fit the new children
        const updatedParent = {
          ...parentNode,
          data: { ...parentNode.data, isExpanding: false, onExplore: handleExplore, onExplain: handleExplain },
        };

        const nextNodes = [
          ...childNodes,
          ...nds.map(n => {
            if (n.id === existingZoneId) {
              return { ...n, style: { ...n.style, width: Math.max(zoneW, zoneW + 150), height: Math.max(zoneH, zoneH + 150) } };
            }
            if (n.id === nodeId) return updatedParent;
            return n;
          }),
        ];
        return resolveCollisions(updateClusterZoneBounds(nextNodes));
      }

      // No existing zone: create one for the cluster
      const zoneId = `zone-topic-${Date.now()}`;
      const childNodes = placeholders.map((title, i) => ({
        id: `node-${Date.now()}-${i}`,
        type: 'concept',
        parentId: zoneId,
        zIndex: 10,
        position: {
          x: 240 + spawnRadius * 0.6 * Math.cos(angleOffset + angleStep * i),
          y: 200 + spawnRadius * 0.6 * Math.sin(angleOffset + angleStep * i),
        },
        data: {
          title, concept: 'Loading…', trl: 7, sourceReliability: 'Medium' as any, depth: parentDepth + 1,
          onExplore: handleExplore, onExplain: handleExplain,
        },
      }));

      const zoneNode = {
        id: zoneId, type: 'clusterZone',
        position: { x: nodeAbsX - 240, y: nodeAbsY - 200 },
        style: { width: 500, height: 460, zIndex: -1 },
        data: { label: parentTitle, color: paletteEntry.color, pattern: paletteEntry.pattern, onFocus: handleFocusZone },
        selectable: true, draggable: true,
      };

      setEdges((eds) => [
        ...eds,
        ...childNodes.map((child) => {
          const handles = pickHandles(
            { x: nodeAbsX, y: nodeAbsY },
            child.position,
          );
          return {
            id: `edge-${nodeId}-${child.id}`,
            source: nodeId,
            target: child.id,
            ...MAP_EDGE_STYLE,
            ...handles,
          };
        }),
      ]);

      if (apiKey) {
        fetchSubTopicsFromGemini(parentTitle, apiKey)
          .then((subTopics) => {
            setNodes(current =>
              current.map(n => {
                const idx = childNodes.findIndex(c => c.id === n.id);
                if (idx === -1) return n;
                const sub = subTopics[idx];
                if (!sub) return n;
                return { ...n, data: { ...n.data, title: sub.title, concept: sub.concept } };
              })
            );
          })
          .catch(err => console.error('fetchSubTopicsFromGemini error:', err));
      } else {
        const words = parentTitle.split(/[ —]/g).filter(Boolean);
        const root = words[0] || parentTitle;
        const genericTitles = [`${root} Mechanisms`, `${root} Evidence`, `${root} Critique`, `${root} Applications`];
        setNodes(current =>
          current.map(n => {
            const idx = childNodes.findIndex(c => c.id === n.id);
            if (idx === -1) return n;
            return { ...n, data: { ...n.data, title: genericTitles[idx] ?? n.data.title, concept: `Sub-topic of "${parentTitle}"` } };
          })
        );
      }

      const updatedParent = {
        ...parentNode,
        data: { ...parentNode.data, isExpanding: false, onExplore: handleExplore, onExplain: handleExplain },
      };

      return [zoneNode, ...childNodes, ...nds.filter(n => n.id !== nodeId), updatedParent];
    });

    setTimeout(() => fitView({ duration: 900, padding: 0.15 }), 80);
  }, [fitView, apiKey, handleExplain]);

  /**
   * Builds the full InfraNodus-style cluster map using Gemini.
   * If no API key is set, prompts the user to add one.
   */
  const handleStartResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const topic = inputValue.trim();
    if (!topic || isResearching) return;

    if (!apiKey) {
      setShowSettings(true);
      setToast('Add a Gemini API key to research → ⚙️');
      return;
    }

    localStorage.setItem('research-tool-last-topic', topic);
    setIsResearching(true);
    setInputValue('');
    setFocusedZoneId(null);

    try {
      const clusters = await fetchClustersFromGemini(topic, apiKey);
      setToast(`Gemini mapped ${clusters.length} clusters ✓`);
      buildClusterGraph(topic, clusters);
    } catch (err: any) {
      console.error('Gemini API error:', err);
      setToast(`API error: ${err?.message?.slice(0, 60) ?? 'unknown'}`);
    } finally {
      setIsResearching(false);
    }
  };

  /**
   * Builds all nodes and edges from a cluster definition array.
   * Extracted so it can be called after both Gemini and fallback paths.
   */
  /**
   * Focuses a specific zone: zooms in on it and dims all other nodes.
   * If the same zone is clicked again, resets to full map view.
   */
  const handleFocusZone = useCallback((zoneId: string) => {
    setFocusedZoneId(prev => {
      if (prev === zoneId) {
        // Toggle off — restore full map
        fitView({ duration: 700, padding: 0.12 });
        return null;
      }
      return zoneId;
    });
  }, [fitView]);

  /**
   * Builds the full InfraNodus-style cluster map.
   * Keyword nodes are anchored inside their zone via parentId + extent: 'parent'.
   */
  const buildClusterGraph = useCallback((topic: string, clusters: Array<{label: string; keywords: string[]}>) => {
    const rootId = `root-${Date.now()}`;
    clusterIndexRef.current = 0;

    const clusterAngleStep = (2 * Math.PI) / clusters.length;
    // Larger radii to prevent zone overlap
    const radii = clusters.map((_, i) => 900 + ((i * 97) % 220));

    const allNewNodes: any[] = [];
    const allNewEdges: any[] = [];

    clusters.forEach((cluster, ci) => {
      const paletteEntry = CLUSTER_PALETTE[ci % CLUSTER_PALETTE.length];
      clusterIndexRef.current = ci + 1;

      // Spread clusters evenly with slight phase offset
      const clusterAngle = clusterAngleStep * ci + ci * 0.1 - Math.PI / 2;
      const radius = radii[ci];
      const clusterCx = radius * Math.cos(clusterAngle);
      const clusterCy = radius * Math.sin(clusterAngle);

      const kwCount = cluster.keywords.length;
      const kwRadius = 200 + kwCount * 25;
      const kwAngleStep = (1.4 * Math.PI) / Math.max(kwCount - 1, 1);
      const kwAngleStart = clusterAngle - 0.7 * Math.PI;

      const zoneId = `zone-initial-${ci}`;

      // Compute absolute kw positions first so we can derive zone bounds
      const absKwPositions = cluster.keywords.map((_, ki) => {
        const kwAngle = kwAngleStart + kwAngleStep * ki;
        const jitter = (Math.random() - 0.5) * 30;
        return {
          x: clusterCx + kwRadius * Math.cos(kwAngle) + jitter,
          y: clusterCy + kwRadius * Math.sin(kwAngle) + jitter,
        };
      });

      const allX = [...absKwPositions.map(p => p.x), clusterCx];
      const allY = [...absKwPositions.map(p => p.y), clusterCy];
      const zoneW = Math.max((Math.max(...allX) - Math.min(...allX)) + ZONE_PADDING, 400);
      const zoneH = Math.max((Math.max(...allY) - Math.min(...allY)) + ZONE_PADDING, 300);
      const zoneLeft = (Math.min(...allX) + Math.max(...allX)) / 2 - zoneW / 2;
      const zoneTop = (Math.min(...allY) + Math.max(...allY)) / 2 - zoneH / 2;

      // Zone node — must be added BEFORE children that reference it as parentId
      const zoneNode = {
        id: zoneId,
        type: 'clusterZone',
        position: { x: zoneLeft, y: zoneTop },
        style: { width: zoneW, height: zoneH, zIndex: -1 },
        data: {
          label: cluster.label,
          color: paletteEntry.color,
          pattern: paletteEntry.pattern,
          onFocus: handleFocusZone,
        },
        selectable: true,
        draggable: true,
      };

      // Keyword nodes anchored inside zone (positions relative to zone top-left)
      const kwNodes = cluster.keywords.map((kw, ki) => ({
        id: `kw-${Date.now()}-${ci}-${ki}`,
        type: 'concept',
        parentId: zoneId,
        zIndex: 10,
        position: {
          x: absKwPositions[ki].x - zoneLeft,
          y: absKwPositions[ki].y - zoneTop,
        },
        data: {
          title: kw,
          concept: `Keyword in "${cluster.label}" cluster.`,
          trl: 7,
          sourceReliability: 'High' as const,
          depth: 2,
          onExplore: handleExplore,
          onExplain: handleExplain,
        },
      }));

      // Proxy node (cluster label) — also anchored inside zone, at zone center
      const proxyId = `proxy-${Date.now()}-${ci}`;
      const proxyNode = {
        id: proxyId,
        type: 'concept',
        parentId: zoneId,
        zIndex: 10,
        position: {
          x: clusterCx - zoneLeft,
          y: clusterCy - zoneTop,
        },
        data: {
          title: cluster.label,
          concept: `Thematic cluster: ${cluster.keywords.join(', ')}`,
          trl: 8,
          sourceReliability: 'High' as const,
          depth: 1,
          onExplore: handleExplore,
          onExplain: handleExplain,
        },
      };

      // Zone first, then its children
      allNewNodes.push(zoneNode, proxyNode, ...kwNodes);

      // Root → Proxy edge: pick handles based on relative positions
      const rootToProxy = pickHandles({ x: 0, y: 0 }, { x: clusterCx, y: clusterCy });
      allNewEdges.push({
        id: `edge-root-${proxyId}`,
        source: rootId,
        target: proxyId,
        ...MAP_EDGE_STYLE,
        ...rootToProxy,
      });
      // Proxy → keyword edges: pick handles based on keyword positions relative to proxy
      kwNodes.forEach((kw, ki) => {
        const kwAbs = absKwPositions[ki];
        const handles = pickHandles({ x: clusterCx, y: clusterCy }, kwAbs);
        allNewEdges.push({
          id: `edge-${proxyId}-${kw.id}`,
          source: proxyId,
          target: kw.id,
          ...MAP_EDGE_STYLE,
          ...handles,
          style: { stroke: 'rgba(26,26,26,0.32)', strokeWidth: 1.2, strokeDasharray: '4 4' },
        });
      });
    });

    const rootNode = {
      id: rootId,
      type: 'concept',
      position: { x: 0, y: 0 },
      zIndex: 10,
      data: {
        title: topic,
        concept: `Central research topic. ${clusters.length} thematic clusters identified. Explore any cluster to dive deeper.`,
        trl: 9,
        sourceReliability: 'High' as const,
        depth: 0,
        onExplore: handleExplore,
        onExplain: handleExplain,
        explained: true,  // root concept is always shown
        isExpanded: true, // root footer is shown by default
      },
    };

    setNodes([rootNode, ...allNewNodes]);
    setEdges(allNewEdges);
    
    // Auto-explain root and proxy nodes sequentially to avoid API flooding and crashes (A18)
    if (apiKey) {
      const triggerAutoExplains = async () => {
        // 1. Explain root
        await handleExplain(topic, rootId);
        
        // 2. Explain proxies slowly
        for (const n of allNewNodes) {
          if (n.type === 'concept' && n.data.depth === 1) {
            await handleExplain(n.data.title, n.id);
            // Higher delay between to prevent ReactFlow bottlenecks
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      };
      
      triggerAutoExplains();
    }

    setTimeout(() => fitView({ duration: 900, padding: 0.12 }), 100);
  }, [fitView, handleExplore, handleExplain, handleFocusZone, apiKey]);

  /** Save graph to localStorage */
  const handleSave = () => {
    saveGraph(nodes, edges);
    setToast('Graph saved ✓');
  };

  /** Load graph from localStorage */
  const handleLoad = () => {
    const saved = loadGraph();
    if (!saved) {
      setToast('Nothing saved yet');
      return;
    }
    const rehydrated = saved.nodes.map(n => ({
      ...n,
      data: { ...n.data, onExplore: handleExplore, onExplain: handleExplain },
    }));
    setNodes(rehydrated);
    setEdges(saved.edges);
    setTimeout(() => fitView({ duration: 800, padding: 0.15 }), 100);
    setToast('Graph loaded ✓');
  };

  // --- Autostart Clustering (InfraNodus Style) ---
  // On mount: load saved graph OR trigger live Gemini clustering.
  const hasAutoStarted = useRef(false);

  useEffect(() => {
    if (hasAutoStarted.current) return;
    hasAutoStarted.current = true;

    // 1. Saved graph exists → rehydrate
    const saved = loadGraph();
    if (saved && saved.nodes.length > 0) {
      const rehydrated = saved.nodes.map(n => ({
        ...n,
        data: { ...n.data, onExplore: handleExplore, onExplain: handleExplain },
      }));
      setNodes(rehydrated);
      setEdges(saved.edges);
      setTimeout(() => fitView({ duration: 800, padding: 0.15 }), 100);
      setToast('Session restored ✓');
      return;
    }

    // 2. Gemini API key available → auto-generate clusters from last topic
    const storedKey = localStorage.getItem(GEMINI_KEY_STORAGE) ?? '';
    if (!storedKey) return; // No key → empty state, user enters topic + key manually

    const lastTopic = localStorage.getItem('research-tool-last-topic') ?? '';
    if (!lastTopic) return; // No previous topic → wait for user input

    const autoStart = async () => {
      setIsResearching(true);
      try {
        const clusters = await fetchClustersFromGemini(lastTopic, storedKey);
        buildClusterGraph(lastTopic, clusters);
        setToast(`Auto-mapped "${lastTopic}" — ${clusters.length} clusters ✓`);
      } catch (err: any) {
        console.error('Autostart Gemini error:', err);
        setToast(`Auto-start failed: ${err?.message?.slice(0, 50) ?? 'unknown'}`);
      } finally {
        setIsResearching(false);
      }
    };

    autoStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes(nds => {
        const next = applyNodeChanges(changes, nds);
        
        // Only trigger zone bounds update on dimension changes (expansion/contraction)
        const hasDimChange = changes.some(c => c.type === 'dimensions');
        if (hasDimChange) {
          return updateClusterZoneBounds(next);
        }
        return next;
      });
    },
    []
  );

  const onNodeDragStop = useCallback(() => {
    // Final relaxation pass
    setNodes(nds => resolveCollisions(updateClusterZoneBounds(nds), 60));
  }, []);

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges(eds => applyEdgeChanges(changes, eds)),
    []
  );

  /** Manual wire between nodes → triggers synergy research via Gemini */
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges(eds => addEdge({ ...params, ...MAP_EDGE_STYLE, label: '↔' } as Edge, eds));

      // Get node titles for synergy research
      const srcNode = nodes.find(n => n.id === params.source);
      const tgtNode = nodes.find(n => n.id === params.target);
      if (!srcNode || !tgtNode) return;

      const srcTitle = srcNode.data.title;
      const tgtTitle = tgtNode.data.title;

      // Create placeholder synergy node immediately
      const offset = (Math.random() - 0.5) * 120;
      const synergyId = `synergy-${Date.now()}`;
      const synergyNode = {
        id: synergyId,
        type: 'concept',
        position: {
          x: (srcNode.position.x + tgtNode.position.x) / 2 + offset,
          y: (srcNode.position.y + tgtNode.position.y) / 2 + offset,
        },
        data: {
          title: `${srcTitle} × ${tgtTitle}`,
          concept: 'Loading…',
          trl: 7,
          sourceReliability: 'Medium' as const,
          depth: Math.max(srcNode.data.depth ?? 0, tgtNode.data.depth ?? 0) + 1,
          onExplore: handleExplore,
          onExplain: handleExplain,
          explained: true,
        },
      };
      setNodes(nds => [...nds, synergyNode]);

      // Async: fetch synergy insights from Gemini
      if (apiKey) {
        fetchSynergyFromGemini(srcTitle, tgtTitle, apiKey)
          .then(synergies => {
            // Update synergy node with first result as concept
            const concept = synergies.map(s => `• ${s.title}: ${s.concept}`).join('\n');
            setNodes(nds => nds.map(n =>
              n.id === synergyId
                ? { ...n, data: { ...n.data, concept } }
                : n
            ));

            // Spawn child nodes for each synergy insight
            const paletteEntry = CLUSTER_PALETTE[clusterIndexRef.current % CLUSTER_PALETTE.length];
            clusterIndexRef.current += 1;
            const zoneId = `zone-synergy-${Date.now()}`;
            const angleStep = (2 * Math.PI) / synergies.length;
            const spawnR = 180;

            const childNodes = synergies.map((s, i) => ({
              id: `synergy-child-${Date.now()}-${i}`,
              type: 'concept',
              parentId: zoneId,
              zIndex: 10,
              position: {
                x: 200 + spawnR * Math.cos(angleStep * i),
                y: 180 + spawnR * Math.sin(angleStep * i),
              },
              data: {
                title: s.title,
                concept: s.concept,
                trl: 6,
                sourceReliability: 'Medium' as const,
                depth: (synergyNode.data.depth ?? 1) + 1,
                onExplore: handleExplore,
                onExplain: handleExplain,
              },
            }));

            const zoneNode = {
              id: zoneId,
              type: 'clusterZone',
              position: {
                x: synergyNode.position.x - 220,
                y: synergyNode.position.y + 60,
              },
              style: { width: 500, height: 460, zIndex: -1 },
              data: {
                label: `${srcTitle} × ${tgtTitle}`,
                color: paletteEntry.color,
                pattern: paletteEntry.pattern,
                onFocus: handleFocusZone,
              },
              selectable: true,
              draggable: true,
            };

            setNodes(nds => [zoneNode, ...childNodes, ...nds]);
            setEdges(eds => [
              ...eds,
              ...childNodes.map(c => ({
                id: `edge-synergy-${synergyId}-${c.id}`,
                source: synergyId,
                target: c.id,
                ...MAP_EDGE_STYLE,
              })),
            ]);

            setToast(`Synergy: ${synergies.length} insights found ✓`);
            setTimeout(() => fitView({ duration: 800, padding: 0.12 }), 100);
          })
          .catch(err => {
            console.error('Synergy research error:', err);
            setNodes(nds => nds.map(n =>
              n.id === synergyId
                ? { ...n, data: { ...n.data, concept: `Synergy between "${srcTitle}" and "${tgtTitle}" — connect to explore laterally.` } }
                : n
            ));
          });
      } else {
        setNodes(nds => nds.map(n =>
          n.id === synergyId
            ? { ...n, data: { ...n.data, concept: `Lateral bridge between "${srcTitle}" and "${tgtTitle}". Add API key for AI synergy analysis.` } }
            : n
        ));
      }

      setTimeout(() => fitView({ duration: 600, padding: 0.12 }), 50);
    },
    [handleExplore, handleExplain, handleFocusZone, fitView, apiKey, nodes]
  );

  /** Semantic zoom: update viewMode based on current zoom level */
  const handleMove = useCallback((_event: any, viewport: { zoom: number }) => {
    setViewMode(prev => {
      const next = viewport.zoom <= 0.55 ? 'overview' : 'detailed';
      return next !== prev ? next : prev;
    });
  }, []);

  const handleNodeDoubleClick = useCallback((_event: React.MouseEvent, node: any) => {
    if (node.type === 'concept') {
      setNodes(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, isExpanded: !n.data.isExpanded } } : n));
    }
  }, [setNodes]);

  const handleZoomModeClick = () => {
    if (viewMode === 'detailed') {
      setViewport({ x: 0, y: 0, zoom: 0.3 }, { duration: 800 });
    } else {
      fitView({ duration: 800, padding: 0.12 });
    }
  };

  return (
    <div className="relative w-screen h-screen font-sans overflow-hidden">
      {/* React Flow Canvas */}
      <div className="absolute inset-0 z-0">
        <ViewModeContext.Provider value={viewMode}>
          <ReactFlow
            nodes={nodes.map(n => {
              // Dim nodes outside focused zone; exempt root node always
              if (!focusedZoneId || n.data?.depth === 0) return n;
              const isInFocus = n.id === focusedZoneId || n.parentId === focusedZoneId;
              return isInFocus ? n : { ...n, style: { ...n.style, opacity: 0.12, pointerEvents: 'none' } };
            })}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={onNodeDragStop}
            onConnect={onConnect}
            onMove={handleMove}
            onNodeDoubleClick={handleNodeDoubleClick}
            onPaneClick={() => {
              if (focusedZoneId) {
                setFocusedZoneId(null);
                fitView({ duration: 600, padding: 0.12 });
              }
            }}
            nodeTypes={nodeTypes}
            connectionMode="loose"
            minZoom={0.05}
            maxZoom={2}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            className="dark:bg-[#080808] bg-zinc-100"
            defaultEdgeOptions={{ ...MAP_EDGE_STYLE, zIndex: 0 }}
            elevateEdgesOnSelect={false}
          >
            <Background color="rgba(255,255,255,0.04)" gap={32} size={1} />
          </ReactFlow>
        </ViewModeContext.Provider>
      </div>

      {/* Header — logo left, controls right, NO search bar */}
      <header className="absolute top-0 left-0 right-0 px-6 py-5 flex justify-between items-center z-20 pointer-events-none">
        {/* Logo */}
        <div className="flex items-center gap-3 pointer-events-auto">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6366f1, #9333ea)', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}
          >
            <Activity className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-white/60 tracking-wide">Research Map</span>
        </div>

        {/* Controls — right */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 transition-colors text-gray-400"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>


          {/* Settings */}
          <button
            onClick={() => setShowSettings(s => !s)}
            title="API Settings"
            className={`p-2 rounded-lg border transition-colors text-gray-400 ${
              showSettings ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400' : 'bg-white/5 hover:bg-white/10 border-white/8'
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Save */}
          <button
            onClick={handleSave}
            title="Save graph"
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 transition-colors text-gray-400 hover:text-indigo-400"
          >
            <Save className="w-4 h-4" />
          </button>

          {/* Load */}
          <button
            onClick={handleLoad}
            title="Load saved graph"
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 transition-colors text-gray-400 hover:text-indigo-400"
          >
            <FolderOpen className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Settings Panel */}
      {showSettings && (
        <div className="absolute top-20 right-6 z-30 w-80 bg-zinc-950/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-5 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-semibold text-white">Gemini API Key</span>
            </div>
            <button onClick={() => setShowSettings(false)} className="text-gray-500 hover:text-gray-300">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-3 leading-relaxed">
            Get your key at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-indigo-400 underline underline-offset-2">aistudio.google.com</a>. Free tier available. Key is stored locally only.
          </p>
          <form
            onSubmit={(e: React.FormEvent) => {
              e.preventDefault();
              const trimmed = apiKeyInput.trim();
              localStorage.setItem(GEMINI_KEY_STORAGE, trimmed);
              setApiKey(trimmed);
              setApiKeyInput('');
              setShowSettings(false);
              setToast(trimmed ? 'Gemini API key saved ✓' : 'API key cleared');
            }}
            className="flex flex-col gap-3"
          >
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKeyInput(e.target.value)}
              placeholder={apiKey ? '•••••• (key stored — paste to replace)' : 'AIza...'}
              className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-indigo-500/50 w-full"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
              >
                Save Key
              </button>
              {apiKey && (
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem(GEMINI_KEY_STORAGE);
                    setApiKey('');
                    setToast('API key removed');
                  }}
                  className="px-3 py-2 rounded-lg bg-red-900/30 hover:bg-red-900/50 text-red-400 text-xs font-semibold transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Loading overlay — shown while Gemini is processing */}
      {isResearching && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-none">
          <div className="w-12 h-12 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin mb-4" />
          <p className="text-white/70 text-sm font-medium">Researching with Gemini…</p>
          <p className="text-gray-500 text-xs mt-1">Mapping semantic clusters</p>
        </div>
      )}

      {/* Bottom search dock — ultra-transparent frosted glass */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
        <form
          onSubmit={handleStartResearch}
          className="flex items-center gap-3 backdrop-blur-md bg-white/[0.03] border border-white/[0.08] rounded-2xl px-5 py-4 transition-all w-[480px]
            shadow-[0_4px_24px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)]
            focus-within:border-white/[0.15] focus-within:bg-white/[0.05]"
        >
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder={apiKey ? 'Enter a research topic…' : 'Add API key first (⚙️) then type topic…'}
            className="bg-transparent text-zinc-900 dark:text-white text-sm outline-none flex-1 tracking-tight placeholder-zinc-400 dark:placeholder-white/30"
            disabled={isResearching}
          />
          {/* Gemini status dot */}
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${apiKey ? 'bg-emerald-400' : 'bg-white/20'}`}
            title={apiKey ? 'Gemini connected' : 'Local mode'}
          />
          <button
            type="submit"
            disabled={isResearching || !inputValue.trim()}
            className="shrink-0 px-3 py-1 rounded-lg text-xs font-medium transition-all disabled:opacity-30
              border border-white/[0.1] bg-white/[0.06] text-white/50 hover:text-white hover:bg-white/[0.12]"
            title="Start research"
          >
            {isResearching ? (
              <span className="w-3 h-3 rounded-full border border-indigo-400 border-t-transparent animate-spin inline-block" />
            ) : (
              '→'
            )}
          </button>
        </form>
      </div>

      {/* Hint when canvas is empty */}
      {nodes.length === 0 && !isResearching && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="text-center">
            {!apiKey ? (
              <>
                <p className="text-gray-400 text-sm font-semibold mb-1">Add your Gemini API key to get started</p>
                <p className="text-gray-600 text-xs">Click ⚙️ in the top-right to enter your key, then type a topic below</p>
              </>
            ) : (
              <>
                <p className="text-gray-500 text-sm font-medium">Type a research topic below</p>
                <p className="text-gray-700 text-xs mt-1">Gemini will map semantic clusters in real-time</p>
                {loadGraph() && (
                  <p className="text-indigo-500/60 text-xs mt-3">Load your saved session via the toolbar ↗</p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Toast notifications */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <EditorCanvas />
    </ReactFlowProvider>
  );
}
