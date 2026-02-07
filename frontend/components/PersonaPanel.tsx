'use client';

import { useState } from 'react';
import { Persona } from '@/lib/api';

interface Props {
  personas: Persona[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onReviewRequest?: (personaIds: string[]) => void;
  isReviewing?: boolean;
}

export function PersonaPanel({ 
  personas, 
  selectedIds, 
  onSelectionChange, 
  onReviewRequest,
  isReviewing = false 
}: Props) {
  const togglePersona = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(pid => pid !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const selectAll = () => onSelectionChange(personas.map(p => p.id));
  const selectNone = () => onSelectionChange([]);

  return (
    <div className="w-72 border-l bg-white flex flex-col">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-slate-800">Review Personas</h2>
        <p className="text-xs text-slate-500 mt-1">
          Select personas to review this document
        </p>
      </div>
      
      {/* Quick actions */}
      <div className="px-4 py-2 border-b flex gap-2">
        <button 
          onClick={selectAll}
          className="text-xs text-blue-600 hover:underline"
        >
          Select all
        </button>
        <span className="text-slate-300">|</span>
        <button 
          onClick={selectNone}
          className="text-xs text-blue-600 hover:underline"
        >
          Clear
        </button>
      </div>
      
      {/* Persona list */}
      <div className="flex-1 overflow-auto p-2">
        {personas.map((persona) => {
          const isSelected = selectedIds.includes(persona.id);
          
          return (
            <button
              key={persona.id}
              onClick={() => togglePersona(persona.id)}
              className={`w-full text-left p-3 rounded-lg mb-2 transition-all ${
                isSelected 
                  ? 'ring-2 ring-offset-1' 
                  : 'hover:bg-slate-50'
              }`}
              style={{ 
                boxShadow: isSelected ? `0 0 0 2px ${persona.color}` : undefined, // ringColor: isSelected ? persona.color : undefined,
                borderLeft: `3px solid ${persona.color}`
              }}
            >
              <div className="flex items-center gap-2">
                <div 
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                    isSelected ? 'bg-current' : ''
                  }`}
                  style={{ borderColor: persona.color, color: persona.color }}
                >
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
                    </svg>
                  )}
                </div>
                <span className="font-medium text-sm">{persona.name}</span>
              </div>
              {persona.description && (
                <p className="text-xs text-slate-500 mt-1 ml-6">
                  {persona.description}
                </p>
              )}
              <div className="flex flex-wrap gap-1 mt-2 ml-6">
                {persona.focus_areas.slice(0, 3).map((area) => (
                  <span 
                    key={area}
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: `${persona.color}20`, color: persona.color }}
                  >
                    {area}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
      
      {/* Review button */}
      <div className="p-4 border-t">
        <button
          onClick={() => onReviewRequest?.(selectedIds)}
          disabled={selectedIds.length === 0 || isReviewing}
          className={`w-full py-2 px-4 rounded-lg font-medium transition-all ${
            selectedIds.length === 0 || isReviewing
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          {isReviewing ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
              </svg>
              Reviewing...
            </span>
          ) : (
            `Review with ${selectedIds.length} persona${selectedIds.length !== 1 ? 's' : ''}`
          )}
        </button>
      </div>
    </div>
  );
}
