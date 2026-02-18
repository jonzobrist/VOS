'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import {
  fetchDocument, fetchPersonas, fetchLatestComments, startReviewStream,
  fetchReviews, fetchMetaComments, synthesizeMetaReview,
  type Document, type Persona, type Comment, type PersonaStatus,
  type MetaComment,
} from '@/lib/api';

type ViewMode = 'meta' | 'individual';

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#6b7280',
};

const CATEGORY_LABELS: Record<string, string> = {
  structure: 'Structure',
  clarity: 'Clarity',
  technical: 'Technical',
  security: 'Security',
  accessibility: 'Accessibility',
};

interface ConnectorLine {
  id: string;
  color: string;
  x1: number; y1: number;
  x2: number; y2: number;
}

export default function DocumentDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const docId = params.id as string;
  const autoReview = searchParams.get('autoReview') === 'true';

  const [document, setDocument] = useState<Document | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [personaStatuses, setPersonaStatuses] = useState<Map<string, PersonaStatus>>(new Map());
  const [isReviewing, setIsReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPersonaPanel, setShowPersonaPanel] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [filterPersona, setFilterPersona] = useState<string | null>(null);

  // Meta review state
  const [viewMode, setViewMode] = useState<ViewMode>('meta');
  const [metaComments, setMetaComments] = useState<MetaComment[]>([]);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [expandedMetaId, setExpandedMetaId] = useState<string | null>(null);
  const [hoveredPersonaId, setHoveredPersonaId] = useState<string | null>(null);
  const [currentReviewId, setCurrentReviewId] = useState<string | null>(null);

  // Connector lines state
  const [connectorLines, setConnectorLines] = useState<ConnectorLine[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const commentsPanelRef = useRef<HTMLDivElement>(null);
  const docPanelRef = useRef<HTMLDivElement>(null);
  const mainAreaRef = useRef<HTMLDivElement>(null);
  const hasStartedAutoReview = useRef(false);

  const contentLines = document?.content?.split('\n') || [];

  // Load doc + personas + existing comments + meta comments
  useEffect(() => {
    Promise.all([fetchDocument(docId), fetchPersonas(), fetchLatestComments(docId), fetchReviews(docId)])
      .then(async ([doc, p, existingComments, reviews]) => {
        setDocument(doc);
        setPersonas(p);
        setSelectedPersonaIds(p.map(pp => pp.id));
        if (existingComments.length > 0 && !autoReview) {
          setComments(existingComments);
          // Load cached meta comments from the latest completed review
          const completedReview = reviews.find(r => r.status === 'completed');
          if (completedReview) {
            setCurrentReviewId(completedReview.id);
            try {
              const cached = await fetchMetaComments(docId, completedReview.id);
              if (cached.length > 0) {
                setMetaComments(cached);
              }
            } catch {
              // No cached meta comments
            }
          }
        }
      })
      .catch((err) => setError(err.message));
  }, [docId]);

  // Auto-review once
  useEffect(() => {
    if (autoReview && document && personas.length > 0 && !hasStartedAutoReview.current) {
      hasStartedAutoReview.current = true;
      doReview(personas.map(p => p.id));
      // Strip autoReview param so refreshes/bookmarks don't re-trigger
      router.replace(`/documents/${docId}`);
    }
  }, [autoReview, document, personas, router, docId]);

  const triggerMetaSynthesis = async (reviewId: string) => {
    setIsSynthesizing(true);
    try {
      const result = await synthesizeMetaReview(docId, reviewId);
      setMetaComments(result);
      setViewMode('meta');
    } catch {
      // Synthesis failed, stay on individual view
    } finally {
      setIsSynthesizing(false);
    }
  };

  const doReview = (personaIds: string[]) => {
    if (abortRef.current) abortRef.current.abort();
    setIsReviewing(true);
    setComments([]);
    setMetaComments([]);
    setPersonaStatuses(new Map());
    setShowPersonaPanel(false);
    setCurrentReviewId(null);
    setViewMode('individual'); // Show individual during streaming

    abortRef.current = startReviewStream(
      docId,
      personaIds,
      (event) => {
        if (event.type === 'persona_status') {
          setPersonaStatuses((prev) => {
            const next = new Map(prev);
            next.set(event.persona_id!, {
              persona_id: event.persona_id!,
              persona_name: event.persona_name!,
              persona_color: event.persona_color!,
              status: event.status as 'queued' | 'running' | 'completed',
            });
            return next;
          });
        }
        if (event.type === 'comment' && event.comment) {
          setComments((prev) => [...prev, event.comment!]);
        }
        if (event.type === 'done') {
          setIsReviewing(false);
          // Auto-trigger meta synthesis
          if (event.review_id) {
            setCurrentReviewId(event.review_id);
            triggerMetaSynthesis(event.review_id);
          }
        }
      },
      (err) => {
        setError(err.message);
        setIsReviewing(false);
      }
    );
  };

  const togglePersona = (id: string) => {
    setSelectedPersonaIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  // Build highlight map based on current view mode
  const lineHighlights = useCallback(() => {
    const highlights: Map<number, { commentId: string; color: string }[]> = new Map();

    if (viewMode === 'meta' && metaComments.length > 0) {
      metaComments.forEach((mc) => {
        const color = PRIORITY_COLORS[mc.priority] || PRIORITY_COLORS.medium;
        for (let line = mc.start_line; line <= mc.end_line; line++) {
          if (!highlights.has(line)) highlights.set(line, []);
          highlights.get(line)!.push({ commentId: mc.id, color });
        }
      });
    } else {
      const filtered = filterPersona ? comments.filter(c => c.persona_id === filterPersona) : comments;
      filtered.forEach((comment) => {
        for (let line = comment.start_line; line <= comment.end_line; line++) {
          if (!highlights.has(line)) highlights.set(line, []);
          highlights.get(line)!.push({ commentId: comment.id, color: comment.persona_color });
        }
      });
    }
    return highlights;
  }, [comments, filterPersona, viewMode, metaComments]);

  const highlights = lineHighlights();

  const sortedComments = [...comments]
    .filter(c => !filterPersona || c.persona_id === filterPersona)
    .sort((a, b) => a.start_line - b.start_line);

  const sortedMetaComments = [...metaComments].sort((a, b) => a.start_line - b.start_line);

  // Unique personas in comments for filter
  const commentPersonas = Array.from(new Map(comments.map(c => [c.persona_id, { id: c.persona_id, name: c.persona_name, color: c.persona_color }])).values());

  // Compute connector lines for active comment
  const updateConnectors = useCallback(() => {
    if (!activeCommentId || !mainAreaRef.current) {
      setConnectorLines([]);
      return;
    }

    const mainRect = mainAreaRef.current.getBoundingClientRect();
    const lines: ConnectorLine[] = [];

    // Find the comment element
    const commentEl = window.document.getElementById(`comment-${activeCommentId}`);
    if (!commentEl) {
      setConnectorLines([]);
      return;
    }
    const commentRect = commentEl.getBoundingClientRect();
    const commentY = commentRect.top + commentRect.height / 2 - mainRect.top;

    // Determine which item is active to get start_line and color
    let startLine: number | null = null;
    let endLine: number | null = null;
    let color = '#6b7280';

    if (viewMode === 'meta') {
      const mc = metaComments.find(m => m.id === activeCommentId);
      if (mc) {
        startLine = mc.start_line;
        endLine = mc.end_line;
        color = PRIORITY_COLORS[mc.priority] || PRIORITY_COLORS.medium;
      }
    } else {
      const c = comments.find(c => c.id === activeCommentId);
      if (c) {
        startLine = c.start_line;
        endLine = c.end_line;
        color = c.persona_color;
      }
    }

    if (startLine === null || endLine === null) {
      setConnectorLines([]);
      return;
    }

    // Find the midpoint line element
    const midLine = Math.floor((startLine + endLine) / 2);
    const lineEl = window.document.querySelector(`[data-line="${midLine}"]`) as HTMLElement | null;
    if (!lineEl) {
      setConnectorLines([]);
      return;
    }

    const lineRect = lineEl.getBoundingClientRect();
    const lineY = lineRect.top + lineRect.height / 2 - mainRect.top;
    const lineX = lineRect.right - mainRect.left;
    const commentX = commentRect.left - mainRect.left;

    lines.push({
      id: activeCommentId,
      color,
      x1: lineX,
      y1: lineY,
      x2: commentX,
      y2: commentY,
    });

    setConnectorLines(lines);
  }, [activeCommentId, viewMode, metaComments, comments]);

  // Update connectors on scroll, resize, and when active comment changes
  useEffect(() => {
    updateConnectors();

    const docPanel = docPanelRef.current;
    const commentsPanel = commentsPanelRef.current;

    const handler = () => updateConnectors();

    docPanel?.addEventListener('scroll', handler);
    commentsPanel?.addEventListener('scroll', handler);
    window.addEventListener('resize', handler);

    return () => {
      docPanel?.removeEventListener('scroll', handler);
      commentsPanel?.removeEventListener('scroll', handler);
      window.removeEventListener('resize', handler);
    };
  }, [updateConnectors]);

  if (error) {
    return (
      <main className="min-h-screen bg-[#0a0a0f] text-[#e4e4ec] p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6">
            <h2 className="text-red-400 font-semibold mb-2">Error</h2>
            <p className="text-neutral-300">{error}</p>
            <Link href="/documents" className="text-indigo-400 hover:text-indigo-300 mt-4 inline-block text-sm">Back to documents</Link>
          </div>
        </div>
      </main>
    );
  }

  if (!document) {
    return (
      <main className="min-h-screen bg-[#0a0a0f] text-[#e4e4ec] p-6">
        <div className="max-w-4xl mx-auto animate-pulse">
          <div className="h-8 bg-[#1a1a25] rounded w-1/3 mb-4" />
          <div className="h-[600px] bg-[#12121a] rounded-xl" />
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen bg-[#0a0a0f] text-[#e4e4ec] flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 border-b border-[#2a2a3a] bg-[#0c0c12] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <Link href="/documents" className="text-neutral-500 hover:text-neutral-300 text-sm transition-colors flex-shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </Link>
            <h1 className="text-base font-semibold truncate">{document.title}</h1>
            {document.description && <span className="text-xs text-neutral-500 truncate hidden md:inline">{document.description}</span>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowPersonaPanel(!showPersonaPanel)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${showPersonaPanel ? 'bg-indigo-600 text-white' : 'bg-[#1a1a25] text-neutral-400 hover:text-white hover:bg-[#252530]'}`}
            >
              Personas
            </button>
            {!isReviewing && (
              <button
                onClick={() => doReview(selectedPersonaIds)}
                disabled={selectedPersonaIds.length === 0}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-lg text-xs font-medium transition-colors"
              >
                {comments.length > 0 ? 'Re-run Review' : 'Start Review'}
              </button>
            )}
          </div>
        </div>

        {/* Review progress bar */}
        {personaStatuses.size > 0 && (
          <div className="flex gap-2 mt-2.5 flex-wrap">
            {Array.from(personaStatuses.values()).map((ps) => (
              <div
                key={ps.persona_id}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium"
                style={{
                  backgroundColor: ps.status === 'completed' ? `${ps.persona_color}20` : ps.status === 'running' ? `${ps.persona_color}10` : '#1a1a25',
                  color: ps.status === 'completed' ? ps.persona_color : ps.status === 'running' ? ps.persona_color : '#666',
                  border: `1px solid ${ps.status === 'completed' ? `${ps.persona_color}40` : ps.status === 'running' ? `${ps.persona_color}30` : '#2a2a3a'}`,
                }}
              >
                {ps.status === 'running' && (
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ backgroundColor: ps.persona_color }} />
                )}
                {ps.status === 'completed' && (
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>
                )}
                {ps.status === 'queued' && (
                  <div className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
                )}
                <span>{ps.persona_name}</span>
              </div>
            ))}
            {isSynthesizing && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                <div className="w-1.5 h-1.5 rounded-full animate-pulse-dot bg-indigo-400" />
                <span>Synthesizing...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main content area */}
      <div ref={mainAreaRef} className="flex flex-1 overflow-hidden relative">
        {/* SVG connector lines overlay */}
        {connectorLines.length > 0 && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 10 }}
          >
            <defs>
              {connectorLines.map((line) => (
                <linearGradient
                  key={`grad-${line.id}`}
                  id={`connector-grad-${line.id}`}
                  x1="0%" y1="0%" x2="100%" y2="0%"
                >
                  <stop offset="0%" stopColor={line.color} stopOpacity="0.6" />
                  <stop offset="50%" stopColor={line.color} stopOpacity="0.3" />
                  <stop offset="100%" stopColor={line.color} stopOpacity="0.6" />
                </linearGradient>
              ))}
            </defs>
            {connectorLines.map((line) => {
              const dx = line.x2 - line.x1;
              const cp = dx * 0.4;
              const path = `M ${line.x1} ${line.y1} C ${line.x1 + cp} ${line.y1}, ${line.x2 - cp} ${line.y2}, ${line.x2} ${line.y2}`;
              return (
                <g key={line.id}>
                  <path
                    d={path}
                    fill="none"
                    stroke={`url(#connector-grad-${line.id})`}
                    strokeWidth="2"
                    strokeDasharray="6 4"
                    className="animate-connector-dash"
                  />
                  {/* Start dot */}
                  <circle cx={line.x1} cy={line.y1} r="3" fill={line.color} fillOpacity="0.7" />
                  {/* End dot */}
                  <circle cx={line.x2} cy={line.y2} r="3" fill={line.color} fillOpacity="0.7" />
                </g>
              );
            })}
          </svg>
        )}

        {/* Document panel */}
        <div ref={docPanelRef} className="flex-1 overflow-auto p-6">
          <div className="max-w-3xl mx-auto">
            {/* Rendered markdown with line highlighting */}
            <div className="bg-[#12121a] rounded-xl border border-[#2a2a3a] overflow-hidden">
              <div className="p-5 font-mono text-sm leading-relaxed">
                {contentLines.map((line, idx) => {
                  const lineNum = idx;
                  const lineHighs = highlights.get(lineNum) || [];
                  const hasHighlight = lineHighs.length > 0;
                  const isActive = lineHighs.some(h => h.commentId === activeCommentId);
                  const primaryColor = lineHighs[0]?.color;

                  return (
                    <div
                      key={idx}
                      data-line={idx}
                      className={`flex group rounded-sm transition-colors duration-200 ${hasHighlight ? 'cursor-pointer' : ''} ${isActive ? 'ring-1 ring-inset' : ''}`}
                      style={{
                        backgroundColor: hasHighlight ? `${primaryColor}${isActive ? '25' : '10'}` : undefined,
                        borderLeft: hasHighlight ? `3px solid ${primaryColor}` : '3px solid transparent',
                        boxShadow: isActive && primaryColor ? `inset 0 0 0 1px ${primaryColor}40` : undefined,
                      }}
                      onClick={() => {
                        if (hasHighlight) {
                          const targetId = lineHighs[0].commentId;
                          setActiveCommentId(targetId);
                          const el = window.document.getElementById(`comment-${targetId}`);
                          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }}
                    >
                      <span className="w-10 text-right pr-3 text-[#444] select-none flex-shrink-0 text-xs leading-6 pt-px">
                        {idx + 1}
                      </span>
                      <span className="flex-1 whitespace-pre-wrap text-[#c4c4d4] leading-6 pl-2">
                        {line || '\u00A0'}
                      </span>
                      {hasHighlight && (
                        <span className="flex items-center gap-0.5 px-2 opacity-50">
                          {lineHighs.slice(0, 3).map((h, i) => (
                            <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: h.color }} />
                          ))}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Persona selection panel (overlay) */}
        {showPersonaPanel && (
          <div className="w-72 border-l border-[#2a2a3a] bg-[#0c0c12] flex flex-col overflow-auto flex-shrink-0">
            <div className="p-4 border-b border-[#2a2a3a]">
              <h2 className="text-sm font-semibold">Select Personas</h2>
              <div className="flex gap-2 mt-2">
                <button onClick={() => setSelectedPersonaIds(personas.map(p => p.id))} className="text-xs text-indigo-400 hover:text-indigo-300">All</button>
                <span className="text-[#2a2a3a]">|</span>
                <button onClick={() => setSelectedPersonaIds([])} className="text-xs text-indigo-400 hover:text-indigo-300">None</button>
              </div>
            </div>
            <div className="p-2 space-y-1">
              {personas.map((p) => {
                const isSelected = selectedPersonaIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePersona(p.id)}
                    className={`w-full text-left p-3 rounded-lg transition-all ${isSelected ? 'bg-[#1a1a25]' : 'hover:bg-[#14141e]'}`}
                    style={{ borderLeft: `3px solid ${isSelected ? p.color : '#2a2a3a'}` }}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3.5 h-3.5 rounded border-2 flex items-center justify-center"
                        style={{ borderColor: p.color, backgroundColor: isSelected ? p.color : 'transparent' }}
                      >
                        {isSelected && <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>}
                      </div>
                      <span className="text-sm font-medium">{p.name}</span>
                    </div>
                    {p.description && <p className="text-[11px] text-neutral-500 mt-1 ml-6">{p.description}</p>}
                    <div className="flex flex-wrap gap-1 mt-1.5 ml-6">
                      {p.focus_areas.slice(0, 3).map((area) => (
                        <span key={area} className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${p.color}15`, color: p.color }}>{area}</span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="p-3 border-t border-[#2a2a3a] mt-auto">
              <button
                onClick={() => { doReview(selectedPersonaIds); }}
                disabled={selectedPersonaIds.length === 0 || isReviewing}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
              >
                Review with {selectedPersonaIds.length} persona{selectedPersonaIds.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {/* Comments panel */}
        <div className="w-[380px] border-l border-[#2a2a3a] bg-[#0c0c12] flex flex-col flex-shrink-0">
          {/* View mode toggle + header */}
          <div className="p-3 border-b border-[#2a2a3a]">
            {/* Toggle: Meta Review | Individual Reviews */}
            {(metaComments.length > 0 || comments.length > 0) && (
              <div className="flex rounded-lg bg-[#12121a] p-0.5 mb-2.5">
                <button
                  onClick={() => setViewMode('meta')}
                  className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${
                    viewMode === 'meta'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  Meta Review
                  {metaComments.length > 0 && (
                    <span className={`ml-1 ${viewMode === 'meta' ? 'text-indigo-200' : 'text-neutral-600'}`}>
                      ({metaComments.length})
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setViewMode('individual')}
                  className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${
                    viewMode === 'individual'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  Individual
                  {comments.length > 0 && (
                    <span className={`ml-1 ${viewMode === 'individual' ? 'text-indigo-200' : 'text-neutral-600'}`}>
                      ({comments.length})
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {viewMode === 'meta' ? 'Meta Review' : 'Comments'}
                {viewMode === 'individual' && comments.length > 0 && (
                  <span className="text-neutral-500 font-normal ml-1">({sortedComments.length})</span>
                )}
              </h2>
            </div>

            {/* Persona filter chips (only in individual mode) */}
            {viewMode === 'individual' && commentPersonas.length > 1 && (
              <div className="flex flex-wrap gap-1 mt-2">
                <button
                  onClick={() => setFilterPersona(null)}
                  className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${!filterPersona ? 'bg-[#2a2a3a] text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
                >
                  All
                </button>
                {commentPersonas.map((cp) => (
                  <button
                    key={cp.id}
                    onClick={() => setFilterPersona(filterPersona === cp.id ? null : cp.id)}
                    className="text-[10px] px-2 py-0.5 rounded-full transition-colors flex items-center gap-1"
                    style={{
                      backgroundColor: filterPersona === cp.id ? `${cp.color}25` : 'transparent',
                      color: filterPersona === cp.id ? cp.color : '#888',
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cp.color }} />
                    {cp.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Comments/Meta list */}
          <div ref={commentsPanelRef} className="flex-1 overflow-auto p-3 space-y-2">
            {/* META VIEW */}
            {viewMode === 'meta' && (
              <>
                {metaComments.length === 0 && !isSynthesizing && !isReviewing && (
                  <div className="text-center text-neutral-500 py-12">
                    <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <p className="text-sm">No meta review yet</p>
                    <p className="text-xs mt-1 text-neutral-600">Run a review to generate synthesized feedback</p>
                  </div>
                )}

                {sortedMetaComments.map((mc) => {
                  const isActive = activeCommentId === mc.id;
                  const isExpanded = expandedMetaId === mc.id;
                  const priorityColor = PRIORITY_COLORS[mc.priority] || PRIORITY_COLORS.medium;

                  return (
                    <div
                      key={mc.id}
                      id={`comment-${mc.id}`}
                      className={`rounded-lg border-l-[3px] cursor-pointer transition-all duration-200 animate-slide-in
                        ${isActive ? 'bg-[#1a1a28] ring-1 ring-white/10' : 'bg-[#12121a] hover:bg-[#16161f]'}`}
                      style={{ borderLeftColor: priorityColor }}
                    >
                      {/* Main meta comment content */}
                      <div
                        className="p-3"
                        onClick={() => {
                          setActiveCommentId(mc.id);
                          // Scroll to highlighted line in document
                          const midLine = Math.floor((mc.start_line + mc.end_line) / 2);
                          const lineEl = window.document.querySelector(`[data-line="${midLine}"]`);
                          lineEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }}
                        onMouseEnter={() => setActiveCommentId(mc.id)}
                        onMouseLeave={() => { if (!isExpanded) setActiveCommentId(null); }}
                      >
                        {/* Top row: category badge + priority + line numbers */}
                        <div className="flex items-center gap-1.5 mb-2">
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: `${priorityColor}20`, color: priorityColor }}
                          >
                            {mc.priority.toUpperCase()}
                          </span>
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#1a1a25] text-neutral-400">
                            {CATEGORY_LABELS[mc.category] || mc.category}
                          </span>
                          <span className="text-[10px] text-neutral-600 ml-auto">
                            L{mc.start_line + 1}{mc.end_line !== mc.start_line ? `-${mc.end_line + 1}` : ''}
                          </span>
                        </div>

                        {/* Synthesized content */}
                        <p className="text-[13px] text-[#b4b4c4] leading-relaxed mb-2">{mc.content}</p>

                        {/* Persona dots + expand toggle */}
                        <div className="flex items-center gap-1">
                          {mc.sources.map((source, si) => (
                            <div
                              key={si}
                              className="relative group/dot"
                              onMouseEnter={() => setHoveredPersonaId(`${mc.id}-${source.persona_id}`)}
                              onMouseLeave={() => setHoveredPersonaId(null)}
                            >
                              <span
                                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white cursor-pointer transition-transform hover:scale-125"
                                style={{ backgroundColor: source.persona_color }}
                                title={source.persona_name}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedMetaId(isExpanded ? null : mc.id);
                                }}
                              >
                                {source.persona_name.charAt(0)}
                              </span>
                              {/* Hover tooltip with original comment */}
                              {hoveredPersonaId === `${mc.id}-${source.persona_id}` && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2.5 rounded-lg bg-[#1a1a28] border border-[#2a2a3a] shadow-xl z-50">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: source.persona_color }} />
                                    <span className="text-[10px] font-medium" style={{ color: source.persona_color }}>{source.persona_name}</span>
                                  </div>
                                  <p className="text-[11px] text-[#999] leading-relaxed">{source.original_content}</p>
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-[#1a1a28] border-r border-b border-[#2a2a3a] rotate-45 -mt-1" />
                                </div>
                              )}
                            </div>
                          ))}
                          <button
                            className="ml-auto text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedMetaId(isExpanded ? null : mc.id);
                            }}
                          >
                            {isExpanded ? 'Hide originals' : `${mc.sources.length} sources`}
                          </button>
                        </div>
                      </div>

                      {/* Expanded: show original persona comments */}
                      {isExpanded && (
                        <div className="border-t border-[#2a2a3a] p-2 space-y-1.5 bg-[#0e0e16]">
                          {mc.sources.map((source, si) => (
                            <div
                              key={si}
                              className="p-2 rounded-md bg-[#12121a] border-l-2"
                              style={{ borderLeftColor: source.persona_color }}
                            >
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: source.persona_color }} />
                                <span className="text-[10px] font-medium" style={{ color: source.persona_color }}>{source.persona_name}</span>
                              </div>
                              <p className="text-[11px] text-[#999] leading-relaxed">{source.original_content}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {isSynthesizing && (
                  <div className="flex items-center justify-center py-6 gap-2">
                    <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-neutral-500">Synthesizing meta review...</span>
                  </div>
                )}
              </>
            )}

            {/* INDIVIDUAL VIEW */}
            {viewMode === 'individual' && (
              <>
                {sortedComments.length === 0 && !isReviewing && (
                  <div className="text-center text-neutral-500 py-12">
                    <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <p className="text-sm">No comments yet</p>
                    <p className="text-xs mt-1 text-neutral-600">Start a review to see feedback</p>
                  </div>
                )}

                {sortedComments.map((comment) => {
                  const isActive = activeCommentId === comment.id;
                  return (
                    <div
                      key={comment.id}
                      id={`comment-${comment.id}`}
                      className={`rounded-lg p-3 border-l-[3px] cursor-pointer transition-all duration-200 animate-slide-in
                        ${isActive ? 'bg-[#1a1a28] ring-1 ring-white/10 scale-[1.01]' : 'bg-[#12121a] hover:bg-[#16161f]'}`}
                      style={{ borderLeftColor: comment.persona_color }}
                      onClick={() => {
                        setActiveCommentId(comment.id);
                        const midLine = Math.floor((comment.start_line + comment.end_line) / 2);
                        const lineEl = window.document.querySelector(`[data-line="${midLine}"]`);
                        lineEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                      onMouseEnter={() => setActiveCommentId(comment.id)}
                      onMouseLeave={() => setActiveCommentId(null)}
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: comment.persona_color }} />
                        <span className="text-xs font-medium" style={{ color: comment.persona_color }}>{comment.persona_name}</span>
                        <span className="text-[10px] text-neutral-600 ml-auto">
                          L{comment.start_line + 1}{comment.end_line !== comment.start_line ? `-${comment.end_line + 1}` : ''}
                        </span>
                      </div>
                      <p className="text-[13px] text-[#b4b4c4] leading-relaxed">{comment.content}</p>
                    </div>
                  );
                })}

                {isReviewing && (
                  <div className="flex items-center justify-center py-6 gap-2">
                    <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-neutral-500">Reviewing...</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
