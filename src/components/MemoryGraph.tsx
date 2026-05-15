import { motion } from 'motion/react';
import { Database, Zap, User, MessageSquare } from 'lucide-react';
import { useMemo } from 'react';

interface Node {
  id: string;
  type: 'memory' | 'person' | 'topic' | 'emotion';
  label: string;
  x: number;
  y: number;
  importance: number;
}

interface Edge {
  from: string;
  to: string;
  strength: number;
}

export function MemoryGraph({ memories }: { memories: any[] }) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    
    // Core User Node
    nodes.push({ id: 'user-core', type: 'person', label: 'Pilot', x: 50, y: 50, importance: 1 });

    memories.forEach((m, i) => {
      const angle = (i / memories.length) * Math.PI * 2;
      const radius = 30 + Math.random() * 20;
      const x = 50 + radius * Math.cos(angle);
      const y = 50 + radius * Math.sin(angle);
      
      const nodeId = `mem-${m.id}`;
      nodes.push({
        id: nodeId,
        type: 'memory',
        label: m.content.slice(0, 20) + '...',
        x,
        y,
        importance: m.importanceScore || 0.5
      });

      edges.push({ from: 'user-core', to: nodeId, strength: (m.score || 0.5) * 100 });

      // Connect tags
      m.tags.forEach((tag: string) => {
        let tagNode = nodes.find(n => n.id === `tag-${tag}`);
        if (!tagNode) {
          const tAngle = Math.random() * Math.PI * 2;
          const tRadius = 45;
          tagNode = {
            id: `tag-${tag}`,
            type: 'topic',
            label: tag,
            x: 50 + tRadius * Math.cos(tAngle),
            y: 50 + tRadius * Math.sin(tAngle),
            importance: 0.3
          };
          nodes.push(tagNode);
        }
        edges.push({ from: nodeId, to: tagNode.id, strength: 40 });
      });
    });

    return { nodes, edges };
  }, [memories]);

  return (
    <div className="relative w-full h-[600px] bg-black/40 rounded-[3rem] border border-white/5 overflow-hidden backdrop-blur-3xl group">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(99,102,241,0.05)_0%,transparent_70%)]"></div>
      
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {edges.map((edge, i) => {
          const from = nodes.find(n => n.id === edge.from);
          const to = nodes.find(n => n.id === edge.to);
          if (!from || !to) return null;

          return (
            <motion.line
              key={`${edge.from}-${edge.to}-${i}`}
              x1={`${from.x}%`}
              y1={`${from.y}%`}
              x2={`${to.x}%`}
              y2={`${to.y}%`}
              stroke="rgba(99,102,241,0.15)"
              strokeWidth={edge.strength / 20}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.5, delay: i * 0.05 }}
            />
          );
        })}
      </svg>

      {nodes.map((node) => (
        <motion.div
          key={node.id}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.2, zIndex: 10 }}
          style={{ left: `${node.x}%`, top: `${node.y}%` }}
          className="absolute -translate-x-1/2 -translate-y-1/2 cursor-crosshair group/node"
        >
          <div className="relative">
            <div 
              className="absolute inset-0 blur-lg transition-all duration-500 opacity-50 group-hover/node:opacity-100"
              style={{ 
                backgroundColor: node.type === 'person' ? '#6366f1' : node.type === 'memory' ? '#10b981' : '#f59e0b',
                width: `${node.importance * 40}px`,
                height: `${node.importance * 40}px`
              }}
            ></div>
            <div className={`p-3 rounded-full border border-white/10 backdrop-blur-md shadow-2xl relative transition-colors ${
              node.type === 'person' ? 'bg-indigo-500' : 'bg-white/10 group-hover/node:bg-indigo-500/20'
            }`}>
              {node.type === 'person' && <User className="w-5 h-5 text-white" />}
              {node.type === 'memory' && <MessageSquare className="w-4 h-4 text-emerald-400" />}
              {node.type === 'topic' && <Zap className="w-3 h-3 text-amber-400" />}
            </div>
            
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap opacity-0 group-hover/node:opacity-100 transition-opacity pointer-events-none">
              <span className="px-3 py-1 bg-black/90 border border-white/10 rounded-lg text-[9px] font-black text-white uppercase tracking-widest">{node.label}</span>
            </div>
          </div>
        </motion.div>
      ))}

      <div className="absolute top-8 left-8 space-y-2">
        <h3 className="text-xl font-black text-white">Neural Map</h3>
        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Cognitive Relationship Visualization</p>
      </div>

      <div className="absolute bottom-8 right-8 flex gap-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
          <span className="text-[9px] font-bold text-slate-500 uppercase">Entities</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
          <span className="text-[9px] font-bold text-slate-500 uppercase">Memories</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
          <span className="text-[9px] font-bold text-slate-500 uppercase">Concepts</span>
        </div>
      </div>
    </div>
  );
}
