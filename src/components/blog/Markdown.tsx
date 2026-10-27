import { Fragment } from 'react';
import { headingId } from '../../lib/blog';
import { toolPaths } from '../../lib/navigation';

function inline(text: string) {
  return text.split(/(\[[^\]]+\]\([^\s)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g).map((piece, index) => {
    const link = piece.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link && /^(https:\/\/|\/(?!\/)|#)/.test(link[2])) {
      const tool = link[2].match(/^\/\?tool=(photo|reels|story|video|profile)#main-tool$/);
      if(tool?.[1] === 'story' || link[2] === '/story-downloader') return <Fragment key={index}>{link[1]}</Fragment>;
      return <a key={index} href={tool ? toolPaths[tool[1]] : link[2]}>{link[1]}</a>;
    }
    if (piece.startsWith('**') && piece.endsWith('**')) return <strong key={index}>{piece.slice(2, -2)}</strong>;
    if (piece.startsWith('`') && piece.endsWith('`')) return <code key={index}>{piece.slice(1, -1)}</code>;
    return <Fragment key={index}>{piece}</Fragment>;
  });
}
export function Markdown({ content }: { content: string }) {
  const blocks = content.trim().split(/\r?\n\s*\r?\n/);
  return <div className="article-prose">{blocks.map((block, index) => {
    const heading = block.match(/^(#{2,3}) (.+)$/);
    if (heading) return heading[1].length === 2 ? <h2 id={headingId(heading[2])} key={index}>{inline(heading[2])}</h2> : <h3 id={headingId(heading[2])} key={index}>{inline(heading[2])}</h3>;
    const lines = block.split(/\r?\n/);
    if (lines.every(line => /^\d+\. /.test(line))) return <ol key={index}>{lines.map((line, i) => <li key={i}>{inline(line.replace(/^\d+\. /, ''))}</li>)}</ol>;
    if (lines.every(line => /^- /.test(line))) return <ul key={index}>{lines.map((line, i) => <li key={i}>{inline(line.slice(2))}</li>)}</ul>;
    return <p key={index}>{inline(lines.join(' '))}</p>;
  })}</div>;
}
