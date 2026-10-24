import React from 'react';
import { Image, Film, Video, CirclePlay, User } from 'lucide-react';
import { MediaCategory } from '../lib/downloader-client';

interface MediaTabsProps {
  activeTab: MediaCategory;
  onSelectTab: (tab: MediaCategory) => void;
}

const TABS: { id: MediaCategory; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'photo', label: 'Photo', Icon: Image },
  { id: 'reels', label: 'Reels', Icon: Film },
  { id: 'video', label: 'Video', Icon: Video },
  { id: 'story', label: 'Story', Icon: CirclePlay },
  { id: 'profile', label: 'Profile', Icon: User },
];

export function MediaTabs({ activeTab, onSelectTab }: MediaTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Instagram Media Categories"
      className="grid grid-cols-5 gap-1 sm:gap-2 p-1.5 bg-[#F8F9FD] border border-[#E9EAF0] rounded-2xl mb-5"
    >
      {TABS.map(({ id, label, Icon }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelectTab(id)}
            className={`min-h-[52px] sm:min-h-[48px] px-2 sm:px-3 py-2 rounded-xl flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm transition-colors ${
              isActive
                ? 'bg-white text-[#7C3AED] font-semibold border border-[#E9EAF0]'
                : 'text-[#525866] hover:text-[#171827] font-medium border border-transparent'
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
