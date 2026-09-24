(() => {
  'use strict';
  const root=new URL(document.currentScript.dataset.root || './',document.baseURI);
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={tutorial:'入门教程',hyperbench:'HyperBench',dsl:'组件 DSL'};
  const dialog=document.createElement('dialog');dialog.className='search-dialog';dialog.setAttribute('aria-label','搜索所有文档');
  dialog.innerHTML='<div class="search-top"><label><span class="sr-only">搜索内容</span><input type="search" placeholder="搜索守恒、WENO、CFL、DSL…" autocomplete="off"></label><button class="search-close" type="button" aria-label="关闭搜索">Esc</button></div><p class="search-hint" aria-live="polite">搜索入门教程、HyperBench 与组件 DSL</p><div class="search-results"></div>';
  document.body.append(dialog);
  const input=dialog.querySelector('input'),results=dialog.querySelector('.search-results'),hint=dialog.querySelector('.search-hint');
  let records=null,loading=null;
  async function open(){
    dialog.showModal();input.focus();
    if(!records){
      results.innerHTML='<p class="search-empty">正在载入文档目录…</p>';
      try{
        loading ||= fetch(new URL('search-index.json',root)).then(r=>{if(!r.ok)throw Error(r.status);return r.json();});
        records=await loading;render();
      }catch{loading=null;results.innerHTML='<p class="search-empty">暂时无法载入搜索。请从各栏目目录继续阅读，稍后重试。</p>';}
    }else render();
  }
  function render(){
    if(!records)return;
    const query=input.value.trim().toLowerCase();
    const terms=query.split(/\s+/).filter(Boolean);
    const ranked=records.map(r=>({r,score:terms.reduce((n,t)=>n+(r.title.toLowerCase().includes(t)?5:0)+(r.text.toLowerCase().includes(t)?1:0),0)})).filter(({r})=>terms.every(t=>(r.title+' '+r.text).toLowerCase().includes(t))).sort((a,b)=>b.score-a.score);
    hint.textContent=query?`找到 ${ranked.length} 篇相关文档 · 显示前 24 篇`:'输入关键词，搜索三个栏目中的全部章节';
    results.innerHTML=ranked.slice(0,24).map(({r})=>{
      let offset=query?r.text.toLowerCase().indexOf(terms[0]):-1;offset=Math.max(0,offset-35);
      const excerpt=r.text.slice(offset,offset+125);
      return `<a href="${esc(new URL(r.url,root).href)}"><span class="search-section">${labels[r.section]}</span><strong>${esc(r.title)}</strong><small>${offset?'…':''}${esc(excerpt)}…</small></a>`;
    }).join('') || '<p class="search-empty">没有找到相关章节。试试“通量”“边界”或“时间步”。</p>';
  }
  document.querySelectorAll('.portal-search').forEach(b=>b.addEventListener('click',open));
  dialog.querySelector('.search-close').onclick=()=>dialog.close();
  results.addEventListener('click',e=>{if(e.target.closest('a'))dialog.close();});
  input.addEventListener('input',render);
  document.addEventListener('keydown',e=>{
    if((e.key==='/' || ((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'))&&!dialog.open&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)&&!document.activeElement.isContentEditable){e.preventDefault();open();}
  });
})();
