(() => {
  'use strict';
  const attributes=['data-node-key','data-tv-player','data-player-id','data-player-tab','data-scroll-key','data-view','data-league','data-chart-range'];
  function key(node) {
    if(node.nodeType!==1)return null;
    if(node.id)return node.tagName+':id:'+node.id;
    for(const name of attributes)if(node.hasAttribute(name))return node.tagName+':'+name+':'+node.getAttribute(name);
    return null;
  }
  const compatible=(a,b)=>a && a.nodeType===b.nodeType && (a.nodeType!==1 || a.tagName===b.tagName && a.namespaceURI===b.namespaceURI) && key(a)===key(b);
  function update(current,next) {
    if(current.nodeType!==1) {
      if(current.nodeValue!==next.nodeValue)current.nodeValue=next.nodeValue;
      return;
    }
    // A failed portrait keeps its successful fallback across score refreshes.
    if(current.tagName==='IMG' && current.getAttribute('data-fallback')==='' && next.hasAttribute('data-fallback') && !current.hasAttribute('data-failed-src'))current.setAttribute('data-failed-src',next.getAttribute('src'));
    const keepFallback=current.tagName==='IMG' && current.getAttribute('data-failed-src')===next.getAttribute('src');
    for(const attribute of [...current.attributes]) {
      if(attribute.name==='open' && current.tagName==='DETAILS' || keepFallback && ['src','data-fallback','data-failed-src'].includes(attribute.name))continue;
      if(!next.hasAttribute(attribute.name))current.removeAttribute(attribute.name);
    }
    for(const attribute of [...next.attributes]) {
      if(keepFallback && ['src','data-fallback'].includes(attribute.name))continue;
      if(current.getAttribute(attribute.name)!==attribute.value)current.setAttribute(attribute.name,attribute.value);
    }
    children(current,next);
  }
  function children(parent,next) {
    const keyed=new Map([...parent.childNodes].map(node=>[key(node),node]).filter(([id])=>id));
    let cursor=parent.firstChild;
    for(const desired of [...next.childNodes]) {
      const identity=key(desired);
      let current=identity?keyed.get(identity):compatible(cursor,desired)?cursor:null;
      if(!compatible(current,desired))current=desired.cloneNode(true);
      if(current!==cursor)parent.insertBefore(current,cursor);
      update(current,desired);
      cursor=current.nextSibling;
    }
    while(cursor) { const next=cursor.nextSibling;parent.removeChild(cursor);cursor=next; }
  }
  function patch(element,markup) {
    if(!element)return;
    if(!document.createElement) { if(element.innerHTML!==markup)element.innerHTML=markup;return; }
    const template=document.createElement('template');
    template.innerHTML=markup;
    children(element,template.content);
  }
  window.FantasyDOM={patch};
})();
