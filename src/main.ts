import Phaser from 'phaser';
import './style.css';
import charactersJson from './data/characters.json';
import enemiesJson from './data/enemies.json';
import bannersJson from './data/banners.json';
import worldsJson from './data/worlds.json';
import classesJson from './data/classes.json';
import type { CharacterData, EnemyData, BannerData, WorldData, ClassId } from './data/types';

const characters = charactersJson as CharacterData[];
const enemies = enemiesJson as EnemyData[];
const banners = bannersJson as BannerData[];
const worlds = worldsJson as WorldData[];
const classes = classesJson as {id:ClassId;name:string;strongAgainst:ClassId|null;icon:string}[];
const classMap = new Map(classes.map(c => [c.id, c]));
const charMap = new Map(characters.map(c => [c.id, c]));

interface UnitInstance { uid:string; characterId:string; level:number; xp:number; locked:boolean; favorite:boolean; ascension:number; }
interface EncounterEnemy { enemyId:string; level:number; }
interface GeneratedEncounter { level:number; generatedFromAverage:number; enemies:EncounterEnemy[]; attempts:number; backgroundWorldId:string; }
interface SaveData { version:4; tickets:number; fragments:number; units:UnitInstance[]; discovered:string[]; team:string[]; selectedBanner:number; expeditionLevel:number; currentEncounter:GeneratedEncounter|null; previousEncounter:GeneratedEncounter|null; }
interface BattleUnit { data:CharacterData|EnemyData; level:number; hp:number; maxHp:number; turns:number; sprite:Phaser.GameObjects.Image; x:number;y:number; bar:Phaser.GameObjects.Graphics; hpText:Phaser.GameObjects.Text; levelText:Phaser.GameObjects.Text; classIcon:Phaser.GameObjects.Image; targetRing?:Phaser.GameObjects.Arc; }
type Screen='home'|'gacha'|'summon'|'codex'|'units'|'team'|'detail'|'upgrade'|'expeditions'|'battle';

const SAVE_KEY='argagacha-save-v2';
const uid=()=>`u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
const star=(n:number)=>'★'.repeat(n);
const path=(p:string)=>`${import.meta.env.BASE_URL}${p}`;
const starterUnit=(id:string,level=1):UnitInstance=>({uid:uid(),characterId:id,level,xp:0,locked:false,favorite:false,ascension:0});
function defaultSave():SaveData{
  const units=[starterUnit('caballero_mariposa',5),starterUnit('detective_lince',3),starterUnit('capitan_blaze',2)];
  return {version:4,tickets:12,fragments:120,units,discovered:units.map(u=>u.characterId),team:units.map(u=>u.uid),selectedBanner:0,expeditionLevel:1,currentEncounter:null,previousEncounter:null};
}
function loadSave():SaveData{
  try{
    const raw=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');
    if(raw?.version===4)return raw as SaveData;
    if(raw?.version===3||raw?.version===2){
      const units=(raw.units??[]).map((u:any)=>{
        const rarity=charMap.get(u.characterId)?.rarity??2;
        const baseCap=Math.min(50,15+rarity*5);
        const inferred=Math.max(0,Math.ceil(((u.level??1)-baseCap)/5));
        return {...u,ascension:u.ascension??inferred};
      });
      return {
        version:4,
        tickets:raw.tickets??12,
        fragments:raw.fragments??120,
        units,
        discovered:raw.discovered??[],
        team:raw.team??[],
        selectedBanner:raw.selectedBanner??0,
        expeditionLevel:raw.expeditionLevel??1,
        currentEncounter:raw.currentEncounter??null,
        previousEncounter:raw.previousEncounter??null
      };
    }
  }catch{}
  return defaultSave();
}
const saveGame=(s:SaveData)=>localStorage.setItem(SAVE_KEY,JSON.stringify(s));


class MainScene extends Phaser.Scene{
  save=loadSave(); screen:Screen='home'; summonQueue:CharacterData[]=[]; summonIndex=0;
  unitSort:'power'|'name'|'rarity'|'class'|'level'='power';
  unitSortDesc=true;
  focusedEnemy:BattleUnit|null=null;
  scrollMoved=false;
  interactionReadyAt=0;
  screenEpoch=0;
  private activeInteractives=new Set<Phaser.GameObjects.GameObject>();
  constructor(){super('main');}
  preload(){
    this.load.image('logo',path('assets/ui/logo.png'));this.load.image('ticket',path('assets/ui/ticketgacha.png'));this.load.image('fragment',path('assets/ui/fragmentos.png'));
    worlds.forEach(w=>{this.load.image(`bg-${w.id}`,path(w.background));this.load.image(`world-banner-${w.id}`,path(w.bannerImage));});
    banners.forEach(b=>this.load.image(`banner-${b.id}`,path(b.image)));
    classes.forEach(c=>this.load.image(`class-${c.id}`,path(c.icon)));
    characters.forEach(c=>{this.load.image(`portrait-${c.id}`,path(c.portrait));this.load.image(`char-${c.id}`,path(c.sprite));});
    enemies.forEach(e=>this.load.image(`enemy-${e.id}`,path(e.sprite)));
  }
  create(){
    this.input.setTopOnly(true);
    this.renderHome();
  }
  clear(){
    this.screenEpoch++;
    const epoch=this.screenEpoch;
    this.input.enabled=false;
    for(const obj of this.activeInteractives){
      const interactive=obj as Phaser.GameObjects.GameObject&{disableInteractive?:()=>unknown;removeAllListeners?:()=>unknown;};
      interactive.disableInteractive?.();
      interactive.removeAllListeners?.();
    }
    this.activeInteractives.clear();
    this.tweens.killAll();
    this.input.removeAllListeners();
    this.children.removeAll(true);
    this.focusedEnemy=null;
    this.scrollMoved=false;
    this.interactionReadyAt=this.time.now+180;

    // Captura cualquier pulsación realizada fuera de los controles de la pantalla actual.
    // Esto evita que zonas vacías alcancen objetos antiguos que Phaser aún esté retirando.
    const shield=this.add.rectangle(640,360,1280,720,0x000000,0.001).setDepth(-10000).setInteractive();
    shield.on('pointerdown',(p:Phaser.Input.Pointer)=>p.event.stopPropagation());
    shield.on('pointerup',(p:Phaser.Input.Pointer)=>p.event.stopPropagation());
    this.activeInteractives.add(shield);

    this.time.delayedCall(90,()=>{
      if(epoch===this.screenEpoch)this.input.enabled=true;
    });
  }
  activateOnRelease(obj:Phaser.GameObjects.GameObject,fn:()=>void,options:{allowAfterScroll?:boolean}={}){
    const interactive=obj as any;
    const ownerEpoch=this.screenEpoch;
    const ownerScreen=this.screen;
    interactive.setInteractive({useHandCursor:true});
    this.activeInteractives.add(obj);
    obj.once(Phaser.GameObjects.Events.DESTROY,()=>this.activeInteractives.delete(obj));
    let armedPointer=-1;
    interactive.on('pointerdown',(p:Phaser.Input.Pointer)=>{
      p.event.stopPropagation();
      if(ownerEpoch!==this.screenEpoch||ownerScreen!==this.screen||this.time.now<this.interactionReadyAt)return;
      armedPointer=p.id;
    });
    interactive.on('pointerup',(p:Phaser.Input.Pointer)=>{
      p.event.stopPropagation();
      const valid=armedPointer===p.id&&ownerEpoch===this.screenEpoch&&ownerScreen===this.screen&&obj.active&&this.time.now>=this.interactionReadyAt&&(options.allowAfterScroll||!this.scrollMoved);
      armedPointer=-1;
      if(valid){
        // Desarma inmediatamente toda interacción de la pantalla saliente.
        // La función puede redibujar otra vista sin heredar este mismo gesto.
        this.interactionReadyAt=this.time.now+180;
        fn();
      }
    });
    interactive.on('pointerout',()=>{armedPointer=-1;});
    interactive.on('pointerupoutside',()=>{armedPointer=-1;});
    return interactive;
  }
  txt(x:number,y:number,t:string,size=24,origin=.5,width=1000){return this.add.text(x,y,t,{fontFamily:'Arial, sans-serif',fontSize:`${size}px`,color:'#f8fbff',stroke:'#07101f',strokeThickness:5,align:'center',wordWrap:{width}}).setOrigin(origin);}
  panel(x:number,y:number,w:number,h:number,alpha=.92,color=0x101a31){return this.add.rectangle(x,y,w,h,color,alpha).setStrokeStyle(2,0x7d91b6);}
  button(x:number,y:number,w:number,h:number,label:string,fn:()=>void,accent=0xf2c45f){
    const r=this.add.rectangle(x,y,w,h,0x17243f,.97).setStrokeStyle(3,accent);
    const t=this.txt(x,y,label,20);
    r.on('pointerover',()=>r.setFillStyle(0x26395f));
    r.on('pointerout',()=>r.setFillStyle(0x17243f));
    this.activateOnRelease(r,fn,{allowAfterScroll:true});
    return{r,t};
  }
  header(title='ARGAGACHA'){this.add.rectangle(640,38,1280,76,0x07101f,.98);this.add.image(28,38,'ticket').setDisplaySize(34,34).setOrigin(0,.5);this.txt(70,38,String(this.save.tickets),22,0);this.add.image(160,38,'fragment').setDisplaySize(34,34).setOrigin(0,.5);this.txt(202,38,String(this.save.fragments),22,0);this.txt(1240,38,title,18,1);}
  nav(active:Screen){
    const items:[Screen,string,()=>void][]=[['home','INICIO',()=>this.renderHome()],['gacha','GACHA',()=>this.renderGacha()],['units','UNIDADES',()=>this.renderUnits()],['team','EQUIPO',()=>this.renderTeam()],['codex','CÓDICE',()=>this.renderCodex()],['expeditions','EXPLORAR',()=>this.renderExpeditions()]];
    this.add.rectangle(640,690,1280,60,0x07101f,.99).setDepth(50);
    items.forEach((it,i)=>{
      const x=110+i*212;
      const tx=this.txt(x,690,it[1],17).setDepth(51);
      tx.setColor(active===it[0]?'#f2c45f':'#dce5f7');
      this.activateOnRelease(tx,it[2],{allowAfterScroll:true});
      this.add.rectangle(x,716,130,3,active===it[0]?0xf2c45f:0x8da0c4).setDepth(51);
    });
  }
  baseBackground(worldId='hoennia',tint=0x7b899e){this.add.image(640,360,`bg-${worldId}`).setDisplaySize(1280,720).setTint(tint);this.add.rectangle(640,360,1280,720,0x040914,.45);}
  pageControls(page:number,totalPages:number,onChange:(n:number)=>void,y=635){if(totalPages<=1)return;this.button(420,y,110,42,'‹',()=>onChange(Math.max(0,page-1)));this.txt(640,y,`Página ${page+1} / ${totalPages}`,17);this.button(860,y,110,42,'›',()=>onChange(Math.min(totalPages-1,page+1)));}

  baseLevelCap(c:CharacterData){return Math.min(50,15+c.rarity*5);}
  maxAscensions(c:CharacterData){return Math.max(0,Math.ceil((50-this.baseLevelCap(c))/5));}
  levelCap(u:UnitInstance){const c=charMap.get(u.characterId)!;return Math.min(50,this.baseLevelCap(c)+(u.ascension??0)*5);}
  ascensionCost(u:UnitInstance){const c=charMap.get(u.characterId)!;return c.rarity*25+(u.ascension+1)*25;}
  levelMultiplier(level:number){return 1+(level-1)*.06;}
  statsAt(c:CharacterData,level:number){const m=this.levelMultiplier(level);return{hp:Math.round(c.stats.hp*m),attack:Math.round(c.stats.attack*m),defense:Math.round(c.stats.defense*m),speed:Math.round(c.stats.speed)};}
  levelCostAt(level:number){return 10+level*5;}
  totalLevelCost(from:number,to:number){let total=0;for(let level=from;level<to;level++)total+=this.levelCostAt(level);return total;}
  unitPower(u:UnitInstance){const c=charMap.get(u.characterId)!;const st=this.statsAt(c,u.level);return Math.round(st.hp*.25+st.attack*2+st.defense*1.4+st.speed+(u.ascension??0)*35);}
  sortedUnits(){const list=[...this.save.units];const dir=this.unitSortDesc?-1:1;return list.sort((a,b)=>{const ca=charMap.get(a.characterId)!,cb=charMap.get(b.characterId)!;let v=0;switch(this.unitSort){case'name':v=ca.name.localeCompare(cb.name,'es');break;case'rarity':v=ca.rarity-cb.rarity||a.level-b.level;break;case'class':v=(classMap.get(ca.classId)?.name||'').localeCompare(classMap.get(cb.classId)?.name||'','es')||ca.name.localeCompare(cb.name,'es');break;case'level':v=a.level-b.level||this.unitPower(a)-this.unitPower(b);break;default:v=this.unitPower(a)-this.unitPower(b);}return v*dir;});}
  makeScrollable(container:Phaser.GameObjects.Container,top:number,bottom:number,contentHeight:number){
    const visible=bottom-top,maxOffset=Math.max(0,contentHeight-visible);let offset=0,dragY=0,startY=0,dragging=false;
    const maskShape=this.add.graphics().fillStyle(0xffffff).fillRect(0,top,1280,visible).setVisible(false);container.setMask(maskShape.createGeometryMask());
    const updateInteractiveVisibility=()=>{
      for(const child of container.list){
        const gameObject=child as Phaser.GameObjects.GameObject&{y?:number;displayHeight?:number;input?:Phaser.Types.Input.InteractiveObject|null};
        if(!gameObject.input||typeof gameObject.y!=='number')continue;
        const half=(gameObject.displayHeight??1)/2;
        const worldY=gameObject.y+container.y;
        gameObject.input.enabled=worldY+half>=top&&worldY-half<=bottom;
      }
    };
    let thumb:Phaser.GameObjects.Rectangle|null=null,thumbH=0;
    const apply=(next:number)=>{
      offset=Phaser.Math.Clamp(next,0,maxOffset);container.y=-offset;
      if(thumb)thumb.y=top+thumbH/2+(visible-thumbH)*(maxOffset?offset/maxOffset:0);
      updateInteractiveVisibility();
    };
    this.input.on('wheel',(_p:Phaser.Input.Pointer,_go:any,_dx:number,dy:number)=>apply(offset+dy*.8));
    this.input.on('pointerdown',(p:Phaser.Input.Pointer)=>{if(p.y>=top&&p.y<=bottom){dragging=true;dragY=p.y;startY=offset;this.scrollMoved=false;}});
    this.input.on('pointermove',(p:Phaser.Input.Pointer)=>{if(dragging&&p.isDown){if(Math.abs(p.y-dragY)>8)this.scrollMoved=true;apply(startY+(dragY-p.y));}});
    this.input.on('pointerup',()=>{dragging=false;this.time.delayedCall(0,()=>this.scrollMoved=false);});
    if(maxOffset>0){this.add.rectangle(1268,(top+bottom)/2,5,visible,0x27334b,.7).setDepth(45).setAlpha(.65);thumbH=Math.max(34,visible*(visible/contentHeight));thumb=this.add.rectangle(1268,top+thumbH/2,7,thumbH,0xf2c45f,.9).setDepth(46);}
    apply(0);
  }
  showTypeChart(){
    const blocker=this.add.rectangle(640,360,1280,720,0x02050c,.9).setDepth(200).setInteractive();
    this.activeInteractives.add(blocker);blocker.once(Phaser.GameObjects.Events.DESTROY,()=>this.activeInteractives.delete(blocker));
    blocker.on('pointerdown',(p:Phaser.Input.Pointer)=>p.event.stopPropagation());blocker.on('pointerup',(p:Phaser.Input.Pointer)=>p.event.stopPropagation());
    const box=this.add.rectangle(640,360,900,620,0x101a31,.995).setStrokeStyle(3,0xf2c45f).setDepth(201);
    this.txt(640,82,'TABLA DE VENTAJAS',30).setDepth(202);
    this.txt(640,120,'La clase de la izquierda inflige 25% más daño a la indicada por la flecha.',15).setDepth(202);
    const rows=classes.filter(c=>c.strongAgainst);
    rows.forEach((c,i)=>{
      const target=classMap.get(c.strongAgainst!);const y=175+i*62;
      this.add.image(355,y,`class-${c.id}`).setDisplaySize(36,36).setDepth(202);
      this.txt(390,y,c.name,17,0,180).setDepth(202);
      this.txt(615,y,'→',27).setDepth(202);
      this.add.image(705,y,`class-${target!.id}`).setDisplaySize(36,36).setDepth(202);
      this.txt(740,y,target!.name,17,0,180).setDepth(202);
    });
    this.txt(640,505,'CLASES NEUTRALES',17).setDepth(202);
    const neutral=classes.filter(c=>!c.strongAgainst);
    neutral.forEach((c,i)=>{const x=515+i*250;this.add.image(x,550,`class-${c.id}`).setDisplaySize(38,38).setDepth(202);this.txt(x+35,550,c.name,16,0,150).setDepth(202);});
    this.txt(640,590,'Apoyo e Irregular no tienen ventaja fija, pero sus habilidades compensan esa neutralidad.',14).setDepth(202);
    const close=this.button(640,645,220,46,'CERRAR',()=>{[blocker,box,...this.children.list.filter(o=>(o as any).depth>=202)].forEach(o=>o.destroy());});
    close.r.setDepth(203);close.t.setDepth(204);
  }

  renderHome(){this.screen='home';this.clear();this.baseBackground();this.header();this.add.image(640,150,'logo').setDisplaySize(310,190);this.txt(640,255,'Mundos distintos. Banners distintos. Una sola colección.',22);this.panel(640,435,780,280,.75);this.button(470,370,300,64,'INVOCAR',()=>this.renderGacha());this.button(810,370,300,64,'EXPEDICIONES',()=>this.renderExpeditions());this.button(470,465,300,64,'FORMAR EQUIPO',()=>this.renderTeam());this.button(810,465,300,64,'VER UNIDADES',()=>this.renderUnits());this.txt(640,555,'v0.6 · Progresión, ascensión y habilidades',16);this.nav('home');}

  renderGacha(){this.screen='gacha';this.clear();const banner=banners[this.save.selectedBanner%banners.length];this.add.image(640,360,`banner-${banner.id}`).setDisplaySize(1280,720);this.add.rectangle(640,360,1280,720,0x030713,.2);this.header('PORTAL DE INVOCACIÓN');this.add.rectangle(640,590,1280,260,0x07101f,.82);this.txt(640,500,banner.name.toUpperCase(),36);this.txt(640,542,worlds.find(w=>w.id===banner.worldId)?.description||'',17,.5,850);this.txt(640,578,`${star(5)} 5%  ·  ${star(4)} 15%  ·  ${star(3)} 30%  ·  ${star(2)} 50%`,16);this.button(475,635,275,58,`1 TIRADA · ${banner.ticketCost}`,()=>this.pull(1));this.button(805,635,275,58,`10 TIRADAS · ${banner.ticketCost*10}`,()=>this.pull(10));if(banners.length>1){this.button(65,345,70,90,'‹',()=>{this.save.selectedBanner=(this.save.selectedBanner-1+banners.length)%banners.length;saveGame(this.save);this.renderGacha();});this.button(1215,345,70,90,'›',()=>{this.save.selectedBanner=(this.save.selectedBanner+1)%banners.length;saveGame(this.save);this.renderGacha();});}this.nav('gacha');}
  pull(count:number){const banner=banners[this.save.selectedBanner%banners.length],cost=banner.ticketCost*count;if(this.save.tickets<cost){this.toast('No tienes tickets suficientes.');return;}this.save.tickets-=cost;const results:CharacterData[]=[];for(let i=0;i<count;i++){const r=Math.random();let rarity=2,acc=0;for(const value of [5,4,3,2]){acc+=banner.rates[String(value)]||0;if(r<=acc){rarity=value;break;}}const pool=characters.filter(c=>c.bannerId===banner.id&&c.rarity===rarity);const c=Phaser.Utils.Array.GetRandom(pool.length?pool:characters.filter(x=>x.bannerId===banner.id));this.save.units.push(starterUnit(c.id));if(!this.save.discovered.includes(c.id))this.save.discovered.push(c.id);results.push(c);}saveGame(this.save);this.summonQueue=results;this.summonIndex=0;this.renderSummon();}
  renderSummon(showAll=false){
    this.screen='summon';this.clear();this.add.rectangle(640,360,1280,720,0x02050c);this.header('RESULTADOS DE INVOCACIÓN');
    if(showAll){
      this.txt(640,98,'RESUMEN DE LA TIRADA',31);
      const container=this.add.container(0,0);const cols=5,cardW=200,cardH=300,gapY=330;
      this.summonQueue.forEach((c,i)=>{const x=160+(i%cols)*240,y=285+Math.floor(i/cols)*gapY;const before=this.children.list.length;this.drawUnitCard(x,y,c,200,300,false);const created=this.children.list.splice(before);container.add(created);});
      const rows=Math.ceil(this.summonQueue.length/cols);this.makeScrollable(container,130,595,Math.max(465,rows*gapY));
      this.button(640,635,270,52,'CONTINUAR',()=>this.renderGacha());return;
    }
    const c=this.summonQueue[this.summonIndex];const rarityColor=c.rarity===5?0xffd65a:c.rarity===4?0xb37aff:0x68a7ff;
    const glow=this.add.circle(640,335,235,rarityColor,.18);this.tweens.add({targets:glow,scale:1.12,alpha:.05,duration:850,yoyo:true,repeat:-1});
    const card=this.panel(640,345,500,555,.99,c.rarity===5?0x2b2211:0x101a31).setStrokeStyle(5,rarityColor).setInteractive({useHandCursor:true});
    const p=this.add.image(640,315,`portrait-${c.id}`).setAlpha(0).setY(330);const maxW=430,maxH=405,scale=Math.min(maxW/p.width,maxH/p.height);p.setScale(scale);
    this.tweens.add({targets:p,alpha:1,y:305,duration:430,ease:'Back.easeOut'});
    this.add.rectangle(640,535,470,115,0x050914,.88);this.txt(640,510,c.name,31);this.txt(640,552,`${classMap.get(c.classId)?.name} · ${star(c.rarity)}`,21);this.txt(640,585,`${this.summonIndex+1} / ${this.summonQueue.length}`,15);this.txt(640,640,'PULSA LA CARTA PARA CONTINUAR',15);
    this.activateOnRelease(card,()=>{if(this.summonIndex<this.summonQueue.length-1){this.summonIndex++;this.renderSummon();}else this.renderSummon(true);},{allowAfterScroll:true});
    if(this.summonQueue.length>1)this.button(1080,650,225,46,'MOSTRAR TODO',()=>this.renderSummon(true));
  }
  drawUnitCard(x:number,y:number,c:CharacterData,w=190,h=210,showLevel=false,unit?:UnitInstance){const rarityColor=c.rarity===5?0xffd65a:c.rarity===4?0xb37aff:0x7f93b7;const r=this.add.rectangle(x,y,w,h,0x10192c,.98).setStrokeStyle(2,rarityColor).setInteractive({useHandCursor:true});this.add.image(x,y-32,`portrait-${c.id}`).setDisplaySize(w-16,h-68);this.add.rectangle(x,y+h/2-40,w,80,0x060a13,.92);this.add.image(x-w/2+22,y+h/2-53,`class-${c.classId}`).setDisplaySize(27,27);this.txt(x+7,y+h/2-55,c.name,Math.min(16,Math.max(12,180/c.name.length)));this.txt(x,y+h/2-28,showLevel?`${star(c.rarity)} · Nv. ${unit?.level??1}`:star(c.rarity),14);return r;}
  renderUnits(){
    this.screen='units';this.clear();this.add.rectangle(640,360,1280,720,0x0a1222);this.header('MIS UNIDADES');
    this.txt(315,100,`UNIDADES · ${this.save.units.length}`,29);
    const labels:{[k:string]:string}={power:'PODER',name:'NOMBRE',rarity:'RAREZA',class:'CLASE',level:'NIVEL'};
    this.button(720,100,210,42,`ORDEN: ${labels[this.unitSort]}`,()=>{const modes:['power','name','rarity','class','level']=['power','name','rarity','class','level'];this.unitSort=modes[(modes.indexOf(this.unitSort)+1)%modes.length];this.renderUnits();});
    this.button(930,100,70,42,this.unitSortDesc?'↓':'↑',()=>{this.unitSortDesc=!this.unitSortDesc;this.renderUnits();});
    this.button(1085,100,225,42,'FRAGMENTAR REPES',()=>this.confirmFragmentDuplicates(),0xe06d6d);
    this.txt(1110,132,'Rueda o arrastra para desplazarte',12);
    const list=this.sortedUnits(),container=this.add.container(0,0),cols=6,rowH=225;
    list.forEach((u,i)=>{const c=charMap.get(u.characterId)!;const x=135+(i%cols)*205,y=205+Math.floor(i/cols)*rowH;const before=this.children.list.length;const card=this.drawUnitCard(x,y,c,170,190,true,u);this.txt(x,y+108,`Poder ${this.unitPower(u)}`,12);if(u.favorite)this.txt(x+67,y-80,'♥',20);if(u.locked)this.txt(x-67,y-80,'🔒',15);const created=this.children.list.splice(before);container.add(created);this.activateOnRelease(card,()=>this.showUnit(u,'units'));});
    const rows=Math.ceil(list.length/cols);this.makeScrollable(container,130,650,Math.max(520,rows*rowH+30));this.nav('units');
  }
  renderCodex(){
    this.screen='codex';this.clear();this.add.rectangle(640,360,1280,720,0x0a1222);this.header('CÓDICE MULTIVERSAL');this.txt(640,95,`HOENNIA · ${this.save.discovered.length}/${characters.length} descubiertos`,29);
    const container=this.add.container(0,0),cols=6,rowH=225;
    characters.forEach((c,i)=>{const known=this.save.discovered.includes(c.id),x=135+(i%cols)*205,y=205+Math.floor(i/cols)*rowH;const before=this.children.list.length;const r=this.add.rectangle(x,y,170,190,known?0x10192c:0x080d18,.98).setStrokeStyle(2,known?0x7f93b7:0x33405a);if(known){r.setInteractive({useHandCursor:true});this.add.image(x,y-30,`portrait-${c.id}`).setDisplaySize(154,125);this.add.rectangle(x,y+56,170,76,0x060a13,.93);this.txt(x,y+42,c.name,15);this.txt(x,y+68,star(c.rarity),14);this.activateOnRelease(r,()=>this.showCodexCharacter(c));}else{this.txt(x,y-10,'?',70);this.txt(x,y+60,'SIN DESCUBRIR',13);}const created=this.children.list.splice(before);container.add(created);});
    const rows=Math.ceil(characters.length/cols);this.makeScrollable(container,130,650,Math.max(520,rows*rowH+30));this.nav('codex');
  }
  showCodexCharacter(c:CharacterData){
    this.screen='detail';this.clear();this.add.rectangle(640,360,1280,720,0x0a1222);this.header('CÓDICE');
    const portrait=this.add.image(285,365,`portrait-${c.id}`);const scale=Math.min(500/portrait.width,500/portrait.height);portrait.setScale(scale);
    this.panel(875,360,630,520,.96);this.add.image(600,125,`class-${c.classId}`).setDisplaySize(45,45);
    this.txt(875,125,c.name,32);this.txt(875,165,`${classMap.get(c.classId)?.name} · ${star(c.rarity)}`,18);
    this.add.text(590,205,c.lore,{fontFamily:'Arial',fontSize:'17px',color:'#eaf0ff',wordWrap:{width:565},lineSpacing:4});
    this.txt(610,390,'ACTIVA',14,0);this.txt(685,390,c.activeSkill.name,17,0,440);
    this.add.text(610,415,c.activeSkill.description,{fontFamily:'Arial',fontSize:'14px',color:'#cfd9ec',wordWrap:{width:530}});
    this.txt(610,485,'PASIVA',14,0);this.txt(685,485,c.passiveSkill.name,17,0,440);
    this.add.text(610,510,c.passiveSkill.description,{fontFamily:'Arial',fontSize:'14px',color:'#cfd9ec',wordWrap:{width:530}});
    this.button(120,650,170,50,'VOLVER',()=>this.renderCodex());
  }
  showUnit(u:UnitInstance,back:'units'|'team'){
    const c=charMap.get(u.characterId)!;this.screen='detail';this.clear();this.add.rectangle(640,360,1280,720,0x0a1222);this.header('FICHA DE UNIDAD');
    const portrait=this.add.image(275,350,`portrait-${c.id}`);const pScale=Math.min(470/portrait.width,500/portrait.height);portrait.setScale(pScale);
    this.panel(875,350,650,530,.97);this.add.image(590,110,`class-${c.classId}`).setDisplaySize(46,46);
    this.txt(875,108,c.name,31);this.txt(875,148,`${classMap.get(c.classId)?.name} · ${star(c.rarity)} · Nv. ${u.level}/${this.levelCap(u)} · Asc. ${u.ascension}`,18);
    const st=this.statsAt(c,u.level);
    this.txt(875,190,`PV ${st.hp}   ATQ ${st.attack}   DEF ${st.defense}   VEL ${st.speed}`,17);
    this.txt(875,222,`EXP ${u.xp}/100 · Poder ${this.unitPower(u)}`,15);
    this.add.text(585,255,c.lore,{fontFamily:'Arial',fontSize:'15px',color:'#dfe7f7',wordWrap:{width:575},lineSpacing:3});
    this.txt(600,385,'ACTIVA',13,0);this.txt(670,385,c.activeSkill.name,16,0,460);
    this.add.text(600,407,c.activeSkill.description,{fontFamily:'Arial',fontSize:'13px',color:'#bac8df',wordWrap:{width:545}});
    this.txt(600,462,'PASIVA',13,0);this.txt(670,462,c.passiveSkill.name,16,0,460);
    this.add.text(600,484,c.passiveSkill.description,{fontFamily:'Arial',fontSize:'13px',color:'#bac8df',wordWrap:{width:545}});
    this.button(695,565,185,44,u.favorite?'♥ FAVORITO':'♡ FAVORITO',()=>{u.favorite=!u.favorite;saveGame(this.save);this.showUnit(u,back);});
    this.button(895,565,185,44,u.locked?'🔒 BLOQUEADA':'BLOQUEAR',()=>{u.locked=!u.locked;saveGame(this.save);this.showUnit(u,back);});
    this.button(1095,565,185,44,'MEJORAR',()=>this.showUpgrade(u,back),0x65c88a);
    if(!u.locked&&!this.save.team.includes(u.uid))this.button(995,620,190,42,'FRAGMENTAR',()=>this.confirmDestroyUnit(u,back),0xe06d6d);
    this.button(120,650,170,50,'VOLVER',()=>back==='units'?this.renderUnits():this.renderTeam());
  }
  levelCost(u:UnitInstance){return this.levelCostAt(u.level);}
  showUpgrade(u:UnitInstance,back:'units'|'team',requestedTarget?:number){
    const c=charMap.get(u.characterId)!;this.screen='upgrade';this.clear();this.add.rectangle(640,360,1280,720,0x0a1222);this.header('MEJORA DE UNIDAD');
    const cap=this.levelCap(u);const target=Phaser.Math.Clamp(requestedTarget??Math.min(cap,u.level+1),u.level,cap);
    const current=this.statsAt(c,u.level),future=this.statsAt(c,target),cost=this.totalLevelCost(u.level,target);
    const portrait=this.add.image(235,320,`portrait-${c.id}`);const scale=Math.min(380/portrait.width,430/portrait.height);portrait.setScale(scale);
    this.txt(235,565,c.name,25);this.txt(235,598,`${star(c.rarity)} · Ascensión ${u.ascension}/${this.maxAscensions(c)}`,16);
    this.panel(790,335,760,510,.97);this.add.image(450,125,`class-${c.classId}`).setDisplaySize(42,42);
    this.txt(790,120,`Nv. ${u.level}  →  Nv. ${target}`,31);
    this.txt(790,163,`Límite actual: Nv. ${cap} · EXP ${u.xp}/100`,16);
    const statLine=(name:string,a:number,b:number,y:number)=>{this.txt(535,y,name,17,0);this.txt(750,y,String(a),18);this.txt(860,y,'→',20);const value=this.txt(1035,y,String(b),18);if(b>a)value.setColor('#72e6a0');};
    statLine('PV',current.hp,future.hp,225);statLine('ATQ',current.attack,future.attack,275);statLine('DEF',current.defense,future.defense,325);statLine('VEL',current.speed,future.speed,375);
    this.txt(790,425,`Coste total: ${cost} fragmentos`,20);this.txt(790,458,`Disponibles: ${this.save.fragments}`,15);
    this.button(520,510,105,42,'+1',()=>this.showUpgrade(u,back,Math.min(cap,target+1)));
    this.button(645,510,105,42,'+5',()=>this.showUpgrade(u,back,Math.min(cap,target+5)));
    this.button(770,510,105,42,'+10',()=>this.showUpgrade(u,back,Math.min(cap,target+10)));
    this.button(920,510,150,42,'MÁXIMO',()=>this.showUpgrade(u,back,cap));
    this.button(790,570,280,50,target===u.level?'SELECCIONA NIVELES':'CONFIRMAR MEJORA',()=>this.levelUpTo(u,target,back),cost<=this.save.fragments&&target>u.level?0x65c88a:0x6f7788);
    if(u.level>=cap&&cap<50)this.button(1110,570,220,50,`ASCENDER · ${this.ascensionCost(u)}`,()=>this.ascendUnit(u,back),0xb37aff);
    this.button(120,650,170,50,'VOLVER',()=>this.showUnit(u,back));
  }
  levelUpTo(u:UnitInstance,target:number,back:'units'|'team'){
    if(target<=u.level){this.toast('Selecciona uno o más niveles.');return;}
    const cap=this.levelCap(u);target=Math.min(target,cap);const cost=this.totalLevelCost(u.level,target);
    if(this.save.fragments<cost){this.toast(`Necesitas ${cost} fragmentos.`);return;}
    this.save.fragments-=cost;u.level=target;u.xp=0;saveGame(this.save);this.showUpgrade(u,back,target);
  }
  ascendUnit(u:UnitInstance,back:'units'|'team'){
    const c=charMap.get(u.characterId)!,cap=this.levelCap(u);
    if(u.level<cap){this.toast(`Alcanza el nivel ${cap} primero.`);return;}
    if(cap>=50||u.ascension>=this.maxAscensions(c)){this.toast('Ascensión máxima alcanzada.');return;}
    const cost=this.ascensionCost(u);if(this.save.fragments<cost){this.toast(`Necesitas ${cost} fragmentos.`);return;}
    this.save.fragments-=cost;u.ascension++;saveGame(this.save);this.showUpgrade(u,back);
  }
  confirmDestroyUnit(u:UnitInstance,back:'units'|'team'){
    const c=charMap.get(u.characterId)!;const gain=c.rarity*10;
    const blocker=this.add.rectangle(640,360,1280,720,0x02050c,.9).setDepth(200).setInteractive();this.activeInteractives.add(blocker);
    blocker.on('pointerdown',(p:Phaser.Input.Pointer)=>p.event.stopPropagation());blocker.on('pointerup',(p:Phaser.Input.Pointer)=>p.event.stopPropagation());
    const box=this.add.rectangle(640,350,620,280,0x101a31,.99).setStrokeStyle(3,0xe06d6d).setDepth(201);
    this.txt(640,270,'¿FRAGMENTAR ESTA UNIDAD?',26).setDepth(202);this.txt(640,335,`${c.name} · Nv. ${u.level}\nRecibirás ${gain} fragmentos.`,18).setDepth(202);
    const cancel=this.button(500,430,210,48,'CANCELAR',()=>this.showUnit(u,back));cancel.r.setDepth(203);cancel.t.setDepth(204);
    const confirm=this.button(780,430,210,48,'FRAGMENTAR',()=>this.destroyUnit(u,back),0xe06d6d);confirm.r.setDepth(203);confirm.t.setDepth(204);
    void box;
  }
  destroyUnit(u:UnitInstance,back:'units'|'team'){
    const c=charMap.get(u.characterId)!;this.save.units=this.save.units.filter(x=>x.uid!==u.uid);this.save.team=this.save.team.filter(id=>id!==u.uid);this.save.fragments+=c.rarity*10;saveGame(this.save);back==='units'?this.renderUnits():this.renderTeam();
  }

  duplicateFragmentPlan(){
    const protectedIds=new Set(this.save.team);
    const remove:UnitInstance[]=[];
    for(const character of characters){
      const owned=this.save.units.filter(u=>u.characterId===character.id);
      if(owned.length<=1)continue;
      const protectedUnits=owned.filter(u=>u.locked||u.favorite||protectedIds.has(u.uid));
      const candidates=owned.filter(u=>!u.locked&&!u.favorite&&!protectedIds.has(u.uid)).sort((a,b)=>this.unitPower(b)-this.unitPower(a));
      const keeperCount=protectedUnits.length>0?0:1;
      remove.push(...candidates.slice(keeperCount));
    }
    return remove;
  }
  confirmFragmentDuplicates(){
    const remove=this.duplicateFragmentPlan();
    if(!remove.length){this.toast('No hay repetidos seguros para fragmentar.');return;}
    const gain=remove.reduce((sum,u)=>sum+(charMap.get(u.characterId)?.rarity??1)*10,0);
    const blocker=this.add.rectangle(640,360,1280,720,0x02050c,.9).setDepth(200);
    blocker.setInteractive();this.activeInteractives.add(blocker);blocker.once(Phaser.GameObjects.Events.DESTROY,()=>this.activeInteractives.delete(blocker));
    blocker.on('pointerdown',(p:Phaser.Input.Pointer)=>p.event.stopPropagation());
    blocker.on('pointerup',(p:Phaser.Input.Pointer)=>p.event.stopPropagation());
    const box=this.add.rectangle(640,350,680,330,0x101a31,.99).setStrokeStyle(3,0xf2c45f).setDepth(201);
    this.txt(640,250,'FRAGMENTAR REPETIDOS',28).setDepth(202);
    this.txt(640,325,`Se eliminarán ${remove.length} unidades repetidas y recibirás ${gain} fragmentos.\n\nNo se tocarán unidades bloqueadas, favoritas, del equipo ni la última copia disponible.`,18,.5,560).setDepth(202);
    const cancel=this.button(500,455,220,50,'CANCELAR',()=>{blocker.destroy();box.destroy();cancel.r.destroy();cancel.t.destroy();confirm.r.destroy();confirm.t.destroy();});
    cancel.r.setDepth(203);cancel.t.setDepth(204);
    const confirm=this.button(780,455,220,50,'FRAGMENTAR',()=>{const ids=new Set(remove.map(u=>u.uid));this.save.units=this.save.units.filter(u=>!ids.has(u.uid));this.save.fragments+=gain;saveGame(this.save);this.renderUnits();},0xe06d6d);
    confirm.r.setDepth(203);confirm.t.setDepth(204);
  }

  renderTeam(){
    this.screen='team';this.clear();this.add.rectangle(640,360,1280,720,0x0a1222);this.header('FORMACIÓN');this.txt(640,92,'EQUIPO ACTUAL',29);
    for(let i=0;i<3;i++){const u=this.save.units.find(x=>x.uid===this.save.team[i]),x=390+i*250,y=195;const slot=this.add.rectangle(x,y,200,170,0x10192c,.97).setStrokeStyle(3,u?0xf2c45f:0x44516d);if(u){this.activateOnRelease(slot,()=>{this.save.team=this.save.team.filter(id=>id!==u.uid);saveGame(this.save);this.renderTeam();},{allowAfterScroll:true});const c=charMap.get(u.characterId)!;this.add.image(x,y-22,`portrait-${c.id}`).setDisplaySize(184,112);this.txt(x,y+45,c.name,15);this.txt(x,y+70,`Nv. ${u.level} · Poder ${this.unitPower(u)}`,12);}else this.txt(x,y,'HUECO VACÍO',16);}
    this.txt(640,305,'PULSA UNA UNIDAD PARA AÑADIRLA O QUITARLA',15);
    const list=this.sortedUnits(),container=this.add.container(0,0),cols=7,rowH=125;
    list.forEach((u,i)=>{const c=charMap.get(u.characterId)!,selected=this.save.team.includes(u.uid),x=115+(i%cols)*177,y=390+Math.floor(i/cols)*rowH;const before=this.children.list.length;const r=this.add.rectangle(x,y,150,105,selected?0x29375b:0x10192c,.98).setStrokeStyle(2,selected?0xf2c45f:0x7082a4).setInteractive({useHandCursor:true});this.add.image(x-43,y,`portrait-${c.id}`).setDisplaySize(58,88);this.txt(x+27,y-25,c.name,12,.5,82);this.txt(x+27,y+3,`Nv.${u.level} · ${this.unitPower(u)}`,11);this.txt(x+27,y+31,selected?'EN EQUIPO':'AÑADIR',10);const created=this.children.list.splice(before);container.add(created);this.activateOnRelease(r,()=>{if(selected)this.save.team=this.save.team.filter(id=>id!==u.uid);else if(this.save.team.length<3)this.save.team.push(u.uid);else{this.toast('El equipo ya tiene 3 unidades.');return;}saveGame(this.save);this.renderTeam();});});
    const rows=Math.ceil(list.length/cols);this.makeScrollable(container,325,650,Math.max(325,rows*rowH+20));this.nav('team');
  }
  selectedTeamUnits(){return this.save.team.map(id=>this.save.units.find(u=>u.uid===id)).filter(Boolean) as UnitInstance[];}
  teamAverageLevel(units=this.selectedTeamUnits()){return units.length?units.reduce((sum,u)=>sum+u.level,0)/units.length:1;}
  isCounter(enemyClass:ClassId,teamClasses:ClassId[]){const strong=classMap.get(enemyClass)?.strongAgainst;return strong!==null&&strong!==undefined&&teamClasses.includes(strong);}
  generateEncounter():GeneratedEncounter|null{
    const team=this.selectedTeamUnits();
    if(!team.length)return null;
    const level=this.save.expeditionLevel;
    const avg=this.teamAverageLevel(team);
    const progressBonus=Math.min(4,Math.floor((level-1)/10));
    const variation=Phaser.Math.Between(-1,1);
    const enemyLevel=Phaser.Math.Clamp(Math.round(avg)+progressBonus+variation,1,50);
    const foeCount=level<6?2:3;
    const teamClasses=team.map(u=>charMap.get(u.characterId)!.classId);
    const normalPool=enemies.filter(e=>!e.boss);
    const bossPool=enemies.filter(e=>e.boss);
    const chosen:EnemyData[]=[];
    if(level%10===0&&bossPool.length)chosen.push(Phaser.Utils.Array.GetRandom(bossPool));
    let safety=0;
    while(chosen.length<foeCount&&safety++<100){
      const candidate=Phaser.Utils.Array.GetRandom(normalPool);
      const counters=[...chosen,candidate].filter(e=>this.isCounter(e.classId,teamClasses)).length;
      if(counters<=1)chosen.push(candidate);
    }
    while(chosen.length<foeCount)chosen.push(Phaser.Utils.Array.GetRandom(normalPool));
    const encounter={level,generatedFromAverage:Number(avg.toFixed(2)),enemies:chosen.map(e=>({enemyId:e.id,level:enemyLevel})),attempts:0,backgroundWorldId:'hoennia'};
    this.save.currentEncounter=encounter;saveGame(this.save);return encounter;
  }
  firstClearRewards(level:number){return{tickets:Math.min(5,1+Math.floor((level-1)/7)),fragments:Math.min(100,20+level*3),xp:Math.min(180,35+level*4)};}
  renderExpeditions(){
    this.screen='expeditions';this.clear();this.baseBackground();this.header('EXPEDICIÓN');
    const team=this.selectedTeamUnits();
    this.txt(640,105,`NIVEL ACTUAL · ${this.save.expeditionLevel}`,34);
    if(!team.length){this.panel(640,330,760,300,.92);this.txt(640,250,'Necesitas formar un equipo antes de generar el nivel.',24);this.button(640,390,330,58,'FORMAR EQUIPO',()=>this.renderTeam());this.nav('expeditions');return;}
    const encounter=this.save.currentEncounter??this.generateEncounter()!;
    const reward=this.firstClearRewards(encounter.level);
    this.panel(640,330,940,390,.9);
    this.txt(250,175,'TU EQUIPO',19,0);
    team.forEach((u,i)=>{const c=charMap.get(u.characterId)!;const x=330+i*190;this.add.image(x,245,`portrait-${c.id}`).setDisplaySize(145,115);this.txt(x,318,`${c.name}\nNv. ${u.level} · ${classMap.get(c.classId)?.name}`,14);});
    this.txt(850,175,'ENCUENTRO FIJO',19);
    encounter.enemies.forEach((foe,i)=>{const e=enemies.find(x=>x.id===foe.enemyId)!;const y=230+i*72;this.add.image(760,y,`enemy-${e.id}`).setDisplaySize(65,65).setFlipX(true);this.add.image(815,y-12,`class-${e.classId}`).setDisplaySize(25,25);this.txt(840,y-18,e.name,16,0,260);this.txt(840,y+15,`${classMap.get(e.classId)?.name} · Nv. ${foe.level}`,13,0,260);});
    const blessing=encounter.attempts>=5?10:encounter.attempts>=3?5:0;
    this.txt(640,455,`Primera victoria: ${reward.tickets} ticket${reward.tickets===1?'':'s'} · ${reward.fragments} fragmentos · ${reward.xp} EXP`,17);
    this.txt(640,485,`Generado con nivel medio ${encounter.generatedFromAverage} · Intentos: ${encounter.attempts}${blessing?` · Bendición +${blessing}%`:''}`,14);
    this.button(455,560,350,58,`DESAFIAR NIVEL ${encounter.level}`,()=>this.startBattle(encounter,false));
    if(this.save.previousEncounter)this.button(825,560,350,58,`REPETIR NIVEL ${this.save.previousEncounter.level}`,()=>this.startBattle(this.save.previousEncounter!,true));
    else this.panel(825,560,350,58,.5).setStrokeStyle(2,0x44516d),this.txt(825,560,'SUPERA UN NIVEL PARA REPETIRLO',14);
    this.txt(640,622,'La repetición da 50% de fragmentos, 75% de EXP y ningún ticket.',14);
    this.nav('expeditions');
  }
  combatCharacterStats(c:CharacterData,level:number,boost=1){
    const st=this.statsAt(c,level);const p=c.passiveSkill;let hp=st.hp,attack=st.attack,defense=st.defense,speed=st.speed;
    if(p.stat==='hp')hp=Math.round(hp*(1+p.value));
    if(p.stat==='attack')attack=Math.round(attack*(1+p.value));
    if(p.stat==='defense')defense=Math.round(defense*(1+p.value));
    if(p.stat==='speed')speed=Math.round(speed*(1+p.value));
    return{hp:Math.round(hp*boost),attack:Math.round(attack*boost),defense:Math.round(defense*boost),speed};
  }
  isCharacterData(data:CharacterData|EnemyData):data is CharacterData{return 'activeSkill' in data;}
  drawHp(u:BattleUnit){
    const pct=Phaser.Math.Clamp(u.hp/u.maxHp,0,1);u.bar.clear();u.bar.fillStyle(0x000000,.88).fillRoundedRect(u.x-92,u.y+58,184,20,5);u.bar.fillStyle(pct>.5?0x43c774:pct>.25?0xe0b54c:0xdc5b5b,1).fillRoundedRect(u.x-88,u.y+62,176*pct,12,4);u.hpText.setText(`${Math.max(0,u.hp)} / ${u.maxHp}`);u.levelText.setText(`Nv.${u.level}`);
  }
  startBattle(encounter:GeneratedEncounter,replay=false){
    const selected=this.selectedTeamUnits();if(!selected.length){this.toast('Forma un equipo primero.');this.renderTeam();return;}
    this.screen='battle';this.clear();this.baseBackground(encounter.backgroundWorldId);this.header(`${replay?'REPETICIÓN':'EXPEDICIÓN'} · Nivel ${encounter.level}`);
    const typeBtn=this.button(1135,92,210,38,'TABLA DE TIPOS',()=>this.showTypeChart());typeBtn.r.setDepth(60);typeBtn.t.setDepth(61);
    const blessing=replay?0:encounter.attempts>=5?10:encounter.attempts>=3?5:0,allyBoost=1+blessing/100;
    const allies:BattleUnit[]=selected.map((u,i)=>{const c=charMap.get(u.characterId)!,st=this.combatCharacterStats(c,u.level,allyBoost),max=st.hp,x=205,y=165+i*170;const sprite=this.add.image(x,y,`char-${c.id}`).setDisplaySize(145,145);const bar=this.add.graphics(),hpText=this.txt(x,y+91,'',11),levelText=this.txt(x+62,y+91,`Nv.${u.level}`,12),classIcon=this.add.image(x-72,y+91,`class-${c.classId}`).setDisplaySize(27,27);return{data:{...c,stats:st},level:u.level,hp:max,maxHp:max,turns:0,sprite,x,y,bar,hpText,levelText,classIcon};});
    const bads:BattleUnit[]=encounter.enemies.map((foe,i)=>{const e=enemies.find(x=>x.id===foe.enemyId)!,mult=1+(foe.level-1)*.055,max=Math.round(e.stats.hp*mult),x=1075,y=175+i*165;const sprite=this.add.image(x,y,`enemy-${e.id}`).setDisplaySize(145,145).setFlipX(true).setInteractive({useHandCursor:true});const bar=this.add.graphics(),hpText=this.txt(x,y+91,'',11),levelText=this.txt(x+62,y+91,`Nv.${foe.level}`,12),classIcon=this.add.image(x-72,y+91,`class-${e.classId}`).setDisplaySize(27,27);const unit:BattleUnit={data:{...e,stats:{...e.stats,attack:Math.round(e.stats.attack*mult),defense:Math.round(e.stats.defense*mult),hp:max}},level:foe.level,hp:max,maxHp:max,turns:0,sprite,x,y,bar,hpText,levelText,classIcon};unit.targetRing=this.add.circle(x,y,78,0x000000,0).setStrokeStyle(4,0xffd65a).setVisible(false);this.activateOnRelease(sprite,()=>{this.focusedEnemy=unit;for(const b of bads)b.targetRing?.setVisible(b===unit);},{allowAfterScroll:true});return unit;});
    [...allies,...bads].forEach(u=>this.drawHp(u));
    const log=this.add.text(390,530,`Pulsa un enemigo para concentrar ataques.${blessing?` Bendición del Explorador: +${blessing}% a tu equipo.`:''}`,{fontFamily:'Arial',fontSize:'17px',color:'#fff',backgroundColor:'#000c',padding:{x:14,y:10},wordWrap:{width:500}});
    const start=this.button(640,645,320,50,'COMENZAR COMBATE',async()=>{start.r.disableInteractive();start.t.setText('COMBATE EN CURSO');let turn=0;while(allies.some(a=>a.hp>0)&&bads.some(b=>b.hp>0)&&turn<80){turn++;const order=[...allies.filter(x=>x.hp>0),...bads.filter(x=>x.hp>0)].sort((a,b)=>b.data.stats.speed-a.data.stats.speed);for(const unit of order){if(unit.hp<=0)continue;const isAlly=allies.includes(unit),pool=(isAlly?bads:allies).filter(x=>x.hp>0);if(!pool.length)break;const target=isAlly&&this.focusedEnemy&&this.focusedEnemy.hp>0?this.focusedEnemy:Phaser.Utils.Array.GetRandom(pool);await this.performTurn(unit,target,allies,bads,log);}}
      const won=allies.some(a=>a.hp>0);
      if(won){const base=this.firstClearRewards(encounter.level),rewardT=replay?0:base.tickets,rewardF=replay?Math.floor(base.fragments*.5):base.fragments,rewardXp=replay?Math.floor(base.xp*.75):base.xp;this.save.tickets+=rewardT;this.save.fragments+=rewardF;selected.forEach(u=>{u.xp+=rewardXp;while(u.xp>=100&&u.level<this.levelCap(u)){u.level++;u.xp-=100;}if(u.level>=this.levelCap(u))u.xp=Math.min(u.xp,99);});if(!replay){this.save.previousEncounter={...encounter,enemies:encounter.enemies.map(e=>({...e}))};this.save.expeditionLevel=encounter.level+1;this.save.currentEncounter=null;}saveGame(this.save);log.setText(`¡VICTORIA! +${rewardT} tickets · +${rewardF} fragmentos · +${rewardXp} EXP${replay?' · repetición':' · siguiente nivel desbloqueado'}`);}else{if(!replay&&this.save.currentEncounter){this.save.currentEncounter.attempts++;saveGame(this.save);}log.setText(replay?'DERROTA EN REPETICIÓN. No pierdes progreso.':'DERROTA. El encuentro queda igual; mejora o cambia el equipo.');}
      this.button(640,645,320,50,'VOLVER A EXPEDICIÓN',()=>this.renderExpeditions());
    });
  }
  async performTurn(attacker:BattleUnit,target:BattleUnit,allies:BattleUnit[],enemiesTeam:BattleUnit[],log:Phaser.GameObjects.Text){
    attacker.turns++;
    if(this.isCharacterData(attacker.data)&&attacker.turns%3===0){
      await this.useActiveSkill(attacker,target,allies,enemiesTeam,log);return;
    }
    await this.attack(attacker,target,log,1);
  }
  async useActiveSkill(attacker:BattleUnit,target:BattleUnit,allies:BattleUnit[],enemiesTeam:BattleUnit[],log:Phaser.GameObjects.Text){
    const c=attacker.data as CharacterData,skill=c.activeSkill,isAlly=allies.includes(attacker),friends=(isAlly?allies:enemiesTeam).filter(x=>x.hp>0),foes=(isAlly?enemiesTeam:allies).filter(x=>x.hp>0);
    log.setText(`${c.name} usa ${skill.name}`);
    if(skill.target==='lowestAlly'||skill.target==='allAllies'){
      const targets=skill.target==='allAllies'?friends:[friends.reduce((a,b)=>a.hp/a.maxHp<b.hp/b.maxHp?a:b)];
      const healingBonus=c.passiveSkill.stat==='healing'?1+c.passiveSkill.value:1;
      for(const unit of targets){const amount=Math.max(10,Math.round(c.stats.attack*skill.power*healingBonus+unit.maxHp*.08));unit.hp=Math.min(unit.maxHp,unit.hp+amount);this.drawHp(unit);this.tweens.add({targets:unit.sprite,tint:0x8effb0,duration:120,yoyo:true});}
      await new Promise<void>(resolve=>this.time.delayedCall(420,()=>resolve()));return;
    }
    if(skill.target==='allEnemies'){
      await new Promise<void>(resolve=>this.tweens.add({targets:attacker.sprite,x:attacker.x+(isAlly?30:-30),duration:90,yoyo:true,onComplete:()=>resolve()}));
      for(const foe of foes)await this.attack(attacker,foe,log,skill.power,false);
      return;
    }
    await this.attack(attacker,target,log,skill.power);
  }
  async attack(attacker:BattleUnit,target:BattleUnit,log:Phaser.GameObjects.Text,power=1,animate=true){
    const clsA=attacker.data.classId,clsT=target.data.classId,adv=classMap.get(clsA)?.strongAgainst===clsT?1.25:classMap.get(clsT)?.strongAgainst===clsA?0.8:1;
    const damagePassive=this.isCharacterData(attacker.data)&&attacker.data.passiveSkill.stat==='damage'?1+attacker.data.passiveSkill.value:1;
    const damage=Math.max(5,Math.round((attacker.data.stats.attack*power-target.data.stats.defense*.35)*adv*damagePassive*(.9+Math.random()*.2)));
    log.setText(`${attacker.data.name} → ${target.data.name}: ${damage}${adv>1?' · ¡VENTAJA!':adv<1?' · resistencia':''}`);
    if(animate)await new Promise<void>(resolve=>this.tweens.add({targets:attacker.sprite,x:attacker.x+(target.x>attacker.x?28:-28),duration:90,yoyo:true,onComplete:()=>resolve()}));
    target.hp-=damage;this.drawHp(target);this.tweens.add({targets:target.sprite,alpha:.25,duration:60,yoyo:true,repeat:1});
    if(target.hp<=0){target.targetRing?.setVisible(false);if(this.focusedEnemy===target)this.focusedEnemy=null;this.tweens.add({targets:[target.sprite,target.bar,target.hpText,target.levelText,target.classIcon],alpha:0,duration:250});}
    await new Promise<void>(resolve=>this.time.delayedCall(animate?120:70,()=>resolve()));
  }
  toast(message:string){const box=this.add.rectangle(640,90,540,54,0x060a13,.97).setStrokeStyle(2,0xf2c45f).setDepth(100);const t=this.txt(640,90,message,18).setDepth(101);this.tweens.add({targets:[box,t],alpha:0,delay:1500,duration:350,onComplete:()=>{box.destroy();t.destroy();}});}
}
new Phaser.Game({type:Phaser.AUTO,parent:'game',width:1280,height:720,backgroundColor:'#090d18',scene:[MainScene],scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH}});
