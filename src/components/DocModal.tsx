import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Book, Shield, Brain, Zap, Database } from 'lucide-react';

interface DocModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DocModal({ isOpen, onClose }: DocModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            className="w-full max-w-4xl max-h-[80vh] bg-[#0c0e14] border border-white/10 rounded-[2.5rem] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-8 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#0c0e14]/80 backdrop-blur-md z-10">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-500/10 rounded-2xl">
                  <Book className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tight">System Documentation</h2>
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">Cognitive Engine v2.4.0 Guide</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/5 rounded-full text-slate-500 hover:text-white transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-10 space-y-12 custom-scrollbar">
              <section className="space-y-6">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-lg font-bold text-white">Privacy & Security Architecture</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 bg-white/[0.02] border border-white/5 rounded-3xl">
                    <h4 className="text-sm font-bold text-white mb-2">Local-First Vault</h4>
                    <p className="text-xs text-slate-400 leading-relaxed font-medium">
                      All memories and persona profiles are stored in an encrypted SQLite database on the local filesystem. No data leaves the node without explicit Cognitive Sync activation.
                    </p>
                  </div>
                  <div className="p-6 bg-white/[0.02] border border-white/5 rounded-3xl">
                    <h4 className="text-sm font-bold text-white mb-2">Multi-User Isolation</h4>
                    <p className="text-xs text-slate-400 leading-relaxed font-medium">
                      Authentication uses bcrypt-hashed credentials. Each user profile possesses a unique ID, ensuring strictly isolated memory silos and retrieval mappings.
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-6">
                <div className="flex items-center gap-3">
                  <Brain className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-lg font-bold text-white">The Ingestion Pipeline</h3>
                </div>
                <div className="space-y-4">
                  <div className="flex gap-6 items-start">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xs font-black text-indigo-400 shrink-0">1</div>
                    <div>
                      <h4 className="text-sm font-bold text-white mb-1">Intent Classification</h4>
                      <p className="text-xs text-slate-400 leading-relaxed">System routes inputs through a hybrid keyword/semantic classifier to determine if data is a Fact, Preference, or Query.</p>
                    </div>
                  </div>
                  <div className="flex gap-6 items-start">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xs font-black text-indigo-400 shrink-0">2</div>
                    <div>
                      <h4 className="text-sm font-bold text-white mb-1">Semantic Decomposition</h4>
                      <p className="text-xs text-slate-400 leading-relaxed">Entities are extracted and assigned importance scores (0.0 - 1.0). High-importance data ( {'>'}= 0.45) is committed to long-term storage.</p>
                    </div>
                  </div>
                  <div className="flex gap-6 items-start">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xs font-black text-indigo-400 shrink-0">3</div>
                    <div>
                      <h4 className="text-sm font-bold text-white mb-1">Conflict Detection</h4>
                      <p className="text-xs text-slate-400 leading-relaxed">During retrieval, the engine cross-references older memories. If a new statement contradicts an indexed fact, a Drift Alert is triggered.</p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-6">
                <div className="flex items-center gap-3">
                  <Database className="w-5 h-5 text-blue-400" />
                  <h3 className="text-lg font-bold text-white">Vault Management</h3>
                </div>
                <div className="p-8 bg-blue-500/5 border border-blue-500/10 rounded-3xl">
                   <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4 list-disc pl-5">
                     <li className="text-xs text-slate-300 font-medium tracking-wide">Automatic sensory pruning after 24 hours.</li>
                     <li className="text-xs text-slate-300 font-medium tracking-wide">Manual re-indexing available in Engine Center.</li>
                     <li className="text-xs text-slate-300 font-medium tracking-wide">Custom persona traits update per-session.</li>
                     <li className="text-xs text-slate-300 font-medium tracking-wide">Sentiment drift tracking based on input tone.</li>
                   </ul>
                </div>
              </section>

              <div className="pt-10 flex justify-center">
                 <button 
                  onClick={onClose}
                  className="px-10 py-4 bg-indigo-500 text-white font-black rounded-2xl hover:bg-indigo-600 transition-all shadow-xl shadow-indigo-500/20 uppercase tracking-[0.2em] text-[10px]"
                 >
                   Acknowledge Protocol
                 </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
