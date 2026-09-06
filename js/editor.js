// Éditeur Quill (snow theme) – publipostage Grist.
// + variables #badge (v1.3.0)
// + saut de page forcé à l’export PDF (v1.4.0)
// + zone à 2 colonnes éditables (v1.8.0)
// + paste sans saut de ligne parasite (v1.8.1)

const Editor = (function () {
  let quill = null;
  const FontSize = Quill.import('formats/size');
  Quill.register(FontSize, true);
  const FontFamily = Quill.import('formats/font');
  Quill.register(FontFamily, true);
  const Embed = Quill.import('blots/embed');
  class VarBadgeBlot extends Embed {
    static create(value) { const node = super.create(); node.setAttribute('data-table', value.table); node.setAttribute('data-column', value.column); node.setAttribute('data-key', value.key); node.setAttribute('contenteditable', 'false'); node.classList.add('var-badge'); node.textContent = '#' + value.key; return node; }
    static value(node) { return { table: node.getAttribute('data-table'), column: node.getAttribute('data-column'), key: node.getAttribute('data-key') }; }
  }
  VarBadgeBlot.blotName='varbadge'; VarBadgeBlot.tagName='span'; VarBadgeBlot.className='var-badge'; Quill.register(VarBadgeBlot);
  const BlockEmbed=Quill.import('blots/block/embed');
  class PageBreakBlot extends BlockEmbed { static create(value){const node=super.create(value); node.setAttribute('contenteditable','false'); node.classList.add('page-break-marker'); node.dataset.type='page-break'; return node;} static value(node){return {type:'pageBreak'};} }
  PageBreakBlot.blotName='pagebreak'; PageBreakBlot.tagName='div'; PageBreakBlot.className='page-break-marker'; Quill.register(PageBreakBlot);
  function init() { quill = new Quill('#editor-container', { theme:'snow', modules:{toolbar:[]}, history:{delay:500,maxStack:100,userOnly:true} }); Variables.init(quill); return quill; }
  function getQuill(){return quill;} function getHTML(){return quill ? quill.root.innerHTML : '';} function setHTML(html){if(quill) quill.root.innerHTML=html||'';}
  return {init,getQuill,getHTML,setHTML};
})();