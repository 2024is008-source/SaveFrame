import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const isOpen = openId === item.id;
        return (
          <div key={item.id} className="bg-white border border-[#E9EAF0] rounded-xl overflow-hidden">
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenId(isOpen ? null : item.id)}
                className="w-full min-h-[54px] px-5 py-4 text-left flex items-center justify-between gap-4 font-semibold text-sm sm:text-base text-[#171827] hover:bg-[#F8F9FD]/60"
              >
                <span>{item.question}</span>
                <ChevronDown
                  className={`w-4 h-4 shrink-0 transition-transform ${
                    isOpen ? 'rotate-180 text-[#7C3AED]' : 'text-[#525866]'
                  }`}
                />
              </button>
            </h3>
            {isOpen && (
              <div className="px-5 pb-4 pt-3 text-xs sm:text-sm text-[#525866] leading-relaxed border-t border-[#E9EAF0]/60">
                {item.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
