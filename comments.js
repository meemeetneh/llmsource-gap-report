/* LLMSource report review layer. The report pages themselves are never edited. */
(() => {
  'use strict';
  const config = window.RG_COMMENTS_CONFIG || {};
  const state = {client:null,comments:[],open:false,activeId:null,pendingAnchor:null,replyTo:null,busy:false,name:localStorage.getItem('rg-comment-name')||''};
  const $ = (selector, root=document) => root.querySelector(selector);
  const pages = () => [...document.querySelectorAll('section.page')].filter(p => p.id);
  const icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-9.5A7.5 7.5 0 0 1 10.5 4h2A7.5 7.5 0 0 1 20 11.5Z" stroke-linejoin="round"/></svg>';
  let header, panel, list, foot, toggle, selectionAction;
  let quoteHighlight, activeHighlight;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(label, className, onClick) {
    const node = el('button', className, label);
    node.type = 'button'; node.addEventListener('click', onClick);
    return node;
  }
  function timeLabel(iso) {
    try { return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(iso)); }
    catch { return ''; }
  }
  function displayName(name) {
    return (name || 'Reviewer').trim().slice(0,50) || 'Reviewer';
  }
  function initials(name) {
    return displayName(name).split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();
  }
  function status(text, error=false) {
    const node = $('.rg-status', foot);
    if (node) { node.textContent = text; node.className = 'rg-status ' + (error ? 'rg-error' : 'rg-help'); }
  }
  function fitReport() {
    const doc = $('doc-page'); if (!doc) return;
    const available = window.innerWidth - (state.open && window.innerWidth > 1100 ? 392 : 0);
    const scale = Math.min(1, (available - 32) / 794);
    doc.style.zoom = scale < 1 ? String(Math.max(.3, scale)) : '';
  }
  function setOpen(open) {
    state.open = open;
    panel.hidden = !open;
    document.body.classList.toggle('rg-panel-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    fitReport();
    if (open) { render(); panel.focus(); }
  }
  function buildUI() {
    const report = $('x-dc') || $('doc-page');
    if (!report) return false;
    document.querySelectorAll('section.page:not([id])').forEach(page=>{
      const label=page.getAttribute('data-screen-label') || '';
      if (label.startsWith('01 Cover — image')) page.id='page-01-image';
      else if (label.startsWith('01 Cover')) page.id='page-01';
      else if (label.startsWith('35 Back cover')) page.id='page-35';
    });
    let stage=report;
    while (stage.parentElement && stage.parentElement!==document.body) stage=stage.parentElement;
    if (stage.parentElement!==document.body) return false;
    stage.classList.add('rg-report-stage');
    header = el('header'); header.id = 'rg-header';
    const brand = el('div','rg-brand');
    brand.append(el('strong','', 'LLMSource'), el('span','rg-brand-sep'), el('span','rg-brand-title','The AI Representation Gap'));
    toggle = button('', '', () => setOpen(!state.open)); toggle.id='rg-toggle';
    toggle.setAttribute('aria-label','Open comments'); toggle.setAttribute('aria-controls','rg-panel'); toggle.setAttribute('aria-expanded','false');
    toggle.innerHTML = icon + '<span>Comments</span><span class="rg-badge" aria-label="0 open comments">0</span>';
    header.append(brand,toggle);
    document.body.insertBefore(header,stage);

    panel = el('aside'); panel.id='rg-panel'; panel.hidden=true; panel.tabIndex=-1; panel.setAttribute('aria-label','Report comments');
    const head = el('div','rg-panel-head');
    const line = el('div','rg-panel-head-line');
    line.append(el('h2','', 'Comments'),button('×','rg-icon-button',()=>setOpen(false)));
    head.append(line,el('p','rg-subhead','0 open'));
    list = el('div','rg-panel-scroll');
    foot = el('div','rg-panel-foot');
    panel.append(head,list,foot);
    document.body.append(panel);
    selectionAction = button('Add comment','',onSelectionAction);
    selectionAction.id='rg-selection-action'; selectionAction.hidden=true;
    document.body.append(selectionAction);
    window.addEventListener('resize',fitReport);
    document.addEventListener('mouseup',onSelectionChange);
    document.addEventListener('keyup',e=>{ if (e.key === 'Escape') { selectionAction.hidden=true; if (state.open) setOpen(false); } else onSelectionChange(); });
    window.addEventListener('scroll',()=>{selectionAction.hidden=true;}, {passive:true});
    setTimeout(fitReport,300);
    return true;
  }
  function nodePath(root,node) {
    const path=[];
    while (node && node!==root) {
      const parent=node.parentNode; if (!parent) return null;
      path.unshift([...parent.childNodes].indexOf(node)); node=parent;
    }
    return node===root ? path : null;
  }
  function nodeAtPath(root,path) {
    let node=root;
    for (const index of path || []) { node=node?.childNodes?.[index]; if (!node) return null; }
    return node;
  }
  function pageForNode(node) {
    return (node?.nodeType===Node.ELEMENT_NODE ? node : node?.parentElement)?.closest('section.page');
  }
  function currentPage() {
    const visible = pages().map(p=>({p,rect:p.getBoundingClientRect()})).filter(x=>x.rect.bottom>90 && x.rect.top<window.innerHeight);
    visible.sort((a,b)=>Math.abs(a.rect.top-140)-Math.abs(b.rect.top-140));
    return visible[0]?.p || pages()[0];
  }
  function captureSelection() {
    const sel=window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range=sel.getRangeAt(0);
    const startPage=pageForNode(range.startContainer), endPage=pageForNode(range.endContainer);
    if (!startPage || startPage!==endPage || !startPage.id) return null;
    const quote=sel.toString().trim().replace(/\s+/g,' ');
    if (!quote || quote.length>600) return null;
    const startPath=nodePath(startPage,range.startContainer), endPath=nodePath(startPage,range.endContainer);
    if (!startPath || !endPath) return null;
    return {page_id:startPage.id,quote,start_path:startPath,end_path:endPath,start_offset:range.startOffset,end_offset:range.endOffset};
  }
  function onSelectionChange() {
    if (selectionAction?.contains(document.activeElement) || panel?.contains(document.activeElement)) return;
    const anchor=captureSelection();
    if (!anchor) { selectionAction.hidden=true; return; }
    const rect=window.getSelection().getRangeAt(0).getBoundingClientRect();
    state.pendingAnchor=anchor;
    selectionAction.style.left=Math.min(window.innerWidth-142,Math.max(8,rect.right-120))+'px';
    selectionAction.style.top=Math.min(window.innerHeight-42,Math.max(8,rect.bottom+8))+'px';
    selectionAction.hidden=false;
  }
  function onSelectionAction() {
    selectionAction.hidden=true;
    state.replyTo=null;
    setOpen(true);
    renderComposer();
    $('textarea',foot)?.focus();
  }
  function anchorRange(comment) {
    const page=document.getElementById(comment.page_id);
    if (!page || !comment.start_path || !comment.end_path) return null;
    const start=nodeAtPath(page,comment.start_path), end=nodeAtPath(page,comment.end_path);
    if (!start || !end) return null;
    try {
      const range=document.createRange();
      range.setStart(start,comment.start_offset); range.setEnd(end,comment.end_offset);
      if (range.toString().trim().replace(/\s+/g,' ')!==comment.quote) return null;
      return range;
    } catch { return null; }
  }
  function paintAnchors() {
    document.querySelectorAll('.rg-pin').forEach(pin=>pin.remove());
    if (CSS.highlights) {
      CSS.highlights.delete('rg-comments'); CSS.highlights.delete('rg-comments-active');
      quoteHighlight=new Highlight(); activeHighlight=new Highlight();
    }
    const roots=state.comments.filter(c=>!c.parent_id && !c.resolved_at);
    roots.forEach((comment,index)=>{
      const page=document.getElementById(comment.page_id);
      if (!page) return;
      const range=anchorRange(comment);
      if (range && quoteHighlight) (comment.id===state.activeId ? activeHighlight : quoteHighlight).add(range);
      const pin=button(String(index+1),'rg-pin',()=>{
        state.activeId=comment.id; setOpen(true); render();
        $(`[data-comment-id="${comment.id}"]`,list)?.scrollIntoView({block:'nearest',behavior:'smooth'});
      });
      pin.setAttribute('aria-label',`Open comment ${index+1}`);
      const pageRect=page.getBoundingClientRect();
      const r=range?.getBoundingClientRect();
      const scale=pageRect.width/(page.offsetWidth||794) || 1;
      const top=r && r.height ? (r.top-pageRect.top)/scale : 68+(index%12)*29;
      pin.style.top=Math.max(36,Math.min(page.offsetHeight-35,top))+'px';
      page.append(pin);
    });
    if (quoteHighlight) { CSS.highlights.set('rg-comments',quoteHighlight); CSS.highlights.set('rg-comments-active',activeHighlight); }
  }
  function jumpTo(comment) {
    state.activeId=comment.id;
    const range=anchorRange(comment);
    (range?.startContainer?.parentElement || document.getElementById(comment.page_id))?.scrollIntoView({block:'center',behavior:'smooth'});
    render();
  }
  function renderThread(comment,index) {
    const card=el('article','rg-thread');
    card.dataset.commentId=comment.id;
    card.dataset.active=String(comment.id===state.activeId);
    if (comment.resolved_at) card.classList.add('rg-resolved');
    const top=el('div','rg-thread-top');
    const who=el('div'); who.append(el('div','rg-author',displayName(comment.author_name)),el('div','rg-time',timeLabel(comment.created_at)));
    top.append(el('span','rg-avatar',initials(comment.author_name)),who,el('span','rg-thread-num','#'+(index+1)));
    card.append(top);
    if (comment.quote) card.append(el('p','rg-quote',comment.quote));
    card.append(el('p','rg-body',comment.body));
    const replies=state.comments.filter(c=>c.parent_id===comment.id);
    if (replies.length) {
      const wrap=el('div','rg-replies');
      replies.forEach(reply=>{
        const block=el('div','rg-reply');
        block.append(el('div','rg-author',displayName(reply.author_name)+' · '+timeLabel(reply.created_at)),el('p','rg-body',reply.body));
        wrap.append(block);
      });
      card.append(wrap);
    }
    if (comment.resolved_at) card.append(el('span','rg-resolved-label','Resolved'));
    const actions=el('div','rg-thread-actions');
    actions.append(button('Go to text','rg-text-button',()=>jumpTo(comment)));
    if (!comment.resolved_at) {
      actions.append(button('Reply','rg-text-button',()=>{state.replyTo=comment.id;state.pendingAnchor=null;renderComposer();$('textarea',foot)?.focus();}));
    }
    card.append(actions);
    return card;
  }
  function renderList() {
    const previousScroll=list.scrollTop;
    list.replaceChildren();
    if (!state.client) { list.append(el('p','rg-empty','Comments are being connected. Please try again shortly.')); return; }
    const roots=state.comments.filter(c=>!c.parent_id).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
    if (!roots.length) { list.append(el('p','rg-empty','No comments yet. Select text in the report to start a discussion.')); return; }
    roots.forEach((c,i)=>list.append(renderThread(c,i)));
    list.scrollTop=previousScroll;
  }
  function renderComposer() {
    foot.replaceChildren();
    if (!state.client) return;
    const nameLabel=el('label','', 'Your name'); nameLabel.htmlFor='rg-name';
    const name=el('input'); name.id='rg-name'; name.maxLength=50; name.autocomplete='name'; name.placeholder='Name shown with your comments'; name.value=state.name;
    foot.append(nameLabel,name);
    const page=state.pendingAnchor?.page_id || (state.replyTo ? state.comments.find(c=>c.id===state.replyTo)?.page_id : currentPage()?.id);
    const label=el('label','',state.replyTo ? 'Reply to comment' : state.pendingAnchor ? 'Comment on selected text' : `Comment on ${page?.replace('page-','page ') || 'this page'}`);
    label.htmlFor='rg-message';
    const textarea=el('textarea'); textarea.id='rg-message'; textarea.maxLength=2000; textarea.placeholder='Write a comment…';
    foot.append(label,textarea);
    const actions=el('div','rg-foot-actions');
    actions.append(button('Cancel','rg-text-button',()=>{state.replyTo=null;state.pendingAnchor=null;renderComposer();}));
    actions.append(button('Post comment','rg-primary',()=>postComment(textarea.value,name.value)));
    foot.append(actions,el('p','rg-status rg-help'));
  }
  function renderCount() {
    const count=state.comments.filter(c=>!c.parent_id && !c.resolved_at).length;
    $('.rg-badge',toggle).textContent=String(count);
    $('.rg-badge',toggle).setAttribute('aria-label',`${count} open comments`);
    $('.rg-subhead',panel).textContent=`${count} open`;
  }
  function render() {
    renderCount();
    renderList(); renderComposer(); paintAnchors();
  }
  async function loadComments() {
    const {data,error}=await state.client.rpc('list_report_comments',{p_token:window.RG_COMMENTS_TOKEN});
    if (error) { if (state.open) status('Could not load comments. Retry in a moment.',true); return; }
    state.comments=data||[];
    renderCount(); renderList(); paintAnchors();
  }
  async function postComment(raw,rawName) {
    const body=(raw||'').trim();
    if (!body) {status('Write a comment first.',true);return;}
    const name=(rawName||'').trim();
    if (!name || name.length>50) {status('Enter your name first.',true);return;}
    if (state.busy) return;
    const parent=state.replyTo ? state.comments.find(c=>c.id===state.replyTo) : null;
    const anchor=state.pendingAnchor;
    const pageId=parent?.page_id || anchor?.page_id || currentPage()?.id;
    if (!pageId) {status('Choose a report page first.',true);return;}
    const payload={p_token:window.RG_COMMENTS_TOKEN,p_page_id:pageId,p_body:body,p_author_name:name,p_parent_id:parent?.id||null};
    if (!parent && anchor) Object.assign(payload,{p_quote:anchor.quote,p_start_path:anchor.start_path,p_end_path:anchor.end_path,p_start_offset:anchor.start_offset,p_end_offset:anchor.end_offset});
    state.busy=true;
    const {error}=await state.client.rpc('post_report_comment',payload);
    state.busy=false;
    if (error) {status('Comment was not saved. '+error.message,true);return;}
    state.name=name;localStorage.setItem('rg-comment-name',name);
    state.pendingAnchor=null;state.replyTo=null;window.getSelection()?.removeAllRanges();
    await loadComments();
    renderComposer();
  }
  async function connect() {
    if (!config.url || !config.publishableKey || !window.RG_COMMENTS_TOKEN || !window.supabase?.createClient) {render();return;}
    state.client=window.supabase.createClient(config.url,config.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
    await loadComments();
    renderComposer();
    setInterval(()=>{if (!document.hidden) loadComments();},30000);
  }
  function init() {
    if (buildUI()) { render(); connect(); return; }
    // The report runtime mounts <doc-page> after the document finishes parsing.
    const observer=new MutationObserver(()=>{
      if (!buildUI()) return;
      observer.disconnect(); render(); connect();
    });
    observer.observe(document.body,{childList:true,subtree:true});
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
