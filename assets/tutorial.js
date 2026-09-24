(() => {
  'use strict';
  const toggle=document.querySelector('.toggle-lessons'),sidebar=document.querySelector('.lesson-sidebar');
  toggle?.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));sidebar.classList.toggle('is-open',open);toggle.textContent=open?'收起课程目录':'展开课程目录';});
  document.querySelectorAll('.copy-code').forEach(button=>button.addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(button.closest('.lesson-code').querySelector('code').textContent);button.textContent='已复制';}
    catch{button.textContent='请选中文本复制';}
    setTimeout(()=>button.textContent='复制',1800);
  }));
  if(window.mermaid && document.querySelector('.mermaid')){
    mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'base',themeVariables:{primaryColor:'#edf5f3',primaryBorderColor:'#75a89e',primaryTextColor:'#294152',lineColor:'#8296aa',fontFamily:'-apple-system, BlinkMacSystemFont, PingFang SC, sans-serif'},flowchart:{htmlLabels:false,useMaxWidth:true}});
    mermaid.run({nodes:document.querySelectorAll('.mermaid')}).catch(()=>{
      document.querySelectorAll('.flow-figure figcaption').forEach(c=>c.textContent='图解暂未渲染，可阅读上方流程文本。');
    });
  }
  const slider=document.getElementById('mix-weight');
  if(slider){
    const format=v=>Number(v.toFixed(5)).toString(),array=a=>'['+a.map(format).join(', ')+']';
    function update(){
      const w=Number(slider.value),g=[.5,2,8],r=[.25,1,10.25],u=[1,2,4];
      const f=g.map((x,i)=>w*x+(1-w)*r[i]);
      const next=u.map((x,i)=>x-.1*(f[i]-f[(i+2)%3]));
      const hard=w>=.5?'Godunov':'Rusanov',hardState=w>=.5?[1.75,1.85,3.4]:[2,1.925,3.075];
      document.getElementById('mix-value').textContent=w.toFixed(2)+' / '+(1-w).toFixed(2);
      document.querySelector('.lab-results').innerHTML=`<div><small>混合后的公共通量</small><b>${array(f)}</b></div><div><small>软混合 · 下一状态</small><b>${array(next)}</b></div><div><small>硬选择 · ${hard}</small><b>${array(hardState)}</b></div><div><small>更新前后总和</small><b>7 → ${format(next.reduce((a,b)=>a+b,0))}</b></div>`;
    }
    slider.addEventListener('input',update);update();
  }
})();
