import {strict as assert} from 'node:assert';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Minimal platform fixture; parsed trees are supplied independently of the patcher.
class Node {
  constructor(tag,attributes={},children=[],value=null){this.nodeType=tag?1:3;this.tagName=tag?.toUpperCase();this.namespaceURI='html';this.values=new Map(Object.entries(attributes));this.childNodes=[];this.parentNode=null;this.nodeValue=value;this.scrollTop=0;children.forEach(child=>this.insertBefore(child,null));}
  get id(){return this.getAttribute('id') || '';}
  get attributes(){return [...this.values].map(([name,value])=>({name,value}));}
  get firstChild(){return this.childNodes[0] || null;}
  get nextSibling(){return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this)+1] || null;}
  hasAttribute(name){return this.values.has(name);}
  getAttribute(name){return this.values.get(name) ?? null;}
  setAttribute(name,value){this.values.set(name,String(value));}
  removeAttribute(name){this.values.delete(name);}
  insertBefore(node,cursor){if(node===cursor)return node;if(node.parentNode)node.parentNode.removeChild(node);const index=cursor?this.childNodes.indexOf(cursor):this.childNodes.length;assert.ok(index>=0);this.childNodes.splice(index,0,node);node.parentNode=this;return node;}
  removeChild(node){this.childNodes.splice(this.childNodes.indexOf(node),1);node.parentNode=null;return node;}
  cloneNode(deep){return new Node(this.tagName,Object.fromEntries(this.values),deep?this.childNodes.map(child=>child.cloneNode(true)):[],this.nodeValue);}
}
const text=value=>new Node(null,{},[],value);
const tree=(player,score)=>new Node('section',{'data-node-key':'sleeper:'+player},[
  new Node('img',{src:'portrait-'+player+'.png','data-fallback':'backup.png'}),
  new Node('button',{'data-player-tab':'news'},[text('News')]),
  new Node('div',{'data-scroll-key':'player-news'},[new Node('strong',{},[text(score)]),new Node('details',{},[new Node('summary',{},[text('Sources')])])])
]);
const templates=new Map([['refresh',tree('123','31.1')],['other-player',tree('456','12.4')]]);
const document={createElement:()=>({set innerHTML(markup){this.content=new Node('template',{},[templates.get(markup).cloneNode(true)]);}})};
const context={window:{},document,Map};
vm.runInNewContext(await readFile(new URL('../dom-patch.js',import.meta.url),'utf8'),context);
const original=tree('123','29.4'),root=new Node('div',{},[original]);
const image=original.childNodes[0],button=original.childNodes[1],panel=original.childNodes[2],details=panel.childNodes[1];
panel.scrollTop=137;details.setAttribute('open','');image.setAttribute('src','backup.png');image.setAttribute('data-fallback','');
for(let tick=0;tick<20;tick++)context.window.FantasyDOM.patch(root,'refresh');
assert.equal(root.firstChild,original,'Score refreshes keep the selected player scene mounted');
assert.equal(original.childNodes[1],button,'The focused tab button keeps its identity');
assert.equal(original.childNodes[2],panel);assert.equal(panel.scrollTop,137,'News scroll position survives repeated refreshes');
assert.ok(details.hasAttribute('open'),'Expanded source coverage stays open');
assert.equal(panel.childNodes[0].firstChild.nodeValue,'31.1','New scores update inside the existing panel');
assert.equal(original.childNodes[0],image);assert.equal(image.getAttribute('src'),'backup.png','Working portrait fallbacks are retained');
context.window.FantasyDOM.patch(root,'other-player');
assert.notEqual(root.firstChild,original,'Explicitly selecting a different player starts their own scene');
assert.equal(root.firstChild.getAttribute('data-node-key'),'sleeper:456');
assert.equal(root.childNodes.length,1,'The previous scene is removed without an intermediate home scene');
console.log('Passed: mounted player scenes, retained tabs/scroll/source expansion/portrait fallback, live values, and intentional player changes.');
