interface Thumbnail {url:string;width?:number;height?:number}
const dimension=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=32768?value:undefined;

/** Choose existing renditions only; never rewrite signed CDN URLs or downgrade downloads. */
export function imagePreviews(ordered:readonly Thumbnail[]){
  const original=ordered[0];if(!original)return {};
  const ratio=original.width&&original.height?original.width/original.height:undefined;
  const candidates=ordered.filter(item=>item.url&&(!ratio||!item.width||!item.height||Math.abs(item.width/item.height-ratio)<0.03));
  const size=(item:Thumbnail)=>{
    if(dimension(item.width))return item.width!;
    try{
      const url=new URL(item.url);
      if(!['cdninstagram.com','fbcdn.net'].some(domain=>url.hostname===domain||url.hostname.endsWith('.'+domain)))return 0;
      // A supplied CDN size hint can rank candidates, but is not a measured
      // source dimension and must never become the advertised image resolution.
      const match=(url.searchParams.get('stp')||'').match(/(?:^|_)[sp](\d{2,5})x(\d{2,5})(?:_|$)/);
      return match?dimension(Number(match[1]))||0:0;
    }catch{return 0;}
  };
  const sized=candidates.filter(item=>size(item)>0).sort((a,b)=>size(a)-size(b));
  const select=(target:number)=>sized.find(item=>size(item)>=target)||sized.at(-1)||original;
  return {thumbnailUrl:select(640).url,thumbnailSmallUrl:select(96).url,imagePreviewUrl:original.url};
}
