import tools from '../content/tools.json';
import information from '../content/information.json';
import posts from '../content/blog/posts.json';
export interface SeoPage { route:string; title:string; description:string; keyword:string; image:string; kind:string; contentEditable:boolean }
export function seoCatalog(): SeoPage[] {
const pages = [{route:'/', title:'TikTok Video & Photo Downloader | TikSaveMP4', description:'Download public TikTok videos and photo slideshows.', kind:'Homepage'}, ...tools.map(page=>({route:'/'+page.slug,title:page.title+' | TikSaveMP4',description:page.description,kind:'Tool'})), ...information.map(page=>({route:'/'+page.slug,title:page.title+' | TikSaveMP4',description:page.description,kind:'Information'})), {route:'/blog',title:'TikTok Download Guides & Tutorials | TikSaveMP4',description:'TikTok video, photo and troubleshooting guides.',kind:'Guide index'}, ...posts.filter(post=>post.published).map(post=>({route:'/blog/'+post.slug,title:post.title+' | TikSaveMP4',description:post.description,kind:'Article'}))];
return pages.map(page=>({...page,keyword:'',image:'/social/tiksave.png',contentEditable:true}));
}
export function approvedImages() { return ['/social/tiksave.png']; }
