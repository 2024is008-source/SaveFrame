const assert=require('node:assert/strict'),fs=require('node:fs');
const titles=require('../src/content/search-titles.json'),tools=require('../src/content/tools.json');
const before=process.argv.includes('--before'),base=process.env.TEST_BASE_URL||'http://127.0.0.1:3139';
const decode=value=>value.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
async function main(){
 const pages=[];
 for(const slug of ['reels-downloader','photo-downloader','carousel-downloader','audio-downloader','video-downloader']){
  const route='/'+slug,response=await fetch(base+route,{signal:AbortSignal.timeout(20000)}),html=await response.text();assert.equal(response.status,200);
  const meta={};for(const [tag]of html.matchAll(/<meta\b[^>]*>/g)){const name=tag.match(/(?:name|property)="([^"]+)"/)?.[1],content=tag.match(/content="([^"]*)"/)?.[1];if(name&&content!==undefined)meta[name]=decode(content);}
  const titleTags=[...html.matchAll(/<title>([\s\S]*?)<\/title>/g)],tool=tools.find(tool=>tool.slug===slug);
  const record={route,status:response.status,title:decode(titleTags[0]?.[1]||''),description:meta.description,ogTitle:meta['og:title'],ogDescription:meta['og:description'],twitterTitle:meta['twitter:title'],twitterDescription:meta['twitter:description'],canonical:decode(html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1]||''),h1:decode(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1].replace(/<[^>]+>/g,'').trim()||'')};
  if(!before){
   assert.equal(titleTags.length,1);assert.equal((html.match(/<meta name="description"/g)||[]).length,1);
   assert.equal(record.title,titles[route]);assert.equal(record.description,tool.description);assert.equal(record.h1,tool.title);
   for(const key of ['ogTitle','twitterTitle'])assert.equal(record[key],titles[route]);
   for(const key of ['ogDescription','twitterDescription'])assert.equal(record[key],tool.description);
   assert.equal(record.canonical,'https://saveframe.site'+route);assert.equal(meta.robots,'index, follow');
  }
  pages.push(record);
 }
 fs.writeFileSync('reports/tool-search-metadata-'+(before?'before':'after')+'.json',JSON.stringify({base,pages},null,2)+'\n');
 console.log((before?'Recorded live previous':'PASS: rendered new')+' search/social metadata, descriptions, H1 and canonical URLs for all five tool pages.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
