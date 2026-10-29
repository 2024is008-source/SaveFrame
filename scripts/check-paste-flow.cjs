const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/saveframe.js','utf8'),link='https://www.instagram.com/p/Fixture123/';
function fixture(mobile=true,deferred=false){
 const elements=new Map(),timers=new Map(),frames=[],pending=[];let nextTimer=0,fetches=0,focused='',scrolls=0,clipboard=link;
 const element=id=>{if(!elements.has(id))elements.set(id,{style:{},textContent:'',value:'',innerHTML:'',disabled:false,isConnected:true,className:'',listeners:{},attributes:new Map(),classList:{add(){},remove(){},toggle(){},contains(){return true;}},setAttribute(key,value){this.attributes.set(key,value);},getAttribute(key){return this.attributes.get(key)||null;},addEventListener(type,fn){this.listeners[type]=fn;},querySelector(){return null;},querySelectorAll(){return [];},replaceChildren(){},focus(){focused=id;},blur(){if(focused===id)focused='';},scrollIntoView(){scrolls++;},requestSubmit(){const operation=this.listeners.submit({preventDefault(){}});pending.push(operation);return operation;}});return elements.get(id);};
 element('home-i18n').textContent=JSON.stringify({dictionary:{}});
 const document={getElementById:element,querySelectorAll:()=>[],addEventListener(){},createTreeWalker:()=>({nextNode:()=>null})};
 const media={category:'photo',shortcode:'Fixture123',title:'Photo by fixture',uploader:{username:'fixture'},items:[{index:0,mediaType:'photo',title:'Photo by fixture',thumbnailUrl:'',aspectRatio:'Source image',formats:[{formatId:'photo-original',label:'Original image',Container:'JPEG',ext:'jpg',resolution:'Source resolution'}]}]};
 const requests=[];
 const window={location:{search:'',origin:'http://localhost:3000'},dispatchEvent(){},scrollTo(){},matchMedia:query=>({matches:query.includes('max-width')?mobile:false})};
 vm.runInNewContext(source,{window,document,URL,URLSearchParams,AbortController,NodeFilter:{SHOW_TEXT:4},CustomEvent:class{},navigator:{clipboard:{readText:async()=>clipboard}},fetch:async(_url,options)=>{fetches++;if(deferred)return new Promise(resolve=>requests.push({signal:options.signal,complete:label=>resolve({ok:true,json:async()=>({status:'ok',data:{...media,title:label,items:media.items.map(item=>({...item,title:label}))}})})}));return {ok:true,json:async()=>({status:'ok',data:media})};},setTimeout:(fn)=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>frames.push(fn)});
 window.initializeSaveFrame();
 async function flush(){for(let turn=0;turn<6;turn++){const queued=[...timers.values()];timers.clear();queued.forEach(fn=>fn());await Promise.all(pending.splice(0));await Promise.resolve();frames.splice(0).forEach(fn=>fn());}}
 return {element,flush,requests,setClipboard:value=>{clipboard=value;},fetches:()=>fetches,focused:()=>focused,scrolls:()=>scrolls};
}
(async()=>{
 let test=fixture();test.element('instagram-url-input').value=link;test.element('instagram-url-input').listeners.input({inputType:'insertText'});await test.flush();assert.equal(test.fetches(),0,'Typing alone must not fetch');
 test=fixture();test.element('instagram-url-input').listeners.paste({});test.element('instagram-url-input').value=link;test.element('instagram-url-input').listeners.input({inputType:'insertFromPaste'});await test.flush();assert.equal(test.fetches(),1,'Native paste + input must coalesce into one request');assert.equal(test.focused(),'result-dynamic-content');assert.equal(test.scrolls(),1);
 test=fixture();await test.element('paste-url-btn').listeners.click();await test.flush();assert.equal(test.fetches(),1,'Paste button must fetch automatically');assert.equal(test.focused(),'result-dynamic-content');
 test=fixture(false);await test.element('paste-url-btn').listeners.click();await test.flush();assert.equal(test.fetches(),1);assert.equal(test.scrolls(),0,'Desktop must not auto-scroll');
 test=fixture();test.element('instagram-url-input').value=link;test.element('downloader-form').requestSubmit();test.element('downloader-form').requestSubmit();await test.flush();assert.equal(test.fetches(),1,'Concurrent duplicate submission must not resolve twice');
 test=fixture();test.setClipboard('not a valid link');await test.element('paste-url-btn').listeners.click();await test.flush();assert.equal(test.fetches(),0);assert.equal(test.focused(),'instagram-url-input');
 test=fixture(true,true);test.element('instagram-url-input').value=link;test.element('downloader-form').requestSubmit();
 assert.equal(test.fetches(),1);assert.equal(test.element('submit-download-btn').disabled,true,'Immediate loading feedback before fetch resolves');
 test.element('instagram-url-input').value='https://www.instagram.com/p/Replacement123/';test.element('instagram-url-input').listeners.input({inputType:'insertText'});
 assert.equal(test.requests[0].signal.aborted,true,'Changed URL cancels the old request');test.element('downloader-form').requestSubmit();
 test.requests[1].complete('Newest fixture');await Promise.resolve();test.requests[0].complete('Stale fixture');await test.flush();
 assert.ok(test.element('result-dynamic-content').innerHTML.includes('Newest fixture'));assert.ok(!test.element('result-dynamic-content').innerHTML.includes('Stale fixture'));
 console.log('PASS: automatic clipboard-button/native-input paste, no typing fetch, duplicate suppression, invalid-link feedback and mobile-only result scroll/focus.');
})().catch(error=>{console.error(error);process.exitCode=1;});
