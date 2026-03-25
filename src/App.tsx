// Main application — node-based research environment.
// Visualizes a research conversation as an interactive knowledge map.
// ClusterZone nodes define territories; ConceptNode cards show research items.
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Activity, Sparkles, Sun, Moon, Save, Layers, FolderOpen, Settings, X, Key } from 'lucide-react';
import { fetchClustersFromGemini, GEMINI_KEY_STORAGE } from './gemini-api';
import { useTheme } from 'next-themes';
import { ViewModeContext } from './context';
import {
  ReactFlow, Background, applyNodeChanges, applyEdgeChanges, addEdge,
  Connection, Edge, NodeChange, EdgeChange, ReactFlowProvider, useReactFlow,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ConceptNode } from './components/concept-node';
import { ClusterZone } from './components/cluster-zone';

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
  style: { stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1.2 },
  markerEnd: { type: MarkerType.Arrow, width: 10, height: 10, color: 'rgba(255,255,255,0.18)' },
  animated: false,
};

/** Base spawn radius — scales down with depth so deeper clusters are tighter */
const BASE_SPAWN_RADIUS = 500;
/** Padding around the bounding box of children for zone sizing */
const ZONE_PADDING = 280;

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
  const clusterIndexRef = useRef(0);

  const { theme, setTheme } = useTheme();
  const { fitView, setViewport } = useReactFlow();

  // NOTE: rehydration is done inline in handleLoad — see below

  /**
   * Drill-down expand — called when user clicks "+" on any keyword node.
   * Generates 3-4 specific sub-topics and a deeper cluster zone around them.
   * Also copies a research prompt to clipboard.
   */
  const handleExplore = useCallback((nodeId: string) => {
    setNodes((nds) => {
      const parentNode = nds.find(n => n.id === nodeId);
      if (!parentNode) return nds;

      const parentTitle: string = parentNode.data.title;
      const parentDepth: number = parentNode.data.depth ?? 1;
      const subTopics = expandKeyword(parentTitle);
      const hints = getSuggestedDirections(parentTitle);

      const paletteEntry = CLUSTER_PALETTE[clusterIndexRef.current % CLUSTER_PALETTE.length];
      clusterIndexRef.current += 1;
      const zoneId = `zone-${nodeId}-${Date.now()}`;

      const angleStep = (2 * Math.PI) / subTopics.length;
      const angleOffset = -Math.PI / 2;
      // Tighter radius for deep dives
      const spawnRadius = BASE_SPAWN_RADIUS * Math.pow(0.65, parentDepth);

      const childNodes = subTopics.map((sub, i) => {
        const jitter = (Math.random() - 0.5) * 0.25; // slight organic jitter
        const angle = angleOffset + angleStep * i + jitter;
        return {
          id: `node-${Date.now()}-${i}`,
          type: 'concept',
          position: {
            x: parentNode.position.x + spawnRadius * Math.cos(angle),
            y: parentNode.position.y + spawnRadius * Math.sin(angle),
          },
          data: {
            title: sub,
            concept: `Deep research into "${sub}" within the context of "${parentTitle}".`,
            trl: Math.max(1, 8 - parentDepth * 2),
            sourceReliability: (parentDepth <= 1 ? 'High' : parentDepth === 2 ? 'Medium' : 'Low') as any,
            depth: parentDepth + 1,
            onExplore: handleExplore,
          },
        };
      });

      // Mark parent as expanded with direction hints
      const updatedParent = {
        ...parentNode,
        data: { ...parentNode.data, subtopics: hints, onExplore: handleExplore },
      };

      const xs = childNodes.map(n => n.position.x);
      const ys = childNodes.map(n => n.position.y);
      const zoneW = (Math.max(...xs) - Math.min(...xs)) + ZONE_PADDING;
      const zoneH = (Math.max(...ys) - Math.min(...ys)) + ZONE_PADDING;
      const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
      const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;

      const zoneNode = {
        id: zoneId,
        type: 'clusterZone',
        position: { x: centerX - zoneW / 2, y: centerY - zoneH / 2 },
        style: { width: zoneW, height: zoneH, zIndex: -1 },
        data: { label: parentTitle, color: paletteEntry.color, pattern: paletteEntry.pattern },
        selectable: true,
        draggable: true,
      };

      setEdges((eds) => [
        ...eds,
        ...childNodes.map((child) => ({
          id: `edge-${nodeId}-${child.id}`,
          source: nodeId,
          target: child.id,
          ...MAP_EDGE_STYLE,
        })),
      ]);

      const prompt = `Geh tiefer in "${parentTitle}": ${subTopics.join(', ')}. Erkläre jeden Aspekt präzise und nenne offene Fragen.`;
      navigator.clipboard.writeText(prompt).catch(() => {});

      return [zoneNode, ...childNodes, ...nds.filter(n => n.id !== nodeId), updatedParent];
    });

    setTimeout(() => fitView({ duration: 900, padding: 0.15 }), 80);
  }, [fitView]);

  /**
   * Builds the full InfraNodus-style cluster map.
   * If a Gemini API key is stored, calls the API for real, topic-specific clusters.
   * Falls back to the static knowledge database if the API call fails or no key is set.
   */
  const handleStartResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const topic = inputValue.trim();
    if (!topic || isResearching) return;

    setIsResearching(true);
    setInputValue('');

    let clusters;
    try {
      if (apiKey) {
        clusters = await fetchClustersFromGemini(topic, apiKey);
        setToast(`Gemini mapped ${clusters.length} clusters ✓`);
      } else {
        clusters = getInitialClusters(topic);
        setToast('Add a Gemini API key for live research → ⚙️');
      }
    } catch (err: any) {
      console.error('Gemini API error:', err);
      setToast(`API error — using local data: ${err?.message?.slice(0, 60) ?? 'unknown'}`);
      clusters = getInitialClusters(topic);
    }

    setIsResearching(false);
    buildClusterGraph(topic, clusters);
  };

  /**
   * Builds all nodes and edges from a cluster definition array.
   * Extracted so it can be called after both Gemini and fallback paths.
   */
  const buildClusterGraph = useCallback((topic: string, clusters: Array<{label: string; keywords: string[]}>) => {
    const rootId = `root-${Date.now()}`;
    clusterIndexRef.current = 0;

    const clusterAngleStep = (2 * Math.PI) / clusters.length;
    const radii = clusters.map((_, i) => 580 + ((i * 73) % 180));

    const allNewNodes: any[] = [];
    const allNewEdges: any[] = [];

    clusters.forEach((cluster, ci) => {
      const paletteEntry = CLUSTER_PALETTE[ci % CLUSTER_PALETTE.length];
      clusterIndexRef.current = ci + 1;

      const clusterAngle = clusterAngleStep * ci + ci * 0.15;
      const radius = radii[ci];
      const clusterCx = radius * Math.cos(clusterAngle - Math.PI / 2);
      const clusterCy = radius * Math.sin(clusterAngle - Math.PI / 2);

      const kwCount = cluster.keywords.length;
      const kwRadius = 160 + kwCount * 20;
      const kwAngleStep = (1.4 * Math.PI) / Math.max(kwCount - 1, 1);
      const kwAngleStart = clusterAngle - 0.7 * Math.PI;

      const kwNodes = cluster.keywords.map((kw, ki) => {
        const kwAngle = kwAngleStart + kwAngleStep * ki;
        const jitter = (Math.random() - 0.5) * 30;
        const kwId = `kw-${Date.now()}-${ci}-${ki}`;
        return {
          id: kwId,
          type: 'concept',
          position: {
            x: clusterCx + kwRadius * Math.cos(kwAngle) + jitter,
            y: clusterCy + kwRadius * Math.sin(kwAngle) + jitter,
          },
          data: {
            title: kw,
            concept: `Keyword in "${cluster.label}" cluster of "${topic}" research.`,
            trl: 7,
            sourceReliability: 'High' as const,
            depth: 1,
            onExplore: handleExplore,
          },
        };
      });

      const proxyId = `proxy-${Date.now()}-${ci}`;
      const proxyNode = {
        id: proxyId,
        type: 'concept',
        position: { x: clusterCx, y: clusterCy },
        data: {
          title: cluster.label,
          concept: `Thematic cluster: ${cluster.keywords.join(', ')}`,
          trl: 8,
          sourceReliability: 'High' as const,
          depth: 1,
          onExplore: handleExplore,
        },
      };

      const allX = [...kwNodes.map(n => n.position.x), clusterCx];
      const allY = [...kwNodes.map(n => n.position.y), clusterCy];
      const zoneW = (Math.max(...allX) - Math.min(...allX)) + ZONE_PADDING;
      const zoneH = (Math.max(...allY) - Math.min(...allY)) + ZONE_PADDING;
      const zoneCx = (Math.min(...allX) + Math.max(...allX)) / 2;
      const zoneCy = (Math.min(...allY) + Math.max(...allY)) / 2;

      const zoneNode = {
        id: `zone-initial-${ci}`,
        type: 'clusterZone',
        position: { x: zoneCx - zoneW / 2, y: zoneCy - zoneH / 2 },
        style: { width: Math.max(zoneW, 400), height: Math.max(zoneH, 300), zIndex: -1 },
        data: { label: cluster.label, color: paletteEntry.color, pattern: paletteEntry.pattern },
        selectable: true,
        draggable: true,
      };

      allNewNodes.push(zoneNode, proxyNode, ...kwNodes);

      allNewEdges.push({
        id: `edge-root-${proxyId}`,
        source: rootId,
        target: proxyId,
        ...MAP_EDGE_STYLE,
      });
      kwNodes.forEach(kw => {
        allNewEdges.push({
          id: `edge-${proxyId}-${kw.id}`,
          source: proxyId,
          target: kw.id,
          ...MAP_EDGE_STYLE,
          style: { stroke: 'rgba(255,255,255,0.08)', strokeWidth: 0.8, strokeDasharray: '3 4' },
        });
      });
    });

    const rootNode = {
      id: rootId,
      type: 'concept',
      position: { x: 0, y: 0 },
      data: {
        title: topic,
        concept: `Central research topic. ${clusters.length} thematic clusters identified. Explore any cluster to dive deeper.`,
        trl: 9,
        sourceReliability: 'High' as const,
        depth: 0,
        onExplore: handleExplore,
      },
    };

    setNodes([rootNode, ...allNewNodes]);
    setEdges(allNewEdges);
    setTimeout(() => fitView({ duration: 900, padding: 0.12 }), 100);
  }, [fitView, handleExplore]);

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
      data: { ...n.data, onExplore: handleExplore },
    }));
    setNodes(rehydrated);
    setEdges(saved.edges);
    setTimeout(() => fitView({ duration: 800, padding: 0.15 }), 100);
    setToast('Graph loaded ✓');
  };

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes(nds => applyNodeChanges(changes, nds)),
    []
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges(eds => applyEdgeChanges(changes, eds)),
    []
  );

  /** Manual wire between nodes → spawns a synthesis insight node */
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges(eds => addEdge({ ...params, ...MAP_EDGE_STYLE, label: '↔' } as Edge, eds));

      setNodes(nds => {
        const src = nds.find(n => n.id === params.source);
        const tgt = nds.find(n => n.id === params.target);
        if (!src || !tgt) return nds;

        const offset = (Math.random() - 0.5) * 120;
        const insight = {
          id: `insight-${Date.now()}`,
          type: 'concept',
          position: {
            x: (src.position.x + tgt.position.x) / 2 + offset,
            y: (src.position.y + tgt.position.y) / 2 + offset,
          },
          data: {
            title: 'Synthesis Node',
            concept: `Lateral bridge between "${src.data.title}" and "${tgt.data.title}". Identifies structural gap or emergent synergy.`,
            trl: 7,
            sourceReliability: 'Medium' as const,
            depth: Math.max(src.data.depth ?? 0, tgt.data.depth ?? 0) + 1,
            onExplore: handleExplore,
          },
        };
        return [...nds, insight];
      });

      setTimeout(() => fitView({ duration: 600, padding: 0.12 }), 50);
    },
    [handleExplore, fitView]
  );

  /** Semantic zoom: update viewMode based on current zoom level */
  const handleMove = useCallback((_event: any, viewport: { zoom: number }) => {
    setViewMode(prev => {
      const next = viewport.zoom <= 0.55 ? 'overview' : 'detailed';
      return next !== prev ? next : prev;
    });
  }, []);

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
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onMove={handleMove}
            nodeTypes={nodeTypes}
            minZoom={0.05}
            maxZoom={2}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            className="dark:bg-[#080808] bg-zinc-100"
            defaultEdgeOptions={{ ...MAP_EDGE_STYLE }}
          >
            <Background color="rgba(255,255,255,0.04)" gap={32} size={1} />
          </ReactFlow>
        </ViewModeContext.Provider>
      </div>

      {/* Header */}
      <header className="absolute top-0 left-0 right-0 px-6 py-5 flex justify-between items-center z-20 pointer-events-none">
        {/* Logo — matches favicon */}
        <div className="flex items-center gap-3 pointer-events-auto">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6366f1, #9333ea)', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}
          >
            <Activity className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-white/60 tracking-wide">Research Map</span>
        </div>

        {/* Search bar — center */}
        <div className="absolute left-1/2 -translate-x-1/2 pointer-events-auto">
          <form
            onSubmit={handleStartResearch}
            className="flex items-center gap-3 bg-zinc-950/70 backdrop-blur-3xl border border-white/10 rounded-full px-5 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] focus-within:border-white/20 transition-all"
          >
            <Sparkles className="w-4 h-4 text-gray-500 shrink-0" />
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="New research topic..."
              className="bg-transparent text-white text-sm outline-none w-64 placeholder-gray-600 tracking-tight"
              disabled={isResearching}
            />
            <button
              type="submit"
              disabled={isResearching || !inputValue.trim()}
              className="shrink-0 w-5 h-5 flex items-center justify-center text-gray-500 hover:text-indigo-400 transition-colors disabled:opacity-30"
              title="Start research"
            >
              {isResearching ? (
                <span className="w-3 h-3 rounded-full border border-indigo-400 border-t-transparent animate-spin inline-block" />
              ) : (
                <span className="text-lg leading-none">→</span>
              )}
            </button>
          </form>
          {/* Gemini connection dot */}
          <div className="flex items-center gap-1.5 mt-1.5 justify-center">
            <span className={`w-1.5 h-1.5 rounded-full ${apiKey ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
            <span className="text-[10px] text-gray-600">{apiKey ? 'Gemini connected' : 'Local mode'}</span>
          </div>
        </div>

        {/* Controls — right */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 transition-colors text-gray-400"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={handleZoomModeClick}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 transition-colors text-gray-400 text-xs font-medium"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{viewMode === 'detailed' ? 'Cluster' : 'Detail'}</span>
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

      {/* Hint when canvas is empty */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="text-center">
            <p className="text-gray-600 text-sm font-medium">Enter a research topic above to begin</p>
            <p className="text-gray-700 text-xs mt-1">Click + on any node to explore deeper</p>
            {loadGraph() && (
              <p className="text-indigo-500/60 text-xs mt-3">↑ Load your saved session from the toolbar</p>
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
