import fs from 'node:fs';
import path from 'node:path';
import tools from '../content/tools.json';
import information from '../content/information.json';
import posts from '../content/blog/posts.json';
import { locales, localePath } from '../i18n/config';
export interface SeoPage { route:string; title:string; description:string; keyword:string; image:string; kind:string; contentEditable:boolean }
export function seoCatalog(): SeoPage[] {
  const homes=locales.map(locale=> {
    const dictionary=JSON.parse(fs.readFileSync(path.join(process.cwd(),'src/i18n/dictionaries',locale+'.json'),'utf8'));
    return {route:localePath(locale),title:dictionary['SaveFrame — Instagram Downloader for Photos, Reels, Videos & Stories'],description:dictionary['Save supported public Instagram photos, videos, Reels, carousels, and stories with a simple link. Fast, clean, mobile-friendly web utility.'],keyword:'',image:'/social/saveframe.png',kind:'Homepage · '+locale,contentEditable:false};
  });
  return [...homes,...tools.map(page=>({route:'/'+page.slug,title:page.title+' | SaveFrame',description:page.description,keyword:'',image:'/social/saveframe.png',kind:'Tool',contentEditable:true})),...information.map(page=>({route:'/'+page.slug,title:page.title+' | SaveFrame',description:page.description,keyword:'',image:'/social/saveframe.png',kind:'Information',contentEditable:true})),{route:'/blog',title:'Instagram Download Guides & Tutorials | SaveFrame',description:'Practical guides to downloading supported Instagram photos, Reels, videos, and stories, with clear troubleshooting and backup advice.',keyword:'',image:'/images/blog/reels-1200.webp',kind:'Guide index',contentEditable:false},...posts.filter(post=>post.published).map(post=>({route:'/blog/'+post.slug,title:post.title+' | SaveFrame',description:post.description,keyword:post.primaryKeyword,image:'/images/blog/'+post.cover+'-1200.webp',kind:'Article',contentEditable:true}))];
}
export function approvedImages() { return [...new Set(['/social/saveframe.png',...posts.filter(post=>post.published).map(post=>'/images/blog/'+post.cover+'-1200.webp')])]; }
