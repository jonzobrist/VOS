'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/config';

interface Comment {
  id: string;
  content: string;
  anchor: {
    start_line: number;
    end_line: number;
  };
  persona_id: string;
  persona_name: string;
  persona_color: string;
  created_at: string;
}

interface Document {
  id: string;
  title: string;
  description: string | null;
  current_branch: string;
  created_at: string;
}

interface ConnectorLine {
  commentId: string;
  color: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export default function DocumentDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const docId = params.id as string;
  const autoReview = searchParams.get('autoReview') === 'true';

  const [document, setDocument] = useState<Document | null>(null);
  const [content, setContent] = useState<string>('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [newHighlights, setNewHighlights] = useState<Set<string>>(new Set());
  const [connectorLines, setConnectorLines] = useState<ConnectorLine[]>([]);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const docPanelRef = useRef<HTMLDivElement>(null);
  const commentsPanelRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const commentRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const contentLines = content.split('\n');

  // Sort comments by line position
  const sortedComments = [...comments].sort((a, b) => a.anchor.start_line - b.anchor.start_line);

  // Update connector lines on scroll or comment changes
  const updateConnectors = useCallback(() => {
    if (!containerRef.current) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const newLines: ConnectorLine[] = [];
    
    sortedComments.forEach(comment => {
      const lineEl = lineRefs.current.get(comment.anchor.start_line);
      const commentEl = commentRefs.current.get(comment.id);
      
      if (lineEl && commentEl) {
        const lineRect = lineEl.getBoundingClientRect();
        const commentRect = commentEl.getBoundingClientRect();
        
        // Only draw if both are visible
        if (lineRect.top < containerRect.bottom && lineRect.bottom > containerRect.top &&
            commentRect.top < containerRect.bottom && commentRect.bottom > containerRect.top) {
          newLines.push({
            commentId: comment.id,
            color: comment.persona_color,
            startX: lineRect.right - containerRect.left,
            startY: lineRect.top + lineRect.height / 2 - containerRect.top,
            endX: commentRect.left - containerRect.left,
            endY: commentRect.top + 20 - containerRect.top,
          });
        }
      }
    });
    
    setConnectorLines(newLines);
  }, [sortedComments]);

  // Update connectors on scroll
  useEffect(() => {
    const docPanel = docPanelRef.current;
    const commentsPanel = commentsPanelRef.current;
    
    const handleScroll = () => {
      requestAnimationFrame(updateConnectors);
    };
    
    docPanel?.addEventListener('scroll', handleScroll);
    commentsPanel?.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleScroll);
    
    // Initial update
    const timer = setTimeout(updateConnectors, 100);
    
    return () => {
      docPanel?.removeEventListener('scroll', handleScroll);
      commentsPanel?.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      clearTimeout(timer);
    };
  }, [updateConnectors]);

  // Update connectors when comments change
  useEffect(() => {
    const timer = setTimeout(updateConnectors, 50);
    return () => clearTimeout(timer);
  }, [comments, updateConnectors]);

  // Build highlight map
  const lineHighlights = useCallback(() => {
    const highlights: Map<number, { commentId: string; color: string; isNew: boolean }[]> = new Map();
    
    comments.forEach(comment => {
      for (let line = comment.anchor.start_line; line <= comment.anchor.end_line; line++) {
        if (!highlights.has(line)) highlights.set(line, []);
        highlights.get(line)!.push({
          commentId: comment.id,
          color: comment.persona_color,
          isNew: newHighlights.has(comment.id)
        });
      }
    });
    
    return highlights;
  }, [comments, newHighlights]);

  const scrollToLine = (lineNum: number, commentId: string) => {
    const lineEl = lineRefs.current.get(lineNum);
    if (lineEl) {
      lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setActiveCommentId(commentId);
      lineEl.classList.add('highlight-pulse');
      setTimeout(() => lineEl.classList.remove('highlight-pulse'), 1000);
      setTimeout(updateConnectors, 300);
    }
  };

  const scrollToComment = (commentId: string) => {
    const commentEl = commentRefs.current.get(commentId);
    if (commentEl) {
      commentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setActiveCommentId(commentId);
      commentEl.classList.add('comment-pulse');
      setTimeout(() => commentEl.classList.remove('comment-pulse'), 1000);
      setTimeout(updateConnectors, 300);
    }
  };

  // Fetch document on load
  useEffect(() => {
    async function fetchDocument() {
      try {
        const [docRes, contentRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/v1/documents/${docId}`),
          fetch(`${API_BASE_URL}/api/v1/documents/${docId}/content`)
        ]);

        if (!docRes.ok || !contentRes.ok) {
          throw new Error('Failed to fetch document');
        }

        const doc = await docRes.json();
        const { content } = await contentRes.json();

        setDocument(doc);
        setContent(content);

        if (autoReview) {
          startReview();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    }

    fetchDocument();
  }, [docId, autoReview]);

  const startReview = async () => {
    setIsReviewing(true);
    setReviewStatus('Starting review...');
    setComments([]);
    setNewHighlights(new Set());

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/reviews/${docId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        throw new Error('Failed to start review');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      setReviewStatus('Personas are reviewing...');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.done) {
              setReviewStatus('Review complete!');
              setIsReviewing(false);
            } else {
              const newComment = data as Comment;
              setComments(prev => [...prev, newComment]);
              
              setNewHighlights(prev => new Set(prev).add(newComment.id));
              
              setTimeout(() => {
                scrollToLine(newComment.anchor.start_line, newComment.id);
              }, 100);
              
              setTimeout(() => {
                setNewHighlights(prev => {
                  const next = new Set(prev);
                  next.delete(newComment.id);
                  return next;
                });
              }, 2000);
            }
          } catch (e) {
            console.error('Failed to parse SSE data:', e);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review failed');
      setIsReviewing(false);
    }
  };

  const highlights = lineHighlights();

  const getLineStyle = (lineNum: number) => {
    const lineHighs = highlights.get(lineNum);
    if (!lineHighs || lineHighs.length === 0) return {};
    
    const isActive = lineHighs.some(h => h.commentId === activeCommentId);
    const hasNew = lineHighs.some(h => h.isNew);
    const primaryColor = lineHighs[0].color;
    
    return {
      backgroundColor: `${primaryColor}${hasNew ? '40' : isActive ? '30' : '15'}`,
      borderLeft: `3px solid ${primaryColor}`,
      transition: 'background-color 0.3s ease',
    };
  };

  if (error) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
            <h2 className="text-red-400 font-semibold mb-2">Error</h2>
            <p className="text-slate-300">{error}</p>
            <Link href="/documents" className="text-indigo-400 hover:text-indigo-300 mt-4 inline-block">
              ← Back to documents
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!document) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-slate-700 rounded w-1/3 mb-4"></div>
            <div className="h-64 bg-slate-700 rounded"></div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <style jsx global>{`
        @keyframes highlightPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes commentSlideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes lineDrawIn {
          from { stroke-dashoffset: 100; }
          to { stroke-dashoffset: 0; }
        }
        .highlight-pulse { animation: highlightPulse 0.5s ease-in-out 2; }
        .comment-pulse { animation: highlightPulse 0.5s ease-in-out 2; }
        .comment-enter { animation: commentSlideIn 0.3s ease-out; }
        .connector-line { 
          stroke-dasharray: 100;
          animation: lineDrawIn 0.5s ease-out forwards;
        }
      `}</style>

      <div ref={containerRef} className="flex h-screen relative">
        {/* SVG Connector Lines Overlay */}
        <svg 
          className="absolute inset-0 pointer-events-none z-10"
          style={{ width: '100%', height: '100%' }}
        >
          <defs>
            {sortedComments.map(comment => (
              <linearGradient 
                key={`grad-${comment.id}`} 
                id={`gradient-${comment.id}`}
                x1="0%" y1="0%" x2="100%" y2="0%"
              >
                <stop offset="0%" stopColor={comment.persona_color} stopOpacity="0.6" />
                <stop offset="100%" stopColor={comment.persona_color} stopOpacity="0.2" />
              </linearGradient>
            ))}
          </defs>
          {connectorLines.map((line) => {
            const isActive = line.commentId === activeCommentId;
            const midX = (line.startX + line.endX) / 2;
            
            return (
              <g key={line.commentId}>
                {/* Bezier curve connector */}
                <path
                  d={`M ${line.startX} ${line.startY} 
                      C ${midX} ${line.startY}, 
                        ${midX} ${line.endY}, 
                        ${line.endX} ${line.endY}`}
                  fill="none"
                  stroke={`url(#gradient-${line.commentId})`}
                  strokeWidth={isActive ? 3 : 1.5}
                  className="connector-line transition-all duration-300"
                  opacity={isActive ? 1 : 0.5}
                />
                {/* Small circle at the comment end */}
                <circle
                  cx={line.endX}
                  cy={line.endY}
                  r={isActive ? 4 : 3}
                  fill={line.color}
                  opacity={isActive ? 1 : 0.6}
                  className="transition-all duration-300"
                />
              </g>
            );
          })}
        </svg>

        {/* Document Panel */}
        <div ref={docPanelRef} className="flex-1 p-6 overflow-auto border-r border-slate-700">
          <div className="max-w-3xl mx-auto">
            <div className="mb-6">
              <Link href="/documents" className="text-slate-400 hover:text-white text-sm mb-2 inline-block">
                ← Back
              </Link>
              <h1 className="text-2xl font-bold">{document.title}</h1>
              {document.description && (
                <p className="text-slate-400 text-sm mt-1">{document.description}</p>
              )}
            </div>

            <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
              <div className="p-4 font-mono text-sm">
                {contentLines.map((line, idx) => {
                  const lineNum = idx + 1;
                  const lineHighs = highlights.get(lineNum) || [];
                  const hasHighlight = lineHighs.length > 0;
                  
                  return (
                    <div
                      key={idx}
                      ref={el => { if (el) lineRefs.current.set(lineNum, el); }}
                      className={`flex group cursor-pointer hover:bg-slate-700/30 rounded`}
                      style={getLineStyle(lineNum)}
                      onClick={() => {
                        if (hasHighlight) {
                          scrollToComment(lineHighs[0].commentId);
                        }
                      }}
                    >
                      <span className="w-12 text-right pr-4 text-slate-500 select-none flex-shrink-0 border-r border-slate-700 mr-4">
                        {lineNum}
                      </span>
                      <span className="flex-1 whitespace-pre-wrap text-slate-300">
                        {line || ' '}
                      </span>
                      {hasHighlight && (
                        <span className="ml-2 flex items-center gap-1 opacity-60">
                          {lineHighs.map((h, i) => (
                            <span
                              key={i}
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: h.color }}
                            />
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

        {/* Comments Panel */}
        <div className="w-96 flex flex-col bg-slate-800/30">
          <div className="p-4 border-b border-slate-700">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Review Comments</h2>
              {!isReviewing && comments.length === 0 && (
                <button
                  onClick={startReview}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-medium transition-colors"
                >
                  Start Review
                </button>
              )}
              {!isReviewing && comments.length > 0 && (
                <button
                  onClick={startReview}
                  className="px-3 py-1.5 bg-slate-600 hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors"
                >
                  Re-run
                </button>
              )}
            </div>
            {reviewStatus && (
              <p className="text-sm text-slate-400 mt-2 flex items-center gap-2">
                {isReviewing && (
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                )}
                {reviewStatus}
              </p>
            )}
          </div>

          <div ref={commentsPanelRef} className="flex-1 overflow-auto p-4 space-y-3">
            {sortedComments.length === 0 && !isReviewing && (
              <div className="text-center text-slate-500 py-8">
                <p>No comments yet</p>
                <p className="text-sm mt-2">Click "Start Review" to begin</p>
              </div>
            )}

            {sortedComments.map((comment) => {
              const isNew = newHighlights.has(comment.id);
              const isActive = activeCommentId === comment.id;
              
              return (
                <div
                  key={comment.id}
                  ref={el => { if (el) commentRefs.current.set(comment.id, el); }}
                  className={`
                    bg-slate-800/50 rounded-lg p-3 border-l-4 cursor-pointer
                    transition-all duration-300
                    ${isNew ? 'comment-enter' : ''}
                    ${isActive ? 'ring-2 ring-white/30 scale-[1.02]' : ''}
                    hover:bg-slate-800/70
                  `}
                  style={{ 
                    borderLeftColor: comment.persona_color,
                    boxShadow: isNew ? `0 0 20px ${comment.persona_color}40` : undefined
                  }}
                  onClick={() => scrollToLine(comment.anchor.start_line, comment.id)}
                  onMouseEnter={() => setActiveCommentId(comment.id)}
                  onMouseLeave={() => setActiveCommentId(null)}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className={`w-2 h-2 rounded-full ${isNew ? 'animate-pulse' : ''}`}
                      style={{ backgroundColor: comment.persona_color }}
                    />
                    <span className="text-sm font-medium" style={{ color: comment.persona_color }}>
                      {comment.persona_name}
                    </span>
                    <span className="text-xs text-slate-500">
                      {comment.anchor.start_line === comment.anchor.end_line 
                        ? `L${comment.anchor.start_line + 1}`
                        : `L${comment.anchor.start_line + 1}-${comment.anchor.end_line + 1}`
                      }
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {comment.content}
                  </p>
                </div>
              );
            })}

            {isReviewing && (
              <div className="text-center py-4">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
