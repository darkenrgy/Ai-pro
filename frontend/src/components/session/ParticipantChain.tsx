import type { UserNodeDto } from '@/types/session';

interface ParticipantChainProps {
  node: UserNodeDto | null;
  resolveUserName: (userId: string) => string;
}

function renderNode(node: UserNodeDto, depth: number, resolveUserName: (userId: string) => string): JSX.Element {
  return (
    <div key={node.nodeId} className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400/15 text-sm font-semibold text-cyan-200 ring-1 ring-cyan-400/30">
          {depth + 1}
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-sm font-medium text-white">{resolveUserName(node.userId)}</p>
          <p className="text-xs text-slate-400">Node {node.nodeId.slice(0, 8)}</p>
          <p className="text-xs text-slate-400">Status: {node.active ? 'active' : 'inactive'}</p>
        </div>
      </div>
      {node.children && node.children.length > 0 ? (
        <div className="ml-5 border-l border-dashed border-cyan-400/30 pl-5">
          {node.children.map((child) => renderNode(child, depth + 1, resolveUserName))}
        </div>
      ) : null}
    </div>
  );
}

export function ParticipantChain({ node, resolveUserName }: ParticipantChainProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
      <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-300">Chain</p>
      <h3 className="mt-1 text-lg font-semibold text-white">Hierarchy view</h3>
      <div className="mt-5 space-y-4">{node ? renderNode(node, 0, resolveUserName) : <p className="text-sm text-slate-400">Join the session to reveal the chain.</p>}</div>
    </div>
  );
}
